import { BALANCE } from './data';
import type { GameState } from './state';
import type { ProductDef } from './types';
import { addGold } from './gold';

export const PRODUCTS: ProductDef[] = BALANCE.products;

export function product(id: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Whether the product can be bought now (non-consumables / once-only packs only once). */
export function canPurchase(state: GameState, id: string): boolean {
  const p = product(id);
  if (!p) return false;
  if (p.kind === 'non_consumable' && state.owned.includes(id)) return false;
  // Every perk already owned (e.g. via the mega bundle) -> nothing left to sell.
  if (p.kind === 'non_consumable' && !p.coins && p.perks && p.perks.every((k) => state.perks.includes(k)))
    return false;
  return true;
}

/** Applies a completed purchase. Paid items never contain randomized rewards. */
export function grantProduct(state: GameState, id: string): boolean {
  const p = product(id);
  if (!p) return false;
  if (p.kind === 'non_consumable') {
    if (state.owned.includes(id)) return false;
    state.owned.push(id);
  }
  if (p.coins) state.coins += p.coins;
  if (p.gold) addGold(state, p.gold);
  for (const perk of p.perks ?? []) if (!state.perks.includes(perk)) state.perks.push(perk);
  return true;
}

/** Restore Purchases: re-grants non-consumables the store reports that this save does not know. */
export function restoreProducts(state: GameState, ids: string[]): string[] {
  const restored: string[] = [];
  for (const id of ids) {
    const p = product(id);
    if (!p || p.kind !== 'non_consumable') continue;
    if (state.owned.includes(id)) {
      // Make sure perks are present even if the save lost them.
      for (const perk of p.perks ?? []) if (!state.perks.includes(perk)) state.perks.push(perk);
      continue;
    }
    grantProduct(state, id);
    restored.push(id);
  }
  return restored;
}
