import { BALANCE, ITEMS, category } from './data';
import type { GameState } from './state';
import type { CategoryId } from './types';

export type CatalogState = 0 | 1 | 2;

export function catalogState(state: GameState, idx: number): CatalogState {
  const c = state.catalog.charCodeAt(idx) - 48;
  return (c === 1 || c === 2 ? c : 0) as CatalogState;
}

function setChar(s: string, idx: number, ch: string): string {
  return s.slice(0, idx) + ch + s.slice(idx + 1);
}

/** Marks an item found. Returns true if it was newly found. */
export function markFound(state: GameState, idx: number): boolean {
  if (catalogState(state, idx) === 0) {
    state.catalog = setChar(state.catalog, idx, '1');
    return true;
  }
  return false;
}

/** Marks an item perfectly restored (quality >= 0.95). Returns true if newly perfect. */
export function markPerfect(state: GameState, idx: number): boolean {
  if (catalogState(state, idx) !== 2) {
    state.catalog = setChar(state.catalog, idx, '2');
    return true;
  }
  return false;
}

export function categoryProgress(
  state: GameState,
  cat: CategoryId,
): { found: number; perfect: number; total: number } {
  let found = 0;
  let perfect = 0;
  let total = 0;
  ITEMS.forEach((it, i) => {
    if (it.cat !== cat) return;
    total++;
    const s = catalogState(state, i);
    if (s >= 1) found++;
    if (s === 2) perfect++;
  });
  return { found, perfect, total };
}

export function categoryComplete(state: GameState, cat: CategoryId): boolean {
  const p = categoryProgress(state, cat);
  return p.found === p.total;
}

/** Completing a category set grants a permanent sale bonus for that category. */
export function catalogBonusFor(state: GameState, cat: CategoryId): number {
  return categoryComplete(state, cat) ? 1 + BALANCE.catalogBonus : 1;
}

export function catalogFoundCount(state: GameState): number {
  let n = 0;
  for (let i = 0; i < state.catalog.length; i++) if (state.catalog[i] !== '0') n++;
  return n;
}

/**
 * Every market item found (robots and rockets only come in as business jobs; they are part of the
 * catalog but not of the "flipped it all" goal).
 */
export function catalogComplete(state: GameState): boolean {
  return ITEMS.every((it, i) => !!category(it.cat).business || catalogState(state, i) > 0);
}
