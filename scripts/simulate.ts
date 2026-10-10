/**
 * Balance simulation: a simple bot plays N in-game days and reports the coin curve, the day each
 * shop tier is reached, catalog completion and an estimate of real play time.
 *
 *   npx tsx scripts/simulate.ts            # print report (100 days, 20 bots)
 *   npx tsx scripts/simulate.ts --write    # also write docs/BALANCE.md
 */
import { writeFileSync } from 'node:fs';
import { BALANCE, ITEMS, marketsForTier } from '../src/core/data';
import { Rng } from '../src/core/prng';
import { newGame, type GameState } from '../src/core/state';
import {
  buyOffer,
  canBuy,
  generateOffers,
  haggle,
  offerEstimate,
  priceFor,
  setMarket,
  type Offer,
} from '../src/core/market';
import { advancePhase, completeSale, finishRestoration, recordStep, workshopQueue } from '../src/core/day';
import { recipeFor, instanceValue } from '../src/core/items';
import { chooseItem, generateVisits, postRequest, respondToPrice, walkAway } from '../src/core/customers';
import {
  buyUpgrade,
  canUpgradeTier,
  learnSkill,
  nextTier,
  skillStatus,
  upgradeTier,
} from '../src/core/progression';
import { catalogFoundCount } from '../src/core/catalog';
import { DECOR, buyDecor } from '../src/core/decor';
import { acceptJob, businessOffers, completeJob } from '../src/core/jobs';
import { CAMPAIGNS, campaignStatus, runCampaign } from '../src/core/marketing';
import {
  BODIES,
  TECHS,
  buildDysonStage,
  colonyStatus,
  dysonDone,
  dysonStatus,
  foundColony,
  spaceUnlocked,
  startResearch,
  techStatus,
} from '../src/core/space';
import {
  REGIONS,
  allRegionsWon,
  expansionUnlocked,
  flagshipsAt,
  openRegion,
  regionStatus,
  regionsWon,
} from '../src/core/regions';
import {
  branchCost,
  branchCount,
  branchStatus,
  delegationUnlocked,
  hireOrTrain,
  managerCost,
  managerLevel,
  managerStatus,
  openBranch,
} from '../src/core/managers';
import { BUSINESSES, businessStatus, openBusiness, openCost, setCurrentBusiness } from '../src/core/empire';
import { isContentComplete } from '../src/core/complete';
import { snapPrice } from '../src/core/economy';
import { marketSlots, shelfCapacity } from '../src/core/perks';
import { nextBid, playerBid, playerWon, startAuction, tickAuction } from '../src/core/auction';

const DAYS = Number(process.env.DAYS ?? 100);
const BOTS = Number(process.env.BOTS ?? 20);
const SKILL_ORDER = [
  'logistics1',
  'charm1',
  'appraisal1',
  'haggling1',
  'craft1',
  'logistics2',
  'charm2',
  'appraisal2',
  'haggling2',
  'craft2',
  'charm3',
  'appraisal3',
];

/** Seconds of real play per action (estimates from mini-game design: 5-20 s per step). */
const T = { marketBase: 25, perBuy: 6, perStep: 13, reveal: 6, perCustomer: 9, summary: 8, auctionLot: 12 };

interface BotResult {
  coins: number[];
  tierDay: number[];
  catalog: number[];
  completeDay: number;
  playSec: number[];
  /** Day each business on the ladder was opened (-1 = never). */
  bizDay: number[];
  /** Day all Earth regions were conquered (-1 = never). */
  worldDay: number;
  /** Day each colony was founded (-1 = never), and the Dyson project finished. */
  colonyDay: number[];
  dysonDay: number;
}

