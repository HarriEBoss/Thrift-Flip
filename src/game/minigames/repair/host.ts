import Phaser from 'phaser';
import type { Pt, Rig } from '../../../core/repair';
import type { ItemInstance } from '../../../core/state';
import { STAGE } from '../MiniGame';
import { session } from '../../session';

/** What a repair task can use from the repair it is part of. */
export interface TaskHost {
  scene: Phaser.Scene;
  /** Layer under the cover where tasks put their pieces (closeup local coords, centred). */
  layer: Phaser.GameObjects.Container;
  rig: Rig;
  inst: ItemInstance;
  /** 1, or less with Reduced Motion (multiplies animation speed). */
  speed: number;
  /** Holds the engine image in engine swaps (kept at the bottom of the layer). */
  engine: Phaser.GameObjects.Container;
  sfx(kind: Parameters<typeof session.audio.play>[0], intensity?: number): void;
  burst(u: number, v: number, tex: string, n: number, tints: number[], speed?: number): void;
  /** A texture shared by all repairs (drawn once). */
  shared(key: string, make: () => HTMLCanvasElement): string;
  /** A texture owned by this repair (released when it ends). */
  own(key: string, canvas: HTMLCanvasElement): string;
  /** A wrong move: buzz and a little shake. */
  shake(): void;
}

/**
 * What the e2e bot should do next, in stage unit coords. `hold` holds until the action changes,
 * `holdLevel` until the level reaches `until`.
 */
export type BotAction =
  | { a: 'wait' }
  | { a: 'tap'; p: Pt }
  | { a: 'hold'; p: Pt }
  | { a: 'holdLevel'; p: Pt; until: number }
  | { a: 'drag'; from: Pt; to: Pt }
  | { a: 'circle'; c: Pt; r: number };

/** Unit coords to closeup-local pixels. */
export function at(p: Pt): { x: number; y: number } {
  return { x: p.u * STAGE - STAGE / 2, y: p.v * STAGE - STAGE / 2 };
}

/** Closeup-local pixels to unit coords. */
export function toUnit(x: number, y: number): Pt {
  return { u: (x + STAGE / 2) / STAGE, v: (y + STAGE / 2) / STAGE };
}

export function near(a: Pt, u: number, v: number, r: number): boolean {
  return Math.hypot(a.u - u, a.v - v) < r;
}

/** One hands-on job inside the compartment (reconnect wires, swap a part, pour oil...). */
export abstract class RepairTask {
  /** Called once the task is finished (set by the repair). */
  onDone: () => void = () => {};
  finished = false;
  protected objs: Phaser.GameObjects.GameObject[] = [];

  constructor(protected h: TaskHost) {}

  /** Pieces that are there from the moment the cover comes off (broken part, bolts to undo...). */
  init(): void {}
  /** The task becomes the current one. */
  abstract start(): void;
  abstract instruction(): string;
  /** 0..1 done. */
  abstract progress(): number;
  /** 0..1 how well it was done (1 unless the task can be done badly). */
  score(): number {
    return 1;
  }
  abstract bot(): BotAction;
  /** A level the bot watches (fluids, paste). */
  level(): number | undefined {
    return undefined;
  }
  pointerDown(_u: number, _v: number): void {}
  pointerMove(_u: number, _v: number): void {}
  pointerUp(_u: number, _v: number): void {}
  update(_dt: number): void {}

  protected put<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.h.layer.add(o);
    this.objs.push(o);
    return o;
  }

  protected finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onDone();
  }

  protected tw(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    return this.h.scene.tweens.add(cfg);
  }

  protected ms(n: number): number {
    return Math.round(n * this.h.speed);
  }

  protected haptic(kind: Parameters<typeof session.haptic>[0]): void {
    session.haptic(kind);
  }
}

/** Dipstick-style level gauge with an optional green "just right" band. */
export function drawGauge(
  g: Phaser.GameObjects.Graphics,
  p: Pt,
  level: number,
  color: number,
  band: [number, number] | null,
): void {
  g.clear();
  const { x, y } = at(p);
  const w = STAGE * 0.035;
  const h = STAGE * 0.13;
  const top = y - h / 2;
  g.fillStyle(0x15121b, 0.9);
  g.fillRect(x - w / 2 - 3, top - 3, w + 6, h + 6);
  g.fillStyle(0x3a3640, 1);
  g.fillRect(x - w / 2, top, w, h);
  if (band) {
    g.fillStyle(0x4cc65a, 0.85);
    g.fillRect(x - w / 2, top + h * (1 - band[1]), w, h * (band[1] - band[0]));
  }
  g.fillStyle(color, 1);
  g.fillRect(x - w / 2 + 3, top + h * (1 - level), w - 6, h * level);
  g.lineStyle(2, 0xffffff, 0.8);
  g.lineBetween(x - w / 2 - 6, top + h * (1 - level), x + w / 2 + 6, top + h * (1 - level));
}

/** A bolt or screw slot / hex mark as lines (rotated images render badly in the stage). */
export function drawSlot(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  a: number,
  alpha: number,
): void {
  const dx = Math.cos(a) * r;
  const dy = Math.sin(a) * r;
  g.lineStyle(r * 0.32, 0x19141f, 0.85 * alpha);
  g.lineBetween(x - dx, y - dy, x + dx, y + dy);
  g.lineStyle(r * 0.1, 0xffffff, 0.35 * alpha);
  g.lineBetween(x - dx, y - dy + r * 0.24, x + dx, y + dy + r * 0.24);
}

/** A ratchet spanner on a bolt, its handle at angle `a` (drawn as lines). */
export function drawRatchet(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number): void {
  const len = STAGE * 0.2;
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len;
  g.lineStyle(22, 0x15121b, 0.9);
  g.lineBetween(x, y, ex, ey);
  g.lineStyle(15, 0xb9bfc9, 1);
  g.lineBetween(x, y, ex, ey);
  g.lineStyle(4, 0xffffff, 0.55);
  g.lineBetween(x, y - 4, ex, ey - 4);
  // Rubber grip.
  const gx = x + Math.cos(a) * len * 0.6;
  const gy = y + Math.sin(a) * len * 0.6;
  g.lineStyle(19, 0xe03c31, 1);
  g.lineBetween(gx, gy, ex, ey);
  // Head round the bolt.
  g.fillStyle(0x15121b, 0.9);
  g.fillCircle(x, y, 23);
  g.fillStyle(0xc9ced6, 1);
  g.fillCircle(x, y, 19);
  g.fillStyle(0x6d727c, 1);
  g.fillCircle(x, y, 9);
}
