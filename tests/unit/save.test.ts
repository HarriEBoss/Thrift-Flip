import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../../src/core/data';
import { SaveError, deserialize, isWellFormed, saveBytes, serialize } from '../../src/core/save/schema';
import { CURRENT_VERSION, MIGRATIONS, migrate } from '../../src/core/save/migrations';
import { DEBOUNCE_MS, SaveManager, type Clock, type SaveBackend } from '../../src/core/save/saveManager';
import { makeInstance, recipeFor } from '../../src/core/items';
import { newGame, type GameState } from '../../src/core/state';
import { game } from './helpers';

const FIXTURES = new URL('../fixtures/saves/', import.meta.url);

/** A maxed-out late-game state: every shelf full, full catalog, all skills/upgrades/perks. */
export function lateGame(): GameState {
  const g = game(4242);
  g.tier = 4;
  g.level = 60;
  g.coins = 9_999_999;
  g.rep = 99_999;
  g.catalog = '2'.repeat(ITEMS.length);
  g.skills = [
    'appraisal1',
    'appraisal2',
    'appraisal3',
    'haggling1',
    'haggling2',
    'charm1',
    'charm2',
    'charm3',
    'craft1',
    'craft2',
    'logistics1',
    'logistics2',
  ];
  g.upgrades = [
    'big_sponge',
    'steady_hands',
    'buffer',
    'glue_gun',
    'wire_brush_pro',
    'wire_tester',
    'power_sander',
    'spray_gun',
    'magnifier',
  ];
  g.perks = ['no_ads', 'golden_sponge', 'golden_toolkit', 'shop_expansion', 'appraiser_pass'];
  g.owned = ['mega_bundle', 'starter_pack'];
  for (let i = 0; i < 40; i++) {
    const inst = makeInstance(g, i % ITEMS.length, (i % 4) as 0 | 1 | 2 | 3, 1000 + i, i % 3, 123, true);
    inst.sc = recipeFor(inst).map(() => 0.987);
    inst.q = 0.987;
    inst.col = 'purple';
    g.inv.push(inst);
  }
  g.requests = [
    { t: 'any_kitchen', p: 'chef', day: 300 },
    { t: 'red_radio', p: 'dj', day: 300 },
    { t: 'shiny', p: 'collector', day: 301 },
  ];
  g.day.n = 999;
  g.day.bought = [0, 1, 2, 3, 4, 5];
  g.day.haggled = { 0: 10, 1: 20 };
  g.day.stats.bestName = ITEMS[5].name;
  g.flags.hints = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  g.flags.setsAnnounced = ['kitchen', 'lamps'];
  g.stats.profit = 12_345_678;
  g.bestScore = 12_345_678;
  g.daily = { date: '2026-10-02', best: 3, streak: 200, claimed: true };
  return g;
}

describe('save schema', () => {
  it('round-trips a fresh game', () => {
    const g = newGame(7);
    const back = deserialize(serialize(g));
    expect(back).toEqual(g);
  });
  it('round-trips a late-game state', () => {
    const g = lateGame();
    expect(deserialize(serialize(g))).toEqual(JSON.parse(JSON.stringify(g)));
  });
  it('maxed-out late-game save is < 500 KiB and well-formed', () => {
    const s = serialize(lateGame());
    expect(saveBytes(s)).toBeLessThan(500 * 1024);
    expect(isWellFormed(s)).toBe(true);
  });
  it('never stores language', () => {
    expect(serialize(lateGame())).not.toMatch(/lang/i);
  });
  it('rejects corrupt saves with SaveError', () => {
    expect(() => deserialize('{not json')).toThrow(SaveError);
    expect(() => deserialize('[]')).toThrow(SaveError);
    expect(() => deserialize('{"x":1}')).toThrow(SaveError);
    expect(() => deserialize('{"v":1}')).toThrow(SaveError);
    expect(() => deserialize(`{"v":${CURRENT_VERSION + 1},"sd":1}`)).toThrow(SaveError);
  });
  it('tolerates missing / wrong-typed fields with defaults', () => {
    const g = deserialize(
      JSON.stringify({
        v: 1,
        sd: 5,
        c: 'x',
        iv: [[1, 9999], 'bad', [1, 0, 0, 1, 2, 0, 1, -1, [500, -1], 5, 1]],
        ct: 'zzz',
        se: { music: 9 },
        rq: [[1], ['shiny', 'dj', 3]],
        dy: [3, 9, 1, 2, 'x', [1], 0, 0, 0, 0, 'x', 0, 0, 0, 0],
      }),
    );
    expect(g.coins).toBe(newGame(5).coins);
    expect(g.inv).toHaveLength(1);
    expect(g.inv[0].sc).toEqual([0.5, null]);
    expect(g.catalog).toBe('0'.repeat(ITEMS.length));
    expect(g.settings.music).toBe(1);
    expect(g.requests).toHaveLength(1);
    expect(g.day.ph).toBe('market');
  });
  it('detects malformed UTF-16', () => {
    expect(isWellFormed('ok ✓ 😀')).toBe(true);
    expect(isWellFormed('bad \ud800 x')).toBe(false);
    expect(isWellFormed('bad \udc00')).toBe(false);
    const fake = Object.assign(Object.create(String.prototype), {}) as string;
    void fake;
  });
  it('fallback well-formedness check works without String.prototype.isWellFormed', () => {
    const proto = String.prototype as unknown as { isWellFormed?: unknown };
    const orig = proto.isWellFormed;
    try {
      delete proto.isWellFormed;
      expect(isWellFormed('a😀b')).toBe(true);
      expect(isWellFormed('\ud800')).toBe(false);
      expect(isWellFormed('\udfff')).toBe(false);
    } finally {
      proto.isWellFormed = orig;
    }
  });
});

