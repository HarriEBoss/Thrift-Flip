import { describe, expect, it } from 'vitest';
import {
  WORKSHOPS,
  acceptJob,
  affordableWorkshops,
  buyWorkshop,
  completeJob,
  jobFee,
  jobOffers,
  jobPay,
  serviceCategories,
  workshopStatus,
} from '../../src/core/jobs';
import { ITEMS } from '../../src/core/data';
import { finishRestoration, recordStep, shelfItems, workshopQueue } from '../../src/core/day';
import { recipeFor } from '../../src/core/items';
import { inventoryFull } from '../../src/core/market';
import { deserialize, serialize } from '../../src/core/save/schema';
import { game } from './helpers';

const ws = (id: string) => WORKSHOPS.find((w) => w.id === id)!;

describe('workshops', () => {
  it('unlock with the shop tier; the computer and car workshops need the repair shop first', () => {
    const g = game(1, { coins: 100_000 });
    expect(workshopStatus(g, ws('repair'))).toBe('locked');
    g.tier = 2;
    expect(workshopStatus(g, ws('repair'))).toBe('available');
    g.tier = 4;
    expect(workshopStatus(g, ws('computer'))).toBe('needs');
    expect(workshopStatus(g, ws('garage'))).toBe('needs');
    expect(buyWorkshop(g, 'garage')).toBe(false);
    expect(buyWorkshop(g, 'repair')).toBe(true);
    expect(g.coins).toBe(100_000 - ws('repair').cost);
    expect(workshopStatus(g, ws('repair'))).toBe('owned');
    expect(affordableWorkshops(g)).toBe(2);
    g.coins = 10;
    expect(workshopStatus(g, ws('garage'))).toBe('poor');
    expect(buyWorkshop(g, 'garage')).toBe(false);
  });

  it('bigger workshops cost more and come later', () => {
    for (let i = 1; i < WORKSHOPS.length; i++) {
      expect(WORKSHOPS[i].cost).toBeGreaterThan(WORKSHOPS[i - 1].cost);
      expect(WORKSHOPS[i].tier).toBeGreaterThanOrEqual(WORKSHOPS[i - 1].tier);
    }
  });
});

describe('customer jobs', () => {
  const owner = () => game(77, { tier: 4, coins: 0, workshops: ['repair', 'computer', 'garage'] });

  it('no workshop, no jobs; offers are deterministic and match the workshop', () => {
    expect(jobOffers(game(77, { tier: 4 }))).toEqual([]);
    const g = owner();
    const a = jobOffers(g);
    expect(jobOffers(owner())).toEqual(a);
    expect(a.map((o) => o.k)).toEqual(['service', 'service', 'pc', 'engine']);
    for (const o of a) {
      const it = ITEMS[o.a];
      if (o.k === 'pc') expect(it.cat).toBe('tech');
      if (o.k === 'engine') expect(it.cat).toBe('vehicles');
      if (o.k === 'service') expect(serviceCategories(g.tier)).toContain(it.cat);
      expect(o.fee).toBe(jobFee(it.base, o.k, o.d));
    }
    g.day.n++;
    expect(jobOffers(g)).not.toEqual(a);
  });

  it('engine swaps pay the most, PC rebuilds a lot, small services a little', () => {
    expect(jobFee(800, 'engine', 1)).toBeGreaterThan(jobFee(800, 'pc', 1));
    expect(jobFee(400, 'pc', 1)).toBeGreaterThan(jobFee(400, 'service', 1));
    expect(jobFee(900, 'engine', 2)).toBeGreaterThan(1000);
  });

  it('a job goes into the workshop with a repair recipe, then the customer pays and takes it', () => {
    const g = owner();
    const offers = jobOffers(g);
    const pcIdx = offers.findIndex((o) => o.k === 'pc');
    const inst = acceptJob(g, pcIdx)!;
    expect(inst.job).toEqual({ fee: offers[pcIdx].fee, p: offers[pcIdx].p, k: 'pc' });
    expect(recipeFor(inst).map((s) => s.k)).toEqual(['scrub', 'fix', 'polish']);
    expect(acceptJob(g, pcIdx)).toBeNull();
    expect(workshopQueue(g)).toContain(inst);
    // Jobs never take a shelf space away from buying.
    expect(inventoryFull(g)).toBe(false);
    recordStep(inst, 0, 1);
    recordStep(inst, 1, 1);
    recordStep(inst, 2, 1);
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

  it('jobs are only taken on at the market', () => {
    const g = owner();
    g.day.ph = 'workshop';
    expect(acceptJob(g, 0)).toBeNull();
  });

  it('tips reward great work only', () => {
    expect(jobPay(100, 0.5).tip).toBe(0);
    expect(jobPay(100, 1).tip).toBe(20);
  });

  it('workshops, accepted jobs and job items survive a save', () => {
    const g = owner();
    const inst = acceptJob(g, 3)!;
    const back = deserialize(serialize(g));
    expect(back.workshops).toEqual(g.workshops);
    expect(back.day.jobs).toEqual([3]);
    expect(back.inv.find((i) => i.uid === inst.uid)?.job).toEqual(inst.job);
    expect(back.inv.filter((i) => i.job)).toHaveLength(1);
  });
});
