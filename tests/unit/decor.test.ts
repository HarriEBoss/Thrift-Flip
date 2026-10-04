import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DECOR, affordableDecor, buyDecor, decorFx, decorStatus } from '../../src/core/decor';
import { charmBonus, customersPerDay } from '../../src/core/perks';
import { generateOffers, rarityWeights } from '../../src/core/market';
import { market } from '../../src/core/data';
import { advancePhase } from '../../src/core/day';
import { instanceValue, makeInstance } from '../../src/core/items';
import { nextGoal } from '../../src/core/progression';
import { deserialize } from '../../src/core/save/schema';
import { game } from './helpers';

describe('decorations', () => {
  it('has 10 decorations across all tiers', () => {
    expect(DECOR).toHaveLength(10);
    for (let t = 0; t <= 4; t++) expect(DECOR.some((d) => d.tier === t)).toBe(true);
  });
  it('locks by tier, needs coins, buys once', () => {
    const g = game();
    const plant = DECOR.find((d) => d.id === 'plant')!;
    const cat = DECOR.find((d) => d.id === 'cat')!;
    g.coins = 0;
    expect(decorStatus(g, plant)).toBe('poor');
    expect(decorStatus(g, cat)).toBe('locked');
    g.coins = 1000;
    expect(affordableDecor(g)).toBe(2);
    expect(buyDecor(g, 'plant')).toBe(true);
    expect(g.coins).toBe(1000 - plant.cost);
    expect(buyDecor(g, 'plant')).toBe(false);
    expect(buyDecor(g, 'cat')).toBe(false);
    expect(buyDecor(g, 'nope')).toBe(false);
    expect(decorStatus(g, plant)).toBe('owned');
  });
  it('bonuses change prices, customers, reputation and finds', () => {
    const g = game();
    g.tier = 4;
    g.coins = 1e6;
    const charm = charmBonus(g);
    const cust = customersPerDay(g);
    const mdef = market('estate');
    const w0 = rarityWeights(g, mdef);
    const gem = makeInstance(g, 0, 2, 5, 0, 1, true);
    gem.q = 1;
    const v0 = instanceValue(g, gem);
    for (const d of DECOR) buyDecor(g, d.id);
    const fx = decorFx(g);
    expect(fx.price).toBeCloseTo(0.18);
    expect(charmBonus(g)).toBeCloseTo(charm + 0.18);
    expect(customersPerDay(g)).toBe(Math.min(8, cust + 2));
    const w1 = rarityWeights(g, mdef);
    expect(w1[2]).toBeGreaterThan(w0[2]);
    expect(w1[3]).toBeGreaterThan(w0[3]);
    expect(instanceValue(g, gem)).toBeGreaterThan(v0);
    const rep = g.rep;
    g.day.ph = 'shop';
    advancePhase(g, 'summary');
    expect(g.rep).toBe(rep + 3);
  });
  it('bigger shops find better items', () => {
    const count = (tier: number) => {
      let rare = 0;
      for (let d = 2; d < 200; d++) {
        const g = game(d);
        g.tier = tier;
        g.day.market = 'flea';
        g.day.mseed = d * 13;
        rare += generateOffers(g).filter((o) => o.r >= 2).length;
      }
      return rare;
    };
    expect(count(4)).toBeGreaterThan(count(0) * 1.4);
  });
  it('next goal tracks the shop upgrade', () => {
    const g = game();
    g.coins = 50;
    g.rep = 4;
    const goal = nextGoal(g)!;
    expect(goal.tierId).toBe('garage');
    expect(goal.ready).toBe(false);
    expect(goal.progress).toBeCloseTo(0.5);
    g.coins = 500;
    expect(nextGoal(g)!.ready).toBe(true);
    g.tier = 4;
    expect(nextGoal(g)).toBeNull();
  });
  it('v1 saves migrate to v2 with no decorations', () => {
    const raw = readFileSync(new URL('../fixtures/saves/v1-midgame.json', import.meta.url), 'utf8');
    expect(JSON.parse(raw).v).toBe(1);
    expect(deserialize(raw).decor).toEqual([]);
  });
});
