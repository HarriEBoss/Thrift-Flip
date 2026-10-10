/**
 * Contracts. Every business you own (after the Reselling Shop) gets contracts each day, signed in your
 * company's name: fix a phone, a fleet of scooters, rebuild a PC, swap a car's engine, repair a robot
 * or a rocket, or design something new (business.jobs / business.contract in balance.json). Each has a
 * difficulty (more stars, more pay) and a quality the client asks for. Contract items are restored in
 * the workshop like your own, but are not yours to sell: when one is done the client pays (less if the
 * quality target was missed, a tip for great work).
 */
import { BALANCE, ITEMS, PERSONAS } from './data';
import { Rng, hashSeed } from './prng';
import { addXp } from './progression';
import { makeInstance, recipeFor } from './items';
import { BUSINESSES, business, ownsBusiness } from './empire';
import { brandFlow } from './marketing';
import { designFor } from './design';
import { starsFor } from './economy';
import { conquerRegion, flagshipsAt, regionFx } from './regions';
import namesJson from '../data/names.json';
import type { JobKind } from './repair';
import type { GameState, ItemInstance } from './state';
import type { JobDef } from './types';

/** A contract a customer or client company offers today. */
export interface JobOffer {
  /** Stable id for today: business ladder index x 10 + slot. */
  id: number;
  /** Business it belongs to. */
  b: string;
  /** The items to fix (2-3 for a fleet order). The first is shown on the card. */
  items: Array<{ a: number; s: number; d: number }>;
  a: number;
  s: number;
  d: number;
  k: JobKind;
  /** Pay per item (before the tip). */
  fee: number;
  /** Persona id of the contact person. */
  p: string;
  /** Client company ('' = the contact person is the client). */
  client: string;
  /** Difficulty, 1-5 stars. */
  stars: number;
  /** Reveal stars the client asks for (1-3). */
  target: number;
  /** A region's flagship contract (delivering it conquers the region). */
  region?: string;
}

const round5 = (v: number) => Math.round(v / 5) * 5;

/** What a job pays (before difficulty, fleet bonus and tip). */
export function jobFee(base: number, def: Pick<JobDef, 'fee'>, d: number): number {
  return round5(base * def.fee[0] + def.fee[1] + d * def.fee[2]);
}

/** Pay for one item of a contract: harder contracts and bigger fleet orders pay more. */
export function contractFee(base: number, stars: number, count: number): number {
  const c = BALANCE.empire.contracts;
  return round5(base * (1 + c.payPerStar * (stars - 1)) * (1 + c.fleetBonus * (count - 1)));
}

const CLIENTS = (namesJson as { clients: Record<string, string[]> }).clients;

function topIndex(state: GameState): number {
  let top = 0;
  BUSINESSES.forEach((b, i) => {
    if (ownsBusiness(state, b.id)) top = i;
  });
  return top;
}

/**
 * Today's contracts at one business (deterministic per save, day and business). Difficulty scales
 * with the business and goes up a star once you own a bigger one; marketing (brand) brings more
 * offers; the biggest business you own also gets a custom design contract.
 */
