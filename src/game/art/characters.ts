import Phaser from 'phaser';
import { C } from '../theme';
import type { Persona } from '../../core/types';

type G = Phaser.GameObjects.Graphics;
const hexNum = (h: string) => parseInt(h.replace('#', ''), 16);

export type Mood = 'happy' | 'think' | 'sad' | 'wow';

/** Rory the Raccoon, the game's mascot and coach. Drawn centred at (0,0), ~s tall. */
export function drawRaccoon(g: G, s: number, mood: Mood = 'happy'): void {
  const k = s / 200;
  const ink = C.ink;
  g.lineStyle(5 * k, ink, 1);
  // tail
  g.fillStyle(0x8f8f99, 1);
  g.fillEllipse(62 * k, 52 * k, 50 * k, 90 * k);
  g.strokeEllipse(62 * k, 52 * k, 50 * k, 90 * k);
  g.fillStyle(0x4a4a52, 1);
  g.fillEllipse(66 * k, 30 * k, 40 * k, 14 * k);
  g.fillEllipse(64 * k, 62 * k, 44 * k, 14 * k);
  // body
  g.fillStyle(0xa3a3ad, 1);
  g.fillEllipse(0, 50 * k, 110 * k, 110 * k);
  g.strokeEllipse(0, 50 * k, 110 * k, 110 * k);
  g.fillStyle(0xe9e6ef, 1);
  g.fillEllipse(0, 60 * k, 64 * k, 72 * k);
  // apron
  g.fillStyle(C.teal, 1);
  g.fillRoundedRect(-34 * k, 40 * k, 68 * k, 60 * k, 12 * k);
  g.strokeRoundedRect(-34 * k, 40 * k, 68 * k, 60 * k, 12 * k);
  g.fillStyle(C.mustard, 1);
  g.fillRoundedRect(-14 * k, 56 * k, 28 * k, 20 * k, 6 * k);
  // ears
  g.fillStyle(0xa3a3ad, 1);
  g.fillTriangle(-58 * k, -60 * k, -30 * k, -96 * k, -14 * k, -62 * k);
  g.strokeTriangle(-58 * k, -60 * k, -30 * k, -96 * k, -14 * k, -62 * k);
  g.fillTriangle(58 * k, -60 * k, 30 * k, -96 * k, 14 * k, -62 * k);
  g.strokeTriangle(58 * k, -60 * k, 30 * k, -96 * k, 14 * k, -62 * k);
  // head
  g.fillStyle(0xb6b6c0, 1);
  g.fillEllipse(0, -40 * k, 140 * k, 104 * k);
  g.strokeEllipse(0, -40 * k, 140 * k, 104 * k);
  // mask
  g.fillStyle(0x3f3f47, 1);
  g.fillEllipse(-28 * k, -44 * k, 52 * k, 30 * k);
  g.fillEllipse(28 * k, -44 * k, 52 * k, 30 * k);
  // muzzle
  g.fillStyle(0xf4f1f7, 1);
  g.fillEllipse(0, -18 * k, 58 * k, 38 * k);
  g.fillStyle(ink, 1);
  g.fillEllipse(0, -28 * k, 16 * k, 10 * k);
  // eyes
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-28 * k, -46 * k, 10 * k);
  g.fillCircle(28 * k, -46 * k, 10 * k);
  g.fillStyle(ink, 1);
  const ey = mood === 'think' ? -49 : -45;
  g.fillCircle(-26 * k, ey * k, 6 * k);
  g.fillCircle(30 * k, ey * k, 6 * k);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(-24 * k, (ey - 2) * k, 2 * k);
  g.fillCircle(32 * k, (ey - 2) * k, 2 * k);
  // mouth
  g.lineStyle(4 * k, ink, 1);
  g.beginPath();
  if (mood === 'wow') {
    g.fillStyle(C.terracottaDark, 1);
    g.fillEllipse(0, -6 * k, 14 * k, 16 * k);
  } else if (mood === 'sad') {
    g.arc(0, 0, 10 * k, Math.PI * 1.15, Math.PI * 1.85, false);
    g.strokePath();
  } else {
    g.arc(0, -16 * k, 12 * k, Math.PI * 0.15, Math.PI * 0.85, false);
    g.strokePath();
  }
  // cheeks
  g.fillStyle(C.pink, 0.55);
  g.fillCircle(-46 * k, -22 * k, 8 * k);
  g.fillCircle(46 * k, -22 * k, 8 * k);
}

