import type Phaser from 'phaser';
import { session } from './session';
import { ITEMS } from '../core/data';
import { makeInstance, recipeFor, qualityOf } from '../core/items';
import { advancePhase, completeSale, finishRestoration, recordStep } from '../core/day';
import { grantProduct } from '../core/products';
import { buildDamage, compositeDamaged, gridFromLayer } from './art/damage';
import { newGame } from '../core/state';
import { generateVisits, chooseItem, respondToPrice } from '../core/customers';

/**
 * Test hooks for the Playwright suite. Only installed in E2E/dev builds (__E2E__), never in
 * release bundles.
 */
export function installDebugHooks(game: Phaser.Game): void {
  if (!__E2E__) return;
  const w = window as unknown as Record<string, unknown>;
  w.__tf = {
    game,
    session,
    scene: () => session.currentScene,
    state: () => session.state,
    paused: () => session.paused,
    loopRunning: () => game.loop.running,
    frame: () => game.loop.frame,
    audio: () => session.audio.outputState(),
    /** CSS-pixel position of a marked UI element in the active scenes. */
    where: (id: string) => {
      const canvas = game.canvas.getBoundingClientRect();
      const dpr = game.canvas.width / Math.max(1, canvas.width);
      for (const sc of game.scene.getScenes(true).reverse()) {
        const s = sc as unknown as { markPos?: (id: string) => { x: number; y: number } | null };
        const p = s.markPos?.(id);
        if (p) return { x: canvas.left + p.x / dpr, y: canvas.top + p.y / dpr };
      }
      return null;
    },
    /** Workshop state for automated play (positions converted to CSS pixels). */
    ws: () => {
      const sc = game.scene.getScene('Workshop') as unknown as { debugInfo?: () => Record<string, unknown> };
      if (!sc || !game.scene.isActive('Workshop') || !sc.debugInfo) return null;
      const info = sc.debugInfo();
      const canvas = game.canvas.getBoundingClientRect();
      const dpr = game.canvas.width / Math.max(1, canvas.width);
      const st = info.stage as { x: number; y: number; size: number };
      info.stage = { x: canvas.left + st.x / dpr, y: canvas.top + st.y / dpr, size: st.size / dpr };
      return info;
    },
    /** Test helper: give the player restored items on the shelf. */
    addItems: (indices: number[], restored = true) => {
      const st = session.state;
      for (const a of indices) {
        const inst = makeInstance(st, a, 0, 1000 + a, 1, 5, true);
        if (restored) {
          recipeFor(inst).forEach((_, i) => recordStep(inst, i, 0.9));
          st.inv.push(inst);
          finishRestoration(st, inst);
        } else st.inv.push(inst);
      }
    },
    setup: (patch: {
      tier?: number;
      coins?: number;
      day?: number;
      tutorialDone?: boolean;
      rep?: number;
      level?: number;
      phase?: string;
      workshops?: string[];
    }) => {
      const st = session.state;
      if (patch.tier !== undefined) st.tier = patch.tier;
      if (patch.coins !== undefined) st.coins = patch.coins;
      if (patch.day !== undefined) st.day.n = patch.day;
      if (patch.rep !== undefined) st.rep = patch.rep;
      if (patch.level !== undefined) st.level = patch.level;
      if (patch.tutorialDone !== undefined) st.flags.tutorialDone = patch.tutorialDone;
      if (patch.phase) st.day.ph = patch.phase as typeof st.day.ph;
      if (patch.workshops) st.workshops = [...patch.workshops];
    },
    grant: (id: string) => grantProduct(session.state, id),
    advance: (ph: string) => advancePhase(session.state, ph as never),
    /**
     * Smoke test for one catalog item: build + render every damage layer, build coverage grids,
     * restore through every recipe step and sell it, all in a scratch state.
     */
    smokeItem: (a: number) => {
      const g = newGame(4242 + a);
      g.flags.tutorialDone = true;
      g.tier = 4;
      const inst = makeInstance(g, a, (a % 4) as 0 | 1 | 2 | 3, 3000 + a * 17, a % 3, 10, false);
      g.inv.push(inst);
      const set = buildDamage(inst, 192);
      compositeDamaged(set);
      for (const layer of Object.values(set.layers)) if (layer) gridFromLayer(layer);
      const recipe = recipeFor(inst);
      recipe.forEach((_, i) => recordStep(inst, i, 0.97));
      const res = finishRestoration(g, inst);
      advancePhase(g, 'workshop');
      advancePhase(g, 'shop');
      const v = generateVisits(g)[0];
      const it = chooseItem(g, v)!;
      const r = respondToPrice(g, v, it, 1);
      const sale = completeSale(g, it, r.counter);
      return {
        name: ITEMS[a].name,
        steps: recipe.map((x) => x.k),
        q: qualityOf(inst),
        value: res.value,
        sold: sale.price,
        inv: g.inv.length,
      };
    },
    itemCount: () => ITEMS.length,
    hasModal: () =>
      game.scene.getScenes(true).some((s) => (s as unknown as { hasModal?: () => boolean }).hasModal?.()),
    goto: (key: string, data?: object) => {
      for (const s of game.scene.getScenes(true)) if (s.scene.key !== key) s.scene.stop();
      const target = game.scene.getScene(key);
      if (game.scene.isActive(key)) target.scene.restart(data);
      else game.scene.start(key, data);
    },
  };
}
