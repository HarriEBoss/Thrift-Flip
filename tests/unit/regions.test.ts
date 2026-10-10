import { describe, expect, it } from 'vitest';
import {
  OPEN,
  REGIONS,
  WON,
  allRegionsWon,
  expansionUnlocked,
  openRegion,
  openableRegions,
  regionFx,
  regionMarkets,
  regionStatus,
  regionsWon,
} from '../../src/core/regions';
import { BUSINESSES } from '../../src/core/empire';
import { BALANCE, MARKETS, categoriesForTier } from '../../src/core/data';
import { businessOffers, completeJob, signContract } from '../../src/core/jobs';
import { finishRestoration, recordStep } from '../../src/core/day';
import { availableMarkets, generateOffers } from '../../src/core/market';
import { instanceValue, makeInstance, recipeFor } from '../../src/core/items';
import { dailyIncome } from '../../src/core/managers';
import { deserialize, serialize } from '../../src/core/save/schema';
import { ITEMS } from '../../src/core/data';
import { game } from './helpers';

const ALL = BUSINESSES.map((b) => b.id);
const world = (coins = 1e7) => game(5, { tier: 4, coins, biz: { own: [...ALL], cur: 'reselling' } });
const reg = (id: string) => REGIONS.find((r) => r.id === id)!;

describe('global expansion', () => {
  it('seven regions, each with a cost, a business for its flagship and a market; unlocks at the top', () => {
    expect(REGIONS).toHaveLength(7);
    for (const r of REGIONS) {
      expect(BUSINESSES.some((b) => b.id === r.biz)).toBe(true);
      expect(MARKETS.filter((m) => m.region === r.id)).toHaveLength(1);
      expect(r.u).toBeGreaterThan(0);
      expect(r.v).toBeLessThan(1);
    }
    const g = game(5, { tier: 4, coins: 1e9, biz: { own: ALL.slice(0, -1), cur: 'reselling' } });
    expect(expansionUnlocked(g)).toBe(false);
    expect(regionStatus(g, REGIONS[0])).toBe('locked');
    expect(openRegion(g, REGIONS[0].id)).toBe(false);
    g.biz.own.push(BALANCE.empire.regions.unlock);
    expect(regionStatus(g, REGIONS[0])).toBe('available');
    expect(openableRegions(g)).toBe(7);
  });

  it('opening an office costs coins and puts the flagship contract on the right job board', () => {
    const g = world();
    const r = reg('asia');
    expect(businessOffers(g, r.biz).some((o) => o.region)).toBe(false);
    expect(openRegion(g, 'asia')).toBe(true);
    expect(g.coins).toBe(1e7 - r.cost);
    expect(regionStatus(g, r)).toBe('open');
    expect(openRegion(g, 'asia')).toBe(false);
    const flag = businessOffers(g, r.biz).find((o) => o.region === 'asia')!;
    expect(flag.k).toBe('design');
    expect(flag.client).toBe(r.client);
    const normal = businessOffers(g, r.biz).filter((o) => !o.region);
    expect(flag.fee).toBeGreaterThan(Math.max(...normal.map((o) => o.fee)));
    // Signed: it waits in the workshop and is not offered again.
    const [inst] = signContract(g, flag.id);
    expect(inst.job?.r).toBe('asia');
    expect(businessOffers(g, r.biz).some((o) => o.region)).toBe(false);
    recipeFor(inst).forEach((_, i) => recordStep(inst, i, 1));
    finishRestoration(g, inst);
    expect(completeJob(g, inst).region).toBe('asia');
    expect(regionStatus(g, r)).toBe('won');
    expect(businessOffers(g, r.biz).some((o) => o.region)).toBe(false);
  });

  it('a flagship delivered below the quality wanted does not conquer the region', () => {
    const g = world();
    openRegion(g, 'europe');
    const flag = businessOffers(g, reg('europe').biz).find((o) => o.region)!;
    const [inst] = signContract(g, flag.id);
    inst.job!.t = 3;
    recipeFor(inst).forEach((_, i) => recordStep(inst, i, 0.5));
    finishRestoration(g, inst);
    expect(completeJob(g, inst).region).toBeNull();
    expect(g.regions.europe).toBe(OPEN);
    // The flagship is offered again.
    expect(businessOffers(g, 'computer').some((o) => o.region === 'europe')).toBe(true);
  });

  it('conquered regions boost shop prices, contract pay and manager income', () => {
    const g = world();
    const inst = makeInstance(g, 0, 0, 1, 0, 0, true);
    inst.q = 1;
    const v0 = instanceValue(g, inst);
    const p0 = businessOffers(g, 'phone').map((o) => o.fee);
    g.managers = { phone: 1 };
    const i0 = dailyIncome(g, BUSINESSES[1]).gross;
    for (const r of REGIONS) g.regions[r.id] = WON;
    const fx = regionFx(g);
    expect(fx.price).toBeGreaterThan(0);
    expect(fx.contracts).toBeGreaterThan(0);
    expect(fx.income).toBeGreaterThan(0);
    expect(instanceValue(g, inst)).toBeGreaterThan(v0);
    businessOffers(g, 'phone').forEach((o, i) => expect(o.fee).toBeGreaterThanOrEqual(p0[i]));
    expect(dailyIncome(g, BUSINESSES[1]).gross).toBeGreaterThan(i0);
  });

  it('each conquered region opens its own market, which specialises in its categories', () => {
    const g = world();
    expect(regionMarkets(g)).toEqual([]);
    expect(availableMarkets(g).some((m) => m.region)).toBe(false);
    g.regions.asia = WON;
    const m = regionMarkets(g)[0];
    expect(m.region).toBe('asia');
    expect(availableMarkets(g)).toContain(m);
    g.day.market = m.id;
    for (const o of generateOffers(g, m)) {
      expect(m.cats).toContain(ITEMS[o.a].cat);
      expect(categoriesForTier(g.tier)).toContain(ITEMS[o.a].cat);
    }
  });

  it('space needs every region; regions survive a save', () => {
    const g = world();
    for (const r of REGIONS.slice(1)) g.regions[r.id] = WON;
    expect(allRegionsWon(g)).toBe(false);
    expect(regionsWon(g)).toBe(6);
    g.regions[REGIONS[0].id] = OPEN;
    const back = deserialize(serialize(g));
    expect(back.regions).toEqual(g.regions);
    back.regions[REGIONS[0].id] = WON;
    expect(allRegionsWon(back)).toBe(true);
    const raw = JSON.parse(serialize(g));
    raw.rg = { asia: 9, nowhere: 2, europe: 'x' };
    expect(deserialize(JSON.stringify(raw)).regions).toEqual({ asia: WON });
  });
});
