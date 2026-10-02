import Phaser from 'phaser';
import { drawRaccoon, type Mood } from '../art/characters';
import { C, FS } from '../theme';
import { drawCard, makeText } from './widgets';
import type { BaseScene } from '../scenes/BaseScene';

/**
 * Rory the Raccoon's tutorial bubble + a bouncing pointer. Non-blocking: it never captures input,
 * so the highlighted control is always tappable.
 */
export class Coach extends Phaser.GameObjects.Container {
  private bubble: Phaser.GameObjects.Container;
  private pointer: Phaser.GameObjects.Graphics;
  private rory: Phaser.GameObjects.Graphics;
  private bounce: Phaser.Tweens.Tween | null = null;
  private target: { x: number; y: number } | null = null;

  constructor(private host: BaseScene) {
    super(host, 0, 0);
    this.rory = host.add.graphics();
    this.bubble = host.add.container(0, 0);
    this.pointer = host.add.graphics();
    this.add([this.rory, this.bubble, this.pointer]);
    host.root.add(this);
    this.setDepth(1000);
    this.setVisible(false);
  }

  say(
    text: string,
    opts: { target?: { x: number; y: number }; mood?: Mood; at?: 'top' | 'bottom' | 'right' } = {},
  ): void {
    const f = this.host.frame;
    this.setVisible(true);
    this.host.root.bringToTop(this);
    this.bubble.removeAll(true);
    const right = opts.at === 'right' && !f.portrait;
    const w = right ? Math.min(f.w * 0.42 - 40, 460) : Math.min(f.w - 200, 520);
    const tx = makeText(this.host, 0, 0, text, FS.body, C.ink, { wrap: w - 40, bold: true });
    const h = Math.max(90, tx.height + 40);
    const g = this.host.add.graphics();
    drawCard(g, -w / 2, -h / 2, w, h, C.white, { radius: 24, stroke: C.ink, strokeW: 4 });
    g.fillStyle(C.white, 1);
    g.fillTriangle(-w / 2 + 6, h / 2 - 34, -w / 2 - 22, h / 2 - 8, -w / 2 + 6, h / 2 - 12);
    g.lineStyle(4, C.ink, 1);
    g.lineBetween(-w / 2 + 2, h / 2 - 34, -w / 2 - 22, h / 2 - 8);
    g.lineBetween(-w / 2 - 22, h / 2 - 8, -w / 2 + 2, h / 2 - 12);
    this.bubble.add([g, tx]);
    this.rory.clear();
    drawRaccoon(this.rory, 150, opts.mood ?? 'happy');
    const y = opts.at === 'top' ? 200 : f.h - 230;
    if (right) {
      this.rory.setPosition(f.w - 90, f.h - 150);
      this.bubble.setPosition(f.w - w / 2 - 30, f.h - 330);
    } else {
      this.rory.setPosition(90, y + 30);
      this.bubble.setPosition(Math.min(f.w - w / 2 - 16, 170 + w / 2), y - 10);
    }
    this.target = opts.target ?? null;
    this.drawPointer();
    this.bubble.setScale(0.6);
    this.host.tweens.add({ targets: this.bubble, scale: 1, duration: 220, ease: 'Back.out' });
  }

  private drawPointer(): void {
    this.bounce?.stop();
    this.pointer.clear();
    if (!this.target) return;
    const g = this.pointer;
    g.fillStyle(C.gold, 1);
    g.lineStyle(4, C.ink, 1);
    const pts = [
      new Phaser.Math.Vector2(0, 0),
      new Phaser.Math.Vector2(-22, -30),
      new Phaser.Math.Vector2(-8, -30),
      new Phaser.Math.Vector2(-8, -60),
      new Phaser.Math.Vector2(8, -60),
      new Phaser.Math.Vector2(8, -30),
      new Phaser.Math.Vector2(22, -30),
    ];
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
    g.setPosition(this.target.x, this.target.y - 50);
    this.bounce = this.host.tweens.add({
      targets: g,
      y: this.target.y - 70,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  pointAt(target: { x: number; y: number } | null): void {
    this.host.root.bringToTop(this);
    this.target = target;
    this.drawPointer();
  }

  hide(): void {
    this.bounce?.stop();
    this.setVisible(false);
  }
}
