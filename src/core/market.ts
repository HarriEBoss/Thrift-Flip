import { ITEMS, categoriesForTier, itemIndex, market as marketDef, marketsForTier } from './data';
import { Rng, hashSeed } from './prng';
import { askingPrice, effectiveFloor, estimateRange, haggleAccepted } from './economy';
import { catalogState, markFound } from './catalog';
import { TUTORIAL_SEED, makeInstance } from './items';
import { appraisalLevel, marketSlots, revealsGems, shelfCapacity, skillRank } from './perks';
import { trendFor } from './trends';
import { decorFx } from './decor';
import { regionMarkets } from './regions';
import type { GameState, ItemInstance } from './state';
import type { MarketDef, Rarity } from './types';

export interface Offer {
  idx: number;
  a: number;
  r: Rarity;
  /** Rarity the player sees (gems look common unless revealed). */
  apparent: Rarity;
  d: number;
  s: number;
  ask: number;
  /** Base seller floor before Haggling skill. */
  floor: number;
  seller: number;
}

export function tutorialOffer(): Offer {
  return {
    idx: 0,
    a: itemIndex('kit_polka_dot_mug'),
    r: 0,
    apparent: 0,
    d: 0,
    s: TUTORIAL_SEED,
    ask: 4,
    floor: 0.8,
    seller: 0,
  };
}

/** Picks an archetype: biased towards catalog entries the player has not found yet. */
function pickArchetype(state: GameState, rng: Rng, cats: string[]): number {
  const pool: number[] = [];
  const unseen: number[] = [];
  ITEMS.forEach((it, i) => {
    if (!cats.includes(it.cat)) return;
    pool.push(i);
    if (catalogState(state, i) === 0) unseen.push(i);
  });
  if (unseen.length && rng.chance(0.4)) return rng.pick(unseen);
  return rng.pick(pool);
}

/** Generates today's market offering. Deterministic from the day's market seed. */
export function generateOffers(state: GameState, mdef: MarketDef = marketDef(state.day.market)): Offer[] {
  if (!state.flags.tutorialDone && state.day.n === 1) return [tutorialOffer()];
  const rng = new Rng(hashSeed(state.seed, 'market', state.day.mseed, mdef.id));
  // Regional markets specialise in a few categories (of those the shop size allows).
  const all = categoriesForTier(state.tier);
  const focus = mdef.cats ? all.filter((c) => mdef.cats!.includes(c)) : [];
  const cats = focus.length ? focus : all;
  const count = rng.int(mdef.count[0], mdef.count[1]);
  const offers: Offer[] = [];
  for (let i = 0; i < count; i++) {
    const a = pickArchetype(state, rng, cats);
    const r = rng.weighted(rarityWeights(state, mdef)) as Rarity;
    const d = rng.weighted(mdef.damage);
    const apparent: Rarity = r === 3 && !revealsGems(state) ? 0 : r;
    const ask = askingPrice(ITEMS[a].base, apparent, d, mdef.ask, rng.range(0.85, 1.15));
    offers.push({
      idx: i,
      a,
      r,
      apparent,
      d,
      s: rng.int(1, 0x7fffffff),
      ask,
      floor: Math.round(rng.range(mdef.floor[0], mdef.floor[1]) * 100) / 100,
      seller: rng.int(0, 5),
    });
  }
  return ensureAffordable(state, offers);
}

/**
 * Soft-lock guard: a player with an empty inventory who cannot afford anything gets one
 * generous seller, so the loop can always continue without purchases.
 */
export function ensureAffordable(state: GameState, offers: Offer[]): Offer[] {
  if (state.inv.length > 0 || !offers.length) return offers;
  if (offers.some((o) => o.ask <= state.coins)) return offers;
  let cheapest = offers[0];
  for (const o of offers) if (o.ask < cheapest.ask) cheapest = o;
  cheapest.ask = Math.max(0, state.coins);
  return offers;
}

/**
 * Rarity weights for a market. Bigger shops attract better finds: every shop tier and some
 * decorations shift the odds toward uncommon, rare and hidden-gem items.
 */
