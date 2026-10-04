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
      sec += T.perStep;
    });
    finishRestoration(g, inst);
    sec += T.reveal;
  }
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

function runBot(seed: number): BotResult {
  const g = newGame(seed);
  const rng = new Rng(seed ^ 0x9e3779b9);
  const skill = rng.range(0.78, 0.92);
  const res: BotResult = {
    coins: [],
    tierDay: [1, -1, -1, -1, -1],
    catalog: [],
    completeDay: -1,
    playSec: [],
  };
  let total = 0;
  for (let d = 1; d <= DAYS; d++) {
    total += playDay(g, rng, skill);
    for (let t = 1; t <= g.tier; t++) if (res.tierDay[t] < 0) res.tierDay[t] = d;
    res.coins.push(g.coins);
    res.catalog.push(catalogFoundCount(g));
    res.playSec.push(total);
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
const report = lines.join('\n') + '\n';
console.log(report);
if (process.argv.includes('--write')) writeFileSync('docs/BALANCE.md', report);