/** A customer bust built from persona data (skin, hair, shirt, hat style) with a mood face. */
export function drawCustomer(g: G, p: Persona, s: number, mood: Mood = 'happy'): void {
  const k = s / 200;
  const ink = C.ink;
  const skin = hexNum(p.look.skin);
  const hair = hexNum(p.look.hair);
  const shirt = hexNum(p.look.shirt);
  g.lineStyle(5 * k, ink, 1);
  // shoulders
  g.fillStyle(shirt, 1);
  g.fillRoundedRect(-70 * k, 40 * k, 140 * k, 80 * k, 40 * k);
  g.strokeRoundedRect(-70 * k, 40 * k, 140 * k, 80 * k, 40 * k);
  // neck
  g.fillStyle(skin, 1);
  g.fillRect(-14 * k, 26 * k, 28 * k, 22 * k);
  // hair back
  g.fillStyle(hair, 1);
  if (p.look.hat !== 6 && p.look.hat !== 8) g.fillEllipse(0, -26 * k, 128 * k, 120 * k);
  // head
  g.fillStyle(skin, 1);
  g.fillEllipse(0, -14 * k, 108 * k, 116 * k);
  g.strokeEllipse(0, -14 * k, 108 * k, 116 * k);
  // fringe
  g.fillStyle(hair, 1);
  g.fillEllipse(-14 * k, -60 * k, 80 * k, 34 * k);
  g.fillEllipse(24 * k, -62 * k, 62 * k, 28 * k);
  // hats
  switch (p.look.hat) {
    case 1: // beret
      g.fillStyle(C.terracotta, 1);
      g.fillEllipse(-6 * k, -74 * k, 110 * k, 34 * k);
      g.strokeEllipse(-6 * k, -74 * k, 110 * k, 34 * k);
      break;
    case 2: // headband
      g.fillStyle(C.mustard, 1);
      g.fillRect(-54 * k, -60 * k, 108 * k, 12 * k);
      break;
    case 3: // cap
      g.fillStyle(C.leaf, 1);
      g.fillEllipse(0, -70 * k, 104 * k, 46 * k);
      g.strokeEllipse(0, -70 * k, 104 * k, 46 * k);
      g.fillRoundedRect(10 * k, -60 * k, 70 * k, 14 * k, 7 * k);
      g.strokeRoundedRect(10 * k, -60 * k, 70 * k, 14 * k, 7 * k);
      break;
    case 4: // sun hat
      g.fillStyle(0xf4e3c1, 1);
      g.fillEllipse(0, -64 * k, 170 * k, 30 * k);
      g.strokeEllipse(0, -64 * k, 170 * k, 30 * k);
      g.fillEllipse(0, -80 * k, 90 * k, 40 * k);
      g.strokeEllipse(0, -80 * k, 90 * k, 40 * k);
      g.fillStyle(C.pink, 1);
      g.fillRect(-44 * k, -72 * k, 88 * k, 8 * k);
      break;
    case 5: // chef hat
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(-36 * k, -120 * k, 72 * k, 60 * k, 26 * k);
      g.strokeRoundedRect(-36 * k, -120 * k, 72 * k, 60 * k, 26 * k);
      break;
    case 6: // helmet
      g.fillStyle(C.sky, 1);
      g.fillEllipse(0, -64 * k, 116 * k, 64 * k);
      g.strokeEllipse(0, -64 * k, 116 * k, 64 * k);
      break;
    case 7: // headphones
      g.lineStyle(9 * k, ink, 1);
      g.beginPath();
      g.arc(0, -20 * k, 62 * k, Math.PI * 1.05, Math.PI * 1.95, false);
      g.strokePath();
      g.fillStyle(C.purple, 1);
      g.fillRoundedRect(-66 * k, -30 * k, 18 * k, 36 * k, 8 * k);
      g.fillRoundedRect(48 * k, -30 * k, 18 * k, 36 * k, 8 * k);
      g.lineStyle(5 * k, ink, 1);
      break;
    case 8: // top hat
      g.fillStyle(0x2b2b33, 1);
      g.fillRect(-36 * k, -132 * k, 72 * k, 66 * k);
      g.strokeRect(-36 * k, -132 * k, 72 * k, 66 * k);
      g.fillRoundedRect(-62 * k, -72 * k, 124 * k, 12 * k, 6 * k);
      g.fillStyle(C.purple, 1);
      g.fillRect(-36 * k, -84 * k, 72 * k, 10 * k);
      break;
  }
  g.lineStyle(5 * k, ink, 1);
  // eyes
  g.fillStyle(ink, 1);
  const eyeY = mood === 'think' ? -22 : -16;
  if (mood === 'happy' || mood === 'wow') {
    g.fillCircle(-20 * k, eyeY * k, 6 * k);
    g.fillCircle(20 * k, eyeY * k, 6 * k);
  } else {
    g.fillRect(-27 * k, (eyeY - 2) * k, 14 * k, 5 * k);
    g.fillRect(13 * k, (eyeY - 2) * k, 14 * k, 5 * k);
  }
  // mouth
  g.lineStyle(4 * k, ink, 1);
  g.beginPath();
  if (mood === 'happy') {
    g.arc(0, 6 * k, 16 * k, Math.PI * 0.15, Math.PI * 0.85, false);
    g.strokePath();
  } else if (mood === 'wow') {
    g.fillStyle(C.terracottaDark, 1);
    g.fillEllipse(0, 16 * k, 16 * k, 20 * k);
  } else if (mood === 'think') {
    g.moveTo(-12 * k, 18 * k);
    g.lineTo(12 * k, 14 * k);
    g.strokePath();
  } else {
    g.arc(0, 28 * k, 14 * k, Math.PI * 1.2, Math.PI * 1.8, false);
    g.strokePath();
  }
  g.fillStyle(C.pink, 0.5);
  g.fillCircle(-36 * k, 4 * k, 8 * k);
  g.fillCircle(36 * k, 4 * k, 8 * k);
}
