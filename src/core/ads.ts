import { BALANCE } from './data';
import { adsRemoved } from './perks';
import type { GameState } from './state';

/**
 * Interstitials: only on the Day Summary -> next day transition, never before the player's
 * 3rd day, at most one per 3 minutes of play, never for players who bought Remove Ads.
 * (Callers guarantee the "only on summary transition" part; mini-games/tutorial/purchase never call this.)
 */
export function canShowInterstitial(state: GameState): boolean {
  if (adsRemoved(state)) return false;
  if (!state.flags.tutorialDone) return false;
  if (state.day.n < BALANCE.ads.interstitialMinDay) return false;
  return state.stats.playSec - state.flags.lastInterstitial >= BALANCE.ads.interstitialCooldownSec;
}

export function markInterstitialShown(state: GameState): void {
  state.flags.lastInterstitial = state.stats.playSec;
}

/** Small optional "Free Gift" reward (rewarded ad), a few per in-game day. */
export function freeGiftAvailable(state: GameState): boolean {
  return state.flags.tutorialDone && state.day.gifts < BALANCE.ads.freeGiftPerDay;
}

export function freeGiftAmount(state: GameState): number {
  return 20 + 20 * state.tier + Math.min(60, state.level * 3);
}

/** "+20% tip" after a sale (rewarded ad), a few per in-game day. */
export function saleTipAvailable(state: GameState): boolean {
  return state.flags.tutorialDone && state.day.tipsAds < BALANCE.ads.saleTipPerDay;
}

export function saleTipAmount(price: number): number {
  return Math.max(2, Math.round(price * BALANCE.ads.saleTipBonus));
}
