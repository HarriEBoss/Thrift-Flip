/**
 * Customer jobs. Every business you own (after the Reselling Shop) gets jobs each day: fix a phone,
 * rebuild a PC, swap a car's engine, repair a robot or a rocket (business.jobs in balance.json). A job
 * is restored in the workshop like your own items, but it is not yours to sell: when it is done the
 * customer pays the fee, plus a tip for great work.
 */
import { BALANCE, ITEMS, PERSONAS } from './data';
import { Rng, hashSeed } from './prng';
import { addXp } from './progression';
import { makeInstance, recipeFor } from './items';
import { BUSINESSES, business, ownsBusiness } from './empire';
import type { JobKind } from './repair';
import type { GameState, ItemInstance } from './state';
import type { JobDef } from './types';

/** A job a customer offers today. */
export interface JobOffer {
  /** Stable id for today: business ladder index x 10 + slot. */
  id: number;
  /** Business it belongs to. */
  b: string;
  /** Item archetype. */
  a: number;
  s: number;
  d: number;
  k: JobKind;
  fee: number;
  /** Persona id of the customer. */
  p: string;
}

const round5 = (v: number) => Math.round(v / 5) * 5;

/** What a job pays (before the tip). */
export function jobFee(base: number, def: Pick<JobDef, 'fee'>, d: number): number {
  return round5(base * def.fee[0] + def.fee[1] + d * def.fee[2]);
}

/** Today's job offers at one business (deterministic per save, day and business). */
export function businessOffers(state: GameState, id: string): JobOffer[] {
  const bi = BUSINESSES.findIndex((b) => b.id === id);
  const b = BUSINESSES[bi];
  if (!b || !ownsBusiness(state, id)) return [];
  const rng = new Rng(hashSeed(state.seed, 'jobs', state.day.n, id));
  const out: JobOffer[] = [];
  let slot = 0;
  for (const def of b.jobs) {
    const pool = ITEMS.map((it, a) => ({ it, a })).filter(
      (x) => def.cats.includes(x.it.cat) && (!def.shapes || def.shapes.includes(x.it.shape)),
    );
    for (let i = 0; i < def.n && pool.length; i++) {
      const { it, a } = rng.pick(pool);
      const d = rng.int(1, 2);
      const people = PERSONAS.filter((p) => p.cats.includes(it.cat));
      const p = people.length ? rng.pick(people).id : rng.pick(PERSONAS).id;
      out.push({
        id: bi * 10 + slot++,
        b: id,
        a,
        s: rng.int(1000, 2 ** 30),
        d,
        k: def.k,
        fee: jobFee(it.base, def, d),
        p,
      });
    }
  }
  return out;
}

/** Every job on offer today, at every business you own. */
export function jobOffers(state: GameState): JobOffer[] {
  return BUSINESSES.flatMap((b) => businessOffers(state, b.id));
}

/** Jobs still open today at a business. */
export function openJobs(state: GameState, id: string): number {
  return businessOffers(state, id).filter((o) => !state.day.jobs.includes(o.id)).length;
}

/** Takes on job `id`: the customer's item goes into the workshop queue. */
export function acceptJob(state: GameState, id: number): ItemInstance | null {
  if (state.day.ph !== 'market' || state.day.jobs.includes(id)) return null;
  const o = jobOffers(state).find((x) => x.id === id);
  if (!o) return null;
  const inst = makeInstance(state, o.a, 0, o.s, o.d, 0, true);
  inst.job = { fee: o.fee, p: o.p, k: o.k };
  inst.sc = recipeFor(inst).map(() => null);
  state.inv.push(inst);
  state.day.jobs.push(id);
  return inst;
}

/** Fee plus a tip for great work (up to +20% for a perfect job with the default balance). */
export function jobPay(fee: number, quality: number): { fee: number; tip: number } {
  const t = BALANCE.empire.jobTip;
  return { fee, tip: Math.round(fee * Math.max(0, quality - t.from) * t.rate) };
}

export interface JobResult {
  fee: number;
  tip: number;
  xp: number;
  rep: number;
  levelUps: number;
}

/** The customer collects a finished job and pays. */
export function completeJob(state: GameState, inst: ItemInstance): JobResult {
  const idx = state.inv.indexOf(inst);
  if (idx < 0 || !inst.job) throw new Error('not a job in the inventory');
  if (inst.q < 0) throw new Error('job not finished');
  state.inv.splice(idx, 1);
  const { fee, tip } = jobPay(inst.job.fee, inst.q);
  const pay = fee + tip;
  state.coins += pay;
  state.day.stats.revenue += pay;
  state.stats.revenue += pay;
  state.stats.profit += pay;
  const r = BALANCE.empire.jobRep;
  const rep = inst.q >= 0.95 ? r.perfect : r.done;
  state.rep += rep;
  state.day.stats.rep += rep;
  const xp = 10 + pay / 20;
  const levelUps = addXp(state, xp);
  return { fee, tip, xp: Math.round(xp), rep, levelUps };
}

export { business };
