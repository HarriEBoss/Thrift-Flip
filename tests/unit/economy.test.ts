import { describe, expect, it } from 'vitest';
import {
  askingPrice,
  conditionFactor,
  customerDecision,
  dirtyQuality,
  effectiveFloor,
  estimateRange,
  haggleAccepted,
  isExtremeOverprice,
  itemValue,
  maxPay,
  priceRange,
  restorationQuality,
  snapPrice,
  starsFor,
  suggestedPrice,
} from '../../src/core/economy';

describe('value formula', () => {
  it('conditionFactor = 0.15 + 0.85q, clamped', () => {
    expect(conditionFactor(0)).toBeCloseTo(0.15);
    expect(conditionFactor(1)).toBeCloseTo(1);
    expect(conditionFactor(0.5)).toBeCloseTo(0.575);
    expect(conditionFactor(2)).toBeCloseTo(1);
    expect(conditionFactor(-1)).toBeCloseTo(0.15);
  });
  it('itemValue = base x rarity x condition x trend', () => {
    expect(itemValue(100, 0, 1)).toBe(100);
    expect(itemValue(100, 1, 1)).toBe(160);
    expect(itemValue(100, 2, 1)).toBe(300);
    expect(itemValue(100, 3, 1)).toBe(600);
    expect(itemValue(100, 0, 1, 1.3)).toBe(130);
    expect(itemValue(100, 0, 0)).toBe(15);
    expect(itemValue(1, 0, 0)).toBe(1);
  });
  it('asking prices scale with damage and market', () => {
    const light = askingPrice(100, 0, 0, 1, 1);
    const heavy = askingPrice(100, 0, 2, 1, 1);
    expect(light).toBeGreaterThan(heavy);
    expect(askingPrice(100, 0, 0, 2, 1)).toBeGreaterThan(light);
    expect(dirtyQuality(9)).toBe(dirtyQuality(2));
  });
  it('estimate width shrinks with appraisal', () => {
    const [a0, b0] = estimateRange(100, 0, 0);
    const [a3, b3] = estimateRange(100, 0, 3);
    expect(b0 - a0).toBeGreaterThan(b3 - a3);
    expect(estimateRange(100, 0, 99)).toEqual(estimateRange(100, 0, 3));
  });
});

describe('haggling', () => {
  it('accepts at or above the floor', () => {
    expect(haggleAccepted(80, 100, 0.8)).toBe(true);
    expect(haggleAccepted(79, 100, 0.8)).toBe(false);
  });
  it('haggling skill lowers the floor within bounds', () => {
    expect(effectiveFloor(0.9, 0)).toBeCloseTo(0.9);
    expect(effectiveFloor(0.9, 2)).toBeCloseTo(0.82);
    expect(effectiveFloor(0.62, 2)).toBeCloseTo(0.6);
    expect(effectiveFloor(1, 0)).toBeCloseTo(0.95);
  });
});

describe('customers', () => {
  it('maxPay spans 0.9..1.15 x value x wtp', () => {
    expect(maxPay(100, 1, 0)).toBeCloseTo(90);
    expect(maxPay(100, 1, 1)).toBeCloseTo(115);
    expect(maxPay(100, 2, 0, 1.1)).toBeCloseTo(198);
  });
  it('decides sale / counter / walk', () => {
    expect(customerDecision(100, 100)).toBe('sale');
    expect(customerDecision(110, 100)).toBe('counter');
    expect(customerDecision(116, 100)).toBe('walk');
    expect(isExtremeOverprice(201, 100)).toBe(true);
    expect(isExtremeOverprice(150, 100)).toBe(false);
  });
  it('snaps prices to nice numbers', () => {
    expect(snapPrice(7.4)).toBe(7);
    expect(snapPrice(23)).toBe(25);
    expect(snapPrice(234)).toBe(230);
    expect(snapPrice(1234)).toBe(1250);
    expect(snapPrice(0)).toBe(1);
    expect(suggestedPrice(100)).toBe(110);
    expect(suggestedPrice(50)).toBe(55);
    const [lo, hi] = priceRange(100);
    expect(lo).toBeLessThan(hi);
  });
});

describe('restoration quality', () => {
  it('weights required steps double and penalises skipped optional steps', () => {
    expect(restorationQuality([{ req: true, score: 1 }])).toBe(1);
    const q = restorationQuality([
      { req: true, score: 1 },
      { req: false, score: null },
    ]);
    expect(q).toBeCloseTo((2 + 0.35) / 3);
    expect(restorationQuality([{ req: true, score: null }])).toBe(0);
    expect(restorationQuality([])).toBe(0);
    expect(restorationQuality([{ req: false, score: 5 }])).toBe(1);
  });
  it('stars', () => {
    expect(starsFor(0.96)).toBe(3);
    expect(starsFor(0.85)).toBe(2);
    expect(starsFor(0.6)).toBe(1);
    expect(starsFor(0.2)).toBe(0);
  });
});
