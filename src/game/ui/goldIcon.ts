import Phaser from 'phaser';

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** A shiny gold bar (ingot), centred on (x, y), about `size` wide. */
export function drawGoldBar(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const w = size;
  const h = size * 0.5;
  const top = w * 0.62;
  g.fillStyle(0x7a5208, 1);
  g.fillPoints(
    [
      V(x - w / 2 - 2, y + h / 2 + 2),
      V(x + w / 2 + 2, y + h / 2 + 2),
      V(x + top / 2 + 2, y - h / 2 - 2),
      V(x - top / 2 - 2, y - h / 2 - 2),
    ],
    true,
  );
  g.fillStyle(0xf2c12e, 1);
  g.fillPoints(
    [V(x - w / 2, y + h / 2), V(x + w / 2, y + h / 2), V(x + top / 2, y - h / 2), V(x - top / 2, y - h / 2)],
    true,
  );
  g.fillStyle(0xffe58a, 1);
  g.fillRect(x - top / 2 + 3, y - h / 2 + 2, top - 6, h * 0.22);
  g.fillStyle(0xffffff, 0.7);
  g.fillRect(x - w * 0.3, y - h * 0.05, w * 0.08, h * 0.45);
}
