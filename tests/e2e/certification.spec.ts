import { expect, test, type Page } from '@playwright/test';
import { setupPage, waitForScene, ytLog } from './helpers';
import { drag, press, scene, tap, where, ws, type Mode } from './play';

type Audio = { context: string; master: number; platformEnabled: boolean; paused: boolean };
type TfAny = {
  loopRunning(): boolean;
  frame(): number;
  paused(): boolean;
  audio(): Audio;
  hasModal(): boolean;
  state(): unknown;
  setup(p: object): void;
  addItems(a: number[], restored?: boolean): void;
  goto(k: string, d?: object): void;
  session: { state: { settings: { music: number; sfx: number } }; applySettings(): void };
};
const tf = <T>(page: Page, fn: (t: TfAny) => T) =>
  page.evaluate(`(${fn.toString()})(window.__tf)`) as Promise<T>;

async function boot(page: Page, opts: { audio?: boolean } = {}) {
  const h = await setupPage(page, opts);
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
  return h;
}

test('platform pause stops loop, audio and input; resume restarts; save on pause', async ({ page }) => {
  await boot(page);
  // A user gesture unlocks audio.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(300);
  expect((await tf(page, (t) => t.audio())).context).toBe('running');
  const before = (await ytLog(page)).filter((e) => e.name === 'saveData').length;
  await page.evaluate(() => (window as unknown as { __ytMock: { pause(): void } }).__ytMock.pause());
  await page.waitForTimeout(300);
  expect(await tf(page, (t) => t.paused())).toBe(true);
  expect(await tf(page, (t) => t.loopRunning())).toBe(false);
  const a = await tf(page, (t) => t.audio());
  expect(a.paused).toBe(true);
  expect(a.context).not.toBe('running');
  const f1 = await tf(page, (t) => t.frame());
  await page.waitForTimeout(500);
  expect(await tf(page, (t) => t.frame())).toBe(f1);
  expect((await ytLog(page)).filter((e) => e.name === 'saveData').length).toBeGreaterThan(before);
  await page.evaluate(() => (window as unknown as { __ytMock: { resume(): void } }).__ytMock.resume());
  await page.waitForTimeout(400);
  expect(await tf(page, (t) => t.loopRunning())).toBe(true);
  expect(await tf(page, (t) => t.frame())).toBeGreaterThan(f1);
  expect((await tf(page, (t) => t.audio())).context).toBe('running');
});

test('YouTube audio disabled means no output, and sliders cannot override it', async ({ page }) => {
  await boot(page, { audio: false });
  await page.mouse.click(10, 10);
  await page.waitForTimeout(300);
  let a = await tf(page, (t) => t.audio());
  expect(a.platformEnabled).toBe(false);
  expect(a.context === 'none' || a.context === 'suspended').toBe(true);
  await tf(page, (t) => {
    t.session.state.settings.music = 1;
    t.session.state.settings.sfx = 1;
    t.session.applySettings();
  });
  await page.mouse.click(20, 20);
  a = await tf(page, (t) => t.audio());
  expect(a.context === 'none' || a.context === 'suspended').toBe(true);
  // Enabling on the platform lets audio start; disabling again silences it.
  await page.evaluate(() =>
    (window as unknown as { __ytMock: { setAudio(on: boolean): void } }).__ytMock.setAudio(true),
  );
  await page.mouse.click(30, 30);
  await page.waitForTimeout(300);
  a = await tf(page, (t) => t.audio());
  expect(a.context).toBe('running');
  expect(a.master).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { __ytMock: { setAudio(on: boolean): void } }).__ytMock.setAudio(false),
  );
  await page.waitForTimeout(300);
  a = await tf(page, (t) => t.audio());
  expect(a.master).toBe(0);
  expect(a.context).not.toBe('running');
});

