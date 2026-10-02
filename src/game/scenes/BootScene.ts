import Phaser from 'phaser';
import { C } from '../theme';

/** Generates the small particle textures, then hands over to the main menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const progress = this.registry.get('bootProgress') as ((p: number) => void) | undefined;
    const g = this.add.graphics();
    const make = (key: string, size: number, draw: (g: Phaser.GameObjects.Graphics, s: number) => void) => {
      g.clear();
      draw(g, size);
      g.generateTexture(key, size, size);
    };
    make('p_dot', 32, (gr, s) => {
      gr.fillStyle(0xffffff, 1);
      gr.fillCircle(s / 2, s / 2, s / 2 - 1);
    });
    make('p_ring', 48, (gr, s) => {
      gr.lineStyle(4, 0xffffff, 1);
      gr.strokeCircle(s / 2, s / 2, s / 2 - 4);
      gr.fillStyle(0xffffff, 0.35);
      gr.fillCircle(s / 2, s / 2, s / 2 - 6);
      gr.fillStyle(0xffffff, 1);
      gr.fillCircle(s * 0.35, s * 0.35, s * 0.1);
    });
    make('p_star', 48, (gr, s) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? s / 2 - 1 : s / 4.4;
        pts.push(new Phaser.Math.Vector2(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r));
      }
      gr.fillStyle(0xffffff, 1);
      gr.fillPoints(pts, true);
    });
    make('p_spark', 48, (gr, s) => {
      const c = s / 2;
      gr.fillStyle(0xffffff, 1);
      gr.fillPoints(
        [
          new Phaser.Math.Vector2(c, 0),
          new Phaser.Math.Vector2(c + s * 0.1, c - s * 0.1),
          new Phaser.Math.Vector2(s, c),
          new Phaser.Math.Vector2(c + s * 0.1, c + s * 0.1),
          new Phaser.Math.Vector2(c, s),
          new Phaser.Math.Vector2(c - s * 0.1, c + s * 0.1),
          new Phaser.Math.Vector2(0, c),
          new Phaser.Math.Vector2(c - s * 0.1, c - s * 0.1),
        ],
        true,
      );
    });
    make('p_flake', 16, (gr, s) => {
      gr.fillStyle(0xffffff, 1);
      gr.fillRect(2, 4, s - 4, s - 8);
    });
    make('p_coin', 40, (gr, s) => {
      gr.fillStyle(C.mustardDark, 1);
      gr.fillCircle(s / 2, s / 2 + 2, s / 2 - 2);
      gr.fillStyle(C.gold, 1);
      gr.fillCircle(s / 2, s / 2, s / 2 - 3);
      gr.lineStyle(3, C.ink, 1);
      gr.strokeCircle(s / 2, s / 2, s / 2 - 3);
      gr.fillStyle(C.mustardDark, 1);
      gr.fillRect(s / 2 - 2.5, s / 2 - 8, 5, 16);
    });
    g.destroy();
    progress?.(80);
    this.scene.start('MainMenu');
  }
}
