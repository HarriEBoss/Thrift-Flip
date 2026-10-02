import { ITEMS } from '../data';
import {
  defaultSettings,
  emptyDayStats,
  newGame,
  type DayPhase,
  type GameState,
  type ItemInstance,
} from '../state';
import type { CategoryId, Rarity } from '../types';
import { CURRENT_VERSION, migrate } from './migrations';

/**
 * Save format (compact JSON). Item instances and requests are tuples; no derived data is stored.
 * Language is never stored (YouTube requirement).
 *
 * v1 shape (see tests/fixtures/saves for real examples):
 * { v, sd, c, x, l, rp, t, nu, dy:[...], iv:[[...]], sk, up, pk, ow, ct, rq:[[t,p,day]], st:{...}, bs, se:{...}, dl:[...], fl:{...} }
 */
export type SaveObject = Record<string, unknown> & { v: number };

const PHASES: DayPhase[] = ['market', 'workshop', 'shop', 'summary'];

type ItemTuple = [number, number, number, number, number, number, number, number, number[], string, number];

function encodeItem(i: ItemInstance): ItemTuple {
  return [
    i.uid,
    i.a,
    i.r,
    i.rev ? 1 : 0,
    i.s,
    i.d,
    i.paid,
    i.q < 0 ? -1 : Math.round(i.q * 1000),
    i.sc.map((x) => (x === null ? -1 : Math.round(x * 1000))),
    i.col,
    i.day,
  ];
}

function decodeItem(t: unknown): ItemInstance | null {
  if (!Array.isArray(t) || t.length < 11) return null;
  const [uid, a, r, rev, s, d, paid, q, sc, col, day] = t as ItemTuple;
  if (typeof a !== 'number' || a < 0 || a >= ITEMS.length) return null;
  return {
    uid: num(uid, 0),
    a,
    r: Math.max(0, Math.min(3, num(r, 0))) as Rarity,
    rev: rev === 1,
    s: num(s, 1),
    d: Math.max(0, Math.min(2, num(d, 0))),
    paid: num(paid, 0),
    q: num(q, -1) < 0 ? -1 : num(q, 0) / 1000,
    sc: Array.isArray(sc) ? sc.map((x) => (typeof x === 'number' && x >= 0 ? x / 1000 : null)) : [],
    col: typeof col === 'string' ? col : '',
    day: num(day, 1),
  };
}

function num(v: unknown, def: number): number {
  return typeof v === 'number' && isFinite(v) ? v : def;
}
function str(v: unknown, def: string): string {
  return typeof v === 'string' ? v : def;
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : v === 1 ? true : v === 0 ? false : def;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function numArr(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && isFinite(x)) : [];
}

export function serialize(state: GameState): string {
  const d = state.day;
  const s = d.stats;
  const obj: SaveObject = {
    v: CURRENT_VERSION,
    sd: state.seed,
    c: state.coins,
    x: state.xp,
    l: state.level,
    rp: state.rep,
    t: state.tier,
    nu: state.nextUid,
    dy: [
      d.n,
      PHASES.indexOf(d.ph),
      d.market,
      d.mseed,
      d.bought,
      Object.entries(d.haggled).flatMap(([k, v]) => [Number(k), v]),
      d.tips,
      d.served,
      d.rerolls,
      d.premiumOnce ? 1 : 0,
      [
        s.revenue,
        s.spent,
        s.sold,
        s.restored,
        s.xp,
        s.rep,
        s.bestBuy,
        s.bestSell,
        s.gems,
        s.levelUps,
        s.requestsDone,
        s.bonus,
      ],
      s.bestName,
      d.doubled ? 1 : 0,
      d.gifts,
      d.tipsAds,
    ],
    iv: state.inv.map(encodeItem),
    sk: state.skills,
    up: state.upgrades,
    pk: state.perks,
    ow: state.owned,
    ct: state.catalog,
    rq: state.requests.map((r) => [r.t, r.p, r.day]),
    st: { ...state.stats },
    bs: state.bestScore,
    se: { ...state.settings },
    dl: [state.daily.date, state.daily.best, state.daily.streak, state.daily.claimed ? 1 : 0],
    fl: {
      td: state.flags.tutorialDone ? 1 : 0,
      cs: state.flags.completeSeen ? 1 : 0,
      li: Math.round(state.flags.lastInterstitial),
      h: state.flags.hints,
      sa: state.flags.setsAnnounced,
    },
  };
  return JSON.stringify(obj);
}

export class SaveError extends Error {}

