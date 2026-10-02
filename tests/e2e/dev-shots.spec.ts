import { test } from '@playwright/test';
import { setupPage, waitForScene } from './helpers';

// Developer visual check. Only runs with SHOTS=<dir>: SHOTS=/tmp/shots npx playwright test dev-shots
const dir = process.env.SHOTS;
const sizes: Array<[string, number, number]> = [
  ['9x16', 360, 640],
  ['16x9', 960, 540],
  ['1x1', 600, 600],
  ['32x9', 1280, 360],
];
const scene = process.env.SHOT_SCENE ?? 'MainMenu';

for (const [name, w, h] of sizes) {
  test(`shot ${scene} ${name}`, async ({ page }) => {
    test.skip(!dir, 'SHOTS not set');
    await page.setViewportSize({ width: w, height: h });
    await setupPage(page);
    await page.goto('/');
    await waitForScene(page, 'MainMenu');
    if (scene !== 'MainMenu') {
      await page.evaluate(
        ([k, d]) =>
          (window as unknown as { __tf: { goto(k: string, d?: object): void } }).__tf.goto(
            k,
            d ? JSON.parse(d) : undefined,
          ),
        [scene, process.env.SHOT_DATA ?? ''],
      );
      await waitForScene(page, scene);
    }
    await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 700));
    await page.screenshot({ path: `${dir}/${scene}-${name}.png` });
  });
}
