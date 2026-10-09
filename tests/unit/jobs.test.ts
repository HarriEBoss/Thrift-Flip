import { describe, expect, it } from 'vitest';
import {
  acceptJob,
  businessOffers,
  completeJob,
  contractFee,
  jobFee,
  jobOffers,
  jobPay,
  openJobs,
  signContract,
} from '../../src/core/jobs';
import { BUSINESSES, business } from '../../src/core/empire';
import { BALANCE, ITEMS } from '../../src/core/data';
import { finishRestoration, recordStep, shelfItems, workshopQueue } from '../../src/core/day';
import { recipeFor } from '../../src/core/items';
import { inventoryFull } from '../../src/core/market';
import { deserialize, serialize } from '../../src/core/save/schema';
import type { GameState, ItemInstance } from '../../src/core/state';
import { game } from './helpers';

const ALL = BUSINESSES.map((b) => b.id);
const owner = (own = ALL) => game(77, { tier: 4, coins: 0, biz: { own: [...own], cur: 'reselling' } });

function finish(g: GameState, inst: ItemInstance, score: number) {
  recipeFor(inst).forEach((_, i) => recordStep(inst, i, score));
  finishRestoration(g, inst);
  return completeJob(g, inst);
}

describe('contracts', () => {
  it('the Reselling Shop has none; each business offers contracts from its own categories', () => {
    expect(jobOffers(game(77, { tier: 4 }))).toEqual([]);
    const g = owner();
    for (const b of BUSINESSES.slice(1)) {
      const offers = businessOffers(g, b.id).filter((o) => o.k !== 'design');
      expect(offers).toHaveLength(b.jobs.reduce((n, j) => n + j.n, 0));
      for (const o of offers) {
        const def = b.jobs.find((j) => j.k === o.k && j.cats.includes(ITEMS[o.a].cat))!;
        expect(def, `${b.id} ${ITEMS[o.a].cat}`).toBeTruthy();
        if (def.shapes) expect(def.shapes).toContain(ITEMS[o.a].shape);
        expect(o.fee).toBe(contractFee(jobFee(ITEMS[o.a].base, def, o.d), o.stars, o.items.length));
        expect(o.b).toBe(b.id);
        expect(o.stars).toBeGreaterThanOrEqual(1);
        expect(o.stars).toBeLessThanOrEqual(5);
        expect(o.target).toBeGreaterThanOrEqual(1);
        expect(o.target).toBeLessThanOrEqual(3);
        for (const it of o.items) expect(def.cats).toContain(ITEMS[it.a].cat);
      }
    }
    expect(businessOffers(g, 'computer').some((o) => o.k === 'pc')).toBe(true);
    expect(businessOffers(g, 'mechanic').some((o) => o.k === 'engine')).toBe(true);
  });

  it('offers are deterministic per day and have unique ids', () => {
    const a = jobOffers(owner());
    expect(jobOffers(owner())).toEqual(a);
    expect(new Set(a.map((o) => o.id)).size).toBe(a.length);
    const g = owner();
    g.day.n++;
    expect(jobOffers(g)).not.toEqual(a);
  });

  it('difficulty and pay scale with the tier: bigger businesses pay more, and earlier ones get harder', () => {
    const g = owner();
    const avg = (id: string, h = g) => {
      const o = businessOffers(h, id);
      return o.reduce((n, x) => n + x.fee, 0) / o.length;
    };
    for (let i = 2; i < BUSINESSES.length; i++)
      expect(avg(BUSINESSES[i].id)).toBeGreaterThan(avg(BUSINESSES[i - 1].id));
    // Owning a bigger business adds a star (and pay) to the smaller ones' contracts.
    const small = owner(['reselling', 'phone']);
    const big = owner(['reselling', 'phone', 'computer']);
    const stars = (h: GameState) => businessOffers(h, 'phone').map((o) => o.stars);
    expect(stars(big)).toEqual(stars(small).map((s) => Math.min(5, s + 1)));
    expect(avg('phone', big)).toBeGreaterThan(avg('phone', small));
    expect(contractFee(100, 3, 1)).toBeGreaterThan(contractFee(100, 1, 1));
    expect(contractFee(100, 1, 3)).toBeGreaterThan(contractFee(100, 1, 1));
  });

  it('fleet orders bring several items, all for the same client company', () => {
    let found = false;
    for (let d = 1; d < 40 && !found; d++) {
      const g = owner();
      g.day.n = d;
      const o = jobOffers(g).find((x) => x.items.length > 1);
      if (!o) continue;
      found = true;
      expect(o.client).not.toBe('');
      const items = signContract(g, o.id);
      expect(items).toHaveLength(o.items.length);
      for (const i of items) expect(i.job).toMatchObject({ fee: o.fee, c: o.client, t: o.target });
    }
    expect(found).toBe(true);
  });

  it('your biggest business gets a custom design contract: design, build, polish', () => {
    const g = owner(['reselling', 'phone', 'computer']);
    const des = businessOffers(g, 'computer').filter((o) => o.k === 'design');
    expect(des).toHaveLength(1);
    expect(businessOffers(g, 'phone').some((o) => o.k === 'design')).toBe(false);
    const inst = acceptJob(g, des[0].id)!;
    expect(recipeFor(inst).map((s) => s.k)).toEqual(['design', 'fix', 'polish']);
    const normal = businessOffers(g, 'computer').filter((o) => o.k !== 'design');
    expect(des[0].fee).toBeGreaterThan(Math.max(...normal.map((o) => o.fee)));
  });

  it('a contract goes into the workshop, then the client pays and takes it', () => {
    const g = owner();
    const o = businessOffers(g, 'computer').find((x) => x.k === 'pc')!;
    const inst = acceptJob(g, o.id)!;
    expect(inst.job).toMatchObject({ fee: o.fee, p: o.p, k: 'pc', t: o.target });
    expect(recipeFor(inst).map((s) => s.k)).toEqual(['scrub', 'fix', 'polish']);
    expect(acceptJob(g, o.id)).toBeNull();
    expect(openJobs(g, 'computer')).toBe(businessOffers(g, 'computer').length - 1);
    expect(workshopQueue(g)).toContain(inst);
    expect(inventoryFull(g)).toBe(false);
    const before = g.coins;
    const r = finish(g, inst, 1);
    expect(r.missed).toBe(false);
    expect(r.fee).toBe(inst.job!.fee);
    expect(r.tip).toBeGreaterThan(0);
    expect(g.coins).toBe(before + r.fee + r.tip);
    expect(g.inv).not.toContain(inst);
    expect(shelfItems(g)).toHaveLength(0);
  });

  it('missing the quality target pays less and earns no tip or reputation', () => {
    const g = owner();
    const o = businessOffers(g, 'mechanic')[0];
    const inst = acceptJob(g, o.id)!;
    inst.job!.t = 3;
    const rep = g.rep;
    const r = finish(g, inst, 0.6);
    expect(r.missed).toBe(true);
    expect(r.tip).toBe(0);
    expect(r.fee).toBe(Math.round(o.fee * BALANCE.empire.contracts.belowTarget));
    expect(g.rep).toBe(rep);
  });

  it('marketing brings more contracts', () => {
    const g = owner();
    const quiet = businessOffers(g, 'phone').length;
    g.brand = 1000;
    expect(businessOffers(g, 'phone').length).toBeGreaterThan(quiet);
  });

  it('a small repair uses the item own repair (wiring for a lamp, Repair for a phone)', () => {
    const g = owner();
    for (const o of businessOffers(g, 'phone')) {
      for (const inst of signContract(g, o.id)) {
        const k = recipeFor(inst)[1].k;
        expect(k).toBe(ITEMS[inst.a].cat === 'phones' ? 'fix' : 'wire');
      }
    }
  });

  it('contracts are only signed at the market, and only at businesses you own', () => {
    const g = owner();
    g.day.ph = 'workshop';
    expect(signContract(g, businessOffers(g, 'phone')[0].id)).toEqual([]);
    expect(businessOffers(game(1), 'phone')).toEqual([]);
  });

  it('tips reward great work only', () => {
    expect(jobPay(100, 0.5).tip).toBe(0);
    expect(jobPay(100, 1).tip).toBe(20);
  });

  it('signed contracts and their items survive a save', () => {
    const g = owner();
    const o = businessOffers(g, 'robotics')[0];
    const items = signContract(g, o.id);
    const back = deserialize(serialize(g));
    expect(back.day.jobs).toEqual([o.id]);
    for (const inst of items) expect(back.inv.find((i) => i.uid === inst.uid)?.job).toEqual(inst.job);
    expect(business('robotics')).toBeTruthy();
  });
});
