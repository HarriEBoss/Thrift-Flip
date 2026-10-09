/** Data schemas for src/data/*.json and runtime game state. Pure types; no Phaser, no DOM. */

export type CategoryId =
  | 'kitchen'
  | 'lamps'
  | 'chairs'
  | 'radios'
  | 'clocks'
  | 'ceramics'
  | 'bikes'
  | 'curios'
  | 'tech'
  | 'vehicles'
  | 'phones'
  | 'robots'
  | 'rockets';
export const CATEGORY_IDS: readonly CategoryId[] = [
  'kitchen',
  'ceramics',
  'lamps',
  'clocks',
  'radios',
  'chairs',
  'bikes',
  'curios',
  'tech',
  'vehicles',
  'phones',
  'robots',
  'rockets',
];

export type StepKind = 'sticker' | 'scrub' | 'rust' | 'sand' | 'glue' | 'wire' | 'fix' | 'paint' | 'polish';
/** Canonical order steps are performed in. */
export const STEP_ORDER: readonly StepKind[] = [
  'sticker',
  'scrub',
  'rust',
  'sand',
  'glue',
  'wire',
  'fix',
  'paint',
  'polish',
];

export type Rarity = 0 | 1 | 2 | 3; // Common, Uncommon, Rare, Hidden Gem
export type Era = '50s' | '60s' | '70s' | '80s' | '90s';

/** Colour tokens used by vector parts. B/A are per-item (body/accent); the rest are fixed. */
export type ColorToken = 'B' | 'A' | 'S' | 'H' | 'K' | 'M' | 'W' | 'G' | 'L' | 'Y' | 'R';

/** Vector part primitives in a 100x100 box (y down). */
export type Part =
  | { t: 'r'; x: number; y: number; w: number; h: number; r?: number; c: ColorToken; o?: 0 }
  | { t: 'e'; x: number; y: number; rx: number; ry: number; c: ColorToken; o?: 0 }
  | { t: 'p'; pts: number[]; c: ColorToken; o?: 0 }
  | { t: 'l'; pts: number[]; w: number; c: ColorToken }
  | { t: 'a'; x: number; y: number; r: number; a0: number; a1: number; w: number; c: ColorToken };

export interface RecipeStepTemplate {
  k: StepKind;
  req: boolean;
  /** Probability this damage appears on an instance. */
  p: number;
}

export interface CategoryDef {
  id: CategoryId;
  unlockTier: number;
  /** Only comes in as customer jobs at this business (never at markets, never on sale). */
  business?: string;
  /** Shape variants (arrays of parts). Item archetypes reference these by index. */
  shapes: Part[][];
}

export interface ItemArchetype {
  id: string;
  name: string;
  cat: CategoryId;
  shape: number;
  /** Body / accent colour ids from the palette in balance.json. */
  body: string;
  accent: string;
  base: number;
  era: Era;
}

export interface Persona {
  id: string;
  name: string;
  wtp: number;
  cats: CategoryId[];
  /** Looks: skin, hair, shirt colour (hex strings) + hat style. */
  look: { skin: string; hair: string; shirt: string; hat: number };
  weight: number;
  minTier: number;
}

export interface MarketDef {
  id: string;
  name: string;
  unlockTier: number;
  /** Items on offer. */
  count: [number, number];
  /** Asking price multiplier relative to (base x rarity x dirty condition). */
  ask: number;
  /** Rarity weights for Common/Uncommon/Rare/Gem. */
  rarity: [number, number, number, number];
  /** Damage level weights 0 (light) .. 2 (heavy). */
  damage: [number, number, number];
  /** Seller floors (min fraction of asking price accepted in a haggle). */
  floor: [number, number];
  auction?: boolean;
  color: string;
}

export interface TierDef {
  id: string;
  name: string;
  cost: number;
  rep: number;
  shelves: number;
  customers: number;
}

