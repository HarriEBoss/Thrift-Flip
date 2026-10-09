import type { CDPSession, Page } from '@playwright/test';

export type Mode = 'mouse' | 'touch';

interface Pt {
  x: number;
  y: number;
}

type Tf = {
  where(id: string): Pt | null;
  ws(): WsInfo | null;
  scene(): string;
  hasModal(): boolean;
  state(): {
    day: { n: number; ph: string; bought: number[] };
    stats: { sold: number };
    coins: number;
    inv: unknown[];
  };
};

export interface WsInfo {
  view: 'steps' | 'reveal';
  kind: string | null;
  pendingOptional: boolean;
  progress: number;
  stage: { x: number; y: number; size: number };
  step: number;
  steps: string[];
  locked: boolean;
  path?: Array<{ x: number; y: number }>;
  sticker?: { corner: { u: number; v: number }; dir: number; w: number };
  wire?: {
    phase: string;
    screws: Array<{ u: number; v: number }>;
    center: { u: number; v: number };
    radius: number;
    left: Array<{ u: number; v: number }>;
    right: Array<{ u: number; v: number }>;
    order: number[];
    swap: {
      broken: { u: number; v: number };
      fresh: { u: number; v: number };
      slot: { u: number; v: number };
      bin: { u: number; v: number };
    } | null;
    pour: { cap: { u: number; v: number }; level: number; lo: number; hi: number } | null;
  };
}

const cdp = new WeakMap<Page, CDPSession>();

async function session(page: Page): Promise<CDPSession> {
  let s = cdp.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    cdp.set(page, s);
  }
  return s;
}