/** Restores everything in the queue; finished customer jobs are paid. */
function workshop(g: GameState, rng: Rng, skill: number, spend: (sec: number) => void): void {
  advancePhase(g, 'workshop');
  for (const inst of workshopQueue(g)) {
    const recipe = recipeFor(inst);
    recipe.forEach((st, i) => {
      if (!st.req && rng.chance(0.15)) {
        recordStep(inst, i, null);
        return;
      }
      const score = Math.max(0.3, Math.min(1, skill + rng.range(-0.12, 0.12)));
      recordStep(inst, i, score);
      spend(T.perStep);
    });
    finishRestoration(g, inst);
    spend(T.reveal);
    if (inst.job) {
      // Big repairs (PC rebuilds, engine swaps, robots, rockets) take longer.
      const cat = ITEMS[inst.a].cat;
      spend(
        inst.job.k === 'engine'
          ? 45
          : inst.job.k === 'pc'
            ? 30
            : cat === 'robots' || cat === 'rockets'
              ? 30
              : 10,
      );
      completeJob(g, inst);
    }
  }
}

function playDay(g: GameState, rng: Rng, skill: number): number {
  let sec = 0;
  // Morning: upgrades
  while (canUpgradeTier(g)) upgradeTier(g);
  for (const id of SKILL_ORDER) {
    const s = BALANCE.skills.find((x) => x.id === id)!;
    if (skillStatus(g, s) === 'available') learnSkill(g, id);
  }
  const reserve = nextTier(g)?.cost ?? 0;
  for (const u of BALANCE.upgrades) {
    if (g.coins - u.cost >= reserve * 0.6 && g.tier >= u.tier) buyUpgrade(g, u.id);
  }
  for (const d of DECOR) {
    if (g.coins - d.cost >= reserve * 0.7) buyDecor(g, d.id);
  }
  // Open the next business as soon as the savings allow (keeping a reserve for the shop).
  for (const b of BUSINESSES) {
    if (businessStatus(g, b) === 'available' && g.coins - openCost(b) >= reserve * 0.5) openBusiness(g, b.id);
  }
  // Delegation: hire and train managers, open branches, keeping half the coins in hand.
  if (delegationUnlocked(g)) {
    for (let k = 0; k < 6; k++) {
      const opts = BUSINESSES.flatMap((b) => {
        const mc = managerCost(b, managerLevel(g, b.id));
        const out: Array<{ cost: number; run: () => boolean }> = [];
        if (mc !== null && managerStatus(g, b) === 'available')
          out.push({ cost: mc, run: () => hireOrTrain(g, b.id) });
        if (managerLevel(g, b.id) > 0 && branchStatus(g, b) === 'available')
          out.push({ cost: branchCost(b, branchCount(g, b.id)), run: () => openBranch(g, b.id) });
        return out;
      }).filter((o) => o.cost <= g.coins * 0.5);
      if (!opts.length) break;
      opts.sort((a, b) => a.cost - b.cost)[0].run();
    }
  }
  // Marketing: every few days, the best campaign it can comfortably afford.
  if (g.day.n % 3 === 1) {
    const c = [...CAMPAIGNS]
      .reverse()
      .find((x) => campaignStatus(g, x) === 'available' && g.coins > x.cost * 4);
    if (c) runCampaign(g, c.id);
  }
  // Space: research in tree order, found colonies, build Dyson stages, keeping a third in hand.
  if (spaceUnlocked(g)) {
    const t = TECHS.find((x) => techStatus(g, x) === 'available' && x.cost <= g.coins * 0.7);
    if (t) startResearch(g, t.id);
    for (const b of BODIES)
      if (colonyStatus(g, b) === 'available' && b.cost <= g.coins * 0.7) foundColony(g, b.id);
    while (dysonStatus(g) === 'available') buildDysonStage(g);
  }
  // Global expansion: open the next region's office when it is comfortably affordable.
  if (expansionUnlocked(g)) {
    const next = REGIONS.find((r) => regionStatus(g, r) === 'available' && r.cost <= g.coins * 0.5);
    if (next && !REGIONS.some((r) => regionStatus(g, r) === 'open')) openRegion(g, next.id);
  }
  // Work where a flagship contract waits; else at the biggest business two days out of three, the
  // Reselling Shop on the third.
  const top = BUSINESSES.filter((b) => g.biz.own.includes(b.id)).pop()!;
  const flag = REGIONS.find((r) => regionStatus(g, r) === 'open' && flagshipsAt(g, r.biz).length);
  setCurrentBusiness(g, flag ? flag.biz : g.biz.own.length > 1 && g.day.n % 3 !== 0 ? top.id : 'reselling');
  if (g.biz.cur !== 'reselling') {
    sec += T.marketBase;
    for (const o of businessOffers(g, g.biz.cur)) if (acceptJob(g, o.id)) sec += T.perBuy;
    workshop(g, rng, skill, (n) => (sec += n));
    advancePhase(g, 'shop');
    advancePhase(g, 'summary');
    sec += T.summary;
    while (canUpgradeTier(g)) upgradeTier(g);
    advancePhase(g, 'market');
    return sec;
  }
  // Market choice: newest unlocked (auction sometimes)
  const ms = marketsForTier(g.tier);
  const choice = ms[Math.min(ms.length - 1, rng.int(Math.max(0, ms.length - 3), ms.length - 1))];
  setMarket(g, choice.id);
  sec += T.marketBase;
  const offers = generateOffers(g);
  if (choice.auction) {
    for (const lot of offers) {
      if (g.day.bought.length >= marketSlots(g)) break;
      const est = offerEstimate(g, lot);
      const limit = ((est[0] + est[1]) / 2) * 0.62;
      const a = startAuction(lot, rng.int(1, 1e9));
      let guard = 0;
      while (!a.done && guard++ < 400) {
        if (a.leader !== 0 && nextBid(a) <= Math.min(limit, g.coins)) playerBid(a, g.coins);
        tickAuction(a, 0.25);
      }
      sec += T.auctionLot;
      if (playerWon(a)) {
        g.day.haggled[lot.idx] = a.price;
        buyOffer(g, lot);
      }
    }
  } else {
    const scored = offers
      .map((o: Offer) => {
        const est = offerEstimate(g, o);
        const mid = (est[0] + est[1]) / 2;
        return { o, roi: (mid - priceFor(g, o)) / Math.max(1, priceFor(g, o)) };
      })
      .sort((a, b) => b.roi - a.roi);
    for (const { o } of scored) {
      if (g.day.bought.length >= marketSlots(g)) break;
      if (g.inv.length >= shelfCapacity(g) + 2) break;
      if (rng.chance(0.5)) haggle(g, o, Math.round(o.ask * rng.range(0.75, 0.9)));
      if (canBuy(g, o) === 'ok') {
        buyOffer(g, o);
        sec += T.perBuy;
      }
    }
  }
  workshop(g, rng, skill, (n) => (sec += n));
  advancePhase(g, 'shop');
  const visits = generateVisits(g);
  for (const v of visits) {
    const it = chooseItem(g, v);
    if (!it) break;
    sec += T.perCustomer;
    const price = snapPrice(instanceValue(g, it) * rng.range(0.95, 1.12));
    const r = respondToPrice(g, v, it, price);
    const reqIdx = v.returning;
    if (r.response === 'sale') completeSale(g, it, price, reqIdx);
    else if (r.response === 'counter') completeSale(g, it, r.counter, reqIdx);
    else walkAway(g, r.extreme);
    postRequest(g, v);
  }
  advancePhase(g, 'summary');
  sec += T.summary;
  // The summary screen offers the shop upgrade as soon as it is affordable.
  while (canUpgradeTier(g)) upgradeTier(g);
  advancePhase(g, 'market');
  return sec;
}

