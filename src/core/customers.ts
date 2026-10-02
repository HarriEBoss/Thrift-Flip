import { BALANCE, ITEMS, PERSONAS, REQUESTS, categoriesForTier, persona as personaDef } from './data';
import { Rng, hashSeed } from './prng';
import { customerDecision, isExtremeOverprice, maxPay, type CustomerResponse } from './economy';
import { colorOf, instanceValue, isRestored } from './items';
import { charmBonus, customersPerDay } from './perks';
import type { CustomerRequest, GameState, ItemInstance } from './state';
import type { Persona, RequestTemplate } from './types';

export interface Visit {
  /** Position in today's queue. */
  i: number;
  persona: string;
  /** 0..1 roll for maxPay. */
  roll: number;
  /** 0..1 roll for item choice. */
  pick: number;
  /** Request template id this customer will post (if any). */
  post: string | null;
  /** If this is a returning requester: index into state.requests. */
  returning: number | null;
}

export function requestTemplate(id: string): RequestTemplate {
  const r = REQUESTS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown request ${id}`);
  return r;
}

export function matchesRequest(inst: ItemInstance, tmpl: RequestTemplate): boolean {
  if (!isRestored(inst)) return false;
  const arch = ITEMS[inst.a];
  if (tmpl.cat && arch.cat !== tmpl.cat) return false;
  if (tmpl.color && colorOf(inst) !== tmpl.color) return false;
  if (tmpl.era && arch.era !== tmpl.era) return false;
  if (tmpl.minQ !== undefined && inst.q < tmpl.minQ) return false;
  if (tmpl.minRarity !== undefined && inst.r < tmpl.minRarity) return false;
  return true;
}

function eligiblePersonas(state: GameState): Persona[] {
  return PERSONAS.filter((p) => p.minTier <= state.tier);
}

function eligibleRequests(state: GameState): RequestTemplate[] {
  const cats = categoriesForTier(state.tier);
  return REQUESTS.filter((r) => !r.cat || cats.includes(r.cat));
}

/**
 * Today's customer queue. Deterministic per (seed, day). Returning requesters whose request
 * can be fulfilled from the current inventory come first.
 */
export function generateVisits(state: GameState): Visit[] {
  const rng = new Rng(hashSeed(state.seed, 'customers', state.day.n));
  const visits: Visit[] = [];
  const restored = state.inv.filter(isRestored);
  state.requests.forEach((req, ri) => {
    if (visits.length >= 2) return;
    const tmpl = requestTemplate(req.t);
    if (restored.some((it) => matchesRequest(it, tmpl))) {
      visits.push({
        i: visits.length,
        persona: req.p,
        roll: rng.next(),
        pick: rng.next(),
        post: null,
        returning: ri,
      });
    }
  });
  const n = customersPerDay(state);
  const personas = eligiblePersonas(state);
  const reqs = eligibleRequests(state);
  let pending = state.requests.length;
  const total = Math.min(8, n + visits.length);
  while (visits.length < total) {
    const p = personas[rng.weighted(personas.map((x) => x.weight))];
    let post: string | null = null;
    if (state.flags.tutorialDone && pending < 3 && rng.chance(0.22)) {
      post = rng.pick(reqs).id;
      pending++;
    }
    visits.push({
      i: visits.length,
      persona: p.id,
      roll: rng.next(),
      pick: rng.next(),
      post,
      returning: null,
    });
  }
  return visits;
}

/** The item a visiting customer wants (prefers their favourite categories). */
export function chooseItem(state: GameState, v: Visit): ItemInstance | null {
  const restored = state.inv.filter(isRestored);
  if (!restored.length) return null;
  if (v.returning !== null) {
    const req = state.requests[v.returning];
    if (req) {
      const tmpl = requestTemplate(req.t);
      const m = restored.filter((it) => matchesRequest(it, tmpl));
      if (m.length) return m.reduce((best, it) => (it.q > best.q ? it : best), m[0]);
    }
  }
  const p = personaDef(v.persona);
  const weights = restored.map((it) => (p.cats.includes(ITEMS[it.a].cat) ? 4 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = v.pick * total;
  for (let i = 0; i < restored.length; i++) {
    r -= weights[i];
    if (r < 0) return restored[i];
  }
  return restored[restored.length - 1];
}

export function visitWtp(state: GameState, v: Visit): number {
  const p = personaDef(v.persona);
  if (v.returning !== null) {
    const req = state.requests[v.returning];
    if (req) return p.wtp * requestTemplate(req.t).bonus;
  }
  return p.wtp;
}

export function visitMaxPay(state: GameState, v: Visit, inst: ItemInstance): number {
  return maxPay(instanceValue(state, inst), visitWtp(state, v), v.roll, charmBonus(state));
}

export interface PriceResponse {
  response: CustomerResponse;
  /** Counter-offer amount (= maxPay rounded down) when response is 'counter'. */
  counter: number;
  extreme: boolean;
}

export function respondToPrice(state: GameState, v: Visit, inst: ItemInstance, price: number): PriceResponse {
  const mp = visitMaxPay(state, v, inst);
  const response = customerDecision(price, mp);
  return {
    response,
    counter: Math.max(1, Math.floor(mp)),
    extreme: response === 'walk' && isExtremeOverprice(price, mp),
  };
}

export interface SaleResult {
  price: number;
  profit: number;
  xp: number;
  rep: number;
  levelUps: number;
  request: boolean;
}

export function postRequest(state: GameState, v: Visit): CustomerRequest | null {
  if (!v.post || state.requests.length >= 3) return null;
  if (state.requests.some((r) => r.t === v.post)) return null;
  const req = { t: v.post, p: v.persona, day: state.day.n };
  state.requests.push(req);
  return req;
}

export function walkAway(state: GameState, extreme: boolean): number {
  if (!extreme) return 0;
  const dip = BALANCE.rep.overprice;
  state.rep = Math.max(0, state.rep - dip);
  state.day.stats.rep -= dip;
  return -dip;
}
