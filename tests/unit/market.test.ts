import { describe, expect, it } from 'vitest';
import { ITEMS, market } from '../../src/core/data';
import {
  applyAppraiserTip,
  availableMarkets,
  buyOffer,
  canBuy,
  generateOffers,
  haggle,
  inventoryFull,
  offerEstimate,
  priceFor,
  rerollMarket,
  setMarket,
  slotsLeft,
  tutorialOffer,
  visibleRarity,
} from '../../src/core/market';
import { newGame } from '../../src/core/state';
import { catalogState } from '../../src/core/catalog';
import { marketSlots } from '../../src/core/perks';
import { game } from './helpers';

describe('market generation', () => {
  it('day 1 before the tutorial is a single dirty mug', () => {
    const g = newGame(1);
    const offers = generateOffers(g);
    expect(offers).toHaveLength(1);
    expect(ITEMS[offers[0].a].id).toBe('kit_polka_dot_mug');
    expect(tutorialOffer().ask).toBeLessThanOrEqual(g.coins);
  });
  it('is deterministic and within the count range', () => {
    const g = game();
    const a = generateOffers(g);
    const b = generateOffers(g);
    expect(a).toEqual(b);
    const m = market('flea');
    expect(a.length).toBeGreaterThanOrEqual(m.count[0]);
    expect(a.length).toBeLessThanOrEqual(m.count[1]);
    for (const o of a) expect(['kitchen', 'ceramics']).toContain(ITEMS[o.a].cat);
  });
  it('hides gems unless revealed (~5% gems over many days)', () => {
    let gems = 0;
    let total = 0;
    for (let d = 2; d < 300; d++) {
      const g = game(d * 31);
      g.day.mseed = d;
      for (const o of generateOffers(g)) {
        total++;
        if (o.r === 3) {
          gems++;
          expect(o.apparent).toBe(0);
          expect(visibleRarity(g, o)).toBe(0);
          applyAppraiserTip(g, o);
          expect(visibleRarity(g, o)).toBe(3);
        }
      }
    }
    expect(gems / total).toBeGreaterThan(0.02);
    expect(gems / total).toBeLessThan(0.08);
  });
  it('appraiser pass reveals gems up front', () => {
    for (let d = 2; d < 200; d++) {
      const g = game(d);
      g.perks.push('appraiser_pass');
      g.day.mseed = d * 17;
      for (const o of generateOffers(g)) expect(o.apparent).toBe(o.r);
    }
  });
});

describe('buying and haggling', () => {
  it('buys within slots and coins', () => {
    const g = game();
    g.coins = 100000;
    const offers = generateOffers(g);
    const slots = marketSlots(g);
    for (let i = 0; i < slots; i++) expect(buyOffer(g, offers[i])).not.toBeNull();
    expect(slotsLeft(g)).toBe(0);
    expect(canBuy(g, offers[slots])).toBe('no_slots');
    expect(canBuy(g, offers[0])).toBe('already');
    expect(catalogState(g, offers[0].a)).toBeGreaterThan(0);
    expect(g.day.stats.spent).toBeGreaterThan(0);
  });
  it('refuses when broke or full', () => {
    const g = game();
    g.coins = 0;
    const o = generateOffers(g)[0];
    expect(canBuy(g, o)).toBe('no_coins');
    expect(buyOffer(g, o)).toBeNull();
    g.coins = 1e6;
    for (let i = 0; i < 40; i++)
      g.inv.push({
        ...g.inv[0],
        uid: i,
        a: 0,
        r: 0,
        rev: true,
        s: 1,
        d: 0,
        paid: 1,
        q: 1,
        sc: [],
        col: '',
        day: 1,
      });
    expect(inventoryFull(g)).toBe(true);
    expect(canBuy(g, o)).toBe('full');
  });
  it('one haggle per item: accepted locks the offer, rejected locks full price', () => {
    const g = game();
    const offers = generateOffers(g);
    const o = offers[0];
    expect(haggle(g, o, o.ask)).toBe('accepted');
    expect(haggle(g, o, 1)).toBe('invalid');
    const o2 = offers[1];
    expect(haggle(g, o2, Math.ceil(o2.ask * 0.96))).toBe('accepted');
    expect(priceFor(g, o2)).toBeLessThanOrEqual(o2.ask);
    const o3 = offers[2];
    expect(haggle(g, o3, 1)).toBe('rejected');
    expect(priceFor(g, o3)).toBe(o3.ask);
  });
  it('estimates narrow with an appraiser tip', () => {
    const g = game();
    const o = generateOffers(g)[0];
    const [a, b] = offerEstimate(g, o);
    applyAppraiserTip(g, o);
    applyAppraiserTip(g, o);
    const [c, d] = offerEstimate(g, o);
    expect(d - c).toBeLessThanOrEqual(b - a);
  });
  it('reroll gives a new offering but keeps slot usage', () => {
    const g = game();
    g.coins = 1e5;
    const before = generateOffers(g);
    buyOffer(g, before[0]);
    rerollMarket(g);
    const after = generateOffers(g);
    expect(after).not.toEqual(before);
    expect(slotsLeft(g)).toBe(marketSlots(g) - 1);
    expect(canBuy(g, after[0])).toBe('ok');
  });
  it('market selection respects tier and purchases', () => {
    const g = game();
    expect(availableMarkets(g).map((m) => m.id)).toEqual(['flea']);
    expect(setMarket(g, 'estate')).toBe(false);
    g.tier = 2;
    expect(setMarket(g, 'estate')).toBe(true);
    g.coins = 1e5;
    buyOffer(g, generateOffers(g)[0]);
    expect(setMarket(g, 'flea')).toBe(false);
  });
});