export async function tf<T>(page: Page, fn: (tf: Tf) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__tf)`) as Promise<T>;
}

export async function where(page: Page, id: string, timeout = 15000): Promise<Pt> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const p = await page.evaluate((i) => (window as unknown as { __tf: Tf }).__tf.where(i), id);
    if (p) return p;
    await page.waitForTimeout(100);
  }
  throw new Error(`UI element "${id}" not found`);
}

export async function tap(page: Page, mode: Mode, p: Pt): Promise<void> {
  if (mode === 'mouse') {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();
  } else {
    const s = await session(page);
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(40);
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(60);
}

export async function press(page: Page, mode: Mode, id: string, timeout?: number): Promise<void> {
  // Let tweens settle so the button is where it says it is.
  await page.waitForTimeout(120);
  await tap(page, mode, await where(page, id, timeout));
}

export async function drag(page: Page, mode: Mode, pts: Pt[], delay = 8): Promise<void> {
  if (!pts.length) return;
  if (mode === 'mouse') {
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts.slice(1)) {
      await page.mouse.move(p.x, p.y);
      if (delay) await page.waitForTimeout(delay);
    }
    await page.mouse.up();
  } else {
    const s = await session(page);
    await s.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: pts[0].x, y: pts[0].y }],
    });
    for (const p of pts.slice(1)) {
      await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
      if (delay) await page.waitForTimeout(delay);
    }
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

/** Press and hold at `p` until `done()` says so (or 20 s pass), then release. */
export async function holdUntil(page: Page, mode: Mode, p: Pt, done: () => Promise<boolean>): Promise<void> {
  if (mode === 'mouse') {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
  } else {
    const s = await session(page);
    await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await done())) await page.waitForTimeout(60);
  if (mode === 'mouse') await page.mouse.up();
  else {
    const s = await session(page);
    await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

export async function ws(page: Page): Promise<WsInfo | null> {
  return page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.ws()) as Promise<WsInfo | null>;
}

export async function scene(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.scene());
}

function unit(info: WsInfo, u: number, v: number): Pt {
  return { x: info.stage.x + u * info.stage.size, y: info.stage.y + v * info.stage.size };
}

function lerpPath(a: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  return out;
}

/** Plays the current workshop step to completion. */
export async function solveStep(page: Page, mode: Mode): Promise<void> {
  let info = await ws(page);
  if (!info) return;
  if (info.pendingOptional) {
    await press(page, mode, 'do');
    await page.waitForTimeout(250);
    info = await ws(page);
    if (!info) return;
  }
  const startStep = info.step;
  const kind = info.kind;
  const stillHere = async () => {
    const i = await ws(page);
    return !!i && i.step === startStep && i.view === 'steps' && !i.locked && i.kind === kind;
  };
  if (kind === 'scrub' || kind === 'rust' || kind === 'sand' || kind === 'paint') {
    if (kind === 'paint') await press(page, mode, 'swatch0');
    for (let pass = 0; pass < 8 && (await stillHere()); pass++) {
      const rows: Pt[] = [];
      for (let v = 0.06; v <= 0.95; v += 0.045) {
        const left = rows.length % 2 === 0;
        rows.push(unit(info, left ? 0.04 : 0.96, v), unit(info, left ? 0.96 : 0.04, v));
      }
      // The game interpolates brush stamps between pointer events, so row endpoints are enough.
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < rows.length; i++) pts.push(...lerpPath(rows[i], rows[i + 1], 2));
      await drag(page, mode, pts, 0);
      await page.waitForTimeout(80);
    }
  } else if (kind === 'polish') {
    for (let pass = 0; pass < 10 && (await stillHere()); pass++) {
      // Loopy rows: small circles while travelling (keeps circularity high).
      const pts: Pt[] = [];
      for (let v = 0.08 + (pass % 2) * 0.06; v <= 0.95; v += 0.12) {
        let th = 0;
        for (let u = 0.04; u <= 0.96; u += 0.03) {
          th += Math.PI / 3;
          pts.push(unit(info, u + 0.07 * Math.cos(th), v + 0.07 * Math.sin(th)));
        }
      }
      await drag(page, mode, pts, 0);
    }
  } else if (kind === 'sticker' && info.sticker) {
    const sk = info.sticker;
    const a = unit(info, sk.corner.u, sk.corner.v);
    const b = unit(info, sk.corner.u + sk.dir * sk.w * 1.4, sk.corner.v);
    await drag(page, mode, lerpPath(a, b, 40), 45);
  } else if (kind === 'glue' && info.path) {
    const pts: Pt[] = [];
    const path = info.path.map((p) => unit(info!, p.x, p.y));
    for (let i = 0; i + 1 < path.length; i++) pts.push(...lerpPath(path[i], path[i + 1], 6));
    await drag(page, mode, pts, 6);
  } else if ((kind === 'wire' || kind === 'fix') && info.wire) {
    // The repair: turn over, unscrew (hold) or twist off the cover, lift it, connect wires, wait.
    for (let guard = 0; guard < 60 && (await stillHere()); guard++) {
      const now = await ws(page);
      const w = now?.wire;
      if (!now || !w) break;
      if (w.phase === 'screws' && w.screws.length) {
        const p = unit(now, w.screws[0].u, w.screws[0].v);
        await drag(
          page,
          mode,
          Array.from({ length: 12 }, () => p),
          100,
        );
        await page.waitForTimeout(500);
      } else if (w.phase === 'twist') {
        const pts: Pt[] = [];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 24) * Math.PI * 2;
          pts.push(
            unit(now, w.center.u + Math.cos(a) * w.radius * 0.6, w.center.v + Math.sin(a) * w.radius * 0.6),
          );
        }
        await drag(page, mode, pts, 15);
        await page.waitForTimeout(300);
      } else if (w.phase === 'cover') {
        const c = unit(now, w.center.u, w.center.v);
        await drag(page, mode, [c, c], 40);
        await page.waitForTimeout(700);
      } else if ((w.phase === 'swapOut' || w.phase === 'swapIn') && w.swap) {
        const from = w.phase === 'swapOut' ? w.swap.broken : w.swap.fresh;
        const to = w.phase === 'swapOut' ? w.swap.bin : w.swap.slot;
        await drag(page, mode, lerpPath(unit(now, from.u, from.v), unit(now, to.u, to.v), 10), 12);
        await page.waitForTimeout(500);
      } else if (w.phase === 'pour' && w.pour) {
        await holdUntil(page, mode, unit(now, w.pour.cap.u, w.pour.cap.v), async () => {
          const i = await ws(page);
          return !i?.wire?.pour || i.wire.pour.level >= w.pour!.lo + 0.04;
        });
        await page.waitForTimeout(600);
      } else if (w.phase === 'wires') {
        for (let l = 0; l < w.left.length; l++) {
          const r = w.order.indexOf(l);
          await drag(
            page,
            mode,
            lerpPath(unit(now, w.left[l].u, w.left[l].v), unit(now, w.right[r].u, w.right[r].v), 12),
            10,
          );
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(400);
      } else {
        await page.waitForTimeout(300);
      }
    }
  }
  // Fall back to "Done" if auto-complete did not trigger.
  await page.waitForTimeout(150);
  if (await stillHere()) {
    const done = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.where('done'));
    if (done) await tap(page, mode, done);
  }
  // Wait for the step transition.
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && (await stillHere())) await page.waitForTimeout(100);
  await page.waitForTimeout(1000);
}

/** Restores every queued item (handles reveal + next). */
export async function playWorkshop(page: Page, mode: Mode): Promise<void> {
  for (let guard = 0; guard < 80; guard++) {
    const sc = await scene(page);
    if (sc !== 'Workshop') return;
    const info = await ws(page);
    if (!info) return;
    if (info.view === 'reveal') {
      await page.waitForTimeout(1600);
      await press(page, mode, 'next');
      await page.waitForTimeout(500);
      continue;
    }
    await solveStep(page, mode);
  }
  throw new Error('workshop did not finish');
}

export async function closeModals(page: Page, mode: Mode): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const has = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.hasModal());
    if (!has) return;
    const c = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.where('close'));
    if (c) await tap(page, mode, c);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

/** Sells to every customer (accepting counter-offers). */
export async function playShop(page: Page, mode: Mode): Promise<void> {
  for (let guard = 0; guard < 60; guard++) {
    if ((await scene(page)) !== 'Shop') return;
    await closeModals(page, mode);
    const close = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.where('closeShop'));
    if (close) {
      await tap(page, mode, close);
      await page.waitForTimeout(500);
      continue;
    }
    const sell = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.where('sell'));
    if (sell) {
      await tap(page, mode, sell);
      await page.waitForTimeout(400);
      const deal = await page.evaluate(() => (window as unknown as { __tf: Tf }).__tf.where('deal'));
      if (deal) await tap(page, mode, deal);
      await page.waitForTimeout(3200);
      continue;
    }
    await page.waitForTimeout(400);
  }
}

/** Buys up to `n` affordable items at the market and leaves. */
export async function playMarket(page: Page, mode: Mode, n: number): Promise<void> {
  await closeModals(page, mode);
  for (let i = 0, bought = 0; bought < n && i < 10; i++) {
    const card = await page.evaluate((k) => (window as unknown as { __tf: Tf }).__tf.where(k), `card${i}`);
    if (!card) break;
    await tap(page, mode, card);
    await page.waitForTimeout(300);
    const before = await tf(page, (t) => t.state().day.bought.length);
    await press(page, mode, 'buy');
    await page.waitForTimeout(300);
    const after = await tf(page, (t) => t.state().day.bought.length);
    if (after > before) bought++;
    await closeModals(page, mode);
  }
  await press(page, mode, 'go');
  await page.waitForTimeout(600);
}

export async function playSummary(page: Page, mode: Mode): Promise<void> {
  await page.waitForTimeout(500);
  for (let attempt = 0; attempt < 3 && (await scene(page)) === 'Summary'; attempt++) {
    await closeModals(page, mode);
    const p = await where(page, 'next');
    if (process.env.E2E_DEBUG) console.log('summary next at', p, 'attempt', attempt);
    await tap(page, mode, p);
    await page.waitForTimeout(1500);
    if (process.env.E2E_DEBUG && (await scene(page)) === 'Summary')
      await page.screenshot({ path: `test-results/summary-${mode}-${attempt}.png` });
  }
}

/** Plays one full day from the market. */
export async function playDay(page: Page, mode: Mode, buy = 2): Promise<void> {
  if ((await scene(page)) === 'Market') await playMarket(page, mode, buy);
  if ((await scene(page)) === 'Workshop') await playWorkshop(page, mode);
  if ((await scene(page)) === 'Shop') await playShop(page, mode);
  if ((await scene(page)) === 'Summary') await playSummary(page, mode);
}
