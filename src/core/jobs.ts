/**
 * Workshops and customer jobs. Later in the game you can open a Repair Shop, then a Computer
 * Workshop and a Car Garage. Each day, customers bring work in (fix a radio, rebuild a PC, swap a
 * car's engine). A job is restored in the workshop like your own items, but it is not yours to
 * sell: when it is done the customer pays the fee, plus a tip for great work.
 */
import { CATEGORIES, ITEMS, PERSONAS, RECIPES, categoriesForTier } from './data';
import { Rng, hashSeed } from './prng';
import { addXp } from './progression';
import { makeInstance, recipeFor } from './items';
import type { JobKind } from './repair';
import type { GameState, ItemInstance } from './state';
import type { CategoryId } from './types';

export type WorkshopId = 'repair' | 'computer' | 'garage';

export interface WorkshopDef {
  id: WorkshopId;
  /** Shop tier needed. */
  tier: number;
  cost: number;
  /** Workshop that must be owned first. */
  needs?: WorkshopId;
  /** The kind of job it brings in. */
  kind: JobKind;
  /** Job offers per day. */
  offers: number;
}

export const WORKSHOPS: WorkshopDef[] = [
  { id: 'repair', tier: 2, cost: 600, kind: 'service', offers: 2 },
  { id: 'computer', tier: 3, cost: 1800, needs: 'repair', kind: 'pc', offers: 1 },
  { id: 'garage', tier: 4, cost: 3500, needs: 'repair', kind: 'engine', offers: 1 },
];

export type WorkshopStatus = 'owned' | 'available' | 'poor' | 'locked' | 'needs';

export function workshopStatus(state: GameState, w: WorkshopDef): WorkshopStatus {
  if (state.workshops.includes(w.id)) return 'owned';
  if (state.tier < w.tier) return 'locked';
  if (w.needs && !state.workshops.includes(w.needs)) return 'needs';
  if (state.coins < w.cost) return 'poor';
  return 'available';
}

export function buyWorkshop(state: GameState, id: WorkshopId): boolean {
  const w = WORKSHOPS.find((x) => x.id === id);
  if (!w || workshopStatus(state, w) !== 'available') return false;
  state.coins -= w.cost;
  state.workshops.push(id);
  return true;
}

export function hasWorkshop(state: GameState): boolean {
  return state.workshops.length > 0;
}

/** Workshops the player could buy right now (for "!" badges). */
export function affordableWorkshops(state: GameState): number {
  return WORKSHOPS.filter((w) => workshopStatus(state, w) === 'available').length;
}

/** A job a customer offers today. */
export interface JobOffer {
  /** Item archetype. */
  a: number;
  s: number;
  d: number;
  k: JobKind;
  fee: number;
  /** Persona id of the customer. */
  p: string;
}

/** Categories with something electrical or mechanical to repair (a wire or Repair step). */
export function serviceCategories(tier: number): CategoryId[] {
  return categoriesForTier(tier).filter((c) => RECIPES[c].some((s) => s.k === 'wire' || s.k === 'fix'));
}

const round5 = (v: number) => Math.round(v / 5) * 5;

/** What a job pays (before the tip): big jobs pay a lot. */
export function jobFee(base: number, k: JobKind, d: number): number {
  switch (k) {
    case 'service':
      return round5(base * 0.35 + 20 + d * 10);
    case 'pc':
      return round5(base * 0.8 + 150 + d * 20);
    case 'engine':
      return round5(base * 1.0 + 400 + d * 40);
  }
}

/** Today's job offers (deterministic per save and day). */
export function jobOffers(state: GameState): JobOffer[] {
  const rng = new Rng(hashSeed(state.seed, 'jobs', state.day.n));
  const out: JobOffer[] = [];
  for (const w of WORKSHOPS) {
    if (!state.workshops.includes(w.id)) continue;
    const cats: CategoryId[] =
      w.kind === 'service' ? serviceCategories(state.tier) : w.kind === 'pc' ? ['tech'] : ['vehicles'];
    const pool = ITEMS.map((it, a) => ({ it, a })).filter(
      (x) =>
        cats.includes(x.it.cat) && CATEGORIES.some((c) => c.id === x.it.cat && c.unlockTier <= state.tier),
    );
    if (!pool.length) continue;
    for (let i = 0; i < w.offers; i++) {
      const { it, a } = rng.pick(pool);
      const d = rng.int(1, 2);
      const people = PERSONAS.filter((p) => p.cats.includes(it.cat) && p.minTier <= state.tier);
      const p = people.length ? rng.pick(people).id : rng.pick(PERSONAS).id;
      out.push({ a, s: rng.int(1000, 2 ** 30), d, k: w.kind, fee: jobFee(it.base, w.kind, d), p });
    }
  }
  return out;
}

/** Takes on job `index` of today's offers: the customer's item goes into the workshop queue. */
export function acceptJob(state: GameState, index: number): ItemInstance | null {
  if (state.day.ph !== 'market' || state.day.jobs.includes(index)) return null;
  const o = jobOffers(state)[index];
  if (!o) return null;
  const inst = makeInstance(state, o.a, 0, o.s, o.d, 0, true);
  inst.job = { fee: o.fee, p: o.p, k: o.k };
  inst.sc = recipeFor(inst).map(() => null);
  state.inv.push(inst);
  state.day.jobs.push(index);
  return inst;
}

/** Fee plus a tip for great work (up to +20% for a perfect job). */
export function jobPay(fee: number, quality: number): { fee: number; tip: number } {
  return { fee, tip: Math.round(fee * Math.max(0, quality - 0.6) * 0.5) };
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
  const rep = inst.q >= 0.95 ? 3 : 2;
  state.rep += rep;
  state.day.stats.rep += rep;
  const xp = 10 + pay / 20;
  const levelUps = addXp(state, xp);
  return { fee, tip, xp: Math.round(xp), rep, levelUps };
}