test('no overall mute button on YouTube; Esc closes every modal without preventDefault', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const w = window as unknown as { __escPrevented: boolean[] };
    w.__escPrevented = [];
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setTimeout(() => w.__escPrevented.push(e.defaultPrevented), 0);
    });
  });
  const esc = async () => {
    expect(await tf(page, (t) => t.hasModal())).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    expect(await tf(page, (t) => t.hasModal())).toBe(false);
  };
  await press(page, 'mouse', 'settings');
  await where(page, 'motion');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __tf: { where(i: string): unknown } }).__tf.where('mute'),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __tf: { where(i: string): unknown } }).__tf.where('store'),
    ),
  ).toBeNull();
  await esc();
  // Market detail + haggle + trends + switch
  await tf(page, (t) => t.setup({ tutorialDone: true, tier: 2, coins: 3000, day: 5 }));
  await tf(page, (t) => t.goto('Market'));
  await waitForScene(page, 'Market');
  await press(page, 'mouse', 'card0');
  await esc();
  await press(page, 'mouse', 'card1');
  await press(page, 'mouse', 'haggle');
  await esc();
  await press(page, 'mouse', 'trends');
  await esc();
  await press(page, 'mouse', 'switch');
  await esc();
  await press(page, 'mouse', 'upgrades');
  await esc();
  // Summary modals
  await tf(page, (t) => {
    t.setup({ phase: 'summary' });
    t.goto('Summary');
  });
  await waitForScene(page, 'Summary');
  for (const id of ['hub_shop', 'hub_decor', 'hub_tools', 'hub_skills']) {
    await press(page, 'mouse', 'upgrades');
    await press(page, 'mouse', id);
    await esc();
  }
  // Buying a decoration spends coins and keeps it in the save.
  const before = await tf(page, (t) => (t.state() as { coins: number }).coins);
  await press(page, 'mouse', 'upgrades');
  await press(page, 'mouse', 'hub_decor');
  await press(page, 'mouse', 'decor_plant');
  await esc();
  const after = await tf(page, (t) => t.state() as { coins: number; decor: string[] });
  expect(after.decor).toContain('plant');
  expect(after.coins).toBeLessThan(before);
  // Shop requests modal
  await tf(page, (t) => {
    t.setup({ phase: 'shop' });
    t.addItems([1, 2]);
    t.goto('Shop');
  });
  await waitForScene(page, 'Shop');
  await press(page, 'mouse', 'requests');
  await esc();
  const prevented = await page.evaluate(
    () => (window as unknown as { __escPrevented: boolean[] }).__escPrevented,
  );
  expect(prevented.length).toBeGreaterThan(5);
  expect(prevented.every((p) => p === false)).toBe(true);
});

const RATIOS: Array<[string, number, number]> = [
  ['9:32', 270, 960],
  ['9:21', 360, 840],
  ['9:16', 405, 720],
  ['3:4', 540, 720],
  ['1:1', 640, 640],
  ['4:3', 800, 600],
  ['16:9', 960, 540],
  ['21:9', 1050, 450],
  ['32:9', 1280, 360],
];

test('resizing through all aspect ratios mid-mini-game keeps state', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 720, height: 960 });
  await boot(page);
  const mode: Mode = 'mouse';
  await press(page, mode, 'play');
  await waitForScene(page, 'Market');
  await press(page, mode, 'card0');
  await press(page, mode, 'buy');
  await press(page, mode, 'go');
  await waitForScene(page, 'Workshop');
  await page.waitForTimeout(600);
  let info = (await ws(page))!;
  expect(info.kind).toBe('scrub');
  // Scrub the top half only.
  const pts = [];
  for (let v = 0.1; v < 0.5; v += 0.05)
    pts.push(
      { x: info.stage.x + 0.05 * info.stage.size, y: info.stage.y + v * info.stage.size },
      { x: info.stage.x + 0.95 * info.stage.size, y: info.stage.y + v * info.stage.size },
    );
  await drag(page, mode, pts, 0);
  await page.waitForTimeout(200);
  info = (await ws(page))!;
  const progress = info.progress;
  expect(progress).toBeGreaterThan(0.1);
  expect(progress).toBeLessThan(1);
  for (const [name, w, h] of RATIOS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const now = (await ws(page))!;
    expect(await scene(page), name).toBe('Workshop');
    expect(now.kind, name).toBe('scrub');
    expect(now.step, name).toBe(info.step);
    expect(now.progress, name).toBeCloseTo(progress, 5);
    // The stage stays inside the viewport.
    expect(now.stage.x, name).toBeGreaterThanOrEqual(-1);
    expect(now.stage.y + now.stage.size, name).toBeLessThanOrEqual(h + 1);
  }
  // Still playable after all that: finish the scrub at the final size.
  const fin = (await ws(page))!;
  const pts2 = [];
  for (let v = 0.05; v < 0.97; v += 0.04)
    pts2.push(
      { x: fin.stage.x + 0.03 * fin.stage.size, y: fin.stage.y + v * fin.stage.size },
      { x: fin.stage.x + 0.97 * fin.stage.size, y: fin.stage.y + v * fin.stage.size },
    );
  await drag(page, mode, pts2, 0);
  await page.waitForTimeout(1500);
  const after = (await ws(page))!;
  expect(after.step === 1 || after.kind !== 'scrub').toBe(true);
});