function runBot(seed: number, days = DAYS): BotResult {
  const g = newGame(seed);
  const rng = new Rng(seed ^ 0x9e3779b9);
  const skill = rng.range(0.78, 0.92);
  const res: BotResult = {
    coins: [],
    tierDay: [1, -1, -1, -1, -1],
    catalog: [],
    completeDay: -1,
    playSec: [],
    bizDay: BUSINESSES.map((b, i) => (i === 0 ? 1 : -1)),
    worldDay: -1,
    colonyDay: BODIES.map(() => -1),
    dysonDay: -1,
  };
  let total = 0;
  for (let d = 1; d <= days; d++) {
    total += playDay(g, rng, skill);
    for (let t = 1; t <= g.tier; t++) if (res.tierDay[t] < 0) res.tierDay[t] = d;
    res.coins.push(g.coins);
    res.catalog.push(catalogFoundCount(g));
    res.playSec.push(total);
    BUSINESSES.forEach((b, i) => {
      if (res.bizDay[i] < 0 && g.biz.own.includes(b.id)) res.bizDay[i] = d;
    });
    if (res.worldDay < 0 && allRegionsWon(g)) res.worldDay = d;
    BODIES.forEach((b, i) => {
      if (res.colonyDay[i] < 0 && g.space.colonies.includes(b.id)) res.colonyDay[i] = d;
    });
    if (res.dysonDay < 0 && dysonDone(g)) {
      res.dysonDay = d;
      if (days > DAYS) break;
    }
    if (process.env.REGIONS && d === days) console.error(`regions ${regionsWon(g)} coins ${g.coins}`);
    if (process.env.TRACE && d % 5 === 0)
      console.error(`d${d} t${g.tier} c${g.coins} rep${g.rep} lvl${g.level} inv${g.inv.length}`);
    if (res.completeDay < 0 && isContentComplete(g)) res.completeDay = d;
  }
  return res;
}

