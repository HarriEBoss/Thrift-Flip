/**
 * Global expansion. From the top of the ladder on, conquer the world one region at a time: open a
 * regional office (coins), then win its flagship contract (a big custom design job at one of your
 * businesses). A conquered region gives a permanent bonus (shop prices, contract pay or manager
 * income) and opens its own market. Space opens once every region is conquered. Data in
 * balance.json -> empire.regions and markets.json (markets with a `region`). Pure.
 */
import { BALANCE, MARKETS } from './data';
import { ownsBusiness } from './empire';
import type { GameState } from './state';
import type { MarketDef, RegionDef } from './types';
import { discounted } from './skilltree';
import { earnGold } from './gold';

const R = () => BALANCE.empire.regions;
export const REGIONS: RegionDef[] = BALANCE.empire.regions.list;

export const OPEN = 1;
export const WON = 2;

export function region(id: string): RegionDef | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function expansionUnlocked(state: GameState): boolean {
  return ownsBusiness(state, R().unlock);
}

export type RegionStatus = 'locked' | 'poor' | 'available' | 'open' | 'won';

export function regionStatus(state: GameState, r: RegionDef): RegionStatus {
  const s = state.regions[r.id] ?? 0;
  if (s >= WON) return 'won';
  if (s === OPEN) return 'open';
  if (!expansionUnlocked(state)) return 'locked';
  return state.coins < regionCost(state, r) ? 'poor' : 'available';
}

/** Coins to open a regional office (less with the prestige discount). */
export function regionCost(state: GameState, r: RegionDef): number {
  return discounted(state, r.cost);
}

/** Opens the regional office: the flagship contract then appears on the business's job board. */
export function openRegion(state: GameState, id: string): boolean {
  const r = region(id);
  if (!r || regionStatus(state, r) !== 'available') return false;
  state.coins -= regionCost(state, r);
  state.regions[id] = OPEN;
  return true;
}

/** Conquers a region (when its flagship contract is delivered). */
export function conquerRegion(state: GameState, id: string): boolean {
  if (!region(id) || state.regions[id] === WON) return false;
  state.regions[id] = WON;
  earnGold(state, 'region');
  return true;
}

export function regionsWon(state: GameState): number {
  return REGIONS.filter((r) => state.regions[r.id] === WON).length;
}

/** Every Earth region conquered: space research can start. */
export function allRegionsWon(state: GameState): boolean {
  return regionsWon(state) === REGIONS.length;
}

/** Sum of the bonuses of every conquered region. */
export function regionFx(state: GameState): Required<RegionDef['fx']> {
  const fx = { price: 0, contracts: 0, income: 0 };
  for (const r of REGIONS) {
    if (state.regions[r.id] !== WON) continue;
    fx.price += r.fx.price ?? 0;
    fx.contracts += r.fx.contracts ?? 0;
    fx.income += r.fx.income ?? 0;
  }
  return fx;
}

/** Regions whose office is open and whose flagship is not yet signed, at a business. */
export function flagshipsAt(state: GameState, biz: string): RegionDef[] {
  return REGIONS.filter(
    (r) => r.biz === biz && state.regions[r.id] === OPEN && !state.inv.some((i) => i.job?.r === r.id),
  );
}

/** Regional markets you can go to (conquered regions). */
export function regionMarkets(state: GameState): MarketDef[] {
  return MARKETS.filter((m) => m.region && state.regions[m.region] === WON);
}

/** Regions you could open right now (for "!" badges). */
export function openableRegions(state: GameState): number {
  return REGIONS.filter((r) => regionStatus(state, r) === 'available').length;
}