test('menus are reachable with touch only; heap stays small', async ({ browser }) => {
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await boot(page);
  await tf(page, (t) => t.setup({ tutorialDone: true }));
  await tf(page, (t) => t.goto('MainMenu'));
  await waitForScene(page, 'MainMenu');
  await press(page, 'touch', 'settings');
  await press(page, 'touch', 'motion');
  await press(page, 'touch', 'close');
  await press(page, 'touch', 'catalog');
  await waitForScene(page, 'Catalog');
  await press(page, 'touch', 'tab_lamps');
  await press(page, 'touch', 'back');
  await waitForScene(page, 'MainMenu');
  await press(page, 'touch', 'daily');
  await waitForScene(page, 'Daily');
  await press(page, 'touch', 'back');
  await waitForScene(page, 'MainMenu');
  await tap(page, 'touch', await where(page, 'play'));
  await waitForScene(page, 'Market');
  const heap = await page.evaluate(
    () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
  );
  expect(heap).toBeLessThan(200 * 1024 * 1024);
  await ctx.close();
});

test('an error inside one frame does not freeze the game; workshop frees its canvases', async ({ page }) => {
  test.setTimeout(180_000);
  // Track every canvas so we can add up the pixel memory still held (iOS limits this).
  await page.addInitScript(() => {
    const list: HTMLCanvasElement[] = [];
    (window as unknown as { __canvases: HTMLCanvasElement[] }).__canvases = list;
    const orig = document.createElement.bind(document);
    document.createElement = ((tag: string, o?: ElementCreationOptions) => {
      const el = orig(tag, o);
      if (tag.toLowerCase() === 'canvas') list.push(el as HTMLCanvasElement);
      return el;
    }) as typeof document.createElement;
  });
  await boot(page);
  const heldMB = () =>
    page.evaluate(() => {
      const list = (window as unknown as { __canvases: HTMLCanvasElement[] }).__canvases;
      return list.reduce((s, c) => s + c.width * c.height * 4, 0) / 2 ** 20;
    });
  const visitWorkshop = async (a: number) => {
    await tf(page, (t) => {
      t.setup({ tutorialDone: true, phase: 'market' });
      t.goto('Market');
    });
    await waitForScene(page, 'Market');
    await page.evaluate((idx) => {
      const t = (window as unknown as { __tf: TfAny }).__tf;
      t.setup({ phase: 'workshop' });
      t.addItems([idx], false);
      t.goto('Workshop');
    }, a);
    await waitForScene(page, 'Workshop');
    await page.waitForTimeout(400);
  };
  await visitWorkshop(3);
  const first = await heldMB();
  for (const a of [11, 24, 38, 52, 67, 81, 95, 110]) await visitWorkshop(a);
  const last = await heldMB();
  console.log(`canvas memory held: first ${first.toFixed(1)} MB, after 8 more items ${last.toFixed(1)} MB`);
  expect(last).toBeLessThan(first + 12);

  // Throw inside a frame: the loop must keep running.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await tf(page, (t) => t.frame());
  await page.evaluate(() => {
    const g = (window as unknown as { __tf: { game: { events: { once(e: string, f: () => void): void } } } })
      .__tf.game;
    g.events.once('step', () => {
      throw new Error('e2e: injected frame error');
    });
  });
  await page.waitForTimeout(1000);
  expect(await tf(page, (t) => t.frame())).toBeGreaterThan(before + 10);
  expect(await tf(page, (t) => t.loopRunning())).toBe(true);
  expect(errors).toEqual([]);
});
