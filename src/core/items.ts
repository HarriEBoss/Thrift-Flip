import { BALANCE, ITEMS, RECIPES } from './data';
import { Rng, hashSeed } from './prng';
import { itemValue, restorationQuality } from './economy';
import type { GameState, ItemInstance } from './state';
import type { CategoryId, ItemArchetype, Rarity, StepKind } from './types';
import { STEP_ORDER } from './types';
import { trendFor } from './trends';
import { catalogBonusFor } from './catalog';
import { decorFx } from './decor';
import { regionFx } from './regions';
import type { JobKind } from './repair';

export interface RecipeStep {
  k: StepKind;
  req: boolean;
}

export function archetype(inst: { a: number }): ItemArchetype {
  return ITEMS[inst.a];
}

/**
 * Restoration recipe: ordered list of 2-5 steps derived from the category template and the
 * instance seed. Heavier damage makes optional damage more likely. Deterministic.
 */
export function recipeFor(inst: { a: number; s: number; d: number; job?: { k: JobKind } }): RecipeStep[] {
  const arch = ITEMS[inst.a];
  if (inst.job) return jobRecipe(arch.cat, inst.job.k);
  // Tutorial mug: always scrub -> polish.
  if (inst.s === TUTORIAL_SEED)
    return [
      { k: 'scrub', req: true },
      { k: 'polish', req: false },
    ];
  const tmpl = RECIPES[arch.cat];
  const rng = new Rng(hashSeed('recipe', inst.s, inst.a));
  const boost = [0.75, 1, 1.25][inst.d] ?? 1;
  let steps: RecipeStep[] = [];
  for (const st of tmpl) {
    if (rng.chance(Math.min(1, st.p * (st.req ? 1 : boost)))) steps.push({ k: st.k, req: st.req });
  }
  // Ensure at least one required step.
  if (!steps.some((s) => s.req)) {
    const req = tmpl.find((s) => s.req) ?? tmpl[0];
    steps.push({ k: req.k, req: true });
  }
  // Ensure 2..5 steps.
  const optional = tmpl.filter((s) => !steps.some((x) => x.k === s.k));
  while (steps.length < 2 && optional.length) {
    const o = optional.splice(rng.int(0, optional.length - 1), 1)[0];
    steps.push({ k: o.k, req: false });
  }
  if (steps.length > 5) {
    const opt = steps.filter((s) => !s.req);
    rng.shuffle(opt);
    const drop = new Set(opt.slice(0, steps.length - 5));
    steps = steps.filter((s) => !drop.has(s));
  }
  steps.sort((a, b) => STEP_ORDER.indexOf(a.k) - STEP_ORDER.indexOf(b.k));
  return steps;
}

export const TUTORIAL_SEED = 777;

/**
 * A customer's job is about the repair: clean it, do the repair (wiring, or the full Repair step
 * for computers, cars and the big jobs), and an optional polish.
 */
function jobRecipe(cat: CategoryId, k: JobKind): RecipeStep[] {
  if (k === 'design')
    return [
      { k: 'design', req: true },
      { k: 'fix', req: true },
      { k: 'polish', req: false },
    ];
  const fix = k !== 'service' || RECIPES[cat].some((s) => s.k === 'fix');
  return [
    { k: 'scrub', req: true },
    { k: fix ? 'fix' : 'wire', req: true },
    { k: 'polish', req: false },
  ];
}

export function qualityOf(inst: ItemInstance): number {
  const recipe = recipeFor(inst);
  return restorationQuality(recipe.map((st, i) => ({ req: st.req, score: inst.sc[i] ?? null })));
}

/** True when every required step has a score. */
export function requiredDone(inst: ItemInstance): boolean {
  const recipe = recipeFor(inst);
  return recipe.every((st, i) => !st.req || typeof inst.sc[i] === 'number');
}

export function isRestored(inst: ItemInstance): boolean {
  return inst.q >= 0;
}

/** Colour currently shown for an item (painted colour overrides body). */
export function colorOf(inst: ItemInstance): string {
  return inst.col || ITEMS[inst.a].body;
}

/** Current sale value of an item in the player's state (trend, catalog set bonus, perks). */
export function instanceValue(state: GameState, inst: ItemInstance): number {
  const arch = ITEMS[inst.a];
  const q = inst.q >= 0 ? inst.q : 0;
  const trend = trendFor(state, arch.cat);
  const rareSale = inst.r >= 2 ? 1 + decorFx(state).rareSale : 1;
  const bonus = catalogBonusFor(state, arch.cat) * rareSale * (1 + regionFx(state).price);
  return itemValue(arch.base, inst.r, q, trend, bonus);
}

export function makeInstance(
  state: GameState,
  a: number,
  r: Rarity,
  s: number,
  d: number,
  paid: number,
  revealed: boolean,
): ItemInstance {
  const inst: ItemInstance = {
    uid: state.nextUid++,
    a,
    r,
    rev: revealed || r < 3,
    s,
    d,
    paid,
    q: -1,
    sc: [],
    col: '',
    day: state.day.n,
  };
  inst.sc = recipeFor(inst).map(() => null);
  return inst;
}

export function categoryOf(inst: { a: number }): CategoryId {
  return ITEMS[inst.a].cat;
}

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Hidden Gem'] as const;

export { BALANCE };
