/**
 * Gold Bars: the premium currency (balance.json -> empire.gold). They are earned by playing
 * (milestones) and, where the platform has a store, bought in packs. Pure wallet functions; the
 * things to spend them on are in ./timeskip.
 */
import { BALANCE } from './data';
import type { GameState } from './state';

export const GOLD = BALANCE.empire.gold;

export type GoldReason = keyof typeof GOLD.earn;

/** What was earned since the UI last looked (for a "+3 Gold Bars" toast). Not saved. */
const news: Array<{ n: number; why: GoldReason }> = [];

/** Gold Bars earned in play for a milestone. */
export function earnGold(state: GameState, why: GoldReason, times = 1): number {
  const n = Math.max(0, Math.round(GOLD.earn[why] * times));
  if (!n) return 0;
  state.gold.bars += n;
  state.gold.earned += n;
  news.push({ n, why });
  return n;
}

/** Gold Bars from a purchase (not counted as earned). */
export function addGold(state: GameState, n: number): void {
  state.gold.bars += Math.max(0, Math.floor(n));
}

export function spendGold(state: GameState, n: number): boolean {
  if (n <= 0 || state.gold.bars < n) return false;
  state.gold.bars -= n;
  return true;
}

/** Takes the earned-gold notes (oldest first). */
export function drainGoldNews(): Array<{ n: number; why: GoldReason }> {
  return news.splice(0, news.length);
}
