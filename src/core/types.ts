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

export type StepKind =
  'sticker' | 'scrub' | 'rust' | 'sand' | 'glue' | 'design' | 'wire' | 'fix' | 'paint' | 'polish';
/** Canonical order steps are performed in. */
export const STEP_ORDER: readonly StepKind[] = [
  'sticker',
  'scrub',
  'rust',
  'sand',
  'glue',
  'design',
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
  /** A region's own market: open once that region is conquered. */
  region?: string;
  /** Only these categories (that the shop size allows) are found here. */
  cats?: CategoryId[];
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
  /** Daily income per shop when a manager runs it at 100% efficiency. */
  income: number;
  needs: { business?: string; shopTier?: number };
  jobs: JobDef[];
  /** How its contracts scale (none for the Reselling Shop). */
  contract?: ContractDef;
}

/** Contract difficulty at a business. */
export interface ContractDef {
  /** Difficulty stars (1-5): more pay. One more when you own a bigger business. */
  stars: [number, number];
  /** Quality the client asks for, in reveal stars (1-3). */
  target: [number, number];
  /** Chance a contract is a fleet order (2-3 items). */
  fleet: number;
  /** Offers a custom engineering contract when this is your biggest business. */
  design: boolean;
}

export interface TechDef {
  id: string;
  cost: number;
  /** In-game days of research. */
  days: number;
  needs: string[];
}

/** A solar system body: found a colony there to harvest its material. */
export interface BodyDef {
  id: string;
  /** Coins to found the colony. */
  cost: number;
  techs: string[];
  /** Colony that must be founded first. */
  body?: string;
  material: string;
  /** Material harvested per day. */
  rate: number;
  /** Coins the colony makes per day. */
  income: number;
  /** Distance from the Sun on the map (0..1). */
  orbit: number;
  /** Not needed to go further (the Moon). */
  optional?: boolean;
  /** The colony's name as a client of its repair contracts. */
  client: string;
}

export interface SpaceBalance {
  tech: TechDef[];
  bodies: BodyDef[];
  /** Colony repair contracts at Rocket Repair: pay = base x pay[0] + pay[1]; reward = rate x reward. */
  contract: { pay: [number, number]; reward: number; cats: CategoryId[]; shapes: Record<string, number[]> };
  /** Dyson stage n needs coins x n and materials[m] x n; each built stage sells energy every day. */
  dyson: { stages: number; coins: number; materials: Record<string, number>; energy: number };
}

/** An Earth region: open an office, then win its flagship contract to conquer it. */
export interface RegionDef {
  id: string;
  /** Coins to open the regional office. */
  cost: number;
  /** Business whose job board gets the flagship contract. */
  biz: string;
  /** Who the flagship contract is for. */
  client: string;
  /** Position on the world map (0..1). */
  u: number;
  v: number;
  /** Permanent bonuses once conquered: shop prices, contract pay, manager income (fractions). */
  fx: { price?: number; contracts?: number; income?: number };
}

export interface CampaignDef {
  id: string;
  cost: number;
  /** Brand points it adds. */
  brand: number;
  /** Business you must own to run it. */
  needs: string;
}

export interface EmpireBalance {
  businesses: BusinessDef[];
  /** Space: Earth research, colonies on other bodies, and the Dyson project. */
  space: SpaceBalance;
  /** Global expansion: conquer every region before space. */
  regions: {
    /** Business that must be owned first. */
    unlock: string;
    /** Flagship contract pay: a design contract's pay x this. */
    flagshipPay: number;
    list: RegionDef[];
  };
  /** Delegation: managers run businesses for you; branches multiply a business. */
  managers: {
    /** Business that must be owned before managers and branches are available. */
    unlock: string;
    /** Hiring a manager costs the business capital x this. */
    hireCost: number;
    /** Training to the next level costs the hire cost x upgradeGrowth^level. */
    upgradeGrowth: number;
    /** Share of the business income a manager makes, per level (1..n). */
    efficiency: number[];
    /** Daily wage, as a share of what the manager makes. */
    wagePct: number;
    /** First extra branch costs the capital x branchCost; each next one x branchGrowth more. */
    branchCost: number;
    branchGrowth: number;
  };
  /** Brand flow = 1 + flowMax x (1 - e^(-brand / flowK)); brand fades by `decay` a day. */
  marketing: { flowMax: number; flowK: number; decay: number; campaigns: CampaignDef[] };
  contracts: {
    /** Pay x (1 + payPerStar x (stars - 1)). */
    payPerStar: number;
    /** Extra pay per item beyond the first in a fleet order. */
    fleetBonus: number;
    /** Pay factor when the client's quality target is missed. */
    belowTarget: number;
    /** Custom design pay: base x [0] + [1]. */
    designPay: [number, number];
  };
  /** Tip for great work: fee x max(0, quality - from) x rate. */
  jobTip: { from: number; rate: number };
  jobRep: { done: number; perfect: number };
}
