import { BALANCE, categoriesForTier } from './data';
import { Rng, hashSeed } from './prng';
import type { GameState } from './state';
import type { CategoryId } from './types';

export interface WeeklyTrends {
  week: number;
  /** Category -> modifier in [0.9, 1.3]. Categories not listed are 1.0. */
  mods: Partial<Record<CategoryId, number>>;
  /** Trend paint colour (gives a paint score bonus). */
  color: string;
}

export function weekOf(day: number): number {
  return Math.floor((Math.max(1, day) - 1) / 7);
}

const cache = new Map<string, WeeklyTrends>();

/** Trends are set per in-game week for 1-2 hot categories (1.1-1.3) and one cold one (0.9). */
export function trendsFor(seed: number, day: number, tier: number): WeeklyTrends {
  const week = weekOf(day);
  const key = `${seed}:${week}:${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(hashSeed(seed, 'trend', week));
  const cats = rng.shuffle([...categoriesForTier(tier)]);
  const hot = cats.length >= 3 && rng.chance(0.5) ? 2 : 1;
  const mods: Partial<Record<CategoryId, number>> = {};
  const [lo, hi] = BALANCE.trendRange;
  for (let i = 0; i < Math.min(hot, cats.length); i++) {
    mods[cats[i]] = Math.round(rng.range(lo, hi) * 20) / 20;
  }
  if (cats.length > hot + 1) mods[cats[hot]] = 0.9;
  const color = rng.pick(BALANCE.paintColors);
  const out = { week, mods, color };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

export function trendFor(state: GameState, cat: CategoryId): number {
  return trendsFor(state.seed, state.day.n, state.tier).mods[cat] ?? 1;
}

export function trendColor(state: GameState): string {
  return trendsFor(state.seed, state.day.n, state.tier).color;
}
