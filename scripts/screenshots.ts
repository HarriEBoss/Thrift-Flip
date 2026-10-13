/**
 * Store screenshot + thumbnail generator (from scripted game states).
 *
 *   npm run build:e2e && npm run screenshots
 *
 * Output: dist-store/
 *   ios-iphone-6.9/*.png   1320 x 2868  (App Store Connect: 6.9" iPhone class; verify current sizes)
 *   ios-ipad-13/*.png      2064 x 2752  (App Store Connect: 13" iPad class)
 *   android-phone/*.png    1080 x 1920  (Google Play phone screenshots, 9:16)
 *   android-tablet/*.png   1600 x 2560  (Google Play 10" tablet screenshots)
 *   google-play/feature-graphic.png 1024 x 500, google-play/icon-512.png 512 x 512
 *   youtube/*.png          16:9 1920x1080, 1:1 1080x1080, 9:16 1080x1920 key art (no text/logos)
 *
 * Re-check required sizes in App Store Connect help and the Playables Developer Portal before upload.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = 'dist-store';
const SDK = 'https://www.youtube.com/game_api/v1';
const mock = readFileSync('tests/e2e/mock-ytgame.js', 'utf8');

interface Target {
  dir: string;
  width: number;
  height: number;
  dpr: number;
}

const DEVICES: Target[] = [
  { dir: 'ios-iphone-6.9', width: 440, height: 956, dpr: 3 },
  { dir: 'ios-ipad-13', width: 1032, height: 1376, dpr: 2 },
  { dir: 'android-phone', width: 360, height: 640, dpr: 3 },
  { dir: 'android-tablet', width: 800, height: 1280, dpr: 2 },
];
const THUMBS: Target[] = [
  { dir: 'youtube', width: 1920, height: 1080, dpr: 1 },
  { dir: 'youtube', width: 1080, height: 1080, dpr: 1 },
  { dir: 'youtube', width: 1080, height: 1920, dpr: 1 },
];

type Tf = {
  scene(): string;
  goto(k: string, d?: object): void;
  setup(p: object): void;
  addItems(a: number[], restored?: boolean): void;
  ws(): { stage: { x: number; y: number; size: number } } | null;
  state(): {
    catalog: string;
    regions: Record<string, number>;
    space: { techs: string[]; colonies: string[] };
  };
  where(id: string): { x: number; y: number } | null;
};

/** Click a marked UI element (waits for it to exist). */
async function press(page: Page, id: string): Promise<void> {
  await page.waitForFunction((i) => !!(window as unknown as { __tf: Tf }).__tf.where(i), id);
  await page.waitForTimeout(400);
  const p = await page.evaluate((i) => (window as unknown as { __tf: Tf }).__tf.where(i), id);
  await page.mouse.click(p!.x, p!.y);
  await page.waitForTimeout(900);
}

/** A late-game company: every business, most of the world, a colony on Mars. */
async function empire(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({
      tutorialDone: true,
      tier: 4,
      coins: 48_500_000,
      day: 240,
      phase: 'market',
      named: true,
      company: 'Sunny Fix Co',
      businesses: ['phone', 'computer', 'mechanic', 'robotics', 'rocket'],
      business: 'rocket',
    });
    const st = tf.state();
    for (const r of ['namerica', 'samerica', 'europe', 'africa', 'asia', 'oceania', 'antarctica'])
      st.regions[r] = 2;
    st.space.techs.push('rockets', 'lifesupport', 'habitats');
    if (!st.space.colonies.includes('mars')) st.space.colonies.push('mars');
  });
}

async function open(t: Target): Promise<Page> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: t.dpr,
  });
  const page = await ctx.newPage();
  await page.route(SDK, (r) => r.fulfill({ body: mock, contentType: 'application/javascript' }));
  await page.goto(BASE);
  await page.waitForFunction(() => (window as unknown as { __tf?: Tf }).__tf?.scene() === 'MainMenu');
  await page.evaluate(() => {
    const tf = (window as unknown as { __tf: Tf }).__tf;
    tf.setup({ tutorialDone: true, tier: 2, coins: 1850, day: 12, rep: 40, level: 9 });
    tf.addItems([3, 18, 34, 48, 61, 66]);
    tf.state().catalog = '2'.repeat(12) + '1'.repeat(46) + '0'.repeat(62);
  });
  return page;
}

