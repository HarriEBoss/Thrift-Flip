import { BALANCE, ITEMS, marketsForTier } from './data';
import { hashSeed } from './prng';
import { starsFor } from './economy';
import { categoryComplete, markFound, markPerfect } from './catalog';
import { instanceValue, isRestored, qualityOf, recipeFor, requiredDone } from './items';
import { addXp } from './progression';
import { matchesRequest, requestTemplate, type SaleResult } from './customers';
import { newDay, type DayPhase, type GameState, type ItemInstance } from './state';
import type { CategoryId } from './types';

/** Allowed transitions of the day state machine. */
const NEXT: Record<DayPhase, DayPhase> = {
  market: 'workshop',
  workshop: 'shop',
  shop: 'summary',
  summary: 'market',
};

export function canAdvance(state: GameState, to: DayPhase): boolean {
  return NEXT[state.day.ph] === to;
}

export function advancePhase(state: GameState, to: DayPhase): void {
  if (!canAdvance(state, to)) throw new Error(`Invalid day transition ${state.day.ph} -> ${to}`);
  if (to === 'market') {
    startNextDay(state);
    return;
  }
  state.day.ph = to;
}

/** Items still waiting in the workshop. */
export function workshopQueue(state: GameState): ItemInstance[] {
  return state.inv.filter((i) => !isRestored(i));
}

export function shelfItems(state: GameState): ItemInstance[] {
  return state.inv.filter(isRestored);
}

export interface RestoreResult {
  quality: number;
  value: number;
  stars: number;
  newPerfect: boolean;
  gemRevealed: boolean;
  xp: number;
  levelUps: number;
  setCompleted: CategoryId | null;
}

/** Records one step's score (null = skipped optional step). */
export function recordStep(inst: ItemInstance, stepIndex: number, score: number | null): void {
  const recipe = recipeFor(inst);
  if (stepIndex < 0 || stepIndex >= recipe.length) throw new Error('bad step index');
  if (score === null && recipe[stepIndex].req) throw new Error('required step cannot be skipped');
  inst.sc[stepIndex] = score === null ? null : Math.max(0, Math.min(1, score));
}

/** Finalises a restoration: quality, catalog, XP, gem reveal. */
export function finishRestoration(state: GameState, inst: ItemInstance, paintColor?: string): RestoreResult {
  if (!requiredDone(inst)) throw new Error('required steps missing');
  if (paintColor) inst.col = paintColor;
  inst.q = Math.round(qualityOf(inst) * 1000) / 1000;
  const gemRevealed = !inst.rev && inst.r === 3;
  inst.rev = true;
  markFound(state, inst.a);
  const newPerfect = inst.q >= 0.95 ? markPerfect(state, inst.a) : false;
  state.stats.restored++;
  state.day.stats.restored++;
  if (inst.q >= 0.95) state.stats.perfects++;
  if (gemRevealed) {
    state.stats.gems++;
    state.day.stats.gems++;
  }
  const steps = recipeFor(inst).length;
  const xp = BALANCE.xp.perStep * steps * (0.5 + inst.q) + (newPerfect ? 10 : 0);
  const levelUps = addXp(state, xp);
  const cat = ITEMS[inst.a].cat;
  let setCompleted: CategoryId | null = null;
  if (categoryComplete(state, cat) && !state.flags.setsAnnounced.includes(cat)) {
    state.flags.setsAnnounced.push(cat);
    setCompleted = cat;
  }
  return {
    quality: inst.q,
    value: instanceValue(state, inst),
    stars: starsFor(inst.q),
    newPerfect,
    gemRevealed,
    xp: Math.round(xp),
    levelUps,
    setCompleted,
  };
}

/** Completes a sale at `price` (fulfilling the request at `requestIndex` if given). */
export function completeSale(
  state: GameState,
  inst: ItemInstance,
  price: number,
  requestIndex: number | null = null,
): SaleResult {
  const idx = state.inv.indexOf(inst);
  if (idx < 0) throw new Error('item not in inventory');
  if (!isRestored(inst)) throw new Error('cannot sell an unrestored item');
  state.inv.splice(idx, 1);
  const p = Math.max(1, Math.round(price));
  const profit = p - inst.paid;
  state.coins += p;
  state.day.stats.revenue += p;
  state.day.stats.sold++;
  state.stats.revenue += p;
  state.stats.sold++;
  state.stats.profit += profit;
  if (profit > state.stats.bestFlip) {
    state.stats.bestFlip = profit;
    state.stats.bestFlipName = ITEMS[inst.a].name;
  }
  if (profit > state.day.stats.bestSell - state.day.stats.bestBuy || !state.day.stats.bestName) {
    state.day.stats.bestName = ITEMS[inst.a].name;
    state.day.stats.bestBuy = inst.paid;
    state.day.stats.bestSell = p;
  }
  let rep = BALANCE.rep.sale + (inst.q >= 0.95 ? BALANCE.rep.perfect : 0);
  let request = false;
  if (requestIndex !== null && state.requests[requestIndex]) {
    const tmpl = requestTemplate(state.requests[requestIndex].t);
    if (matchesRequest(inst, tmpl)) {
      state.requests.splice(requestIndex, 1);
      rep += BALANCE.rep.request;
      request = true;
      state.stats.requests++;
      state.day.stats.requestsDone++;
    }
  }
  state.rep += rep;
  state.day.stats.rep += rep;
  const xp = 4 + Math.max(0, profit) / BALANCE.xp.perSaleDiv;
  const levelUps = addXp(state, xp);
  return { price: p, profit, xp: Math.round(xp), rep, levelUps, request };
}

/** Bonus coins (rewarded ads, gifts): count towards coins and lifetime profit. */
export function grantBonus(state: GameState, coins: number): number {
  const c = Math.max(0, Math.round(coins));
  state.coins += c;
  state.day.stats.bonus += c;
  state.stats.profit += c;
  return c;
}

export function dayProfit(state: GameState): number {
  const s = state.day.stats;
  return s.revenue - s.spent + s.bonus;
}

/** Double Day Earnings (rewarded ad, once per day): doubles today's positive sales profit. */
export function doubleDayAmount(state: GameState): number {
  const s = state.day.stats;
  return Math.max(0, s.revenue - s.spent);
}

export function applyDoubleDay(state: GameState): number {
  if (state.day.doubled) return 0;
  const amt = doubleDayAmount(state);
  state.day.doubled = true;
  return grantBonus(state, amt);
}

function startNextDay(state: GameState): void {
  const n = state.day.n + 1;
  const markets = marketsForTier(state.tier);
  const prev = markets.find((m) => m.id === state.day.market) ? state.day.market : markets[0].id;
  if (!state.flags.tutorialDone) state.flags.tutorialDone = true;
  state.day = newDay(n, prev, hashSeed(state.seed, 'day', n) >>> 0);
  // Old requests expire after 7 days so the board keeps moving.
  state.requests = state.requests.filter((r) => n - r.day <= 7);
}
