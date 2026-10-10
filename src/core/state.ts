import type { JobKind } from './repair';
import { BALANCE, ITEMS } from './data';
import { suggestName } from './names';
import type { CategoryId, Rarity, StepKind } from './types';

export type DayPhase = 'market' | 'workshop' | 'shop' | 'summary';

export interface ItemInstance {
  uid: number;
  /** Archetype index into ITEMS. */
  a: number;
  r: Rarity;
  /** True rarity revealed to the player (gems are hidden until restored or appraised). */
  rev: boolean;
  /** Seed for procedural damage + recipe. */
  s: number;
  /** Damage level 0..2. */
  d: number;
  paid: number;
  /** Restoration quality 0..1, or -1 when not restored yet. */
  q: number;
  /** Per-recipe-step score (0..1), null = skipped/not done. Same length as the recipe. */
  sc: Array<number | null>;
  /** Painted colour id ('' = original body colour). */
  col: string;
  /** Day bought. */
  day: number;
  /** A customer's repair job (not ours to sell): fee paid when done, persona id, kind of job. */
  job?: {
    fee: number;
    p: string;
    k: JobKind;
    /** Reveal stars the client asked for (1-3); missing it lowers the pay. */
    t?: number;
    /** Client company name for contracts (else the customer persona is the client). */
    c?: string;
    /** Region whose flagship contract this is (finishing it conquers the region). */
    r?: string;
    /** Colony whose repair contract this is (finishing it ships extra material). */
    sp?: string;
  };
}

export interface SpaceState {
  /** Technologies researched. */
  techs: string[];
  /** Research in progress and days left. */
  research: { id: string; left: number } | null;
  /** Colonies founded (body ids). */
  colonies: string[];
  /** Materials in stock. */
  mat: Record<string, number>;
  /** Dyson stages built. */
  dyson: number;
}

/** Prestige: kept when a run is reset. */
export interface PrestigeState {
  /** Prestiges done. */
  n: number;
  /** Tokens not spent yet. */
  tokens: number;
  /** Skill tree nodes bought. */
  nodes: string[];
  /** Fewest in-game days a run took to harvest the whole Sun (0 = never). */
  best: number;
}

export interface CustomerRequest {
  /** Request template id. */
  t: string;
  /** Persona id who asked. */
  p: string;
  /** Day posted. */
  day: number;
}

export interface DayStats {
  revenue: number;
  spent: number;
  sold: number;
  restored: number;
  xp: number;
  rep: number;
  bestName: string;
  bestBuy: number;
  bestSell: number;
  gems: number;
  levelUps: number;
  requestsDone: number;
  /** Bonus coins from ads/perks (double earnings, tips, gifts). */
  bonus: number;
  /** Coins your managers made today (net of wages). */
  passive: number;
}

export interface DayState {
  n: number;
  ph: DayPhase;
  market: string;
  /** Seed for today's market offering (changes on reroll). */
  mseed: number;
  /** Offer indices bought today. */
  bought: number[];
  /** Offer index -> haggle outcome: price locked (accepted offer or full price after rejection). */
  haggled: Record<number, number>;
  /** Offer indices whose true rarity was revealed by an Appraiser's Tip. */
  tips: number[];
  /** Customers served so far today (index into today's generated queue). */
  served: number;
  /** Number of market rerolls today. */
  rerolls: number;
  /** Whether the premium tool (rewarded) is active for the next restoration. */
  premiumOnce: boolean;
  stats: DayStats;
  /** Double Day Earnings (rewarded ad) used today. */
  doubled: boolean;
  /** Ad counters (per in-game day). */
  gifts: number;
  tipsAds: number;
  /** Ids of today's job offers already taken on. */
  jobs: number[];
  /** Marketing campaigns run today. */
  ads: string[];
}

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  cbPalette: boolean;
  /** Overall mute (not shown / not used on YouTube). */
  muted: boolean;
}

export interface LifetimeStats {
  profit: number;
  revenue: number;
  restored: number;
  sold: number;
  perfects: number;
  gems: number;
  bestFlip: number;
  bestFlipName: string;
  requests: number;
  playSec: number;
}

export interface DailyRecord {
  /** Date key of the last attempted daily challenge (YYYY-MM-DD). */
  date: string;
  /** Best stars on that date. */
  best: number;
  /** Consecutive days with at least one star. */
  streak: number;
  /** Whether the reward for `date` has been claimed. */
  claimed: boolean;
}

