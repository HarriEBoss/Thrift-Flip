import { expect, test } from '@playwright/test';
import { setupPage, waitForScene } from './helpers';
import {
  playDay,
  playMarket,
  playShop,
  playSummary,
  playWorkshop,
  press,
  scene,
  tf,
  type Mode,
} from './play';

for (const mode of ['mouse', 'touch'] as Mode[]) {
  test.describe(`core loop with ${mode} only`, () => {
    if (mode === 'touch') test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    else test.use({ viewport: { width: 960, height: 540 } });

    test(`tutorial day + two more days (${mode})`, async ({ page }) => {
      test.setTimeout(600_000);
      const h = await setupPage(page);
      const t0 = Date.now();
      await page.goto('/');
      await waitForScene(page, 'MainMenu');
      await press(page, mode, 'play');
      await waitForScene(page, 'Market');
      // Tutorial: one dirty mug.
      await playMarket(page, mode, 1);
      expect(await scene(page)).toBe('Workshop');
      await playWorkshop(page, mode);
      expect(await scene(page)).toBe('Shop');
      // First sale.
      await playShop(page, mode);
      const firstSale = Date.now() - t0;
      const sold = await tf(page, (t) => t.state().stats.sold);
      expect(sold).toBeGreaterThanOrEqual(1);
      expect(firstSale).toBeLessThan(90_000);
      await waitForScene(page, 'Summary');
      await playSummary(page, mode);
      await waitForScene(page, 'Market');
      expect(await tf(page, (t) => t.state().day.n)).toBe(2);
      // Two more full days.
      for (const day of [2, 3]) {
        await playDay(page, mode, 2);
        await waitForScene(page, 'Market');
        expect(await tf(page, (t) => t.state().day.n)).toBe(day + 1);
      }
      expect(await tf(page, (t) => t.state().stats.sold)).toBeGreaterThanOrEqual(2);
      expect(h.external).toEqual([]);
    });
  });
}
