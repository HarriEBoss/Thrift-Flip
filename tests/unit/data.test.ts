import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  CATEGORIES,
  ITEMS,
  MARKETS,
  PERSONAS,
  RECIPES,
  REQUESTS,
  categoriesForTier,
  category,
  itemIndex,
  market,
  marketsForTier,
  paletteHex,
  persona,
} from '../../src/core/data';
import { CATEGORY_IDS } from '../../src/core/types';

describe('content data', () => {
  it('has 8 categories x 15 items = 120 catalog entries with unique ids', () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(ITEMS).toHaveLength(120);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(120);
    for (const c of CATEGORY_IDS) expect(ITEMS.filter((i) => i.cat === c)).toHaveLength(15);
  });
  it('every item references a valid shape and palette colours', () => {
    const pal = new Set(BALANCE.palette.map((p) => p.id));
    for (const it of ITEMS) {
      expect(category(it.cat).shapes[it.shape]).toBeDefined();
      expect(pal.has(it.body)).toBe(true);
      expect(pal.has(it.accent)).toBe(true);
      expect(it.base).toBeGreaterThan(0);
    }
  });
  it('has recipes for all categories with at least one required step', () => {
    for (const c of CATEGORY_IDS) {
      expect(RECIPES[c].length).toBeGreaterThanOrEqual(2);
      expect(RECIPES[c].some((s) => s.req)).toBe(true);
    }
  });
  it('has 5 markets, 5 tiers, ~12 personas, ~25 request templates, 12 skills', () => {
    expect(MARKETS).toHaveLength(5);
    expect(BALANCE.tiers).toHaveLength(5);
    expect(PERSONAS).toHaveLength(12);
    expect(REQUESTS).toHaveLength(25);
    expect(BALANCE.skills).toHaveLength(12);
  });
  it('lookups work and throw on unknown ids', () => {
    expect(itemIndex(ITEMS[3].id)).toBe(3);
    expect(() => itemIndex('nope')).toThrow();
    expect(() => category('nope' as never)).toThrow();
    expect(market('flea').id).toBe('flea');
    expect(() => market('nope')).toThrow();
    expect(persona('student').id).toBe('student');
    expect(() => persona('nope')).toThrow();
    expect(paletteHex('red')).toMatch(/^#/);
    expect(paletteHex('nope')).toBe('#cccccc');
  });
  it('unlocks categories and markets by tier', () => {
    expect(categoriesForTier(0)).toEqual(['kitchen', 'ceramics']);
    expect(categoriesForTier(4)).toHaveLength(8);
    expect(marketsForTier(0).map((m) => m.id)).toEqual(['flea']);
    expect(marketsForTier(4)).toHaveLength(5);
  });
  it('products contain no randomized rewards', () => {
    for (const p of BALANCE.products) {
      expect(Object.keys(p).some((k) => /random|loot|mystery/i.test(k))).toBe(false);
    }
  });
});