function median(xs: number[]): number {
  const s = xs.filter((x) => x >= 0).sort((a, b) => a - b);
  if (!s.length) return -1;
  return s[Math.floor(s.length / 2)];
}

const results = Array.from({ length: BOTS }, (_, i) => runBot(1000 + i * 7919));
// The long game (empire, world, space, Dyson): fewer bots, many more days.
const LONG_DAYS = Number(process.env.LONG_DAYS ?? 1500);
const LONG_BOTS = Number(process.env.LONG_BOTS ?? 6);
const longRuns = Array.from({ length: LONG_BOTS }, (_, i) => runBot(5000 + i * 104729, LONG_DAYS));
const lines: string[] = [];
const out = (s = '') => lines.push(s);
out('# Balance simulation');
out();
out(
  `Generated by \`npx tsx scripts/simulate.ts --write\`. ${BOTS} bots play ${DAYS} days each with a simple strategy: buy the best estimated ROI, haggle half the time, play mini-games at a skill of 0.78–0.92 ± 0.12, and price near value.`,
);
out();
out(
  'Targets from the brief: tier 2 around day 3, tier 5 around days 35–45, and about 4–6 h to content completion.',
);
out();
out('## Day each shop tier is reached (median over bots)');
out();
out('| Tier | Name | Cost | Rep | Median day | Earliest | Latest | Bots reaching |');
out('|---|---|---|---|---|---|---|---|');
BALANCE.tiers.forEach((t, i) => {
  const days = results.map((r) => r.tierDay[i]);
  const reached = days.filter((d) => d >= 0);
  out(
    `| ${i + 1} | ${t.name} | ${t.cost} | ${t.rep} | ${median(days)} | ${reached.length ? Math.min(...reached) : '-'} | ${reached.length ? Math.max(...reached) : '-'} | ${reached.length}/${BOTS} |`,
  );
});
out();
out('## Business ladder: day each business is opened (median over bots)');
out();
out('| Business | Capital | Opening cost | Median day | Play time (h) | Bots reaching |');
out('|---|---|---|---|---|---|');
BUSINESSES.forEach((b, i) => {
  const days = results.map((r) => r.bizDay[i]);
  const reached = days.filter((d) => d >= 0);
  const md = median(days);
  const hours =
    md > 0 ? median(results.map((r) => (r.bizDay[i] > 0 ? r.playSec[r.bizDay[i] - 1] : -1))) / 3600 : -1;
  out(
    `| ${b.id} | ${b.capital} | ${openCost(b)} | ${md} | ${hours >= 0 ? hours.toFixed(1) : '-'} | ${reached.length}/${BOTS} |`,
  );
});
out();
{
  const days = results.map((r) => r.worldDay);
  const md = median(days);
  const hours =
    md > 0 ? median(results.map((r) => (r.worldDay > 0 ? r.playSec[r.worldDay - 1] : -1))) / 3600 : -1;
  out(
    `All ${REGIONS.length} Earth regions conquered: median day ${md > 0 ? md : '-'} (${hours >= 0 ? hours.toFixed(1) : '-'} h), ${days.filter((d) => d > 0).length}/${BOTS} bots.`,
  );
  out();
}
out('## Coin curve and catalog (median)');
out();
out('| Day | Coins | Catalog found | Play time (min) |');
out('|---|---|---|---|');
for (const d of [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100].filter(
  (x) => x <= DAYS,
)) {
  const coins = median(results.map((r) => r.coins[d - 1]));
  const cat = median(results.map((r) => r.catalog[d - 1]));
  const min = median(results.map((r) => r.playSec[d - 1])) / 60;
  out(
    `| ${d} | ${coins} | ${cat}/${ITEMS.length} (${Math.round((cat / ITEMS.length) * 100)}%) | ${min.toFixed(0)} |`,
  );
}
out();
const comp = results.map((r) => r.completeDay);
const compDay = median(comp);
const compMin =
  compDay > 0 ? median(results.map((r) => (r.completeDay > 0 ? r.playSec[r.completeDay - 1] : -1))) / 60 : -1;