export function rarityWeights(state: GameState, mdef: MarketDef): [number, number, number, number] {
  const t = state.tier;
  const fx = decorFx(state);
  const [c, u, r, g] = mdef.rarity;
  return [c, u * (1 + 0.15 * t), r * (1 + 0.25 * t + fx.rare), g * (1 + 0.2 * t + fx.gem)];
}

/** Offer as currently visible: an Appraiser's Tip reveals the true rarity. */
export function visibleRarity(state: GameState, o: Offer): Rarity {
  return state.day.tips.includes(o.idx) ? o.r : o.apparent;
}

export function offerEstimate(state: GameState, o: Offer): [number, number] {
  const lvl = state.day.tips.includes(o.idx) ? 3 : appraisalLevel(state);
  return estimateRange(ITEMS[o.a].base, visibleRarity(state, o), lvl, trendFor(state, ITEMS[o.a].cat));
}

export function priceFor(state: GameState, o: Offer): number {
  const locked = state.day.haggled[o.idx];
  return typeof locked === 'number' ? locked : o.ask;
}

/** `day.bought` length counts every purchase today (including ones from before a reroll). */
export function slotsLeft(state: GameState): number {
  return Math.max(0, marketSlots(state) - state.day.bought.length);
}

export function inventoryFull(state: GameState): boolean {
  return state.inv.filter((i) => !i.job).length >= shelfCapacity(state) + marketSlots(state);
}

export type BuyResult = 'ok' | 'no_slots' | 'no_coins' | 'already' | 'full';

export function canBuy(state: GameState, o: Offer): BuyResult {
  if (state.day.bought.includes(o.idx)) return 'already';
  if (slotsLeft(state) <= 0) return 'no_slots';
  if (inventoryFull(state)) return 'full';
  if (state.coins < priceFor(state, o)) return 'no_coins';
  return 'ok';
}

export function buyOffer(state: GameState, o: Offer): ItemInstance | null {
  if (canBuy(state, o) !== 'ok') return null;
  const price = priceFor(state, o);
  state.coins -= price;
  state.day.stats.spent += price;
  state.day.bought.push(o.idx);
  const inst = makeInstance(
    state,
    o.a,
    o.r,
    o.s,
    o.d,
    price,
    state.day.tips.includes(o.idx) || revealsGems(state),
  );
  state.inv.push(inst);
  markFound(state, o.a);
  return inst;
}

export type HaggleResult = 'accepted' | 'rejected' | 'invalid';

/** One haggle per item. A rejected offer locks the item at full price. */
export function haggle(state: GameState, o: Offer, offer: number): HaggleResult {
  if (typeof state.day.haggled[o.idx] === 'number' || state.day.bought.includes(o.idx)) return 'invalid';
  const floor = effectiveFloor(o.floor, skillRank(state, 'haggling'));
  const price = Math.max(1, Math.round(offer));
  if (price >= o.ask) {
    state.day.haggled[o.idx] = o.ask;
    return 'accepted';
  }
  if (haggleAccepted(price, o.ask, floor)) {
    state.day.haggled[o.idx] = price;
    return 'accepted';
  }
  state.day.haggled[o.idx] = o.ask;
  return 'rejected';
}

/** Appraiser's Tip (rewarded ad): reveal one offer's true rarity and a narrow estimate. */
export function applyAppraiserTip(state: GameState, o: Offer): void {
  if (!state.day.tips.includes(o.idx)) state.day.tips.push(o.idx);
}

/** Market Reroll (rewarded ad): fresh offering; already-bought items stay in the inventory. */
export function rerollMarket(state: GameState): void {
  state.day.rerolls++;
  state.day.mseed = hashSeed(state.day.mseed, 'reroll', state.day.rerolls) >>> 0;
  // Slots used so far today are preserved by moving bought indices out of range.
  state.day.bought = state.day.bought.map((_, i) => -1 - i - state.day.rerolls * 100);
  state.day.haggled = {};
  state.day.tips = [];
}

export function availableMarkets(state: GameState): MarketDef[] {
  return [...marketsForTier(state.tier), ...regionMarkets(state)];
}

export function setMarket(state: GameState, id: string): boolean {
  if (state.day.bought.length > 0) return false;
  if (!availableMarkets(state).some((m) => m.id === id)) return false;
  state.day.market = id;
  return true;
}
