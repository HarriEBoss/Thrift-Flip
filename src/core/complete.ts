import { catalogComplete } from './catalog';
import { isMaxTier } from './progression';
import type { GameState } from './state';

/** Content is complete when the top shop tier is reached AND the catalog is complete. */
export function isContentComplete(state: GameState): boolean {
  return isMaxTier(state) && catalogComplete(state);
}

/** True exactly once: when the "You've flipped it all!" screen should be shown. */
export function shouldShowCompletion(state: GameState): boolean {
  return isContentComplete(state) && !state.flags.completeSeen;
}

export function markCompletionSeen(state: GameState): void {
  state.flags.completeSeen = true;
}
