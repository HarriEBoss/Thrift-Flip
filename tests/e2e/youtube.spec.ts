import { expect, test, type Page } from '@playwright/test';
import { setupPage, waitForScene, ytLog } from './helpers';
import { press } from './play';

type St = {
  coins: number;
  bestScore: number;
  stats: { profit: number; playSec: number };
  day: { n: number; gifts: number; ph: string };
  flags: { lastInterstitial: number; tutorialDone: boolean };
};
type T = {
  state(): St;
  setup(p: object): void;
  goto(k: string): void;
  addItems(a: number[]): void;
  session: { save(force: boolean): Promise<void>; submitScoreIfBest(): Promise<void> };
};
const tf = <R>(page: Page, fn: (t: T) => R) => page.evaluate(`(${fn.toString()})(window.__tf)`) as Promise<R>;

async function boot(page: Page) {
  await setupPage(page);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  await tf(page, (t) => t.setup({ tutorialDone: true, day: 2 }));
  await tf(page, (t) => t.goto('MainMenu'));
  await waitForScene(page, 'MainMenu');
}

test('rewarded ad grants only when requestRewardedAd resolves true', async ({ page }) => {
  await boot(page);
  const c0 = await tf(page, (t) => t.state().coins);
  await press(page, 'mouse', 'gift');
  await page.waitForTimeout(800);
  const c1 = await tf(page, (t) => t.state().coins);
  expect(c1).toBeGreaterThan(c0);
  const log = await ytLog(page);
  expect(log.filter((e) => e.name === 'rewarded').map((e) => (e as unknown as { id: string }).id)).toEqual([
    'free-gift',
  ]);
  // No ad available -> no reward.
  await page.evaluate(
    () => ((window as unknown as { __ytMock: { rewardResult: boolean } }).__ytMock.rewardResult = false),
  );
  await press(page, 'mouse', 'gift');
  await page.waitForTimeout(800);
  expect(await tf(page, (t) => t.state().coins)).toBe(c1);
  // Interstitials never grant rewards and are not shown from the menu.
  expect((await ytLog(page)).some((e) => e.name === 'interstitial')).toBe(false);
});

test('interstitial only on summary -> next day, never before day 3, max 1 per 3 minutes', async ({
  page,
}) => {
  await boot(page);
  const toSummary = async (day: number) => {
    await page.evaluate(
      (d) => (window as unknown as { __tf: T }).__tf.setup({ day: d, phase: 'summary' }),
      day,
    );
    await tf(page, (t) => t.goto('Summary'));
    await waitForScene(page, 'Summary');
    await press(page, 'mouse', 'next');
    await waitForScene(page, 'Market');
  };
  await tf(page, (t) => ((t.state().stats.playSec = 10_000), undefined));
  await toSummary(2);
  expect((await ytLog(page)).filter((e) => e.name === 'interstitial')).toHaveLength(0);
  await toSummary(3);
  expect((await ytLog(page)).filter((e) => e.name === 'interstitial')).toHaveLength(1);
  // Immediately again: cooldown blocks it.
  await toSummary(4);
  expect((await ytLog(page)).filter((e) => e.name === 'interstitial')).toHaveLength(1);
  await tf(page, (t) => ((t.state().stats.playSec += 200), undefined));
  await toSummary(5);
  expect((await ytLog(page)).filter((e) => e.name === 'interstitial')).toHaveLength(2);
});

test('sendScore uses lifetime profit and matches the best score stored in the save', async ({ page }) => {
  await boot(page);
  await tf(page, (t) => ((t.state().stats.profit = 1234.6), undefined));
  await tf(page, async (t) => {
    await t.session.submitScoreIfBest();
    await t.session.save(true);
  });
  await tf(page, (t) => ((t.state().stats.profit = 1000), undefined));
  await tf(page, async (t) => t.session.submitScoreIfBest());
  const sent = (await ytLog(page))
    .filter((e) => e.name === 'sendScore')
    .map((e) => (e as unknown as { value: number }).value);
  expect(sent).toEqual([1234]);
  const save = await page.evaluate(() => (window as unknown as { __ytMock: { save: string } }).__ytMock.save);
  const parsed = JSON.parse(save) as { bs: number; v: number };
  expect(parsed.bs).toBe(1234);
  expect(Math.max(...sent)).toBe(parsed.bs);
  expect(save.length * 2).toBeLessThan(500 * 1024);
});

test('a save written by the game loads back after a reload', async ({ page, context }) => {
  await boot(page);
  await tf(page, (t) => t.setup({ coins: 4321, day: 7 }));
  await tf(page, (t) => t.session.save(true));
  const save = await page.evaluate(() => (window as unknown as { __ytMock: { save: string } }).__ytMock.save);
  const page2 = await context.newPage();
  await setupPage(page2, { initialSave: save });
  await page2.goto('/');
  await waitForScene(page2, 'MainMenu');
  const st = await page2.evaluate(() =>
    (window as unknown as { __tf: { state(): { coins: number; day: { n: number } } } }).__tf.state(),
  );
  expect(st.coins).toBe(4321);
  expect(st.day.n).toBe(7);
});

test('a corrupt save shows a friendly message and is not overwritten until acknowledged', async ({
  page,
}) => {
  await setupPage(page, { initialSave: '{"v":1, broken' });
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => (window as unknown as { __tf: { hasModal(): boolean } }).__tf.hasModal()),
  ).toBe(true);
  const log = await ytLog(page);
  expect(log.some((e) => e.name === 'logError')).toBe(true);
  expect(log.some((e) => e.name === 'saveData')).toBe(false);
  // Esc must not dismiss this one; the explicit button starts fresh.
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => (window as unknown as { __tf: { hasModal(): boolean } }).__tf.hasModal()),
  ).toBe(true);
});
