import { expect, test } from '@playwright/test';
import { setupPage, waitForScene, ytLog } from './helpers';

test('firstFrameReady before gameReady; gameReady only once the menu is interactive', async ({ page }) => {
  const h = await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  await page.waitForFunction(() =>
    (window as unknown as { __ytMock: { log: Array<{ name: string }> } }).__ytMock.log.some(
      (e) => e.name === 'gameReady',
    ),
  );
  const log = await ytLog(page);
  const names = log.map((e) => e.name);
  const ff = names.indexOf('firstFrameReady');
  const gr = names.indexOf('gameReady');
  expect(ff).toBeGreaterThanOrEqual(0);
  expect(gr).toBeGreaterThan(ff);
  expect(names.filter((n) => n === 'gameReady')).toHaveLength(1);
  expect(names.filter((n) => n === 'firstFrameReady')).toHaveLength(1);
  // The HTML loading screen is gone by gameReady.
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5000 });
  expect(h.external).toEqual([]);
});

test('loadData resolves before any saveData', async ({ page }) => {
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  // Force a save through the debug hook.
  await page.evaluate(() =>
    (window as unknown as { __tf: { session: { save(f: boolean): Promise<void> } } }).__tf.session.save(true),
  );
  const log = await ytLog(page);
  const saves = log.filter((e) => e.name === 'saveData');
  expect(saves.length).toBeGreaterThan(0);
  for (const s of saves) expect(s.afterLoad).toBe(true);
});

test('no Page Visibility listeners are registered', async ({ page }) => {
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  const vis = await page.evaluate(() => (window as unknown as { __visListeners: string[] }).__visListeners);
  expect(vis).toEqual([]);
});
