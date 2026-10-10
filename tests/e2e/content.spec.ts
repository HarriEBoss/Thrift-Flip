import { expect, test } from '@playwright/test';
import { setupPage, waitForScene } from './helpers';
import { closeModals, playWorkshop, press, tap, tf, where } from './play';

type Smoke = { name: string; steps: string[]; q: number; value: number; sold: number; inv: number };

test('every catalog item can be generated, rendered, restored and sold', async ({ page }) => {
  test.setTimeout(180_000);
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  const n = await page.evaluate(() =>
    (window as unknown as { __tf: { itemCount(): number } }).__tf.itemCount(),
  );
  expect(n).toBe(195);
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
  // All 9 restoration mini-games occur in the content.
  expect([...kinds].sort()).toEqual([
    'fix',
    'glue',
    'paint',
    'polish',
    'rust',
    'sand',
    'scrub',
    'sticker',
    'wire',
  ]);
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
  // Keep bidding until a lot is won (a pricey lot can be lost to the other bidders first).
  const won = () => page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.state().day.bought.length);
  for (let i = 0; i < 80 && (await won()) < 1; i++) {
    const bid = await page.evaluate(() =>
      (window as unknown as { __tf: { where(id: string): { x: number; y: number } | null } }).__tf.where(
        'bid',
      ),
    );
    if (bid) await tap(page, 'mouse', bid);
    await page.waitForTimeout(500);
  }
  expect(await won()).toBeGreaterThanOrEqual(1);
  // Completion screen
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf & { state(): { catalog: string } } }).__tf;
    const st = tf.state() as unknown as { catalog: string; tier: number };
    st.catalog = '1'.repeat(195);
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

test('business ladder: open Phone Repair, work there, fix a customer phone and get paid', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 405, height: 720 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = { setup(p: object): void; goto(k: string): void };
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({ tutorialDone: true, tier: 2, coins: 1200, day: 6, phase: 'market', named: true });
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  // Open Phone Repair from the business ladder.
  await press(page, 'mouse', 'upgrades');
  await press(page, 'mouse', 'hub_empire');
  await press(page, 'mouse', 'biz_phone');
  await page.waitForTimeout(300);
  const own = await tf(page, (t) => (t.state() as unknown as { biz: { own: string[] } }).biz.own);
  expect(own).toEqual(['reselling', 'phone']);
  await closeModals(page, 'mouse');
  // Work at Phone Repair today: the market turns into the job board.
  await press(page, 'mouse', 'workAt');
  await press(page, 'mouse', 'work_phone');
  await waitForScene(page, 'Market');
  await page.waitForTimeout(500);
  await press(page, 'mouse', 'job0');
  await press(page, 'mouse', 'take');
  await page.waitForTimeout(1000);
  // A contract can be a fleet order of a few items.
  expect(await tf(page, (t) => t.state().inv.length)).toBeGreaterThanOrEqual(1);
  const coins = await tf(page, (t) => t.state().coins);
  await press(page, 'mouse', 'go');
  await waitForScene(page, 'Workshop');
  await playWorkshop(page, 'mouse');
  // No shop floor at a repair business: straight to the day summary, paid.
  await waitForScene(page, 'Summary');
  const after = await tf(page, (t) => ({ coins: t.state().coins, inv: t.state().inv.length }));
  expect(after.inv).toBe(0);
  expect(after.coins).toBeGreaterThan(coins);
});

test('workshop jobs: take a PC rebuild at Computer Repair, fix it and get paid', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 405, height: 720 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = { setup(p: object): void; goto(k: string): void };
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({
      tutorialDone: true,
      tier: 4,
      coins: 0,
      day: 6,
      phase: 'market',
      named: true,
      businesses: ['phone', 'computer'],
      business: 'computer',
    });
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  // Board: two small computer repairs, then the full PC rebuild.
  await press(page, 'mouse', 'job2');
  await press(page, 'mouse', 'take');
  await page.waitForTimeout(1000);
  const jobs = await tf(page, (t) => t.state().inv.length);
  expect(jobs).toBe(1);
  await press(page, 'mouse', 'go');
  await waitForScene(page, 'Workshop');
  const steps = await page.evaluate(
    () => (window as unknown as { __tf: { ws(): { steps: string[] } } }).__tf.ws().steps,
  );
  expect(steps).toContain('fix');
  await playWorkshop(page, 'mouse');
  const after = await tf(page, (t) => ({ coins: t.state().coins, inv: t.state().inv.length }));
  // The customer took the PC home and paid well for the rebuild.
  expect(after.inv).toBe(0);
  expect(after.coins).toBeGreaterThan(300);
});

