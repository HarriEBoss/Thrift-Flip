import Phaser from 'phaser';
import { drawCoin } from '../ui/widgets';

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
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    };
    // Pixel particles: '#' solid, '+' translucent.
    const blocks = (pattern: string[]) => (gr: Phaser.GameObjects.Graphics, s: number) => {
      const n = pattern.length;
      const b = s / n;
      pattern.forEach((rowS, y) =>
        [...rowS].forEach((ch, x) => {
          if (ch === '.') return;
          gr.fillStyle(0xffffff, ch === '+' ? 0.4 : 1);
          gr.fillRect(x * b, y * b, b, b);
        }),
      );
    };
    make(
      'p_dot',
      32,
      blocks([
        '..####..',
        '.######.',
        '########',
        '########',
        '########',
        '########',
        '.######.',
        '..####..',
      ]),
    );
    make(
      'p_ring',
      48,
      blocks([
        '..####..',
        '.#++++#.',
        '#+#++++#',
        '#++++++#',
        '#++++++#',
        '#++++++#',
        '.#++++#.',
        '..####..',
      ]),
    );
    make(
      'p_star',
      45,
      blocks([
        '....#....',
        '....#....',
        '...###...',
        '..#####..',
        '#########',
        '..#####..',
        '...###...',
        '....#....',
        '....#....',
      ]),
    );
    make(
      'p_spark',
      45,
      blocks([
        '....#....',
        '....#....',
        '....#....',
        '...###...',
        '#########',
        '...###...',
        '....#....',
        '....#....',
        '....#....',
      ]),
    );
    make('p_flake', 16, blocks(['....', '####', '####', '....']));
    make('p_coin', 40, (gr, s) => drawCoin(gr, s / 2, s / 2, s / 2 - 3));
    g.destroy();
    progress?.(80);
    this.scene.start('MainMenu');
  }
}
