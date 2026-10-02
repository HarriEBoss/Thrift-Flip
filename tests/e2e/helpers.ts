import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, Request } from '@playwright/test';

export const SDK_URL = 'https://www.youtube.com/game_api/v1';
const mockSdk = readFileSync(fileURLToPath(new URL('./mock-ytgame.js', import.meta.url)), 'utf8');

export interface Harness {
  external: string[];
}

/** Serves the mock SDK, records non-local requests, and spies on visibilitychange listeners. */
export async function setupPage(
  page: Page,
  opts: { initialSave?: string; audio?: boolean } = {},
): Promise<Harness> {
  const h: Harness = { external: [] };
  await page.addInitScript(
    ({ save, audio }) => {
      const w = window as unknown as Record<string, unknown>;
      if (save) w.__ytMockInitialSave = save;
      if (audio === false) w.__ytMockAudio = false;
      const vis: string[] = [];
      w.__visListeners = vis;
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type: string, ...rest: unknown[]) {
        if (/visibilitychange/i.test(type)) vis.push(type);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...rest);
      };
    },
    { save: opts.initialSave ?? '', audio: opts.audio ?? true },
  );
  await page.route(SDK_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockSdk }),
  );
  page.on('request', (req: Request) => {
    const u = req.url();
    if (u.startsWith('http://127.0.0.1:4173') || u.startsWith('data:') || u.startsWith('blob:')) return;
    if (u === SDK_URL) return;
    h.external.push(u);
  });
  return h;
}

export async function waitForScene(page: Page, key: string): Promise<void> {
  await page.waitForFunction(
    (k) => (window as unknown as { __tf?: { scene(): string } }).__tf?.scene() === k,
    key,
    {
      timeout: 20_000,
    },
  );
}

export async function ytLog(page: Page): Promise<Array<{ name: string; t: number; afterLoad?: boolean }>> {
  return page.evaluate(
    () => (window as unknown as { __ytMock: { log: Array<{ name: string; t: number }> } }).__ytMock.log,
  );
}
