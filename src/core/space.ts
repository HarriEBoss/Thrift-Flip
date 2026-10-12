/**
 * Space. Once every Earth region is conquered: research space technology on Earth (coins + days),
 * found colonies on the Moon (optional), Mars, the asteroid belt, Europa, Titan and Mercury, each
 * harvesting its own material and making coins every day, and finally build the Dyson project in
 * stages that use those materials until the Sun's whole output is harvested. Numbers in
 * balance.json -> empire.space. Pure.
 */
import { BALANCE } from './data';
import { allRegionsWon } from './regions';
import type { GameState } from './state';
import type { BodyDef, TechDef } from './types';
import { discounted, prestigeFx } from './skilltree';
import { earnGold } from './gold';

const S = () => BALANCE.empire.space;
export const TECHS: TechDef[] = BALANCE.empire.space.tech;
export const BODIES: BodyDef[] = BALANCE.empire.space.bodies;

export function tech(id: string): TechDef | undefined {
  return TECHS.find((t) => t.id === id);
}

export function body(id: string): BodyDef | undefined {
  return BODIES.find((b) => b.id === id);
}

/** Space opens once every Earth region is conquered. */
export function spaceUnlocked(state: GameState): boolean {
  return allRegionsWon(state);
}

export function hasTech(state: GameState, id: string): boolean {
  return state.space.techs.includes(id);
}

export type TechStatus = 'locked' | 'needs' | 'busy' | 'poor' | 'available' | 'researching' | 'done';

export function techStatus(state: GameState, t: TechDef): TechStatus {
  if (hasTech(state, t.id)) return 'done';
  if (state.space.research?.id === t.id) return 'researching';
  if (!spaceUnlocked(state)) return 'locked';
  if (!t.needs.every((n) => hasTech(state, n))) return 'needs';
  if (state.space.research) return 'busy';
  return state.coins < techCost(state, t) ? 'poor' : 'available';
}

/** Research cost and days (less with the prestige lab nodes). */
export function techCost(state: GameState, t: TechDef): number {
  const r = prestigeFx(state).research;
  return r > 0 ? Math.round((t.cost * (1 - r)) / 10) * 10 : t.cost;
}

export function techDays(state: GameState, t: TechDef): number {
  return Math.max(1, Math.round(t.days * (1 - prestigeFx(state).research)));
}

/** Coins to found a colony (less with the prestige discount). */
export function colonyCost(state: GameState, b: BodyDef): number {
  return discounted(state, b.cost);
}

/** Starts researching a technology (one at a time). */
export function startResearch(state: GameState, id: string): boolean {
  const t = tech(id);
  if (!t || techStatus(state, t) !== 'available') return false;
  state.coins -= techCost(state, t);
  state.space.research = { id, left: techDays(state, t) };
  return true;
}

export type ColonyStatus = 'locked' | 'needs' | 'poor' | 'available' | 'founded';

export function colonyStatus(state: GameState, b: BodyDef): ColonyStatus {
  if (state.space.colonies.includes(b.id)) return 'founded';
  if (!spaceUnlocked(state)) return 'locked';
  if (!b.techs.every((t) => hasTech(state, t))) return 'needs';
  if (b.body && !state.space.colonies.includes(b.body)) return 'needs';
  return state.coins < colonyCost(state, b) ? 'poor' : 'available';
}

export function foundColony(state: GameState, id: string): boolean {
  const b = body(id);
  if (!b || colonyStatus(state, b) !== 'available') return false;
  state.coins -= colonyCost(state, b);
  state.space.colonies.push(id);
  earnGold(state, 'colony');
  return true;
}

/** Materials and coins each colony sends home a day, plus the Dyson project's energy sales. */
export function spaceIncome(state: GameState): { coins: number; mat: Record<string, number> } {
  const mat: Record<string, number> = {};
  const fx = prestigeFx(state);
  let coins = state.space.dyson * S().dyson.energy;
  for (const id of state.space.colonies) {
    const b = body(id);
    if (!b) continue;
    mat[b.material] = (mat[b.material] ?? 0) + Math.round(b.rate * (1 + fx.harvest));
    coins += b.income;
  }
  return { coins: Math.round(coins * (1 + fx.income)), mat };
}

/** End of day: research moves on a day, colonies harvest and pay, the Dyson project sells energy. */
export function spaceDay(state: GameState): { coins: number; researched: string | null } {
  let researched: string | null = null;
  const r = state.space.research;
  if (r) {
    r.left -= 1;
    if (r.left <= 0) {
      state.space.techs.push(r.id);
      researched = r.id;
      state.space.research = null;
    }
  }
  const inc = spaceIncome(state);
  for (const [m, n] of Object.entries(inc.mat)) state.space.mat[m] = (state.space.mat[m] ?? 0) + n;
  if (inc.coins > 0) {
    state.coins += inc.coins;
    state.day.stats.passive += inc.coins;
    state.stats.revenue += inc.coins;
    state.stats.profit += inc.coins;
  }
  return { coins: inc.coins, researched };
}

/** What the next Dyson stage needs (null when the project is finished). */
export function dysonNeeds(state: GameState): { coins: number; mat: Record<string, number> } | null {
  const d = S().dyson;
  const n = state.space.dyson + 1;
  if (n > d.stages) return null;
  const cut = 1 - prestigeFx(state).dyson;
  const mat: Record<string, number> = {};
  for (const [m, k] of Object.entries(d.materials)) mat[m] = Math.ceil(k * n * cut);
  return { coins: Math.round((d.coins * n * cut) / 10) * 10, mat };
}

export type DysonStatus = 'locked' | 'needs' | 'short' | 'available' | 'done';

export function dysonStatus(state: GameState): DysonStatus {
  if (dysonDone(state)) return 'done';
  if (!spaceUnlocked(state)) return 'locked';
  if (!hasTech(state, 'dyson')) return 'needs';
  const need = dysonNeeds(state)!;
  const enough =
    state.coins >= need.coins && Object.entries(need.mat).every(([m, k]) => (state.space.mat[m] ?? 0) >= k);
  return enough ? 'available' : 'short';
}

/** Builds the next stage of the Dyson project, using up its coins and materials. */
export function buildDysonStage(state: GameState): boolean {
  if (dysonStatus(state) !== 'available') return false;
  const need = dysonNeeds(state)!;
  state.coins -= need.coins;
  for (const [m, k] of Object.entries(need.mat)) state.space.mat[m] -= k;
  state.space.dyson += 1;
  earnGold(state, 'dyson');
  return true;
}

/** Share of the Sun's output harvested (0..1). */
export function sunHarvested(state: GameState): number {
  return state.space.dyson / S().dyson.stages;
}

/** The whole Sun is harvested: the end of the race (prestige comes next). */
export function dysonDone(state: GameState): boolean {
  return state.space.dyson >= S().dyson.stages;
}

/** Things to do in the space program right now (for "!" badges). */
export function spaceActions(state: GameState): number {
  if (!spaceUnlocked(state)) return 0;
  return (
    TECHS.filter((t) => techStatus(state, t) === 'available').length +
    BODIES.filter((b) => colonyStatus(state, b) === 'available').length +
    (dysonStatus(state) === 'available' ? 1 : 0)
  );
}

/** Material reward of a colony's repair contract. */
export function colonyReward(b: BodyDef): number {
  return b.rate * S().contract.reward;
}
