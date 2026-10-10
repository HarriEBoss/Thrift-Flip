import { describe, expect, it } from 'vitest';
import {
  canShowInterstitial,
  freeGiftAmount,
  freeGiftAvailable,
  markInterstitialShown,
  saleTipAmount,
  saleTipAvailable,
} from '../../src/core/ads';
import { dailyBest, dailyItem, dateKey, previousDateKey, recordDaily } from '../../src/core/daily';
import { PRODUCTS, canPurchase, grantProduct, product, restoreProducts } from '../../src/core/products';
import { trendColor, trendFor, trendsFor, weekOf } from '../../src/core/trends';
import { recipeFor } from '../../src/core/items';
import { newGame } from '../../src/core/state';
import { game } from './helpers';

describe('ad rules', () => {
  it('interstitials never before day 3, at most every 3 minutes, never with Remove Ads', () => {
    const g = newGame(1);
    expect(canShowInterstitial(g)).toBe(false);
    g.flags.tutorialDone = true;
    g.day.n = 2;
    expect(canShowInterstitial(g)).toBe(false);
    g.day.n = 3;
    g.stats.playSec = 1000;
    expect(canShowInterstitial(g)).toBe(true);
    markInterstitialShown(g);
    g.stats.playSec += 60;
    expect(canShowInterstitial(g)).toBe(false);
    g.stats.playSec += 200;
    expect(canShowInterstitial(g)).toBe(true);
    g.perks.push('no_ads');
    expect(canShowInterstitial(g)).toBe(false);
  });
  it('small optional rewards are capped per day', () => {
    const g = game();
    expect(freeGiftAvailable(g)).toBe(true);
    g.day.gifts = 3;
    expect(freeGiftAvailable(g)).toBe(false);
    expect(freeGiftAmount(g)).toBeGreaterThan(0);
    expect(saleTipAvailable(g)).toBe(true);
    g.day.tipsAds = 3;
    expect(saleTipAvailable(g)).toBe(false);
    expect(saleTipAmount(100)).toBe(20);
    expect(saleTipAmount(1)).toBe(2);
  });
});

describe('daily challenge', () => {
  it('date keys', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
  });
  it('is seeded per date', () => {
    expect(dailyItem('2026-10-02')).toEqual(dailyItem('2026-10-02'));
    const a = dailyItem('2026-10-02');
    expect(a.sc).toHaveLength(recipeFor(a).length);
  });
  it('rewards new stars only and tracks streaks', () => {
    const g = game();
    const r1 = recordDaily(g, '2026-10-01', 2);
    expect(r1.improved).toBe(true);
    expect(r1.reward).toBeGreaterThan(0);
    expect(r1.streak).toBe(1);
    const r2 = recordDaily(g, '2026-10-01', 1);
    expect(r2.improved).toBe(false);
    expect(r2.reward).toBe(0);
    const r3 = recordDaily(g, '2026-10-01', 3);
    expect(r3.reward).toBe(r1.reward / 2);
    expect(dailyBest(g, '2026-10-01')).toBe(3);
    expect(dailyBest(g, '2026-10-02')).toBe(0);
    expect(recordDaily(g, '2026-10-02', 1).streak).toBe(2);
    expect(recordDaily(g, '2026-10-05', 1).streak).toBe(1);
    expect(recordDaily(g, '2026-10-06', 0).streak).toBe(1);
  });
});

describe('products', () => {
  it('grants coins and perks; non-consumables once', () => {
    const g = game();
    const c = g.coins;
    expect(canPurchase(g, 'starter_pack')).toBe(true);
    expect(grantProduct(g, 'starter_pack')).toBe(true);
    expect(g.coins).toBe(c + 1000);
    expect(g.perks).toContain('golden_sponge');
    expect(canPurchase(g, 'starter_pack')).toBe(false);
    expect(grantProduct(g, 'starter_pack')).toBe(false);
    expect(grantProduct(g, 'coins_small')).toBe(true);
    expect(grantProduct(g, 'coins_small')).toBe(true);
    expect(canPurchase(g, 'coins_small')).toBe(true);
    expect(grantProduct(g, 'nope')).toBe(false);
    expect(canPurchase(g, 'nope')).toBe(false);
    expect(product('remove_ads')?.perks).toEqual(['no_ads']);
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(6);
  });
  it('mega bundle makes single perk products unpurchasable', () => {
    const g = game();
    grantProduct(g, 'mega_bundle');
    expect(canPurchase(g, 'remove_ads')).toBe(false);
    expect(canPurchase(g, 'appraiser_pass')).toBe(false);
  });
  it('restore re-grants unknown non-consumables only', () => {
    const g = game();
    grantProduct(g, 'remove_ads');
    g.perks = [];
    const restored = restoreProducts(g, ['remove_ads', 'golden_toolkit', 'coins_large', 'nope']);
    expect(restored).toEqual(['golden_toolkit']);
    expect(g.perks).toContain('no_ads');
    expect(g.perks).toContain('golden_toolkit');
  });
});

describe('trends', () => {
  it('are weekly, deterministic and in range', () => {
    expect(weekOf(1)).toBe(0);
    expect(weekOf(8)).toBe(1);
    const t = trendsFor(5, 3, 4);
    expect(trendsFor(5, 3, 4)).toBe(t);
    const vals = Object.values(t.mods);
    expect(vals.length).toBeGreaterThanOrEqual(2);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0.9);
      expect(v).toBeLessThanOrEqual(1.3);
    }
    const g = game();
    expect(trendFor(g, 'kitchen')).toBeGreaterThan(0);
    expect(typeof trendColor(g)).toBe('string');
    for (let i = 0; i < 80; i++) trendsFor(i, 1, 2);
  });
});

describe('compact numbers', () => {
  it('keeps small amounts and shortens big ones', async () => {
    const { compact } = await import('../../src/game/ui/format');
    expect(compact(98765)).toBe('98765');
    expect(compact(123456)).toBe('123K');
    expect(compact(1234567)).toBe('1.23M');
    expect(compact(45_600_000)).toBe('45.6M');
    expect(compact(2_500_000_000)).toBe('2.5B');
    expect(compact(-1_500_000)).toBe('-1.5M');
  });
});
