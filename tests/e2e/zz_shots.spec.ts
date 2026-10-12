import { test } from '@playwright/test';
import { setupPage, waitForScene } from './helpers';
import { solveStep, ws } from './play';

const OUT = '/tmp/claude-0/-home-user-Thrift-Flip/34eb7b7f-8d32-59bf-9a0b-f744e39fb303/scratchpad/shots';
const ITEMS = (process.env.SHOT_ITEMS ?? '120,135,165,180').split(',').map(Number);
const KIND = process.env.SHOT_KIND ?? 'design';

for (const a of ITEMS)
  test(`shots ${KIND} ${a}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 540, height: 960 });
    await setupPage(page);
    await page.goto('/');
    await waitForScene(page, 'MainMenu');
    await page.evaluate(
      ([a, kind]) => {
        type Tf = { setup(p: object): void; goto(k: string): void; state(): { inv: object[] }; addItems(i: number[], r: boolean): void };
        const tf = (window as unknown as { __tf: Tf }).__tf;
        tf.setup({ tutorialDone: true, tier: 4, coins: 2000, day: 6, phase: 'workshop', named: true });
        tf.addItems([a as number], false);
        const st = tf.state() as unknown as { inv: Array<{ job?: object; d: number }> };
        const inst = st.inv[st.inv.length - 1];
        if (kind !== 'none') inst.job = { fee: 100, p: 'x', k: kind, c: 'Acme' };
        inst.d = 2;
        tf.goto('Workshop');
      },
      [a, KIND] as const,
    );
    await waitForScene(page, 'Workshop');
    let n = 0;
    for (let step = 0; step < 4; step++) {
      const info = await ws(page);
      const kind = (info as unknown as { kind?: string })?.kind;
      if (!info || !kind) break;
      if (kind === 'design' || kind === 'scrub' || kind === 'polish' || kind === 'rust' || kind === 'sticker' || kind === 'sand' || kind === 'paint' || kind === 'glue') {
        await solveStep(page, 'mouse');
        await page.waitForTimeout(1200);
        continue;
      }
      let done = false;
      const shooter = (async () => {
        while (!done && n < 40) {
          await page.screenshot({ path: `${OUT}/${KIND}_${a}_${String(n++).padStart(2, '0')}.png` });
          await page.waitForTimeout(1300);
        }
      })();
      await solveStep(page, 'mouse');
      done = true;
      await shooter;
      break;
    }
  });
