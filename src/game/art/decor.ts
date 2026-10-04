import Phaser from 'phaser';
import { C } from '../theme';

type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/**
 * Shop decorations, drawn in code (centred on 0,0, about `s` tall, standing on y = s/2).
 * Distinct silhouettes so each one reads at small sizes.
 */
export function drawDecor(g: G, id: string, s: number): void {
  const k = s / 100;
  const ink = C.ink;
  g.lineStyle(4 * k, ink, 1);
  switch (id) {
    case 'plant':
      g.fillStyle(C.terracotta, 1);
      g.fillPoints([V(-22 * k, 10 * k), V(22 * k, 10 * k), V(16 * k, 50 * k), V(-16 * k, 50 * k)], true);
      g.strokePoints([V(-22 * k, 10 * k), V(22 * k, 10 * k), V(16 * k, 50 * k), V(-16 * k, 50 * k)], true);
      g.fillStyle(C.leaf, 1);
      for (const [x, y, r] of [
        [-14, -14, 16],
        [14, -18, 16],
        [0, -36, 18],
        [0, -4, 14],
      ]) {
        g.fillCircle(x * k, y * k, r * k);
        g.strokeCircle(x * k, y * k, r * k);
      }
      break;
    case 'rug':
      g.fillStyle(C.purple, 1);
      g.fillEllipse(0, 34 * k, 96 * k, 30 * k);
      g.strokeEllipse(0, 34 * k, 96 * k, 30 * k);
      g.fillStyle(C.gold, 1);
      g.fillEllipse(0, 34 * k, 60 * k, 16 * k);
      g.fillStyle(C.pink, 1);
      g.fillEllipse(0, 34 * k, 26 * k, 7 * k);
      break;
    case 'bell':
      g.fillStyle(C.gold, 1);
      g.fillPoints(
        [V(-26 * k, 30 * k), V(26 * k, 30 * k), V(18 * k, -10 * k), V(0, -26 * k), V(-18 * k, -10 * k)],
        true,
      );
      g.strokePoints(
        [V(-26 * k, 30 * k), V(26 * k, 30 * k), V(18 * k, -10 * k), V(0, -26 * k), V(-18 * k, -10 * k)],
        true,
      );
      g.fillStyle(0xb5773f, 1);
      g.fillRoundedRect(-36 * k, 30 * k, 72 * k, 16 * k, 6 * k);
      g.strokeRoundedRect(-36 * k, 30 * k, 72 * k, 16 * k, 6 * k);
      g.fillStyle(C.white, 0.7);
      g.fillCircle(-8 * k, -4 * k, 5 * k);
      break;
    case 'cat':
      g.fillStyle(C.mustard, 1);
      g.fillEllipse(0, 26 * k, 56 * k, 44 * k);
      g.strokeEllipse(0, 26 * k, 56 * k, 44 * k);
      g.fillTriangle(-24 * k, -18 * k, -18 * k, -40 * k, -6 * k, -22 * k);
      g.strokeTriangle(-24 * k, -18 * k, -18 * k, -40 * k, -6 * k, -22 * k);
      g.fillTriangle(24 * k, -18 * k, 18 * k, -40 * k, 6 * k, -22 * k);
      g.strokeTriangle(24 * k, -18 * k, 18 * k, -40 * k, 6 * k, -22 * k);
      g.fillCircle(0, -12 * k, 24 * k);
      g.strokeCircle(0, -12 * k, 24 * k);
      g.fillStyle(ink, 1);
      g.fillCircle(-9 * k, -14 * k, 3.5 * k);
      g.fillCircle(9 * k, -14 * k, 3.5 * k);
      g.fillStyle(C.pink, 1);
      g.fillTriangle(-4 * k, -6 * k, 4 * k, -6 * k, 0, -2 * k);
      g.lineStyle(5 * k, C.mustardDark, 1);
      g.beginPath();
      g.arc(30 * k, 30 * k, 14 * k, Math.PI * 1.1, Math.PI * 1.9, false);
      g.strokePath();
      break;
    case 'neon':
      g.fillStyle(0x2b2b33, 1);
      g.fillRoundedRect(-46 * k, -24 * k, 92 * k, 48 * k, 12 * k);
      g.strokeRoundedRect(-46 * k, -24 * k, 92 * k, 48 * k, 12 * k);
      g.lineStyle(6 * k, C.pink, 1);
      g.strokeRoundedRect(-36 * k, -14 * k, 72 * k, 28 * k, 8 * k);
      g.lineStyle(5 * k, C.sky, 1);
      g.strokeCircle(-18 * k, 0, 7 * k);
      g.lineBetween(-2 * k, -7 * k, -2 * k, 7 * k);
      g.lineBetween(10 * k, -7 * k, 10 * k, 7 * k);
      g.lineBetween(-2 * k, -7 * k, 10 * k, 7 * k);
      g.lineStyle(4 * k, ink, 1);
      g.lineBetween(-30 * k, -24 * k, -30 * k, -44 * k);
      g.lineBetween(30 * k, -24 * k, 30 * k, -44 * k);
      break;
    case 'fishtank':
      g.fillStyle(0x8fd3ef, 0.9);
      g.fillRoundedRect(-40 * k, -24 * k, 80 * k, 60 * k, 8 * k);
      g.strokeRoundedRect(-40 * k, -24 * k, 80 * k, 60 * k, 8 * k);
      g.fillStyle(C.terracotta, 1);
      g.fillEllipse(-6 * k, 4 * k, 22 * k, 12 * k);
      g.fillTriangle(5 * k, 4 * k, 15 * k, -4 * k, 15 * k, 12 * k);
      g.fillStyle(C.leaf, 1);
      g.fillRect(24 * k, 10 * k, 5 * k, 24 * k);
      g.fillStyle(C.white, 0.8);
      g.fillCircle(-22 * k, -8 * k, 3 * k);
      g.fillCircle(-18 * k, -16 * k, 2 * k);
      g.fillStyle(0xb5773f, 1);
      g.fillRect(-44 * k, 36 * k, 88 * k, 10 * k);
      g.strokeRect(-44 * k, 36 * k, 88 * k, 10 * k);
      break;
    case 'jukebox':
      g.fillStyle(C.terracotta, 1);
      g.fillRoundedRect(-30 * k, -40 * k, 60 * k, 88 * k, { tl: 30 * k, tr: 30 * k, bl: 6 * k, br: 6 * k });
      g.strokeRoundedRect(-30 * k, -40 * k, 60 * k, 88 * k, { tl: 30 * k, tr: 30 * k, bl: 6 * k, br: 6 * k });
      g.fillStyle(C.gold, 1);
      g.fillCircle(0, -14 * k, 16 * k);
      g.strokeCircle(0, -14 * k, 16 * k);
      g.fillStyle(ink, 1);
      g.fillCircle(0, -14 * k, 4 * k);
      g.fillStyle(C.sky, 1);
      g.fillRect(-18 * k, 12 * k, 36 * k, 8 * k);
      g.fillStyle(C.pink, 1);
      g.fillRect(-18 * k, 26 * k, 36 * k, 8 * k);
      break;
    case 'chandelier':
      g.lineBetween(0, -48 * k, 0, -24 * k);
      g.fillStyle(C.gold, 1);
      g.fillEllipse(0, -18 * k, 70 * k, 14 * k);
      g.strokeEllipse(0, -18 * k, 70 * k, 14 * k);
      g.fillStyle(0xdff4ff, 1);
      for (const x of [-28, -10, 10, 28]) {
        g.fillPoints(
          [V(x * k, -12 * k), V((x + 7) * k, 6 * k), V(x * k, 20 * k), V((x - 7) * k, 6 * k)],
          true,
        );
        g.strokePoints(
          [V(x * k, -12 * k), V((x + 7) * k, 6 * k), V(x * k, 20 * k), V((x - 7) * k, 6 * k)],
          true,
        );
      }
      g.fillStyle(C.white, 0.9);
      g.fillCircle(-24 * k, -26 * k, 3 * k);
      g.fillCircle(24 * k, -28 * k, 3 * k);
      break;
    case 'display':
      g.fillStyle(0xb5773f, 1);
      g.fillRect(-42 * k, 20 * k, 84 * k, 28 * k);
      g.strokeRect(-42 * k, 20 * k, 84 * k, 28 * k);
      g.fillStyle(0xdff4ff, 0.7);
      g.fillRect(-38 * k, -34 * k, 76 * k, 54 * k);
      g.strokeRect(-38 * k, -34 * k, 76 * k, 54 * k);
      g.fillStyle(C.purple, 1);
      g.fillPoints([V(0, -20 * k), V(12 * k, -6 * k), V(0, 10 * k), V(-12 * k, -6 * k)], true);
      g.strokePoints([V(0, -20 * k), V(12 * k, -6 * k), V(0, 10 * k), V(-12 * k, -6 * k)], true);
      g.fillStyle(C.white, 0.8);
      g.fillRect(-30 * k, -28 * k, 6 * k, 40 * k);
      break;
    case 'fountain':
      g.fillStyle(C.gold, 1);
      g.fillEllipse(0, 34 * k, 90 * k, 24 * k);
      g.strokeEllipse(0, 34 * k, 90 * k, 24 * k);
      g.fillRect(-6 * k, -10 * k, 12 * k, 40 * k);
      g.strokeRect(-6 * k, -10 * k, 12 * k, 40 * k);
      g.fillEllipse(0, -12 * k, 44 * k, 12 * k);
      g.strokeEllipse(0, -12 * k, 44 * k, 12 * k);
      g.lineStyle(5 * k, C.sky, 1);
      g.beginPath();
      g.arc(-14 * k, -14 * k, 18 * k, Math.PI * 1.1, Math.PI * 1.95, false);
      g.strokePath();
      g.beginPath();
      g.arc(14 * k, -14 * k, 18 * k, Math.PI * 1.05, Math.PI * 1.9, false);
      g.strokePath();
      g.fillStyle(C.sky, 1);
      g.fillEllipse(0, 32 * k, 70 * k, 12 * k);
      break;
  }
}
