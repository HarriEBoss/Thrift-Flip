import Phaser from 'phaser';
import type { Platform } from '../platform/Platform';
import { session } from './session';
import { cappedDpr } from './ui/layout';
import { SCENES } from './scenes';
import { installDebugHooks } from './debug';
import { C } from './theme';
import { installPixelChrome } from './ui/pixelChrome';

/**
 * Creates the Phaser game. Rendering happens at devicePixelRatio (capped at 3): the canvas
 * backing store is CSS size x DPR and Phaser's zoom is 1/DPR, so text and vectors stay crisp.
 */
export async function bootGame(platform: Platform, progress: (p: number) => void): Promise<void> {
  await session.init(platform);
  progress(20);
  try {
    // Make sure the bundled font is ready before any text is rasterised.
    await Promise.race([
      Promise.all([document.fonts.load("400 32px 'Nunito'"), document.fonts.load("700 32px 'Nunito'")]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
  progress(35);

  const parent = document.getElementById('game')!;
  const size = measure(parent);
  const dpr = cappedDpr(window.devicePixelRatio);

  installPixelChrome();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.round(size.w * dpr),
    height: Math.round(size.h * dpr),
    backgroundColor: C.cream,
    banner: false,
    disableContextMenu: true,
    autoFocus: false,
    audio: { noAudio: true },
    input: { activePointers: 2, keyboard: true, mouse: true, touch: true },
    render: { antialias: true, roundPixels: false, powerPreference: 'default' },
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr, autoRound: false },
    scene: SCENES,
    callbacks: {
      postBoot: (g) => {
        g.registry.set('bootProgress', progress);
      },
    },
  });

  guardLoop(game, platform);

  let lastKey = '';
  const resize = () => {
    const s = measure(parent);
    const d = cappedDpr(window.devicePixelRatio);
    const key = `${s.w}x${s.h}@${d}`;
    if (key === lastKey) return;
    lastKey = key;
    game.scale.resize(Math.max(1, Math.round(s.w * d)), Math.max(1, Math.round(s.h * d)));
    game.scale.setZoom(1 / d);
  };
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(parent);
  game.events.once(Phaser.Core.Events.READY, resize);

  // Platform-driven pause/resume (no Page Visibility API).
  platform.onPause(() => {
    session.setPaused(true);
    game.loop.sleep();
    game.input.enabled = false;
    void session.save(true);
  });
  platform.onResume(() => {
    session.setPaused(false);
    game.input.enabled = true;
    game.loop.wake();
  });

  // Unlock audio on the first user gesture (and keep it resumed on later gestures).
  const unlock = () => {
    if (!session.paused) session.audio.unlock();
  };
  parent.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });

  // Track play time for ad pacing.
  setInterval(() => {
    if (!session.paused) session.state.stats.playSec += 1;
  }, 1000);

  installDebugHooks(game);
}

/**
 * Phaser asks for the next animation frame only after the current one returns, so a single
 * exception anywhere in a frame (a tween callback, a timer, a scene update, a draw) would stop the
 * game for good and leave a frozen picture. The frame callback is wrapped and, if frames keep
 * failing, the game repairs itself in steps instead of kicking the player out:
 * 1. after a few failing frames, hide anything that still points at a removed texture;
 * 2. if that does not help, restart the current scene (it rebuilds from the saved state);
 * 3. only if the restarted scene fails straight away, go back to the main menu.
 */
function guardLoop(game: Phaser.Game, platform: Platform): void {
  type Raf = { start(cb: (t: number) => void, ...rest: unknown[]): void; callback: (t: number) => void };
  const raf = (game.loop as unknown as { raf: Raf }).raf;
  let streak = 0;
  let lastRestart = -1e9;
  const recover = (): void => {
    const active = game.scene.getScenes(true);
    if (streak === 3) {
      for (const sc of active) hideBrokenTextures(sc.children.list);
    } else if (streak === 20) {
      const sc = active[0];
      if (!sc) return;
      const now = performance.now();
      const again = now - lastRestart < 8000;
      lastRestart = now;
      if (again && sc.scene.key !== 'MainMenu') sc.scene.start('MainMenu');
      else sc.scene.restart();
    }
  };
  const wrap =
    (cb: (t: number) => void) =>
    (time: number): void => {
      try {
        cb(time);
        streak = 0;
      } catch (err) {
        streak++;
        if (streak === 1 || streak % 300 === 0) platform.logError(err);
        try {
          recover();
        } catch (e) {
          platform.logError(e);
        }
        if (streak >= 20) streak = 3; // keep trying the later steps on a cadence
      }
    };
  const start = raf.start.bind(raf);
  raf.start = (cb, ...rest) => start(wrap(cb), ...rest);
  raf.callback = wrap(raf.callback);
}

/** Hides display objects whose texture was removed (drawing them throws every frame). */
function hideBrokenTextures(list: Phaser.GameObjects.GameObject[]): void {
  for (const o of list) {
    const img = o as Phaser.GameObjects.Image;
    if (img.texture && img.frame) {
      // A destroyed texture leaves its frames without a source.
      if (!img.frame.source || !img.frame.texture) img.setVisible(false);
    }
    const children = (o as Phaser.GameObjects.Container).list;
    if (Array.isArray(children)) hideBrokenTextures(children as Phaser.GameObjects.GameObject[]);
  }
}

function measure(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const w = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
  const h = el.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
  return { w: Math.max(1, w || window.innerWidth), h: Math.max(1, h || window.innerHeight) };
}
