import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/core/data';
import { newGame, type GameState } from '../../src/core/state';
import { GOLD, addGold, drainGoldNews, earnGold, spendGold } from '../../src/core/gold';
import {
  awayIncome,
  canSkip,
  earlyCost,
  earlyTools,
  skipDays,
  skipStatus,
  unlockEarly,
} from '../../src/core/timeskip';
import { MockPaymentProvider, type PaymentProvider, type PayResult } from '../../src/core/store/payments';
import { StoreService } from '../../src/core/store/storeService';
import { grantProduct } from '../../src/core/products';
import { openBusiness } from '../../src/core/empire';
import { conquerRegion } from '../../src/core/regions';
import { prestige } from '../../src/core/prestige';

function ready(g: GameState = newGame(3)): GameState {
  g.flags.tutorialDone = true;
  return g;
}

describe('Gold Bars wallet', () => {
  it('earned in play for milestones, spent only when there are enough', () => {
    const g = newGame(1);
    drainGoldNews();
    expect(earnGold(g, 'region')).toBe(GOLD.earn.region);
    expect(g.gold).toEqual({ bars: GOLD.earn.region, earned: GOLD.earn.region });
    expect(drainGoldNews()).toEqual([{ n: GOLD.earn.region, why: 'region' }]);
    expect(drainGoldNews()).toEqual([]);
    addGold(g, 10);
    expect(g.gold.earned).toBe(GOLD.earn.region);
    expect(spendGold(g, 1000)).toBe(false);
    expect(spendGold(g, 0)).toBe(false);
    expect(spendGold(g, 3)).toBe(true);
    expect(g.gold.bars).toBe(GOLD.earn.region + 7);
  });

  it('milestones pay out: a new business, a conquered region, a prestige keeps the bars', () => {
    const g = ready();
    g.tier = 4;
    g.coins = 1e9;
    openBusiness(g, 'phone');
    expect(g.gold.bars).toBe(GOLD.earn.business);
    conquerRegion(g, 'asia');
    conquerRegion(g, 'asia');
    expect(g.gold.bars).toBe(GOLD.earn.business + GOLD.earn.region);
    g.space.dyson = BALANCE.empire.space.dyson.stages;
    const p = prestige(g)!;
    expect(p.gold.bars).toBe(g.gold.bars + GOLD.earn.prestige);
  });
});

describe('time skips', () => {
  it('only at the start of a day, with enough Gold Bars', () => {
    const g = ready();
    expect(skipStatus(g, 'skip1')).toBe('poor');
    addGold(g, 100);
    expect(skipStatus(g, 'skip1')).toBe('available');
    g.day.bought.push(0);
    expect(canSkip(g)).toBe(false);
    expect(skipDays(g, 'skip1')).toBeNull();
    expect(g.gold.bars).toBe(100);
    g.day.bought = [];
    g.day.ph = 'workshop';
    expect(skipStatus(g, 'skip3')).toBe('busy');
    expect(skipStatus(g, 'nope')).toBe('busy');
  });

  it('days pass with the real end-of-day: managers pay (all of them), research and colonies move on', () => {
    const g = ready();
    g.tier = 4;
    g.biz = { own: ['reselling', 'phone', 'computer', 'mechanic', 'robotics', 'rocket'], cur: 'rocket' };
    g.managers = { phone: 3, rocket: 2 };
    for (const r of ['namerica', 'samerica', 'europe', 'africa', 'asia', 'oceania', 'antarctica'])
      g.regions[r] = 2;
    g.space.research = { id: 'rockets', left: 2 };
    g.space.colonies = ['moon'];
    addGold(g, 50);
    const day = g.day.n;
    const coins = g.coins;
    const est = awayIncome(g);
    const r = skipDays(g, 'skip3')!;
    expect(r.days).toBe(3);
    expect(g.day.n).toBe(day + 3);
    expect(g.day.ph).toBe('market');
    expect(g.gold.bars).toBe(50 - GOLD.skips.find((s) => s.id === 'skip3')!.cost);
    expect(r.coins).toBe(g.coins - coins);
    expect(r.coins).toBeGreaterThanOrEqual(est * 3 * 0.9);
    expect(r.researched).toEqual(['rockets']);
    expect(r.mat.helium3).toBeGreaterThan(0);
  });
});

describe('tools early', () => {
  it('Gold Bars unlock a tool before its shop size; the further away, the dearer', () => {
    const g = ready();
    const tools = earlyTools(g);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((u) => u.tier > g.tier)).toBe(true);
    const near = tools.find((u) => u.tier === 1)!;
    const far = tools.find((u) => u.tier === 3)!;
    expect(earlyCost(g, far)).toBeGreaterThan(earlyCost(g, near));
    expect(unlockEarly(g, near.id)).toBe(false);
    addGold(g, earlyCost(g, near));
    const coins = g.coins;
    expect(unlockEarly(g, near.id)).toBe(true);
    expect(g.upgrades).toContain(near.id);
    expect(g.coins).toBe(coins);
    expect(g.gold.bars).toBe(0);
    expect(unlockEarly(g, near.id)).toBe(false);
    expect(unlockEarly(g, 'big_sponge')).toBe(false);
  });
});