export interface SkillDef {
  id: string;
  branch: 'appraisal' | 'haggling' | 'charm' | 'craft' | 'logistics';
  rank: number;
  level: number; // player level required
  requires?: string;
}

export interface UpgradeDef {
  id: string;
  cost: number;
  tier: number;
  /** Effect multipliers / additive params keyed by tool param name. */
  fx: Partial<ToolParams>;
}

export interface ToolParams {
  scrubBrush: number;
  rustBrush: number;
  rustPower: number;
  sandBrush: number;
  paintBrush: number;
  paintOverspray: number; // multiplier on overspray penalty (lower = better)
  polishRate: number;
  glueTolerance: number;
  stickerTear: number; // multiplier on max safe peel speed
  wireHints: number; // 1 = highlight first wire hint
  magnifier: number; // 1 = narrower estimate + reveals hidden damage
}

export interface RequestTemplate {
  id: string;
  cat?: CategoryId;
  color?: string;
  era?: Era;
  minQ?: number;
  minRarity?: Rarity;
  bonus: number;
}

export interface DecorFx {
  /** Extra reputation at the end of each day. */
  repPerDay?: number;
  /** Customers happily pay this much more (0.05 = +5%). */
  price?: number;
  /** Extra customers per day. */
  customers?: number;
  /** Rare items show up more often at markets (0.3 = +30% rare weight). */
  rare?: number;
  /** Hidden gems show up more often (0.6 = +60% gem weight). */
  gem?: number;
  /** Rare-or-better items sell for this much more. */
  rareSale?: number;
}

export interface DecorDef {
  id: string;
  cost: number;
  tier: number;
  fx: DecorFx;
}

export interface ProductDef {
  id: string;
  kind: 'consumable' | 'non_consumable';
  price: string; // display fallback only; real price comes from the store
  coins?: number;
  perks?: string[];
  once?: boolean;
  badge?: string;
}

export interface PaletteColor {
  id: string;
  hex: string;
}

export interface Balance {
  startCoins: number;
  rarityMult: [number, number, number, number];
  appraisalWidth: number[];
  tiers: TierDef[];
  skills: SkillDef[];
  upgrades: UpgradeDef[];
  palette: PaletteColor[];
  paintColors: string[];
  products: ProductDef[];
  xp: { base: number; exp: number; perStep: number; perSaleDiv: number };
  rep: { sale: number; perfect: number; request: number; overprice: number };
  skippedOptionalScore: number;
  requiredWeight: number;
  trendRange: [number, number];
  ads: {
    interstitialMinDay: number;
    interstitialCooldownSec: number;
    freeGiftPerDay: number;
    saleTipPerDay: number;
    saleTipBonus: number;
  };
  daily: { rewardPerStar: number };
  catalogBonus: number;
  decor: DecorDef[];
  empire: EmpireBalance;
}

/** A kind of job a business offers: what items, how many a day, and the fee curve. */
export interface JobDef {
  /** 'service': the item's own repair; 'pc' / 'engine': a full PC rebuild / engine swap. */
  k: 'service' | 'pc' | 'engine';
  cats: CategoryId[];
  /** Only these item shapes (e.g. PC rebuilds only for desktop PCs, engine swaps only for cars). */
  shapes?: number[];
  /** Offers per day. */
  n: number;
  /** Fee = base x fee[0] + fee[1] + damage x fee[2]. */
  fee: [number, number, number];
}

/** One rung of the business ladder (data-driven: add a business by adding an entry). */
export interface BusinessDef {
  id: string;
  /** Coins you must have saved before you can open it. */
  capital: number;
  /** Share of the capital spent to open it. */
  spendPct: number;
  /** Daily income when a manager runs it (used from the delegation phase on). */
  income: number;
  needs: { business?: string; shopTier?: number };
  jobs: JobDef[];
}

export interface EmpireBalance {
  businesses: BusinessDef[];
  /** Tip for great work: fee x max(0, quality - from) x rate. */
  jobTip: { from: number; rate: number };
  jobRep: { done: number; perfect: number };
}