test('marketing and a custom design contract: run ads, design to the spec, build it, get paid', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 405, height: 720 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = { setup(p: object): void; goto(k: string): void };
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({
      tutorialDone: true,
      tier: 4,
      coins: 2000,
      day: 6,
      phase: 'market',
      named: true,
      businesses: ['phone', 'computer'],
      business: 'computer',
    });
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  const state = () =>
    tf(page, (t) => t.state() as unknown as { coins: number; brand: number; inv: unknown[] });
  // Marketing: flyers and a radio ad grow the brand.
  await press(page, 'mouse', 'upgrades');
  await press(page, 'mouse', 'hub_marketing');
  await press(page, 'mouse', 'mkt_flyers');
  await press(page, 'mouse', 'mkt_radio');
  await page.waitForTimeout(300);
  expect((await state()).brand).toBeGreaterThan(0);
  await closeModals(page, 'mouse');
  // The board is rebuilt with the extra contracts the brand brings; the design one is last.
  await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.goto('Market'));
  await waitForScene(page, 'Market');
  await page.waitForTimeout(500);
  let last = 0;
  for (let i = 0; i < 10; i++)
    if (
      await page.evaluate(
        (k) => !!(window as unknown as { __tf: { where(id: string): unknown } }).__tf.where(k),
        `job${i}`,
      )
    )
      last = i;
  await press(page, 'mouse', `job${last}`);
  await press(page, 'mouse', 'take');
  await page.waitForTimeout(1000);
  await press(page, 'mouse', 'go');
  await waitForScene(page, 'Workshop');
  const steps = await page.evaluate(
    () => (window as unknown as { __tf: { ws(): { steps: string[] } } }).__tf.ws().steps,
  );
  expect(steps).toEqual(['design', 'fix', 'polish']);
  const before = (await state()).coins;
  await playWorkshop(page, 'mouse');
  await waitForScene(page, 'Summary');
  const after = await state();
  expect(after.inv).toHaveLength(0);
  expect(after.coins - before).toBeGreaterThan(400);
});

test('managers and branches: hire a manager, open a branch, and they earn while you work elsewhere', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 405, height: 720 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = { setup(p: object): void; goto(k: string): void };
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({
      tutorialDone: true,
      tier: 4,
      coins: 200_000,
      day: 30,
      phase: 'market',
      named: true,
      businesses: ['phone', 'computer', 'mechanic', 'robotics', 'rocket'],
      business: 'rocket',
    });
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  await press(page, 'mouse', 'upgrades');
  await press(page, 'mouse', 'hub_managers');
  await press(page, 'mouse', 'hire_phone');
  await press(page, 'mouse', 'hire_phone');
  await press(page, 'mouse', 'branch_phone');
  await page.waitForTimeout(300);
  const st = () =>
    tf(
      page,
      (t) =>
        t.state() as unknown as {
          managers: Record<string, number>;
          branches: Record<string, number>;
          day: { stats: { passive: number } };
        },
    );
  const s1 = await st();
  expect(s1.managers).toEqual({ phone: 2 });
  expect(s1.branches).toEqual({ phone: 1 });
  await closeModals(page, 'mouse');
  // End the day without taking any work: the managers still bring in the takings.
  await press(page, 'mouse', 'go');
  await waitForScene(page, 'Summary');
  expect((await st()).day.stats.passive).toBeGreaterThan(0);
});

test('world expansion: open an office in North America, deliver the flagship contract, conquer it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 405, height: 720 });
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  type Tf = { setup(p: object): void; goto(k: string): void };
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({
      tutorialDone: true,
      tier: 4,
      coins: 200_000,
      day: 40,
      phase: 'market',
      named: true,
      businesses: ['phone', 'computer', 'mechanic', 'robotics', 'rocket'],
      business: 'mechanic',
    });
    tf.goto('Market');
  });
  await waitForScene(page, 'Market');
  await press(page, 'mouse', 'upgrades');
  await press(page, 'mouse', 'hub_world');
  await press(page, 'mouse', 'region_namerica');
  await page.waitForTimeout(300);
  const regions = () =>
    tf(page, (t) => (t.state() as unknown as { regions: Record<string, number> }).regions);
  expect(await regions()).toEqual({ namerica: 1 });
  await closeModals(page, 'mouse');
  // The flagship contract is the last card on Mechanic's board.
  await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.goto('Market'));
  await waitForScene(page, 'Market');
  await page.waitForTimeout(500);
  let last = 0;
  for (let i = 0; i < 10; i++)
    if (
      await page.evaluate(
        (k) => !!(window as unknown as { __tf: { where(id: string): unknown } }).__tf.where(k),
        `job${i}`,
      )
    )
      last = i;
  await press(page, 'mouse', `job${last}`);
  await press(page, 'mouse', 'take');
  await page.waitForTimeout(1000);
  await press(page, 'mouse', 'go');
  await waitForScene(page, 'Workshop');
  await playWorkshop(page, 'mouse');
  await waitForScene(page, 'Summary');
  expect(await regions()).toEqual({ namerica: 2 });
});
