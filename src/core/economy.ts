import { BALANCE } from './data';
import type { Rarity } from './types';

/** conditionFactor = 0.15 + 0.85 x restorationQuality */
export function conditionFactor(quality: number): number {
  const q = Math.max(0, Math.min(1, quality));
  return 0.15 + 0.85 * q;
}

export function rarityMult(r: Rarity): number {
  return BALANCE.rarityMult[r];
}

/** itemValue = baseValue x rarityMultiplier x conditionFactor x trendModifier (x permanent bonuses) */
export function itemValue(base: number, rarity: Rarity, quality: number, trend = 1, bonus = 1): number {
  return Math.max(1, Math.round(base * rarityMult(rarity) * conditionFactor(quality) * trend * bonus));
}

/** Condition of an un-restored item by damage level (0 light .. 2 heavy). */
export function dirtyQuality(damage: number): number {
  return [0.16, 0.1, 0.04][Math.max(0, Math.min(2, damage))];
}

export function askingPrice(
  base: number,
  apparentRarity: Rarity,
  damage: number,
  marketAsk: number,
  jitter: number,
): number {
  return Math.max(
    1,
    Math.round(
      base * rarityMult(apparentRarity) * conditionFactor(dirtyQuality(damage)) * marketAsk * jitter,
    ),
  );
}

/**
 * Estimated restored value range shown in the market. Centre = value at quality 0.85 for the
 * *apparent* rarity; width depends on Appraisal level (and the magnifier / appraiser pass).
 */
export function estimateRange(
  base: number,
  apparentRarity: Rarity,
  appraisalLevel: number,
  trend = 1,
): [number, number] {
  const widths = BALANCE.appraisalWidth;
  const w = widths[Math.max(0, Math.min(widths.length - 1, appraisalLevel))];
  const centre = base * rarityMult(apparentRarity) * conditionFactor(0.85) * trend;
  return [Math.max(1, Math.round(centre * (1 - w))), Math.max(1, Math.round(centre * (1 + w)))];
}

/** Haggle: the seller accepts if offer >= asking x sellerFloor. */
export function haggleAccepted(offer: number, asking: number, sellerFloor: number): boolean {
  return offer >= asking * sellerFloor - 1e-9;
}

/** Seller floor lowered by the Haggling skill. Clamped to [0.6, 0.95]. */
export function effectiveFloor(baseFloor: number, hagglingLevel: number): number {
  return Math.max(0.6, Math.min(0.95, baseFloor - 0.04 * hagglingLevel));
}

export type CustomerResponse = 'sale' | 'counter' | 'walk';

/** maxPay = itemValue x persona.wtpMultiplier x random(0.9, 1.15) (x Charm bonus). */
export function maxPay(value: number, wtp: number, rand01: number, charmBonus = 1): number {
  return value * wtp * (0.9 + 0.25 * rand01) * charmBonus;
}

export function customerDecision(price: number, maxPayValue: number): CustomerResponse {
  if (price <= maxPayValue) return 'sale';
  if (price <= maxPayValue * 1.15) return 'counter';
  return 'walk';
}

/** Overpricing is "extreme" (mild reputation dip) beyond 2x what the customer would pay. */
export function isExtremeOverprice(price: number, maxPayValue: number): boolean {
  return price > maxPayValue * 2;
}

/** Snap a price to "nice" numbers. */
export function snapPrice(v: number): number {
  const x = Math.max(1, v);
  const step = x < 20 ? 1 : x < 100 ? 5 : x < 1000 ? 10 : 50;
  return Math.max(1, Math.round(x / step) * step);
}

/** Price slider range for an item value. */
export function priceRange(value: number): [number, number] {
  return [snapPrice(Math.max(1, value * 0.4)), snapPrice(Math.max(5, value * 2.2))];
}

export function suggestedPrice(value: number): number {
  return snapPrice(value * 1.05);
}

/** Restoration quality: weighted average of step scores; skipped optional steps count as a low score. */
export function restorationQuality(steps: Array<{ req: boolean; score: number | null }>): number {
  let sum = 0;
  let wsum = 0;
  for (const s of steps) {
    const w = s.req ? BALANCE.requiredWeight : 1;
    const sc =
      s.score === null ? (s.req ? 0 : BALANCE.skippedOptionalScore) : Math.max(0, Math.min(1, s.score));
    sum += sc * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

/** 1-3 stars for a restoration quality (used everywhere stars are shown). */
export function starsFor(quality: number): 0 | 1 | 2 | 3 {
  if (quality >= 0.95) return 3;
  if (quality >= 0.8) return 2;
  if (quality >= 0.55) return 1;
  return 0;
}
