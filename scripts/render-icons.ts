/** Renders resources/icon.svg to the PNG sources @capacitor/assets expects (no native image deps). */
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

async function main(): Promise<void> {
  const svg = readFileSync('resources/icon.svg', 'utf8');
  mkdirSync('assets', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`,
  );
  await page.screenshot({ path: 'assets/icon-only.png' });
  // Splash: icon art centred on the cream background (2732x2732 as @capacitor/assets expects).
  await page.setViewportSize({ width: 2732, height: 2732 });
  for (const [name, bg] of [
    ['splash', '#fdf3e1'],
    ['splash-dark', '#2e2a3a'],
  ] as const) {
    await page.setContent(
      `<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:2732px;height:2732px">` +
        `<div style="width:900px;height:900px;border-radius:200px;overflow:hidden">${svg.replace('<svg ', '<svg width="900" height="900" ')}</div></body></html>`,
    );
    await page.screenshot({ path: `assets/${name}.png` });
  }
  await browser.close();
  console.log('assets/icon-only.png, assets/splash.png, assets/splash-dark.png');
}

void main();
