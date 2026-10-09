/**
 * Custom engineering: a client asks for a new design to a spec (enough power, not too heavy, within
 * budget). The player picks one part for each slot of a blueprint. Pure: part data
 * (src/data/designs.json), spec generation (always solvable), totals and score.
 */
import designsJson from '../data/designs.json';
import { Rng, hashSeed } from './prng';

export interface DesignPart {
  name: string;
  power: number;
  weight: number;
  cost: number;
}

export interface DesignDef {
  /** What "power" means for this business (speed, strength, thrust). */
  power: string;
  slots: Array<{ type: string; u: number; v: number }>;
  parts: Record<string, DesignPart[]>;
}

type RawDef = {
  power: string;
  slots: DesignDef['slots'];
  parts: Record<string, Array<[string, number, number, number]>>;
};

export const DESIGNS: Record<string, DesignDef> = Object.fromEntries(
  Object.entries(designsJson as unknown as Record<string, RawDef>).map(([id, d]) => [
    id,
    {
      power: d.power,
      slots: d.slots,
      parts: Object.fromEntries(
        Object.entries(d.parts).map(([k, list]) => [
          k,
          list.map(([name, power, weight, cost]) => ({ name, power, weight, cost })),
        ]),
      ),
    },
  ]),
);

export function designFor(business: string): DesignDef | undefined {
  return DESIGNS[business];
}

/** The client's spec: at least `power`, at most `weight` and `cost`. */
export interface DesignSpec {
  power: number;
  weight: number;
  cost: number;
}

export interface DesignTotals {
  power: number;
  weight: number;
  cost: number;
}

/** Totals of a design; `picks[i]` is the part index chosen for slot i (-1 = empty). */
export function designTotals(def: DesignDef, picks: number[]): DesignTotals {
  const t = { power: 0, weight: 0, cost: 0 };
  def.slots.forEach((s, i) => {
    const p = def.parts[s.type][picks[i]];
    if (!p) return;
    t.power += p.power;
    t.weight += p.weight;
    t.cost += p.cost;
  });
  return t;
}

export function meetsSpec(t: DesignTotals, spec: DesignSpec): boolean {
  return t.power >= spec.power && t.weight <= spec.weight && t.cost <= spec.cost;
}

/** 0..1: each of power, weight and budget counts a third; full marks when the spec is met. */
export function designScore(t: DesignTotals, spec: DesignSpec): number {
  const p = Math.min(1, t.power / Math.max(1, spec.power));
  const w = t.weight <= spec.weight ? 1 : spec.weight / t.weight;
  const c = t.cost <= spec.cost ? 1 : spec.cost / t.cost;
  return (p + w + c) / 3;
}

function allPicks(def: DesignDef): number[][] {
  let out: number[][] = [[]];
  for (const s of def.slots) {
    const n = def.parts[s.type].length;
    out = out.flatMap((p) => Array.from({ length: n }, (_, i) => [...p, i]));
  }
  return out;
}

/**
 * A spec made from a hidden mixed design (never all-cheapest or all-best), loosened a little, so it
 * can always be met but takes some thinking: the strongest parts are too heavy or too pricey.
 */
export function makeSpec(def: DesignDef, seed: number): DesignSpec {
  const rng = new Rng(hashSeed(seed, 'design'));
  const picks = def.slots.map(() => 0);
  for (let tries = 0; tries < 20; tries++) {
    for (let i = 0; i < picks.length; i++) picks[i] = rng.int(0, def.parts[def.slots[i].type].length - 1);
    if (new Set(picks).size > 1) break;
  }
  const t = designTotals(def, picks);
  return {
    power: Math.floor(t.power * 0.95),
    weight: Math.ceil(t.weight * 1.05),
    cost: Math.ceil((t.cost * 1.05) / 10) * 10,
  };
}

/** A design meeting the spec with the most power (for hints and the test bot). */
export function solveDesign(def: DesignDef, spec: DesignSpec): number[] | null {
  let best: number[] | null = null;
  let bestPower = -1;
  for (const p of allPicks(def)) {
    const t = designTotals(def, p);
    if (meetsSpec(t, spec) && t.power > bestPower) {
      best = p;
      bestPower = t.power;
    }
  }
  return best;
}
