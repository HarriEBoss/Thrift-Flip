/**
 * Prestige: once the whole Sun is harvested, start a new run with permanent bonuses. The n-th
 * prestige gives n tokens for the skill tree (./skilltree). What a prestige keeps: the company
 * name, prestige count, tokens and nodes, settings, the catalog, purchases (products and perks),
 * shop decorations, lifetime stats and the daily challenge. Everything else starts again.
 */
import { BUSINESSES, business } from './empire';
import { hashSeed } from './prng';
import { prestigeFx, tokensFor } from './skilltree';
import { dysonDone } from './space';
import { newGame, type GameState } from './state';

export function canPrestige(state: GameState): boolean {
  return dysonDone(state);
}

/** Tokens the next prestige would give. */
export function nextPrestigeTokens(state: GameState): number {
  return tokensFor(state.prestige.n + 1);
}

/** A fresh run that keeps what a prestige keeps (null if the run is not finished). */
export function prestige(state: GameState): GameState | null {
  if (!canPrestige(state)) return null;
  const n = state.prestige.n + 1;
  const g = newGame(hashSeed(state.seed, 'prestige', n));
  g.company = state.company;
  g.settings = { ...state.settings };
  g.catalog = state.catalog;
  g.owned = [...state.owned];
  g.perks = [...state.perks];
  g.decor = [...state.decor];
  g.stats = { ...state.stats };
  g.bestScore = state.bestScore;
  g.daily = { ...state.daily };
  g.flags = {
    tutorialDone: true,
    completeSeen: state.flags.completeSeen,
    lastInterstitial: state.flags.lastInterstitial,
    hints: [...state.flags.hints],
    setsAnnounced: [...state.flags.setsAnnounced],
    named: state.flags.named,
  };
  const days = state.day.n;
  g.prestige = {
    n,
    tokens: state.prestige.tokens + tokensFor(n),
    nodes: [...state.prestige.nodes],
    best: state.prestige.best > 0 ? Math.min(state.prestige.best, days) : days,
  };
  applyHeadStart(g);
  return g;
}

/** Start coins and businesses from the skill tree (nodes bought before a prestige). */
export function applyHeadStart(g: GameState): void {
  const fx = prestigeFx(g);
  g.coins += fx.startCoins;
  const own = new Set([...g.biz.own, ...fx.startBiz.filter((id) => !!business(id))]);
  g.biz.own = BUSINESSES.map((b) => b.id).filter((id) => own.has(id));
}