export function businessOffers(state: GameState, id: string): JobOffer[] {
  const bi = BUSINESSES.findIndex((b) => b.id === id);
  const b = BUSINESSES[bi];
  if (!b || !ownsBusiness(state, id) || !b.contract) return [];
  const cfg = b.contract;
  const top = topIndex(state);
  const bonus = top > bi ? 1 : 0;
  const flow = brandFlow(state.brand);
  const boost = 1 + regionFx(state).contracts;
  const rng = new Rng(hashSeed(state.seed, 'jobs', state.day.n, id));
  const out: JobOffer[] = [];
  let slot = 0;
  const contact = (cat: string) => {
    const people = PERSONAS.filter((p) => p.cats.includes(cat as never));
    return people.length ? rng.pick(people).id : rng.pick(PERSONAS).id;
  };
  const poolFor = (def: JobDef) =>
    ITEMS.map((it, a) => ({ it, a })).filter(
      (x) => def.cats.includes(x.it.cat) && (!def.shapes || def.shapes.includes(x.it.shape)),
    );
  for (const def of b.jobs) {
    const pool = poolFor(def);
    const n = Math.min(4, Math.round(def.n * flow));
    for (let i = 0; i < n && pool.length; i++) {
      const stars = Math.min(5, rng.int(cfg.stars[0], cfg.stars[1]) + bonus);
      const target = rng.int(cfg.target[0], cfg.target[1]);
      const count = def.k === 'service' && rng.chance(cfg.fleet) ? rng.int(2, 3) : 1;
      const items = Array.from({ length: count }, () => {
        const { a } = rng.pick(pool);
        return { a, s: rng.int(1000, 2 ** 30), d: rng.int(1, 2) };
      });
      const first = items[0];
      const it = ITEMS[first.a];
      const p = contact(it.cat);
      // Always draw the client, so a difficulty bonus changes nothing else about the offer.
      const company = rng.pick(CLIENTS[id] ?? ['']);
      const client = count > 1 || stars >= 3 ? company : '';
      out.push({
        id: bi * 10 + slot++,
        b: id,
        items,
        ...first,
        k: def.k,
        fee: Math.round((contractFee(jobFee(it.base, def, first.d), stars, count) * boost) / 5) * 5,
        p,
        client,
        stars,
        target,
      });
    }
  }
  if (cfg.design && bi === top && designFor(id)) {
    // Custom engineering: design something new for a client, then build it.
    const def = b.jobs.find((j) => j.k !== 'service') ?? b.jobs[0];
    const pool = poolFor(def);
    if (pool.length) {
      const { it, a } = rng.pick(pool);
      const stars = Math.min(5, cfg.stars[1] + bonus);
      const dp = BALANCE.empire.contracts.designPay;
      out.push({
        id: bi * 10 + slot,
        b: id,
        items: [{ a, s: rng.int(1000, 2 ** 30), d: 0 }],
        a,
        s: 0,
        d: 0,
        k: 'design',
        fee: round5(contractFee(round5(it.base * dp[0] + dp[1]), stars, 1) * boost),
        p: contact(it.cat),
        client: rng.pick(CLIENTS[id] ?? ['']),
        stars,
        target: 1,
      });
      const last = out[out.length - 1];
      last.s = last.items[0].s;
    }
  }
  // Flagship contracts of regions whose office is open (slots 9, 8, 7).
  flagshipsAt(state, id).forEach((r, k) => {
    const def = b.jobs.find((j) => j.k !== 'service') ?? b.jobs[0];
    const pool = poolFor(def);
    if (!pool.length || k > 2) return;
    const fr = new Rng(hashSeed(state.seed, 'flagship', r.id));
    const { it, a } = fr.pick(pool);
    const dp = BALANCE.empire.contracts.designPay;
    const base = contractFee(round5(it.base * dp[0] + dp[1]), 5, 1);
    out.push({
      id: bi * 10 + 9 - k,
      b: id,
      items: [{ a, s: fr.int(1000, 2 ** 30), d: 0 }],
      a,
      s: 0,
      d: 0,
      k: 'design',
      fee: round5(base * BALANCE.empire.regions.flagshipPay * boost),
      p: contact(it.cat),
      client: r.client,
      stars: 5,
      target: 1,
      region: r.id,
    });
    const last = out[out.length - 1];
    last.s = last.items[0].s;
  });
  return out;
}

/** Every contract on offer today, at every business you own. */
export function jobOffers(state: GameState): JobOffer[] {
  return BUSINESSES.flatMap((b) => businessOffers(state, b.id));
}

/** Contracts still open today at a business. */
export function openJobs(state: GameState, id: string): number {
  return businessOffers(state, id).filter((o) => !state.day.jobs.includes(o.id)).length;
}

/** Signs contract `id`: its items go into the workshop queue. Returns them. */
export function signContract(state: GameState, id: number): ItemInstance[] {
  if (state.day.ph !== 'market' || state.day.jobs.includes(id)) return [];
  const o = jobOffers(state).find((x) => x.id === id);
  if (!o) return [];
  const out = o.items.map((x) => {
    const inst = makeInstance(state, x.a, 0, x.s, x.d, 0, true);
    inst.job = {
      fee: o.fee,
      p: o.p,
      k: o.k,
      t: o.target,
      ...(o.client ? { c: o.client } : {}),
      ...(o.region ? { r: o.region } : {}),
    };
    inst.sc = recipeFor(inst).map(() => null);
    state.inv.push(inst);
    return inst;
  });
  state.day.jobs.push(id);
  return out;
}

/** Takes on job `id` (a one-item contract): returns its item. */
export function acceptJob(state: GameState, id: number): ItemInstance | null {
  return signContract(state, id)[0] ?? null;
}

/** Fee plus a tip for great work (up to +20% for a perfect job with the default balance). */
export function jobPay(fee: number, quality: number): { fee: number; tip: number } {
  const t = BALANCE.empire.jobTip;
  return { fee, tip: Math.round(fee * Math.max(0, quality - t.from) * t.rate) };
}

export interface JobResult {
  /** The client's quality target was missed (lower pay). */
  missed: boolean;
  /** Region conquered by this delivery. */
  region: string | null;
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
  // Missing the client's quality target lowers the pay (and there is no tip).
  const missed = !!inst.job.t && starsFor(inst.q) < inst.job.t;
  const { fee, tip } = missed
    ? { fee: Math.round(inst.job.fee * BALANCE.empire.contracts.belowTarget), tip: 0 }
    : jobPay(inst.job.fee, inst.q);
  const pay = fee + tip;
  state.coins += pay;
  state.day.stats.revenue += pay;
  state.stats.revenue += pay;
  state.stats.profit += pay;
  const r = BALANCE.empire.jobRep;
  const rep = missed ? 0 : inst.q >= 0.95 ? r.perfect : r.done;
  state.rep += rep;
  state.day.stats.rep += rep;
  const xp = 10 + pay / 20;
  const levelUps = addXp(state, xp);
  // A flagship contract delivered to the client's wishes conquers its region.
  const region = inst.job.r && !missed && conquerRegion(state, inst.job.r) ? inst.job.r : null;
  return { fee, tip, xp: Math.round(xp), rep, levelUps, missed, region };
}

export { business };
