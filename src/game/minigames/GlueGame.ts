import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { PathTracer } from '../../core/minigame';
import { C } from '../theme';
import { session } from '../session';

/** Trace along the crack with the glue nozzle. Score = path coverage x accuracy. */
export class GlueGame extends MiniGame {
  private tracer!: PathTracer;
  private crackG!: Phaser.GameObjects.Graphics;
  private glueG!: Phaser.GameObjects.Graphics;
  private startDot!: Phaser.GameObjects.Graphics;
  private last: { u: number; v: number } | null = null;

  start(): void {
    const path = this.ctx.set.crack!;
    this.tracer = new PathTracer(path, 0.04 * this.ctx.tools.glueTolerance);
    this.crackG = this.add(this.ctx.scene.add.graphics());
    this.drawCrack();
    this.glueG = this.add(this.ctx.scene.add.graphics());
    this.startDot = this.add(this.ctx.scene.add.graphics());
    this.startDot.fillStyle(C.leaf, 1);
    this.startDot.lineStyle(4, C.ink, 1);
    this.startDot.fillCircle(0, 0, 16);
    this.startDot.strokeCircle(0, 0, 16);
    this.startDot.setPosition(path[0].x * STAGE, path[0].y * STAGE);
    this.ctx.scene.tweens.add({ targets: this.startDot, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
    this.makeCursor();
  }

  private drawCrack(): void {
    const g = this.crackG;
    const path = this.ctx.set.crack!;
    g.clear();
    // Dashed guide showing where to glue (shape cue, not colour only).
    g.lineStyle(10, 0xffffff, 0.45);
    g.beginPath();
    path.forEach((p, i) =>
      i === 0 ? g.moveTo(p.x * STAGE, p.y * STAGE) : g.lineTo(p.x * STAGE, p.y * STAGE),
    );
    g.strokePath();
    path.forEach((p, i) => {
      g.fillStyle(this.tracer.visited[i] ? C.leaf : C.white, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillCircle(p.x * STAGE, p.y * STAGE, 7);
      g.strokeCircle(p.x * STAGE, p.y * STAGE, 7);
    });
  }

  instruction(): string {
    return 'mg.glue';
  }
  progress(): number {
    return this.tracer.coverage();
  }
  score(): number {
    return this.tracer.score();
  }
  autoComplete(): boolean {
    return this.tracer.coverage() >= 1;
  }

  override pointerDown(u: number, v: number): void {
    this.last = { u, v };
    this.moveCursor(u, v);
    this.tracer.add(u, v, 0.001);
    this.startDot.setVisible(false);
  }

  override pointerMove(u: number, v: number, down: boolean): void {
    this.moveCursor(u, v);
    if (!down || !this.last) return;
    const d = Math.hypot(u - this.last.u, v - this.last.v);
    // Sub-step so fast moves still register points.
    const steps = Math.max(1, Math.ceil(d / 0.01));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      this.tracer.add(this.last.u + (u - this.last.u) * t, this.last.v + (v - this.last.v) * t, d / steps);
    }
    const onPath = this.tracer.distanceToPath(u, v) <= this.tracer.tolerance * 1.4;
    this.glueG.lineStyle(12, onPath ? 0xbfe8ff : 0xffd0d0, 0.85);
    this.glueG.lineBetween(this.last.u * STAGE, this.last.v * STAGE, u * STAGE, v * STAGE);
    this.last = { u, v };
    this.sfx('glue', 0.7);
    this.drawCrack();
    if (!onPath) session.haptic('light');
  }

  override pointerUp(): void {
    this.last = null;
    this.cursor?.setVisible(false);
  }

  override finishVisuals(): void {
    this.ctx.scene.tweens.add({ targets: [this.crackG, this.glueG], alpha: 0, duration: 400 });
    const path = this.ctx.set.crack!;
    for (const p of path) this.burst(p.x, p.y, 'p_spark', 3, [C.sky, 0xffffff], 120);
  }
}
