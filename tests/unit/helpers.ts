import { newGame, type GameState } from '../../src/core/state';

export function game(seed = 1234, patch: Partial<GameState> = {}): GameState {
  const g = newGame(seed);
  g.flags.tutorialDone = true;
  g.day.n = 2;
  return Object.assign(g, patch);
}
