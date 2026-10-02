import { describe, expect, it } from 'vitest';
import { ITEMS, itemIndex } from '../../src/core/data';
import {
  TUTORIAL_SEED,
  archetype,
  categoryOf,
  colorOf,
  instanceValue,
  isRestored,
  makeInstance,
  qualityOf,
  recipeFor,
  requiredDone,
} from '../../src/core/items';
import { STEP_ORDER } from '../../src/core/types';
import { game } from './helpers';

describe('recipes', () => {
  it('every catalog item yields a 2-5 step recipe in canonical order with a required step', () => {
    for (let a = 0; a < ITEMS.length; a++) {
      for (let s = 1; s < 40; s++) {
        for (const d of [0, 1, 2]) {
          const r = recipeFor({ a, s: s * 7919, d });
          expect(r.length).toBeGreaterThanOrEqual(2);
          expect(r.length).toBeLessThanOrEqual(5);
          expect(r.some((x) => x.req)).toBe(true);
          const idx = r.map((x) => STEP_ORDER.indexOf(x.k));
          expect([...idx].sort((p, q) => p - q)).toEqual(idx);
          expect(new Set(r.map((x) => x.k)).size).toBe(r.length);
        }
      }
    }
  });
  it('is deterministic', () => {
    expect(recipeFor({ a: 5, s: 99, d: 1 })).toEqual(recipeFor({ a: 5, s: 99, d: 1 }));
  });
  it('tutorial mug is scrub -> polish', () => {
    expect(recipeFor({ a: itemIndex('kit_polka_dot_mug'), s: TUTORIAL_SEED, d: 0 }).map((x) => x.k)).toEqual([
      'scrub',
      'polish',
    ]);
  });
});

describe('instances', () => {
  it('creates instances with empty step scores and hides gems', () => {
    const g = game();
    const i = makeInstance(g, 0, 3, 55, 1, 10, false);
    expect(i.rev).toBe(false);
    expect(i.sc.every((x) => x === null)).toBe(true);
    expect(isRestored(i)).toBe(false);
    expect(requiredDone(i)).toBe(false);
    expect(makeInstance(g, 0, 2, 55, 1, 10, false).rev).toBe(true);
    expect(g.nextUid).toBe(3);
    expect(archetype(i)).toBe(ITEMS[0]);
    expect(categoryOf(i)).toBe(ITEMS[0].cat);
  });
  it('quality and value follow the step scores', () => {
    const g = game();
    const i = makeInstance(g, 0, 0, 55, 1, 10, true);
    const recipe = recipeFor(i);
    i.sc = recipe.map(() => 1);
    expect(qualityOf(i)).toBe(1);
    expect(requiredDone(i)).toBe(true);
    i.q = 1;
    const v1 = instanceValue(g, i);
    i.q = 0.5;
    expect(instanceValue(g, i)).toBeLessThan(v1);
    i.q = -1;
    expect(instanceValue(g, i)).toBeGreaterThan(0);
  });
  it('paint colour overrides body colour', () => {
    const g = game();
    const i = makeInstance(g, 0, 0, 55, 1, 10, true);
    expect(colorOf(i)).toBe(ITEMS[0].body);
    i.col = 'purple';
    expect(colorOf(i)).toBe('purple');
  });
});
