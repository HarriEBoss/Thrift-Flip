/**
 * What Gold Bars buy: time skips (1, 3 or 7 days pass with the same end-of-day code as a real day:
 * managers, research, colonies, the Dyson project) and tools before your shop is big enough.
 */
import { BALANCE } from './data';
import { advancePhase, endOfDay } from './day';
import { GOLD, spendGold } from './gold';
import { passiveIncome } from './managers';
import { spaceIncome } from './space';
import type { GameState } from './state';
import type { UpgradeDef } from './types';

export function skipDef(id: string) {
  return GOLD.skips.find((s) => s.id === id);
}

/** Skips happen at the start of a day, before anything was bought or taken on. */
export function canSkip(state: GameState): boolean {
  const d = state.day;
  return state.flags.tutorialDone && d.ph === 'market' && d.bought.length === 0 && d.jobs.length === 0;
}

export type SkipStatus = 'available' | 'busy' | 'poor';

export function skipStatus(state: GameState, id: string): SkipStatus {
  const s = skipDef(id);
  if (!s || !canSkip(state)) return 'busy';
  return state.gold.bars < s.cost ? 'poor' : 'available';
}

/** About how many coins a day passes for while you are away (managers, colonies, energy). */
export function awayIncome(state: GameState): number {
  return passiveIncome(state, true) + spaceIncome(state).coins;
}

export interface SkipResult {
  days: number;
  coins: number;
  /** Materials harvested while away. */
  mat: Record<string, number>;
  /** Technologies whose research finished. */
  researched: string[];
}

/** Spends the Gold Bars and lets the days pass. Null if the skip cannot be done now. */
export function skipDays(state: GameState, id: string): SkipResult | null {
  const s = skipDef(id);
  if (!s || skipStatus(state, id) !== 'available' || !spendGold(state, s.cost)) return null;
  const coins = state.coins;
  const mat = { ...state.space.mat };
  const researched: string[] = [];
  for (let i = 0; i < s.days; i++) {
    const r = endOfDay(state, true);
    if (r.researched) researched.push(r.researched);
    state.day.ph = 'summary';
    advancePhase(state, 'market');
  }
  const gained: Record<string, number> = {};
  for (const [m, n] of Object.entries(state.space.mat)) if (n > (mat[m] ?? 0)) gained[m] = n - (mat[m] ?? 0);
  return { days: s.days, coins: state.coins - coins, mat: gained, researched };
}

/** Tools still waiting for a bigger shop: Gold Bars unlock them early. */
export function earlyTools(state: GameState): UpgradeDef[] {
  return BALANCE.upgrades.filter((u) => !state.upgrades.includes(u.id) && u.tier > state.tier);
}

export function earlyCost(state: GameState, u: UpgradeDef): number {
  return GOLD.early.base + GOLD.early.perTier * Math.max(1, u.tier - state.tier);
}

/** Unlocks a tool before its shop size, for Gold Bars (no coins). */
export function unlockEarly(state: GameState, id: string): boolean {
  const u = BALANCE.upgrades.find((x) => x.id === id);
  if (!u || !earlyTools(state).includes(u) || !spendGold(state, earlyCost(state, u))) return false;
  state.upgrades.push(id);
  return true;
}
