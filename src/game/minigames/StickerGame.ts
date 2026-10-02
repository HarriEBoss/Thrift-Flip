import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { drawResidue, drawSticker } from '../art/damage';
import { ctx2d, makeCanvas } from '../art/itemArt';
import { peelStep, stickerScore, type PeelState } from '../../core/minigame';
import { C } from '../theme';
import { session } from '../session';

/** Peel a price sticker from its curled corner. Too fast tears it (residue, lower score). */
export class StickerGame extends MiniGame {
  private canvas!: HTMLCanvasElement;
  private tex!: Phaser.Textures.CanvasTexture;
  private state: PeelState = { progress: 0, torn: false };
  private grabbing = false;
  private grabStart = { u: 0, v: 0 };
  private flap!: Phaser.GameObjects.Graphics;
  private pulse: Phaser.Tweens.Tween | null = null;
  private lastU = 0;
  private lastV = 0;
  private speedAvg = 0;

  start(): void {
    const s = this.ctx.set.sticker!;
    this.canvas = makeCanvas(this.ctx.tex);
    drawSticker(ctx2d(this.canvas), this.ctx.tex, s, 0);
    const key = `${this.ctx.key}_sticker`;
    if (this.ctx.scene.textures.exists(key)) this.ctx.scene.textures.remove(key);
    this.tex = this.ctx.scene.textures.addCanvas(key, this.canvas)!;
    const img = this.add(this.ctx.scene.add.image(0, 0, key).setOrigin(0, 0));
    img.setDisplaySize(STAGE, STAGE);
    this.flap = this.add(this.ctx.scene.add.graphics());
    const c = this.corner();
    this.flap.fillStyle(C.gold, 1);
    this.flap.lineStyle(4, C.ink, 1);
    this.flap.fillCircle(0, 0, 22);
    this.flap.strokeCircle(0, 0, 22);
    this.flap.setPosition(c.u * STAGE, c.v * STAGE);
    this.pulse = this.ctx.scene.tweens.add({
      targets: this.flap,
      scale: 1.3,
      duration: 450,
      yoyo: true,
      repeat: -1,
    });
    this.makeCursor();
  }

  /** Peel corner in unit coords. */
  private corner(): { u: number; v: number } {
    const s = this.ctx.set.sticker!;
    const cos = Math.cos(s.rot);
    const sin = Math.sin(s.rot);
    const lx = (s.cx * s.w) / 2;
    const ly = (s.cy * s.h) / 2;
    return { u: s.x + lx * cos - ly * sin, v: s.y + lx * sin + ly * cos };
  }

  instruction(): string {
    return 'mg.sticker';
  }
  progress(): number {
    return this.state.progress;
  }
  score(): number {
    return stickerScore(this.state);
  }
  autoComplete(): boolean {
    return this.state.progress >= 1 || this.state.torn;
  }
  override minProgressForDone(): number {
    return 2; // never: peeling finishes itself
  }

  override pointerDown(u: number, v: number): void {
    const c = this.corner();
    if (Math.hypot(u - c.u, v - c.v) < 0.12 + this.state.progress * 0.3 || this.state.progress > 0) {
      this.grabbing = true;
      this.grabStart = { u: u - this.state.progress * this.dirX() * this.ctx.set.sticker!.w, v };
      this.lastU = u;
      this.lastV = v;
      this.pulse?.stop();
      this.flap.setVisible(false);
      session.haptic('light');
    }
    this.moveCursor(u, v);
  }

  private dirX(): number {
    return -this.ctx.set.sticker!.cx;
  }

  override pointerMove(u: number, v: number, down: boolean, dt: number): void {
    this.moveCursor(u, v);
    if (!down || !this.grabbing || this.autoComplete()) return;
    const s = this.ctx.set.sticker!;
    const along = ((u - this.grabStart.u) * this.dirX()) / (s.w * 1.1);
    const delta = along - this.state.progress;
    const speed = Math.hypot(u - this.lastU, v - this.lastV) / Math.max(0.001, dt);
    this.speedAvg = this.speedAvg * 0.6 + speed * 0.4;
    this.lastU = u;
    this.lastV = v;
    const safe = 1.5 * this.ctx.tools.stickerTear;
    const next = peelStep(this.state, delta, this.speedAvg, safe);
    if (next.torn && !this.state.torn) {
      this.sfx('tear');
      session.haptic('medium');
      const x = ctx2d(this.canvas);
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      drawResidue(x, this.canvas.width, s);
      // Residue also goes onto the dirt layer if a scrub step follows.
      const dirt = this.ctx.set.layers.scrub;
      if (dirt) drawResidue(ctx2d(dirt), dirt.width, s);
      this.tex.refresh();
    } else if (delta > 0.005) {
      this.sfx('peel', Math.min(1, this.speedAvg / safe));
      const x = ctx2d(this.canvas);
      x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      drawSticker(x, this.canvas.width, s, next.progress);
      this.tex.refresh();
    }
    this.state = next;
    if (this.state.progress >= 1 && !this.state.torn) {
      this.sfx('pop');
      this.burst(u, v, 'p_spark', 14, [C.gold, 0xffffff], 200);
    }
  }

  override pointerUp(): void {
    this.grabbing = false;
    this.cursor?.setVisible(false);
  }

  override finishVisuals(): void {
    const img = this.objects[0] as Phaser.GameObjects.Image;
    if (!this.state.torn) this.ctx.scene.tweens.add({ targets: img, alpha: 0, duration: 250 });
  }
}