export interface GameState {
  seed: number;
  coins: number;
  xp: number;
  level: number;
  rep: number;
  tier: number;
  day: DayState;
  inv: ItemInstance[];
  nextUid: number;
  skills: string[];
  upgrades: string[];
  /** Owned paid/perk unlocks (product perks). */
  perks: string[];
  /** Product ids purchased (non-consumables + once-only packs), for restore + UI. */
  owned: string[];
  /** Owned shop decorations (ids). */
  decor: string[];
  /** Company name (shown on the shop sign, summaries and contracts). */
  company: string;
  /** Businesses owned (ladder ids, always including 'reselling') and the one worked at today. */
  biz: { own: string[]; cur: string };
  /** Brand points from marketing (fade a little every day). */
  brand: number;
  /** Manager level per business id (missing = no manager). */
  managers: Record<string, number>;
  /** Extra branches per business id (missing = just the first shop). */
  branches: Record<string, number>;
  /** Regions: 1 = office open (flagship contract on offer), 2 = conquered. */
  regions: Record<string, number>;
  /** Space program. */
  space: SpaceState;
  /** Prestige count, tokens and the permanent skill tree. */
  prestige: PrestigeState;
  /** One char per item: '0' unseen, '1' found, '2' perfectly restored. */
  catalog: string;
  requests: CustomerRequest[];
  stats: LifetimeStats;
  /** Highest score sent via submitScore (must match best score in save). */
  bestScore: number;
  settings: Settings;
  daily: DailyRecord;
  flags: {
    tutorialDone: boolean;
    completeSeen: boolean;
    /** Seconds of play when the last interstitial was shown. */
    lastInterstitial: number;
    /** Ids of one-time hints shown. */
    hints: string[];
    /** Categories whose completion bonus was announced. */
    setsAnnounced: CategoryId[];
    /** Whether the player has named (or kept the suggested name of) their company. */
    named: boolean;
  };
}

export function defaultSettings(): Settings {
  return {
    music: 0.6,
    sfx: 0.8,
    haptics: true,
    reducedMotion: false,
    largeText: false,
    cbPalette: false,
    muted: false,
  };
}

export function emptyDayStats(): DayStats {
  return {
    revenue: 0,
    spent: 0,
    sold: 0,
    restored: 0,
    xp: 0,
    rep: 0,
    bestName: '',
    bestBuy: 0,
    bestSell: 0,
    gems: 0,
    levelUps: 0,
    requestsDone: 0,
    bonus: 0,
    passive: 0,
  };
}

export function newDay(n: number, market: string, mseed: number): DayState {
  return {
    n,
    ph: 'market',
    market,
    mseed,
    bought: [],
    haggled: {},
    tips: [],
    served: 0,
    rerolls: 0,
    premiumOnce: false,
    stats: emptyDayStats(),
    doubled: false,
    gifts: 0,
    tipsAds: 0,
    jobs: [],
    ads: [],
  };
}

export function newGame(seed: number): GameState {
  return {
    seed: seed >>> 0,
    coins: BALANCE.startCoins,
    xp: 0,
    level: 1,
    rep: 0,
    tier: 0,
    day: newDay(1, 'flea', seed >>> 0),
    inv: [],
    nextUid: 1,
    skills: [],
    upgrades: [],
    perks: [],
    owned: [],
    decor: [],
    company: suggestName(seed >>> 0),
    biz: { own: ['reselling'], cur: 'reselling' },
    brand: 0,
    managers: {},
    branches: {},
    regions: {},
    space: { techs: [], research: null, colonies: [], mat: {}, dyson: 0 },
    prestige: { n: 0, tokens: 0, nodes: [], best: 0 },
    catalog: '0'.repeat(ITEMS.length),
    requests: [],
    stats: {
      profit: 0,
      revenue: 0,
      restored: 0,
      sold: 0,
      perfects: 0,
      gems: 0,
      bestFlip: 0,
      bestFlipName: '',
      requests: 0,
      playSec: 0,
    },
    bestScore: 0,
    settings: defaultSettings(),
    daily: { date: '', best: 0, streak: 0, claimed: false },
    flags: {
      tutorialDone: false,
      completeSeen: false,
      lastInterstitial: -1e9,
      hints: [],
      setsAnnounced: [],
      named: false,
    },
  };
}

export type { StepKind };
