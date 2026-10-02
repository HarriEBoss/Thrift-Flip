/**
 * Store screenshot + thumbnail generator (from scripted game states).
 *
 *   npm run build:e2e && npm run screenshots
 *
 * Output: dist-store/
 *   ios-iphone-6.9/*.png   1320 x 2868  (App Store Connect: 6.9" iPhone class; verify current sizes)
 *   ios-ipad-13/*.png      2064 x 2752  (App Store Connect: 13" iPad class)
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
  state(): { catalog: string };
};

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
  } finally {
    server.kill();
  }
}

void main();
