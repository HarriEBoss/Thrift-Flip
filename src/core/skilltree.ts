/**
 * The prestige skill tree: permanent bonuses bought with prestige tokens (data in balance.json ->
 * empire.prestige.nodes). Pure; the rest of the game asks `prestigeFx` for the bonuses.
 */
import { BALANCE } from './data';
import type { GameState } from './state';
import type { PrestigeFx, SkillNodeDef } from './types';

export const SKILL_NODES: SkillNodeDef[] = BALANCE.empire.prestige.nodes;

export function skillNode(id: string): SkillNodeDef | undefined {
  return SKILL_NODES.find((n) => n.id === id);
}

/** Branches in tree order. */
export const SKILL_BRANCHES: string[] = [...new Set(SKILL_NODES.map((n) => n.branch))];

export type NodeStatus = 'owned' | 'locked' | 'short' | 'available';

export function nodeStatus(state: GameState, n: SkillNodeDef): NodeStatus {
  if (state.prestige.nodes.includes(n.id)) return 'owned';
  if (!n.req.every((r) => state.prestige.nodes.includes(r))) return 'locked';
  return state.prestige.tokens < n.cost ? 'short' : 'available';
}

/** Buys a node with tokens (its prerequisites first). */
export function buyNode(state: GameState, id: string): boolean {
  const n = skillNode(id);
  if (!n || nodeStatus(state, n) !== 'available') return false;
  state.prestige.tokens -= n.cost;
  state.prestige.nodes.push(id);
  return true;
}

/** Nodes that could be bought right now (for "!" badges). */
export function buyableNodes(state: GameState): number {
  return SKILL_NODES.filter((n) => nodeStatus(state, n) === 'available').length;
}

/** Every bonus of the nodes owned, added up (discount capped). */
export function prestigeFx(state: GameState): Required<PrestigeFx> {
  const fx: Required<PrestigeFx> = {
    income: 0,
    fees: 0,
    discount: 0,
    startCoins: 0,
    startBiz: [],
    marketing: 0,
    loyal: 0,
    managers: 0,
    wages: 0,
    research: 0,
    harvest: 0,
    dyson: 0,
  };
  for (const id of state.prestige?.nodes ?? []) {
    const n = skillNode(id);
    if (!n) continue;
    for (const [k, v] of Object.entries(n.fx) as Array<[keyof PrestigeFx, number | string[]]>) {
      if (k === 'startBiz') fx.startBiz.push(...(v as string[]));
      else fx[k] += v as number;
    }
  }
  fx.discount = Math.min(BALANCE.empire.prestige.maxDiscount, fx.discount);
  fx.loyal = Math.min(0.9, fx.loyal);
  fx.wages = Math.min(1, fx.wages);
  fx.research = Math.min(0.75, fx.research);
  fx.dyson = Math.min(0.75, fx.dyson);
  return fx;
}

/** A cost after the prestige discount. */
export function discounted(state: GameState, cost: number): number {
  const d = prestigeFx(state).discount;
  return d > 0 ? Math.round((cost * (1 - d)) / 10) * 10 : cost;
}

/** Tokens the n-th prestige gives (1 for the first, 2 for the second, ...). */
export function tokensFor(n: number): number {
  return Math.max(0, Math.floor(n));
}

/** Tokens earned in total after n prestiges: 1 + 2 + ... + n. */
export function totalTokens(n: number): number {
  const k = Math.max(0, Math.floor(n));
  return (k * (k + 1)) / 2;
}

/** Tokens needed to buy the whole tree. */
export function treeCost(): number {
  return SKILL_NODES.reduce((a, n) => a + n.cost, 0);
}