out('## Content completion (top tier + full catalog)');
out();
out(`- Bots completing within ${DAYS} days: ${comp.filter((d) => d > 0).length}/${BOTS}`);
out(`- Median completion day: ${compDay > 0 ? compDay : 'n/a'}`);
out(`- Median play time to completion: ${compMin > 0 ? (compMin / 60).toFixed(1) + ' h' : 'n/a'}`);
const minsPerDay = median(results.map((r) => r.playSec[DAYS - 1] / DAYS)) / 60;
out(`- Average real minutes per in-game day: ${minsPerDay.toFixed(1)} (target 3–6)`);
out();
out('Purchases are not needed: these bots never buy anything or watch ads.');
out();
out('## The long game (empire, world, space)');
out();
out(
  `${LONG_BOTS} bots play up to ${LONG_DAYS} days with the same strategy plus: open every business, hire managers and open branches, run campaigns, conquer regions, research, found colonies and build the Dyson project. Target: 50–150 hours to harvest the whole Sun.`,
);
out();
out('| Milestone | Median day | Median play time (h) | Bots reaching |');
out('|---|---|---|---|');
const milestone = (label: string, day: (r: BotResult) => number) => {
  const days = longRuns.map(day);
  const md = median(days);
  const hours = median(longRuns.map((r) => (day(r) > 0 ? r.playSec[day(r) - 1] : -1))) / 3600;
  out(
    `| ${label} | ${md > 0 ? md : '-'} | ${md > 0 ? hours.toFixed(1) : '-'} | ${days.filter((d) => d > 0).length}/${LONG_BOTS} |`,
  );
};
BUSINESSES.forEach((b, i) => milestone(`Business: ${b.id}`, (r) => r.bizDay[i]));
milestone('All Earth regions', (r) => r.worldDay);
BODIES.forEach((b, i) => milestone(`Colony: ${b.id}`, (r) => r.colonyDay[i]));
milestone('Dyson project done (whole Sun)', (r) => r.dysonDay);
const report = lines.join('\n') + '\n';
console.log(report);
if (process.argv.includes('--write')) writeFileSync('docs/BALANCE.md', report);
