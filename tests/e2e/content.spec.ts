import { expect, test } from '@playwright/test';
import { setupPage, waitForScene } from './helpers';
import { press, tap, where } from './play';

type Smoke = { name: string; steps: string[]; q: number; value: number; sold: number; inv: number };

test('every catalog item can be generated, rendered, restored and sold', async ({ page }) => {
  test.setTimeout(180_000);
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  const n = await page.evaluate(() =>
    (window as unknown as { __tf: { itemCount(): number } }).__tf.itemCount(),
  );
  expect(n).toBe(120);
  const kinds = new Set<string>();
  for (let a = 0; a < n; a++) {
    const r = await page.evaluate(
      (i) => (window as unknown as { __tf: { smokeItem(a: number): Smoke } }).__tf.smokeItem(i),
      a,
    );
    expect(r.inv, r.name).toBe(0);
    expect(r.sold, r.name).toBeGreaterThan(0);
    expect(r.q, r.name).toBeGreaterThan(0.9);
    expect(r.steps.length, r.name).toBeGreaterThanOrEqual(2);
    r.steps.forEach((k) => kinds.add(k));
  }
  // All 8 restoration mini-games occur in the content.
  expect([...kinds].sort()).toEqual(['glue', 'paint', 'polish', 'rust', 'sand', 'scrub', 'sticker', 'wire']);
});

test('auction night, catalog, daily fix and completion screens are reachable', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 960, height: 540 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = {
    setup(p: object): void;
    goto(k: string, d?: object): void;
    state(): { day: { bought: number[] }; catalog: string; tier: number; flags: { completeSeen: boolean } };
  };
  // Catalog
  await page.evaluate(() =>
    (window as unknown as { __tf: Tf }).__tf.setup({ tutorialDone: true, tier: 3, coins: 5000, day: 6 }),
  );
  await press(page, 'mouse', 'catalog');
  await waitForScene(page, 'Catalog');
  await press(page, 'mouse', 'tab_bikes');
  await page.keyboard.press('Escape');
  await waitForScene(page, 'MainMenu');
  // Daily Fix
  await press(page, 'mouse', 'daily');
  await waitForScene(page, 'Daily');
  await press(page, 'mouse', 'dailyStart');
  await waitForScene(page, 'Workshop');
  await press(page, 'mouse', 'skip').catch(() => undefined);
  // Auction night
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  await press(page, 'mouse', 'switch');
  await press(page, 'mouse', 'market_auction');
  await waitForScene(page, 'Auction');
  for (let i = 0; i < 12; i++) {
    const bid = await page.evaluate(() =>
      (window as unknown as { __tf: { where(id: string): { x: number; y: number } | null } }).__tf.where(
        'bid',
      ),
    );
    if (bid) await tap(page, 'mouse', bid);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(6000);
  const bought = await page.evaluate(
    () => (window as unknown as { __tf: Tf }).__tf.state().day.bought.length,
  );
  expect(bought).toBeGreaterThanOrEqual(1);
  // Completion screen
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf & { state(): { catalog: string } } }).__tf;
    const st = tf.state() as unknown as { catalog: string; tier: number };
    st.catalog = '1'.repeat(120);
    st.tier = 4;
    tf.goto('Complete');
  });
  await waitForScene(page, 'Complete');
  await expect.poll(async () => (await where(page, 'keep')) !== null).toBe(true);
  await press(page, 'mouse', 'keep');
  await waitForScene(page, 'Market');
  expect(await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.state().flags.completeSeen)).toBe(
    true,
  );
});
