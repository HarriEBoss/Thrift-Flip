import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/core/data';
import {
  advancePhase,
  applyDoubleDay,
  canAdvance,
  completeSale,
  dayProfit,
  doubleDayAmount,
  finishRestoration,
  grantBonus,
  recordStep,
  shelfItems,
  workshopQueue,
} from '../../src/core/day';
import { buyOffer, generateOffers } from '../../src/core/market';
import { recipeFor, makeInstance } from '../../src/core/items';
import { newGame } from '../../src/core/state';
import { generateVisits, chooseItem, respondToPrice } from '../../src/core/customers';
import { game } from './helpers';

describe('day state machine', () => {
  it('only allows market -> workshop -> shop -> summary -> market', () => {
    const g = game();
    expect(canAdvance(g, 'shop')).toBe(false);
    expect(() => advancePhase(g, 'shop')).toThrow();
    advancePhase(g, 'workshop');
    advancePhase(g, 'shop');
    advancePhase(g, 'summary');
    const n = g.day.n;
    advancePhase(g, 'market');
    expect(g.day.n).toBe(n + 1);
    expect(g.day.ph).toBe('market');
  });
  it('the tutorial day flows to a first sale', () => {
    const g = newGame(99);
    const [mug] = generateOffers(g);
    const inst = buyOffer(g, mug)!;
    expect(inst).not.toBeNull();
    advancePhase(g, 'workshop');
    expect(workshopQueue(g)).toHaveLength(1);
    const recipe = recipeFor(inst);
    expect(recipe.map((s) => s.k)).toEqual(['scrub', 'polish']);
    recordStep(inst, 0, 0.98);
    recordStep(inst, 1, 0.97);
    const r = finishRestoration(g, inst);
    expect(r.quality).toBeGreaterThan(0.95);
    expect(r.stars).toBe(3);
    expect(r.newPerfect).toBe(true);
    advancePhase(g, 'shop');
    expect(shelfItems(g)).toHaveLength(1);
    const visits = generateVisits(g);
    const want = chooseItem(g, visits[0])!;
    const price = Math.floor(respondToPrice(g, visits[0], want, 1).counter);
    const sale = completeSale(g, want, price);
    expect(sale.profit).toBeGreaterThan(0);
    expect(g.stats.sold).toBe(1);
    advancePhase(g, 'summary');
    advancePhase(g, 'market');
    expect(g.flags.tutorialDone).toBe(true);
    expect(g.day.n).toBe(2);
  });
});

describe('restoration', () => {
  it('rejects skipping required steps and finishing early', () => {
    const g = game();
    const inst = makeInstance(g, 0, 0, 1234, 1, 5, true);
    g.inv.push(inst);
    const recipe = recipeFor(inst);
    const reqIdx = recipe.findIndex((s) => s.req);
    expect(() => recordStep(inst, reqIdx, null)).toThrow();
    expect(() => recordStep(inst, 99, 1)).toThrow();
    expect(() => finishRestoration(g, inst)).toThrow();
  });
  it('reveals hidden gems on restoration and paints', () => {
    const g = game();
    const inst = makeInstance(g, 0, 3, 1234, 1, 5, false);
    g.inv.push(inst);
    recipeFor(inst).forEach((s, i) => recordStep(inst, i, s.req ? 0.9 : null));
    const r = finishRestoration(g, inst, 'purple');
    expect(r.gemRevealed).toBe(true);
    expect(inst.rev).toBe(true);
    expect(inst.col).toBe('purple');
    expect(g.stats.gems).toBe(1);
  });
  it('announces a completed category set once', () => {
    const g = game();
    const kitchen = ITEMS.map((it, i) => [it, i] as const).filter(([it]) => it.cat === 'kitchen');
    let announced = 0;
    for (const [, a] of kitchen) {
      const inst = makeInstance(g, a, 0, 5, 0, 1, true);
      g.inv.push(inst);
      recipeFor(inst).forEach((_, i) => recordStep(inst, i, 1));
      if (finishRestoration(g, inst).setCompleted) announced++;
    }
    expect(announced).toBe(1);
  });
});

describe('selling and bonuses', () => {
  it('fulfils requests for bonus reputation', () => {
    const g = game();
    const a = ITEMS.findIndex((i) => i.cat === 'kitchen');
    const inst = makeInstance(g, a, 0, 5, 0, 2, true);
    g.inv.push(inst);
    recipeFor(inst).forEach((_, i) => recordStep(inst, i, 1));
    finishRestoration(g, inst);
    g.requests.push({ t: 'any_kitchen', p: 'chef', day: 2 });
    const res = completeSale(g, inst, 30, 0);
    expect(res.request).toBe(true);
    expect(g.requests).toHaveLength(0);
    expect(res.rep).toBeGreaterThanOrEqual(4);
    expect(() => completeSale(g, inst, 30)).toThrow();
  });
  it('cannot sell unrestored items', () => {
    const g = game();
    const inst = makeInstance(g, 0, 0, 5, 0, 2, true);
    g.inv.push(inst);
    expect(() => completeSale(g, inst, 10)).toThrow();
  });
  it('double day earnings once per day; bonuses add to lifetime profit', () => {
    const g = game();
    g.day.stats.revenue = 100;
    g.day.stats.spent = 40;
    expect(doubleDayAmount(g)).toBe(60);
    expect(applyDoubleDay(g)).toBe(60);
    expect(applyDoubleDay(g)).toBe(0);
    expect(dayProfit(g)).toBe(120);
    const p = g.stats.profit;
    expect(grantBonus(g, 10.4)).toBe(10);
    expect(g.stats.profit).toBe(p + 10);
  });
  it('requests expire after a week', () => {
    const g = game();
    g.requests.push({ t: 'any_kitchen', p: 'chef', day: 1 });
    g.day.n = 9;
    g.day.ph = 'summary';
    advancePhase(g, 'market');
    expect(g.requests).toHaveLength(0);
  });
});
