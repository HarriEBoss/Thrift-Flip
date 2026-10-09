import { describe, expect, it } from 'vitest';
import {
  acceptJob,
  businessOffers,
  completeJob,
  jobFee,
  jobOffers,
  jobPay,
  openJobs,
} from '../../src/core/jobs';
import { BUSINESSES, business } from '../../src/core/empire';
import { ITEMS } from '../../src/core/data';
import { finishRestoration, recordStep, shelfItems, workshopQueue } from '../../src/core/day';
import { recipeFor } from '../../src/core/items';
import { inventoryFull } from '../../src/core/market';
import { deserialize, serialize } from '../../src/core/save/schema';
import { game } from './helpers';

const ALL = BUSINESSES.map((b) => b.id);
const owner = () => game(77, { tier: 4, coins: 0, biz: { own: [...ALL], cur: 'reselling' } });

describe('customer jobs', () => {
  it('the Reselling Shop has no jobs; each business offers jobs from its own categories', () => {
    expect(jobOffers(game(77, { tier: 4 }))).toEqual([]);
    const g = owner();
    for (const b of BUSINESSES) {
      const offers = businessOffers(g, b.id);
      expect(offers).toHaveLength(b.jobs.reduce((n, j) => n + j.n, 0));
      for (const o of offers) {
        const def = b.jobs.find((j) => j.k === o.k && j.cats.includes(ITEMS[o.a].cat));
        expect(def, `${b.id} ${ITEMS[o.a].cat}`).toBeTruthy();
        expect(o.fee).toBe(jobFee(ITEMS[o.a].base, def!, o.d));
        expect(o.b).toBe(b.id);
        if (def!.shapes) expect(def!.shapes).toContain(ITEMS[o.a].shape);
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

  it('bigger businesses pay more', () => {
    const g = owner();
    const avg = (id: string) => {
      const o = businessOffers(g, id);
      return o.reduce((n, x) => n + x.fee, 0) / o.length;
    };
    for (let i = 2; i < BUSINESSES.length; i++)
      expect(avg(BUSINESSES[i].id)).toBeGreaterThan(avg(BUSINESSES[i - 1].id));
  });

  it('a job goes into the workshop with a repair recipe, then the customer pays and takes it', () => {
    const g = owner();
    const o = businessOffers(g, 'computer').find((x) => x.k === 'pc')!;
    const inst = acceptJob(g, o.id)!;
    expect(inst.job).toEqual({ fee: o.fee, p: o.p, k: 'pc' });
    expect(recipeFor(inst).map((s) => s.k)).toEqual(['scrub', 'fix', 'polish']);
    expect(acceptJob(g, o.id)).toBeNull();
    expect(openJobs(g, 'computer')).toBe(businessOffers(g, 'computer').length - 1);
    expect(workshopQueue(g)).toContain(inst);
    // Jobs never take a shelf space away from buying.
    expect(inventoryFull(g)).toBe(false);
    recipeFor(inst).forEach((_, i) => recordStep(inst, i, 1));
    finishRestoration(g, inst);
    const before = g.coins;
    const r = completeJob(g, inst);
    expect(r.fee).toBe(inst.job!.fee);
    expect(r.tip).toBeGreaterThan(0);
    expect(g.coins).toBe(before + r.fee + r.tip);
    expect(g.inv).not.toContain(inst);
    expect(shelfItems(g)).toHaveLength(0);
    expect(g.day.stats.revenue).toBe(r.fee + r.tip);
  });

  it('a small repair job uses the item own repair (wiring for a lamp, Repair for a phone)', () => {
    const g = owner();
    for (const o of businessOffers(g, 'phone')) {
      const inst = acceptJob(g, o.id)!;
      const k = recipeFor(inst)[1].k;
      expect(k).toBe(ITEMS[o.a].cat === 'phones' ? 'fix' : 'wire');
    }
  });

  it('jobs are only taken on at the market, and not at businesses you do not own', () => {
    const g = owner();
    g.day.ph = 'workshop';
    expect(acceptJob(g, businessOffers(g, 'phone')[0].id)).toBeNull();
    expect(businessOffers(game(1), 'phone')).toEqual([]);
  });

  it('tips reward great work only', () => {
    expect(jobPay(100, 0.5).tip).toBe(0);
    expect(jobPay(100, 1).tip).toBe(20);
  });

  it('accepted jobs and job items survive a save', () => {
    const g = owner();
    const o = businessOffers(g, 'mechanic')[0];
    const inst = acceptJob(g, o.id)!;
    const back = deserialize(serialize(g));
    expect(back.day.jobs).toEqual([o.id]);
    expect(back.inv.find((i) => i.uid === inst.uid)?.job).toEqual(inst.job);
    expect(business('mechanic')).toBeTruthy();
  });
});
