import { BALANCE } from './data';
import type { GameState } from './state';
import type { DecorDef, DecorFx } from './types';

/** Shop decorations: bought with coins, shown in the shop, each with a small permanent bonus. */
export const DECOR: DecorDef[] = BALANCE.decor;

export type DecorStatus = 'owned' | 'available' | 'poor' | 'locked';

export function decorStatus(state: GameState, d: DecorDef): DecorStatus {
  if (state.decor.includes(d.id)) return 'owned';
  if (state.tier < d.tier) return 'locked';
  if (d.gold ? state.gold.bars < d.gold : state.coins < d.cost) return 'poor';
  return 'available';
}

/** Buys a decoration with coins, or with Gold Bars for the golden ones. */
export function buyDecor(state: GameState, id: string): boolean {
  const d = DECOR.find((x) => x.id === id);
  if (!d || decorStatus(state, d) !== 'available') return false;
  if (d.gold) state.gold.bars -= d.gold;
  else state.coins -= d.cost;
  state.decor.push(id);
  return true;
}

/** Sum of the bonuses of every owned decoration. */
export function decorFx(state: GameState): Required<DecorFx> {
  const fx: Required<DecorFx> = { repPerDay: 0, price: 0, customers: 0, rare: 0, gem: 0, rareSale: 0 };
  for (const d of DECOR) {
    if (!state.decor.includes(d.id)) continue;
    for (const [k, v] of Object.entries(d.fx) as Array<[keyof DecorFx, number]>) fx[k] += v;
  }
  return fx;
}

/** Number of decorations the player could buy right now (for "!" badges). */
export function affordableDecor(state: GameState): number {
  return DECOR.filter((d) => decorStatus(state, d) === 'available').length;
}