async function goto(page: Page, key: string, data?: object): Promise<void> {
  await page.evaluate(
    ([k, d]) => (window as unknown as { __tf: Tf }).__tf.goto(k as string, d as object | undefined),
    [key, data] as const,
  );
  await page.waitForFunction((k) => (window as unknown as { __tf: Tf }).__tf.scene() === k, key);
  await page.waitForTimeout(1500);
}

async function main(): Promise<void> {
  const server = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--outDir',
      'dist-e2e',
      '--port',
      String(PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      stdio: 'ignore',
    },
  );
  await new Promise((r) => setTimeout(r, 2500));
  try {
    for (const d of DEVICES) {
      mkdirSync(`${OUT}/${d.dir}`, { recursive: true });
      const page = await open(d);
      await goto(page, 'MainMenu');
      await page.screenshot({ path: `${OUT}/${d.dir}/01-menu.png` });
      await goto(page, 'Promo');
      await page.screenshot({ path: `${OUT}/${d.dir}/02-before-after.png` });
      await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.setup({ phase: 'market' }));
      await goto(page, 'Market');
      await page.screenshot({ path: `${OUT}/${d.dir}/03-market.png` });
      // Workshop, mid-scrub
      await page.evaluate(() => {
        const tf = (window as unknown as { __tf: Tf }).__tf;
        tf.addItems([84], false);
        tf.setup({ phase: 'workshop' });
      });
      await goto(page, 'Workshop');
      const ws = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.ws());
      if (ws) {
        const { x, y, size } = ws.stage;
        await page.mouse.move(x + size * 0.1, y + size * 0.3);
        await page.mouse.down();
        for (let i = 0; i < 6; i++) {
          await page.mouse.move(x + size * 0.85, y + size * (0.3 + i * 0.04), { steps: 4 });
          await page.mouse.move(x + size * 0.15, y + size * (0.32 + i * 0.04), { steps: 4 });
        }
        await page.mouse.up();
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: `${OUT}/${d.dir}/04-workshop.png` });
      await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.setup({ phase: 'shop' }));
      await goto(page, 'Shop');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${d.dir}/05-shop.png` });
      await goto(page, 'Catalog');
      await page.screenshot({ path: `${OUT}/${d.dir}/06-sticker-book.png` });
      // The business empire: the ladder, the world map and the solar system on the tablet.
      await empire(page);
      await goto(page, 'Market');
      await press(page, 'upgrades');
      await press(page, 'hub_empire');
      await page.screenshot({ path: `${OUT}/${d.dir}/07-business-empire.png` });
      await goto(page, 'Market');
      await press(page, 'upgrades');
      await press(page, 'hub_world');
      await page.screenshot({ path: `${OUT}/${d.dir}/08-world.png` });
      await goto(page, 'Market');
      await press(page, 'tablet');
      await press(page, 'app_space');
      await page.screenshot({ path: `${OUT}/${d.dir}/09-solar-system.png` });
      await page.context().browser()?.close();
      console.log(`wrote ${OUT}/${d.dir}`);
    }
    for (const tgt of THUMBS) {
      mkdirSync(`${OUT}/${tgt.dir}`, { recursive: true });
      const page = await open(tgt);
      await goto(page, 'Promo');
      await page.screenshot({ path: `${OUT}/${tgt.dir}/thumb-${tgt.width}x${tgt.height}.png` });
      await page.context().browser()?.close();
    }
    console.log(`wrote ${OUT}/youtube`);
    // Google Play: the feature graphic (key art, no text) and the 512 px store icon.
    mkdirSync(`${OUT}/google-play`, { recursive: true });
    const fg = await open({ dir: 'google-play', width: 1024, height: 500, dpr: 1 });
    await goto(fg, 'Promo');
    await fg.screenshot({ path: `${OUT}/google-play/feature-graphic.png` });
    await fg.context().browser()?.close();
    const icon = await chromium.launch();
    const ip = await icon.newPage({ viewport: { width: 512, height: 512 } });
    const svg = readFileSync('resources/icon.svg', 'utf8');
    await ip.setContent(
      `<html><body style="margin:0">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`,
    );
    await ip.screenshot({ path: `${OUT}/google-play/icon-512.png` });
    await icon.close();
    console.log(`wrote ${OUT}/google-play`);
  } finally {
    server.kill();
  }
}

void main();