describe('migrations', () => {
  it('every shipped schema version has a fixture that loads', () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
    const versions = new Set(files.map((f) => Number(/^v(\d+)/.exec(f)?.[1])));
    for (let v = 1; v <= CURRENT_VERSION; v++) expect(versions.has(v)).toBe(true);
    for (const f of files) {
      const raw = readFileSync(new URL(f, FIXTURES), 'utf8');
      const g = deserialize(raw);
      expect(g.seed).toBeGreaterThan(0);
      expect(g.catalog).toHaveLength(ITEMS.length);
      // Re-saving produces the current version.
      expect(JSON.parse(serialize(g)).v).toBe(CURRENT_VERSION);
    }
  });
  it('migrate is a no-op at the current version and validates chain', () => {
    const obj = { v: CURRENT_VERSION, a: 1 };
    expect(migrate(obj)).toBe(obj);
    expect(MIGRATIONS.length).toBe(CURRENT_VERSION - 1);
    expect(() => migrate({ v: 0 })).toThrow();
  });
});

function fakeClock(): Clock & { advance(ms: number): void } {
  let t = 0;
  let timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let id = 0;
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      timers.push({ at: t + ms, fn, id: ++id });
      return id;
    },
    clearTimeout: (h) => {
      timers = timers.filter((x) => x.id !== h);
    },
    advance(ms: number) {
      t += ms;
      const due = timers.filter((x) => x.at <= t);
      timers = timers.filter((x) => x.at > t);
      due.forEach((x) => x.fn());
    },
  };
}

function backend(
  initial: string | null = null,
): SaveBackend & { writes: string[]; errors: unknown[]; warns: string[] } {
  const b = {
    writes: [] as string[],
    errors: [] as unknown[],
    warns: [] as string[],
    loadSave: vi.fn(async () => initial),
    writeSave: vi.fn(async (d: string) => {
      b.writes.push(d);
    }),
    logError: (e: unknown) => b.errors.push(e),
    logWarning: (m: string) => b.warns.push(m),
  };
  return b;
}

describe('SaveManager', () => {
  it('loads fresh / loaded / corrupt (keeping a backup and logging)', async () => {
    expect((await new SaveManager(backend(null)).load()).kind).toBe('fresh');
    const ok = await new SaveManager(backend(serialize(newGame(3)))).load();
    expect(ok.kind).toBe('loaded');
    const b = backend('garbage');
    const m = new SaveManager(b);
    const bad = await m.load();
    expect(bad.kind).toBe('corrupt');
    expect(m.backup).toBe('garbage');
    expect(b.errors.length).toBe(1);
    const thrower = backend();
    thrower.loadSave = vi.fn(async () => {
      throw new Error('boom');
    });
    const tm = new SaveManager(thrower);
    expect((await tm.load()).kind).toBe('fresh');
    expect(tm.isLoaded()).toBe(true);
  });
  it('never writes before load completes', async () => {
    const b = backend();
    const m = new SaveManager(b, fakeClock());
    m.bind(() => newGame(1));
    await m.request(true);
    expect(b.writes).toHaveLength(0);
    await m.load();
    await m.request(true);
    expect(b.writes).toHaveLength(1);
  });
  it('debounces to one write per 2 s, force flushes immediately', async () => {
    const b = backend();
    const clock = fakeClock();
    const m = new SaveManager(b, clock);
    await m.load();
    m.bind(() => newGame(1));
    await m.request();
    expect(b.writes).toHaveLength(1);
    await m.request();
    await m.request();
    expect(b.writes).toHaveLength(1);
    clock.advance(DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(b.writes).toHaveLength(2);
    await m.request();
    await m.request(true);
    expect(b.writes).toHaveLength(3);
    clock.advance(DEBOUNCE_MS * 2);
    await Promise.resolve();
    expect(b.writes).toHaveLength(3);
  });
  it('logs write failures and oversize saves instead of throwing', async () => {
    const b = backend();
    let fail = true;
    b.writeSave = vi.fn(async (d: string) => {
      if (fail) {
        fail = false;
        throw new Error('disk');
      }
      b.writes.push(d);
    });
    const m = new SaveManager(b, fakeClock());
    await m.load();
    const g = newGame(1);
    m.bind(() => g);
    await m.request(true);
    expect(b.errors.length).toBe(1);
    g.flags.hints = ['x'.repeat(300 * 1024)];
    await m.request(true);
    expect(b.warns.length).toBe(1);
    g.flags.hints = ['x'.repeat(2 * 1024 * 1024)];
    await m.request(true);
    expect(b.errors.length).toBe(2);
    // JSON.stringify escapes lone surrogates, so even odd strings produce a well-formed save.
    g.flags.hints = ['\ud800'];
    await m.request(true);
    expect(b.errors.length).toBe(2);
    expect(isWellFormed(b.writes[b.writes.length - 1])).toBe(true);
  });
});
