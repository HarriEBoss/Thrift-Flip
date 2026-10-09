/**
 * The business ladder: Reselling Shop -> Phone Repair -> Computer Repair -> Mechanic -> Robotics
 * -> Rocket Repair (data in balance.json -> empire.businesses; add a rung by adding an entry). Each
 * business stays locked until its needs are met and you have saved its capital; opening it spends
 * part of that capital. You choose each day which business to work at. Pure.
 */
import { BALANCE } from './data';
import type { GameState } from './state';
import type { BusinessDef } from './types';

export const BUSINESSES: BusinessDef[] = BALANCE.empire.businesses;
export const RESELLING = 'reselling';

export function business(id: string): BusinessDef | undefined {
  return BUSINESSES.find((b) => b.id === id);
}

export function ownsBusiness(state: GameState, id: string): boolean {
  return state.biz.own.includes(id);
}

/**
 * owned; locked (an earlier business or a bigger shop is needed first); saving (needs met, still
 * saving up the capital); available (can be opened now).
 */
export type BusinessStatus = 'owned' | 'locked' | 'saving' | 'available';

export function needsMet(state: GameState, b: BusinessDef): boolean {
  if (b.needs.business && !ownsBusiness(state, b.needs.business)) return false;
  if (b.needs.shopTier !== undefined && state.tier < b.needs.shopTier) return false;
  return true;
}

export function businessStatus(state: GameState, b: BusinessDef): BusinessStatus {
  if (ownsBusiness(state, b.id)) return 'owned';
  if (!needsMet(state, b)) return 'locked';
  if (state.coins < b.capital) return 'saving';
  return 'available';
}

/** Coins spent to open a business (the rest of the capital stays with you as working money). */
export function openCost(b: BusinessDef): number {
  return Math.round(b.capital * b.spendPct);
}

export function openBusiness(state: GameState, id: string): boolean {
  const b = business(id);
  if (!b || businessStatus(state, b) !== 'available') return false;
  state.coins -= openCost(b);
  state.biz.own.push(id);
  return true;
}

/** Businesses that could be opened right now (for "!" badges). */
export function openableBusinesses(state: GameState): number {
  return BUSINESSES.filter((b) => businessStatus(state, b) === 'available').length;
}

/** The next business on the ladder and how far the savings are (for the goal banner). */
export interface BusinessGoal {
  id: string;
  status: Exclude<BusinessStatus, 'owned'>;
  coins: number;
  capital: number;
  /** 0..1 savings towards the capital. */
  progress: number;
}

export function nextBusinessGoal(state: GameState): BusinessGoal | null {
  const b = BUSINESSES.find((x) => !ownsBusiness(state, x.id));
  if (!b) return null;
  const status = businessStatus(state, b) as BusinessGoal['status'];
  return {
    id: b.id,
    status,
    coins: state.coins,
    capital: b.capital,
    progress: b.capital > 0 ? Math.min(1, state.coins / b.capital) : 1,
  };
}

/** The business worked at today. */
export function currentBusiness(state: GameState): BusinessDef {
  return business(state.biz.cur) ?? BUSINESSES[0];
}

export function isReselling(state: GameState): boolean {
  return state.biz.cur === RESELLING;
}

/** Choose where to work today (only at the start of the day, before buying or taking jobs). */
export function canSwitchBusiness(state: GameState): boolean {
  return state.day.ph === 'market' && state.day.bought.length === 0 && state.day.jobs.length === 0;
}

export function setCurrentBusiness(state: GameState, id: string): boolean {
  if (!ownsBusiness(state, id) || !canSwitchBusiness(state)) return false;
  state.biz.cur = id;
  return true;
}
