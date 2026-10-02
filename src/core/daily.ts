import { BALANCE, ITEMS } from './data';
import { Rng, hashSeed } from './prng';
import type { GameState, ItemInstance } from './state';
import { recipeFor } from './items';
import type { Rarity } from './types';

/** Local calendar date key YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dateKey(dt);
}

/** The seeded daily challenge item (same for every player on that date). */
export function dailyItem(key: string): ItemInstance {
  const rng = new Rng(hashSeed('daily', key));
  const a = rng.int(0, ITEMS.length - 1);
  const inst: ItemInstance = {
    uid: -1,
    a,
    r: 1 as Rarity,
    rev: true,
    s: rng.int(1, 0x7fffffff),
    d: rng.int(1, 2),
    paid: 0,
    q: -1,
    sc: [],
    col: '',
    day: 0,
  };
  inst.sc = recipeFor(inst).map(() => null);
  return inst;
}

export interface DailyOutcome {
  stars: number;
  improved: boolean;
  reward: number;
  streak: number;
}

/** Records a daily challenge result; rewards coins for each newly earned star. */
export function recordDaily(state: GameState, key: string, stars: number): DailyOutcome {
  const d = state.daily;
  const s = Math.max(0, Math.min(3, Math.round(stars)));
  if (d.date !== key) {
    const consecutive = d.date === previousDateKey(key) && d.best > 0;
    const prevStreak = consecutive ? d.streak : 0;
    state.daily = { date: key, best: 0, streak: prevStreak, claimed: false };
  }
  const cur = state.daily;
  const improved = s > cur.best;
  let reward = 0;
  if (improved) {
    reward = (s - cur.best) * BALANCE.daily.rewardPerStar * (1 + state.tier);
    if (cur.best === 0 && s > 0) cur.streak += 1;
    cur.best = s;
    state.coins += reward;
    state.stats.profit += reward;
  }
  cur.claimed = cur.best > 0;
  return { stars: s, improved, reward, streak: cur.streak };
}

export function dailyBest(state: GameState, key: string): number {
  return state.daily.date === key ? state.daily.best : 0;
}
