import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/core/data';
import {
  catalogBonusFor,
  catalogComplete,
  catalogFoundCount,
  catalogState,
  categoryComplete,
  categoryProgress,
  markFound,
  markPerfect,
} from '../../src/core/catalog';
import { isContentComplete, markCompletionSeen, shouldShowCompletion } from '../../src/core/complete';
import { game } from './helpers';

describe('catalog', () => {
  it('tracks unseen -> found -> perfect', () => {
    const g = game();
    expect(catalogState(g, 0)).toBe(0);
    expect(markFound(g, 0)).toBe(true);
    expect(markFound(g, 0)).toBe(false);
    expect(catalogState(g, 0)).toBe(1);
    expect(markPerfect(g, 0)).toBe(true);
    expect(markPerfect(g, 0)).toBe(false);
    expect(markFound(g, 0)).toBe(false);
    expect(catalogState(g, 0)).toBe(2);
    expect(catalogFoundCount(g)).toBe(1);
  });
  it('category completion grants a bonus', () => {
    const g = game();
    expect(catalogBonusFor(g, 'kitchen')).toBe(1);
    ITEMS.forEach((it, i) => it.cat === 'kitchen' && markFound(g, i));
    expect(categoryComplete(g, 'kitchen')).toBe(true);
    expect(categoryProgress(g, 'kitchen')).toEqual({ found: 15, perfect: 0, total: 15 });
    expect(catalogBonusFor(g, 'kitchen')).toBeGreaterThan(1);
  });
  it('content completion requires top tier + full catalog, shown once', () => {
    const g = game();
    ITEMS.forEach((_, i) => markFound(g, i));
    expect(catalogComplete(g)).toBe(true);
    expect(isContentComplete(g)).toBe(false);
    g.tier = 4;
    expect(isContentComplete(g)).toBe(true);
    expect(shouldShowCompletion(g)).toBe(true);
    markCompletionSeen(g);
    expect(shouldShowCompletion(g)).toBe(false);
  });
});
