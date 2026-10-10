/**
 * Delegation: once you own the top of the ladder (Rocket Repair), hire managers to run your other
 * businesses and open more branches of any business. Every day you are not working at a managed
 * business, it pays income x branches x manager efficiency x brand flow x region bonus, minus the
 * manager's wage.
 * Managers train up through efficiency levels; each extra branch costs more than the last, so the
 * loop keeps scaling. Numbers in balance.json -> empire.managers. Pure.
 */
import { BALANCE } from './data';
import { BUSINESSES, business, ownsBusiness } from './empire';
import { brandFlow } from './marketing';
import { regionFx } from './regions';
import { hashSeed } from './prng';
import namesJson from '../data/names.json';
import type { GameState } from './state';
import type { BusinessDef } from './types';

const M = () => BALANCE.empire.managers;
const NAMES = (namesJson as { managers: string[] }).managers;

/** Managers and branches are available once you own the top business of the ladder. */
export function delegationUnlocked(state: GameState): boolean {
  return ownsBusiness(state, M().unlock);
}

export function managerLevel(state: GameState, id: string): number {
  return state.managers[id] ?? 0;
}

export function branchCount(state: GameState, id: string): number {
  return state.branches[id] ?? 0;
}

/** Shops of a business: the first one plus extra branches. */
export function shops(state: GameState, id: string): number {
  return ownsBusiness(state, id) ? 1 + branchCount(state, id) : 0;
}

export function maxManagerLevel(): number {
  return M().efficiency.length;
}

/** Share of the business income the manager makes (0 without a manager). */
export function efficiency(level: number): number {
  return level <= 0 ? 0 : M().efficiency[Math.min(level, M().efficiency.length) - 1];
}

/** A manager's name for a business (the same every time for a save). */
export function managerName(state: GameState, id: string): string {
  return NAMES[hashSeed(state.seed, 'manager', id) % NAMES.length];
}

/** Cost to hire (level 0 -> 1) or train (level n -> n + 1); null at the top level. */
export function managerCost(b: BusinessDef, level: number): number | null {
  if (level >= M().efficiency.length) return null;
  const hire = Math.max(500, b.capital) * M().hireCost;
  return Math.round((hire * Math.pow(M().upgradeGrowth, level)) / 10) * 10;
}

/** Cost of the next branch of a business. */
export function branchCost(b: BusinessDef, have: number): number {
  return Math.round((Math.max(500, b.capital) * M().branchCost * Math.pow(M().branchGrowth, have)) / 10) * 10;
}

export type DelegationStatus = 'locked' | 'notOwned' | 'max' | 'poor' | 'available';

export function managerStatus(state: GameState, b: BusinessDef): DelegationStatus {
  if (!delegationUnlocked(state)) return 'locked';
  if (!ownsBusiness(state, b.id)) return 'notOwned';
  const cost = managerCost(b, managerLevel(state, b.id));
  if (cost === null) return 'max';
  return state.coins < cost ? 'poor' : 'available';
}

export function branchStatus(state: GameState, b: BusinessDef): DelegationStatus {
  if (!delegationUnlocked(state)) return 'locked';
  if (!ownsBusiness(state, b.id)) return 'notOwned';
  return state.coins < branchCost(b, branchCount(state, b.id)) ? 'poor' : 'available';
}

/** Hires a manager, or trains the current one to the next level. */
export function hireOrTrain(state: GameState, id: string): boolean {
  const b = business(id);
  if (!b || managerStatus(state, b) !== 'available') return false;
  state.coins -= managerCost(b, managerLevel(state, id))!;
  state.managers[id] = managerLevel(state, id) + 1;
  return true;
}

export function openBranch(state: GameState, id: string): boolean {
  const b = business(id);
  if (!b || branchStatus(state, b) !== 'available') return false;
  state.coins -= branchCost(b, branchCount(state, id));
  state.branches[id] = branchCount(state, id) + 1;
  return true;
}

/** What a managed business makes in a day: gross, wage and net (0 if unmanaged). */
export function dailyIncome(state: GameState, b: BusinessDef): { gross: number; wage: number; net: number } {
  const lvl = managerLevel(state, b.id);
  if (lvl <= 0 || !ownsBusiness(state, b.id)) return { gross: 0, wage: 0, net: 0 };
  const region = 1 + regionFx(state).income;
  const gross = Math.round(b.income * shops(state, b.id) * efficiency(lvl) * brandFlow(state.brand) * region);
  const wage = Math.round(gross * M().wagePct);
  return { gross, wage, net: gross - wage };
}

/** Today's income from every managed business you are not working at yourself. */
export function passiveIncome(state: GameState): number {
  return BUSINESSES.filter((b) => b.id !== state.biz.cur).reduce((n, b) => n + dailyIncome(state, b).net, 0);
}

/** Pays the managers' takings at the end of the day (once). */
export function payManagers(state: GameState): number {
  const pay = passiveIncome(state);
  if (pay <= 0) return 0;
  state.coins += pay;
  state.day.stats.passive += pay;
  state.stats.revenue += pay;
  state.stats.profit += pay;
  return pay;
}

/** Things to hire, train or open right now (for "!" badges). */
export function delegationActions(state: GameState): number {
  if (!delegationUnlocked(state)) return 0;
  return BUSINESSES.filter((b) => managerStatus(state, b) === 'available').length;
}
