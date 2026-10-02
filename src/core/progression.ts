import { BALANCE } from './data';
import type { GameState } from './state';
import type { SkillDef, UpgradeDef } from './types';

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(BALANCE.xp.base * Math.pow(Math.max(1, level), BALANCE.xp.exp));
}

/** Adds XP, levelling up as needed. Returns the number of levels gained. */
export function addXp(state: GameState, amount: number): number {
  const gain = Math.max(0, Math.round(amount));
  state.xp += gain;
  state.day.stats.xp += gain;
  let ups = 0;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    ups++;
  }
  state.day.stats.levelUps += ups;
  return ups;
}

/** One skill point per level after the first. */
export function skillPoints(state: GameState): number {
  return Math.max(0, state.level - 1 - state.skills.length);
}

export type SkillStatus = 'owned' | 'available' | 'locked';

export function skillStatus(state: GameState, s: SkillDef): SkillStatus {
  if (state.skills.includes(s.id)) return 'owned';
  if (state.level < s.level) return 'locked';
  if (s.requires && !state.skills.includes(s.requires)) return 'locked';
  return skillPoints(state) > 0 ? 'available' : 'locked';
}

export function learnSkill(state: GameState, id: string): boolean {
  const s = BALANCE.skills.find((x) => x.id === id);
  if (!s || skillStatus(state, s) !== 'available') return false;
  state.skills.push(id);
  return true;
}

export function upgradeStatus(state: GameState, u: UpgradeDef): 'owned' | 'available' | 'locked' | 'poor' {
  if (state.upgrades.includes(u.id)) return 'owned';
  if (state.tier < u.tier) return 'locked';
  if (state.coins < u.cost) return 'poor';
  return 'available';
}

export function buyUpgrade(state: GameState, id: string): boolean {
  const u = BALANCE.upgrades.find((x) => x.id === id);
  if (!u || upgradeStatus(state, u) !== 'available') return false;
  state.coins -= u.cost;
  state.upgrades.push(id);
  return true;
}

export function nextTier(state: GameState) {
  return BALANCE.tiers[state.tier + 1] ?? null;
}

export function canUpgradeTier(state: GameState): boolean {
  const n = nextTier(state);
  return !!n && state.coins >= n.cost && state.rep >= n.rep;
}

export function upgradeTier(state: GameState): boolean {
  if (!canUpgradeTier(state)) return false;
  const n = nextTier(state)!;
  state.coins -= n.cost;
  state.tier++;
  return true;
}

export function isMaxTier(state: GameState): boolean {
  return state.tier >= BALANCE.tiers.length - 1;
}
