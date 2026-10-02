import type Phaser from 'phaser';
import { session } from './session';

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
    goto: (key: string, data?: object) => {
      for (const s of game.scene.getScenes(true)) s.scene.stop();
      game.scene.start(key, data);
    },
  };
}
