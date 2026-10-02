import { describe, expect, it } from 'vitest';
import { ITEMS, REQUESTS } from '../../src/core/data';
import {
  chooseItem,
  generateVisits,
  matchesRequest,
  postRequest,
  requestTemplate,
  respondToPrice,
  visitMaxPay,
  visitWtp,
  walkAway,
} from '../../src/core/customers';
import { makeInstance } from '../../src/core/items';
import { customersPerDay } from '../../src/core/perks';
import { game } from './helpers';

function restoredItem(g: ReturnType<typeof game>, a: number, q = 0.9) {
  const i = makeInstance(g, a, 0, 77, 0, 5, true);
  i.q = q;
  i.sc = i.sc.map(() => q);
  g.inv.push(i);
  return i;
}

describe('customer visits', () => {
  it('generates 3-8 deterministic visits', () => {
    const g = game();
    const v = generateVisits(g);
    expect(v).toEqual(generateVisits(g));
    expect(v.length).toBe(customersPerDay(g));
    for (let t = 0; t < 5; t++) {
      g.tier = t;
      g.rep = 500;
      g.perks = ['shop_expansion'];
      const n = generateVisits(g).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(8);
    }
  });
  it('returning requesters come first when a matching item is on the shelf', () => {
    const g = game();
    const mug = ITEMS.findIndex((i) => i.cat === 'kitchen');
    restoredItem(g, mug);
    g.requests.push({ t: 'any_kitchen', p: 'chef', day: 1 });
    const v = generateVisits(g);
    expect(v[0].returning).toBe(0);
    expect(chooseItem(g, v[0])?.a).toBe(mug);
    expect(visitWtp(g, v[0])).toBeGreaterThan(1.1);
  });
  it('chooses items, preferring favourite categories', () => {
    const g = game();
    expect(chooseItem(g, generateVisits(g)[0])).toBeNull();
    const k = ITEMS.findIndex((i) => i.cat === 'kitchen');
    const c = ITEMS.findIndex((i) => i.cat === 'ceramics');
    restoredItem(g, k);
    restoredItem(g, c);
    let kitchen = 0;
    for (let i = 0; i < 100; i++) {
      const it = chooseItem(g, {
        i,
        persona: 'bargain',
        roll: 0.5,
        pick: i / 100,
        post: null,
        returning: null,
      });
      if (it && ITEMS[it.a].cat === 'kitchen') kitchen++;
    }
    expect(kitchen).toBeGreaterThan(60);
  });
  it('responds to prices', () => {
    const g = game();
    const it = restoredItem(g, 0);
    const v = { i: 0, persona: 'student', roll: 0.5, pick: 0, post: null, returning: null };
    const mp = visitMaxPay(g, v, it);
    expect(respondToPrice(g, v, it, Math.floor(mp)).response).toBe('sale');
    const counter = respondToPrice(g, v, it, mp * 1.1);
    expect(counter.response).toBe('counter');
    expect(counter.counter).toBe(Math.floor(mp));
    const walk = respondToPrice(g, v, it, mp * 3);
    expect(walk.response).toBe('walk');
    expect(walk.extreme).toBe(true);
    g.rep = 5;
    expect(walkAway(g, true)).toBe(-1);
    expect(g.rep).toBe(4);
    expect(walkAway(g, false)).toBe(0);
  });
  it('requests match on category, colour, era, quality and rarity', () => {
    const g = game();
    const red = ITEMS.findIndex((i) => i.body === 'red' && i.cat === 'radios');
    const it = restoredItem(g, red, 0.95);
    expect(matchesRequest(it, requestTemplate('red_radio'))).toBe(true);
    expect(matchesRequest(it, requestTemplate('blue_lamp'))).toBe(false);
    expect(matchesRequest(it, requestTemplate('shiny'))).toBe(true);
    expect(matchesRequest(it, requestTemplate('rare_thing'))).toBe(false);
    expect(matchesRequest(it, requestTemplate(`era_${ITEMS[red].era}`))).toBe(true);
    it.col = 'blue';
    expect(matchesRequest(it, requestTemplate('blue_any'))).toBe(true);
    it.q = -1;
    expect(matchesRequest(it, requestTemplate('blue_any'))).toBe(false);
    expect(() => requestTemplate('nope')).toThrow();
    expect(REQUESTS.length).toBe(25);
  });
  it('posts at most 3 distinct requests', () => {
    const g = game();
    const base = { i: 0, persona: 'chef', roll: 0, pick: 0, returning: null };
    expect(postRequest(g, { ...base, post: null })).toBeNull();
    expect(postRequest(g, { ...base, post: 'any_kitchen' })).not.toBeNull();
    expect(postRequest(g, { ...base, post: 'any_kitchen' })).toBeNull();
    postRequest(g, { ...base, post: 'red_any' });
    postRequest(g, { ...base, post: 'blue_any' });
    expect(postRequest(g, { ...base, post: 'pink_any' })).toBeNull();
    expect(g.requests).toHaveLength(3);
  });
  it('posts some requests over many days', () => {
    let posts = 0;
    for (let d = 2; d < 60; d++) {
      const g = game(d);
      g.day.n = d;
      posts += generateVisits(g).filter((v) => v.post).length;
    }
    expect(posts).toBeGreaterThan(10);
  });
});
