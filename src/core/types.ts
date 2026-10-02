/** Data schemas for src/data/*.json and runtime game state. Pure types; no Phaser, no DOM. */

export type CategoryId =
  'kitchen' | 'lamps' | 'chairs' | 'radios' | 'clocks' | 'ceramics' | 'bikes' | 'curios';
export const CATEGORY_IDS: readonly CategoryId[] = [
  'kitchen',
  'ceramics',
  'lamps',
  'clocks',
  'radios',
  'chairs',
  'bikes',
  'curios',
];

export type StepKind = 'sticker' | 'scrub' | 'rust' | 'sand' | 'glue' | 'wire' | 'paint' | 'polish';
/** Canonical order steps are performed in. */
export const STEP_ORDER: readonly StepKind[] = [
  'sticker',
  'scrub',
  'rust',
  'sand',
  'glue',
  'wire',
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
}
