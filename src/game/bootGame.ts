import Phaser from 'phaser';
import type { Platform } from '../platform/Platform';
import { session } from './session';
import { cappedDpr } from './ui/layout';
import { SCENES } from './scenes';
import { installDebugHooks } from './debug';
import { C } from './theme';

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
      Promise.all([document.fonts.load("600 32px 'Fredoka'"), document.fonts.load("700 32px 'Fredoka'")]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
  progress(35);

  const parent = document.getElementById('game')!;
  const size = measure(parent);
  const dpr = cappedDpr(window.devicePixelRatio);

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

function measure(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const w = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
  const h = el.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
  return { w: Math.max(1, w || window.innerWidth), h: Math.max(1, h || window.innerHeight) };
}