/** Parses + migrates + validates a save string. Throws SaveError for corrupt data. */
export function deserialize(raw: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SaveError('Save is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new SaveError('Save is not an object');
  const obj = parsed as SaveObject;
  if (typeof obj.v !== 'number') throw new SaveError('Save has no version');
  if (obj.v > CURRENT_VERSION) throw new SaveError(`Save version ${obj.v} is newer than this game`);
  const m = migrate(obj);
  return fromObject(m);
}

function fromObject(o: SaveObject): GameState {
  const seed = num(o.sd, NaN);
  if (!isFinite(seed)) throw new SaveError('Save has no seed');
  const g = newGame(seed);
  g.coins = Math.max(0, num(o.c, g.coins));
  g.xp = Math.max(0, num(o.x, 0));
  g.level = Math.max(1, num(o.l, 1));
  g.rep = Math.max(0, num(o.rp, 0));
  g.tier = Math.max(0, Math.min(4, num(o.t, 0)));
  g.nextUid = Math.max(1, num(o.nu, 1));
  const dy = Array.isArray(o.dy) ? (o.dy as unknown[]) : null;
  if (dy) {
    const st = numArr(dy[10]);
    const stats = emptyDayStats();
    [
      stats.revenue,
      stats.spent,
      stats.sold,
      stats.restored,
      stats.xp,
      stats.rep,
      stats.bestBuy,
      stats.bestSell,
      stats.gems,
      stats.levelUps,
      stats.requestsDone,
      stats.bonus,
    ] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => st[i] ?? 0);
    stats.bestName = str(dy[11], '');
    const hag = numArr(dy[5]);
    const haggled: Record<number, number> = {};
    for (let i = 0; i + 1 < hag.length; i += 2) haggled[hag[i]] = hag[i + 1];
    g.day = {
      n: Math.max(1, num(dy[0], 1)),
      ph: PHASES[num(dy[1], 0)] ?? 'market',
      market: str(dy[2], 'flea'),
      mseed: num(dy[3], seed) >>> 0,
      bought: numArr(dy[4]),
      haggled,
      tips: numArr(dy[6]),
      served: num(dy[7], 0),
      rerolls: num(dy[8], 0),
      premiumOnce: dy[9] === 1,
      stats,
      doubled: dy[12] === 1,
      gifts: num(dy[13], 0),
      tipsAds: num(dy[14], 0),
    };
  }
  g.inv = Array.isArray(o.iv)
    ? (o.iv as unknown[]).map(decodeItem).filter((x): x is ItemInstance => !!x)
    : [];
  g.skills = strArr(o.sk);
  g.upgrades = strArr(o.up);
  g.perks = strArr(o.pk);
  g.owned = strArr(o.ow);
  const ct = str(o.ct, '');
  g.catalog = /^[012]*$/.test(ct)
    ? ct.padEnd(ITEMS.length, '0').slice(0, ITEMS.length)
    : '0'.repeat(ITEMS.length);
  g.requests = Array.isArray(o.rq)
    ? (o.rq as unknown[])
        .filter((r): r is [string, string, number] => Array.isArray(r) && typeof r[0] === 'string')
        .map((r) => ({ t: r[0], p: str(r[1], 'student'), day: num(r[2], 1) }))
    : [];
  const st = (o.st && typeof o.st === 'object' ? o.st : {}) as Record<string, unknown>;
  for (const k of Object.keys(g.stats) as Array<keyof GameState['stats']>) {
    if (k === 'bestFlipName') g.stats.bestFlipName = str(st[k], '');
    else g.stats[k] = num(st[k], 0);
  }
  g.bestScore = Math.max(0, num(o.bs, 0));
  const se = (o.se && typeof o.se === 'object' ? o.se : {}) as Record<string, unknown>;
  const ds = defaultSettings();
  g.settings = {
    music: clamp01(num(se.music, ds.music)),
    sfx: clamp01(num(se.sfx, ds.sfx)),
    haptics: bool(se.haptics, ds.haptics),
    reducedMotion: bool(se.reducedMotion, ds.reducedMotion),
    largeText: bool(se.largeText, ds.largeText),
    cbPalette: bool(se.cbPalette, ds.cbPalette),
    muted: bool(se.muted, ds.muted),
  };
  const dl = Array.isArray(o.dl) ? (o.dl as unknown[]) : [];
  g.daily = { date: str(dl[0], ''), best: num(dl[1], 0), streak: num(dl[2], 0), claimed: dl[3] === 1 };
  const fl = (o.fl && typeof o.fl === 'object' ? o.fl : {}) as Record<string, unknown>;
  g.flags = {
    tutorialDone: bool(fl.td, false),
    completeSeen: bool(fl.cs, false),
    lastInterstitial: num(fl.li, -1e9),
    hints: strArr(fl.h),
    setsAnnounced: strArr(fl.sa) as CategoryId[],
  };
  return g;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** UTF-16 well-formedness check (lone surrogates are not allowed by YouTube saveData). */
export function isWellFormed(s: string): boolean {
  const sw = s as string & { isWellFormed?: () => boolean };
  if (typeof sw.isWellFormed === 'function') return sw.isWellFormed();
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** UTF-16 byte size of a save string (what the 3 MiB / 500 KiB limits refer to, conservatively). */
export function saveBytes(s: string): number {
  return s.length * 2;
}
