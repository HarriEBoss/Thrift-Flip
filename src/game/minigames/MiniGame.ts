import Phaser from 'phaser';
import type { DamageSet } from '../art/damage';
import type { ToolParams, StepKind } from '../../core/types';
import type { ItemInstance } from '../../core/state';
import { session } from '../session';
import { drawStepIcon } from '../ui/icons';

/** Logical size of the square restoration stage (mini-games use unit coords 0..1 inside it). */
export const STAGE = 560;

export interface MiniCtx {
  scene: Phaser.Scene;
  stage: Phaser.GameObjects.Container;
  set: DamageSet;
  /** Texture pixel size of the layers. */
  tex: number;
  tools: ToolParams;
  inst: ItemInstance;
  kind: StepKind;
  /** Image objects for each overlay layer (already added to the stage). */
  layerImages: Partial<Record<StepKind, Phaser.GameObjects.Image>>;
  /** Unique texture key prefix for this restoration. */
  key: string;
  trendColor: string;
  cbPalette: boolean;
  /** Container for step-specific controls (paint palette), outside the stage. */
  panel: Phaser.GameObjects.Container;
  /** Called by a mini-game when its panel content changed size/visibility. */
  relayout(): void;
}

/**
 * Base class for a restoration mini-game. Receives pointer input in stage unit coords.
 * Subclasses compute their score from pure core logic (src/core/minigame.ts).
 */
export abstract class MiniGame {
  protected done = false;
  protected cursor: Phaser.GameObjects.Graphics | null = null;
  protected objects: Phaser.GameObjects.GameObject[] = [];

  constructor(protected ctx: MiniCtx) {}

  abstract start(): void;
  /** 0..1 completion shown in the progress bar. */
  abstract progress(): number;
  /** Current score 0..1 (what finishing now would give). */
  abstract score(): number;
  /** Whether the step completes automatically now. */
  abstract autoComplete(): boolean;
  /** Minimum progress before the "Done" button is allowed. */
  minProgressForDone(): number {
    return 0.6;
  }

  pointerDown(_u: number, _v: number): void {}
  pointerMove(_u: number, _v: number, _down: boolean, _dt: number): void {}
  pointerUp(_u: number, _v: number): void {}
  update(_dt: number): void {}

  /** Instruction text key for this step. */
  abstract instruction(): string;

  /** Called once when the step ends (before destroy); clean up visuals to the finished look. */
  finishVisuals(): void {}

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.cursor?.destroy();
  }

  protected add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ctx.stage.add(o);
    this.objects.push(o);
    return o;
  }

  /** A tool cursor that follows the pointer, offset so the finger never hides it. */
  protected makeCursor(): void {
    const g = this.ctx.scene.add.graphics();
    drawStepIcon(g, this.ctx.kind, 84);
    g.setVisible(false);
    this.ctx.stage.add(g);
    this.cursor = g;
  }

  protected moveCursor(u: number, v: number, show = true): void {
    if (!this.cursor) return;
    this.cursor.setVisible(show);
    this.cursor.setPosition(u * STAGE - 30, v * STAGE - 40);
  }

  /** Particle burst at stage unit coords (fewer with Reduced Motion). */
  protected burst(u: number, v: number, tex: string, n: number, tints: number[], speed = 120): void {
    const count = session.settings().reducedMotion ? Math.max(1, Math.floor(n / 4)) : n;
    const p = this.ctx.scene.add.particles(u * STAGE, v * STAGE, tex, {
      speed: { min: speed * 0.4, max: speed },
      angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 650 },
      gravityY: tex === 'p_flake' || tex === 'p_dot' ? 300 : -60,
      tint: tints,
      emitting: false,
    });
    this.ctx.stage.add(p);
    p.explode(count);
    this.ctx.scene.time.delayedCall(800, () => p.destroy());
  }

  protected sfx(kind: Parameters<typeof session.audio.play>[0], intensity = 1): void {
    session.audio.play(kind, intensity);
  }
}

export function toStage(u: number): number {
  return u * STAGE;
}
