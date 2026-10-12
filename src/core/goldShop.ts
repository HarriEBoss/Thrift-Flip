/**
 * More things Gold Bars buy (balance.json -> empire.gold.shop): finish research now, a cargo run
 * of a colony's material, a brand boost, new market stock and golden tools for the next item.
 * Golden decorations are in ./decor. Time skips and early tools are in ./timeskip.
 */
import { isReselling } from './empire';
import { GOLD, spendGold } from './gold';
import { rerollMarket } from './market';
import { BODIES, tech } from './space';
import type { GameState } from './state';

const S = () => GOLD.shop;

/** Bars to finish the research in progress now (null when nothing is being researched). */
export function researchRushCost(state: GameState): number | null {
  const r = state.space.research;
  return r ? Math.max(1, r.left) * S().researchPerDay : null;
}

export function rushResearch(state: GameState): string | null {
  const r = state.space.research;
  const cost = researchRushCost(state);
  if (!r || cost === null || !tech(r.id) || !spendGold(state, cost)) return null;
  state.space.techs.push(r.id);
  state.space.research = null;
  return r.id;
}

/** Materials a cargo run can bring: those of the colonies you have founded. */
export function shippableMaterials(state: GameState): string[] {
  return BODIES.filter((b) => state.space.colonies.includes(b.id)).map((b) => b.material);
}

export function shipMaterial(state: GameState, material: string): boolean {
  if (!shippableMaterials(state).includes(material) || !spendGold(state, S().material.cost)) return false;
  state.space.mat[material] = (state.space.mat[material] ?? 0) + S().material.n;
  return true;
}

const BOOST_MARK = 'gold_boost';

/** A brand boost, once a day. */
export function canBoostBrand(state: GameState): boolean {
  return !state.day.ads.includes(BOOST_MARK) && state.gold.bars >= S().brand.cost;
}

export function boostBrand(state: GameState): boolean {
  if (!canBoostBrand(state) || !spendGold(state, S().brand.cost)) return false;
  state.day.ads.push(BOOST_MARK);
  state.brand += S().brand.n;
  return true;
}

/** New stock at the market (the Reselling Shop, at the start of a day). */
export function canGoldReroll(state: GameState): boolean {
  return state.day.ph === 'market' && isReselling(state) && state.gold.bars >= S().reroll;
}

export function goldReroll(state: GameState): boolean {
  if (!canGoldReroll(state) || !spendGold(state, S().reroll)) return false;
  rerollMarket(state);
  return true;
}

/** Golden tools for the next item you restore (as the rewarded ad gives). */
export function canGoldenTools(state: GameState): boolean {
  return !state.day.premiumOnce && state.gold.bars >= S().golden;
}

export function goldenTools(state: GameState): boolean {
  if (!canGoldenTools(state) || !spendGold(state, S().golden)) return false;
  state.day.premiumOnce = true;
  return true;
}