describe('store (mock payments behind an interface)', () => {
  class Fake implements PaymentProvider {
    readonly kind = 'platform' as const;
    constructor(private r: PayResult | 'throw') {}
    async prices() {
      return { gold_small: '$0.99' };
    }
    async buy(): Promise<PayResult> {
      if (this.r === 'throw') throw new Error('store down');
      return this.r;
    }
  }

  it('without a provider (YouTube) there is no store', async () => {
    const s = new StoreService(null);
    expect(s.available).toBe(false);
    const g = newGame(1);
    expect(await s.buy(g, 'gold_small')).toBe('failed');
    expect(g.gold.bars).toBe(0);
  });

  it('Gold Bars arrive only after a successful payment', async () => {
    const g = newGame(1);
    for (const [r, bars] of [
      ['cancelled', 0],
      ['failed', 0],
      ['throw', 0],
      ['success', 20],
    ] as const) {
      g.gold.bars = 0;
      expect(await new StoreService(new Fake(r)).buy(g, 'gold_small')).toBe(r === 'throw' ? 'failed' : r);
      expect(g.gold.bars, r).toBe(bars);
    }
    expect(g.gold.earned).toBe(0);
  });

  it('the mock provider pretends: packs, prices and purchases with no money moving', async () => {
    const mock = new MockPaymentProvider();
    const s = new StoreService(mock);
    expect(s.pretend).toBe(true);
    expect(s.goldPacks().map((p) => p.id)).toEqual(['gold_small', 'gold_medium', 'gold_large']);
    expect((await s.prices()).gold_medium).toBeTruthy();
    const g = newGame(1);
    expect(await s.buy(g, 'gold_large')).toBe('success');
    expect(g.gold.bars).toBe(280);
    expect(await s.buy(g, 'remove_ads')).toBe('failed');
    expect(mock.bought).toEqual(['gold_large']);
    expect(grantProduct(g, 'gold_small')).toBe(true);
    expect(g.gold.bars).toBe(300);
  });
});

describe('more things Gold Bars buy', () => {
  it('finish research now: bars per day to go', async () => {
    const { researchRushCost, rushResearch } = await import('../../src/core/goldShop');
    const g = ready();
    expect(researchRushCost(g)).toBeNull();
    expect(rushResearch(g)).toBeNull();
    g.space.research = { id: 'rockets', left: 2 };
    expect(researchRushCost(g)).toBe(2 * GOLD.shop.researchPerDay);
    expect(rushResearch(g)).toBeNull();
    addGold(g, 100);
    expect(rushResearch(g)).toBe('rockets');
    expect(g.space.techs).toContain('rockets');
    expect(g.space.research).toBeNull();
    expect(g.gold.bars).toBe(100 - 2 * GOLD.shop.researchPerDay);
  });

  it('cargo runs only for founded colonies; boosts and golden tools once a day', async () => {
    const m = await import('../../src/core/goldShop');
    const g = ready();
    addGold(g, 100);
    expect(m.shipMaterial(g, 'regolith')).toBe(false);
    g.space.colonies = ['mars'];
    expect(m.shippableMaterials(g)).toEqual(['regolith']);
    expect(m.shipMaterial(g, 'regolith')).toBe(true);
    expect(g.space.mat.regolith).toBe(GOLD.shop.material.n);
    const brand = g.brand;
    expect(m.boostBrand(g)).toBe(true);
    expect(g.brand).toBe(brand + GOLD.shop.brand.n);
    expect(m.boostBrand(g)).toBe(false);
    expect(m.goldenTools(g)).toBe(true);
    expect(g.day.premiumOnce).toBe(true);
    expect(m.canGoldenTools(g)).toBe(false);
    const seed = g.day.mseed;
    expect(m.goldReroll(g)).toBe(true);
    expect(g.day.mseed).not.toBe(seed);
    g.day.ph = 'workshop';
    expect(m.canGoldReroll(g)).toBe(false);
  });

  it('golden decorations cost Gold Bars, not coins', async () => {
    const { DECOR, buyDecor, decorStatus } = await import('../../src/core/decor');
    const g = ready();
    const d = DECOR.find((x) => x.gold)!;
    g.coins = 1e6;
    expect(decorStatus(g, d)).toBe('poor');
    addGold(g, d.gold!);
    expect(buyDecor(g, d.id)).toBe(true);
    expect(g.coins).toBe(1e6);
    expect(g.gold.bars).toBe(0);
    expect(decorStatus(g, d)).toBe('owned');
  });
});
