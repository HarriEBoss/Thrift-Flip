import Phaser from 'phaser';
import { C } from '../theme';
import type { StepKind } from '../../core/types';
import { vCoin, vStar } from './widgets';
import { pixelDraw, type Pen } from '../art/pixel';

type G = Phaser.GameObjects.Graphics;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Step icons (vector, centred at 0,0, roughly `s` wide). Distinct shapes, never colour alone. */
function v_drawStepIcon(g: Pen, kind: StepKind, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  switch (kind) {
    case 'scrub': // sponge with bubbles
      g.fillStyle(C.mustard, 1);
      g.fillRoundedRect(-14 * k, -6 * k, 28 * k, 16 * k, 4 * k);
      g.strokeRoundedRect(-14 * k, -6 * k, 28 * k, 16 * k, 4 * k);
      g.fillStyle(C.leaf, 1);
      g.fillRect(-14 * k, -6 * k, 28 * k, 5 * k);
      g.fillStyle(C.white, 1);
      g.fillCircle(-8 * k, -13 * k, 4 * k);
      g.strokeCircle(-8 * k, -13 * k, 4 * k);
      g.fillCircle(4 * k, -15 * k, 3 * k);
      g.strokeCircle(4 * k, -15 * k, 3 * k);
      break;
    case 'rust': // wire brush
      g.fillStyle(0xb5773f, 1);
      g.fillRoundedRect(-16 * k, -8 * k, 32 * k, 8 * k, 3 * k);
      g.strokeRoundedRect(-16 * k, -8 * k, 32 * k, 8 * k, 3 * k);
      g.lineStyle(2 * k, 0x8a8f96, 1);
      for (let i = -12; i <= 12; i += 4) g.lineBetween(i * k, 0, i * k, 10 * k);
      break;
    case 'sticker':
      g.fillStyle(0xfff4b8, 1);
      g.fillPoints(
        [V(-14 * k, -12 * k), V(10 * k, -12 * k), V(14 * k, -6 * k), V(14 * k, 12 * k), V(-14 * k, 12 * k)],
        true,
      );
      g.strokePoints(
        [V(-14 * k, -12 * k), V(10 * k, -12 * k), V(14 * k, -6 * k), V(14 * k, 12 * k), V(-14 * k, 12 * k)],
        true,
      );
      g.fillStyle(C.terracotta, 1);
      g.fillRect(-8 * k, -3 * k, 14 * k, 3 * k);
      g.fillRect(-8 * k, 3 * k, 10 * k, 3 * k);
      break;
    case 'glue':
      g.fillStyle(C.white, 1);
      g.fillRoundedRect(-8 * k, -6 * k, 16 * k, 20 * k, 4 * k);
      g.strokeRoundedRect(-8 * k, -6 * k, 16 * k, 20 * k, 4 * k);
      g.fillStyle(C.terracotta, 1);
      g.fillTriangle(-4 * k, -6 * k, 4 * k, -6 * k, 0, -16 * k);
      g.strokeTriangle(-4 * k, -6 * k, 4 * k, -6 * k, 0, -16 * k);
      g.fillStyle(C.sky, 1);
      g.fillRect(-8 * k, 2 * k, 16 * k, 5 * k);
      break;
    case 'sand': // sandpaper block
      g.fillStyle(0xd9b98a, 1);
      g.fillRoundedRect(-15 * k, -9 * k, 30 * k, 18 * k, 3 * k);
      g.strokeRoundedRect(-15 * k, -9 * k, 30 * k, 18 * k, 3 * k);
      g.fillStyle(0x9a7b55, 1);
      for (let i = 0; i < 9; i++)
        g.fillCircle((-11 + (i % 3) * 11) * k, (-4 + Math.floor(i / 3) * 4) * k, 1.4 * k);
      break;
    case 'paint': // brush with paint tip
      g.fillStyle(0xb5773f, 1);
      g.fillRoundedRect(-3 * k, -2 * k, 6 * k, 18 * k, 2 * k);
      g.strokeRoundedRect(-3 * k, -2 * k, 6 * k, 18 * k, 2 * k);
      g.fillStyle(C.purple, 1);
      g.fillPoints(
        [V(-6 * k, -2 * k), V(6 * k, -2 * k), V(4 * k, -14 * k), V(0, -18 * k), V(-4 * k, -14 * k)],
        true,
      );
      g.strokePoints(
        [V(-6 * k, -2 * k), V(6 * k, -2 * k), V(4 * k, -14 * k), V(0, -18 * k), V(-4 * k, -14 * k)],
        true,
      );
      break;
    case 'polish': // cloth + sparkle
      g.fillStyle(C.sky, 1);
      g.fillRoundedRect(-14 * k, -4 * k, 20 * k, 16 * k, 6 * k);
      g.strokeRoundedRect(-14 * k, -4 * k, 20 * k, 16 * k, 6 * k);
      vStar(g, 10 * k, -10 * k, 8 * k, C.gold);
      break;
    case 'wire': // plug
      g.fillStyle(C.inkSoft, 1);
      g.fillRoundedRect(-10 * k, -6 * k, 20 * k, 14 * k, 4 * k);
      g.strokeRoundedRect(-10 * k, -6 * k, 20 * k, 14 * k, 4 * k);
      g.fillStyle(0xd0d4da, 1);
      g.fillRect(-6 * k, -14 * k, 4 * k, 8 * k);
      g.fillRect(2 * k, -14 * k, 4 * k, 8 * k);
      g.lineStyle(3 * k, C.mustard, 1);
      g.beginPath();
      g.moveTo(0, 8 * k);
      g.lineTo(0, 12 * k);
      g.lineTo(10 * k, 16 * k);
      g.strokePath();
      break;
    case 'fix': // spanner over a gear
      g.fillStyle(C.mustard, 1);
      g.fillCircle(6 * k, 6 * k, 9 * k);
      g.strokeCircle(6 * k, 6 * k, 9 * k);
      g.fillStyle(C.cream, 1);
      g.fillCircle(6 * k, 6 * k, 3.5 * k);
      g.fillStyle(0xc0cbdc, 1);
      g.fillPoints([V(-16 * k, 12 * k), V(-12 * k, 16 * k), V(6 * k, -2 * k), V(2 * k, -6 * k)], true);
      g.strokePoints([V(-16 * k, 12 * k), V(-12 * k, 16 * k), V(6 * k, -2 * k), V(2 * k, -6 * k)], true);
      g.fillCircle(6 * k, -8 * k, 7 * k);
      g.strokeCircle(6 * k, -8 * k, 7 * k);
      g.fillStyle(C.cream, 1);
      g.fillRect(4 * k, -16 * k, 5 * k, 8 * k);
      break;
  }
}

function v_iconCoin(g: Pen, s: number): void {
  vCoin(g, 0, 0, s * 0.42);
}

function v_iconStar(g: Pen, s: number, fill: number = C.gold): void {
  vStar(g, 0, 0, s * 0.45, fill);
}

function v_iconHeart(g: Pen, s: number): void {
  const k = s / 40;
  g.fillStyle(C.pink, 1);
  g.lineStyle(2.5 * k, C.ink, 1);
  g.beginPath();
  g.moveTo(0, 14 * k);
  g.lineTo(-15 * k, -1 * k);
  g.arc(-7.5 * k, -6 * k, 8.5 * k, Math.PI * 0.8, Math.PI * 1.95, false);
  g.arc(7.5 * k, -6 * k, 8.5 * k, Math.PI * 1.05, Math.PI * 0.2 + Math.PI * 2, false);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

function v_iconHome(g: Pen, s: number): void {
  const k = s / 40;
  g.fillStyle(C.white, 1);
  g.lineStyle(2.5 * k, C.ink, 1);
  const pts = [
    V(-14 * k, 0),
    V(0, -14 * k),
    V(14 * k, 0),
    V(10 * k, 0),
    V(10 * k, 14 * k),
    V(-10 * k, 14 * k),
    V(-10 * k, 0),
  ];
  g.fillPoints(pts, true);
  g.strokePoints(pts, true);
  g.fillStyle(C.terracotta, 1);
  g.fillRect(-3 * k, 5 * k, 6 * k, 9 * k);
}

function v_iconGift(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(C.pink, 1);
  g.fillRoundedRect(-14 * k, -4 * k, 28 * k, 18 * k, 3 * k);
  g.strokeRoundedRect(-14 * k, -4 * k, 28 * k, 18 * k, 3 * k);
  g.fillStyle(C.purple, 1);
  g.fillRoundedRect(-16 * k, -10 * k, 32 * k, 7 * k, 3 * k);
  g.strokeRoundedRect(-16 * k, -10 * k, 32 * k, 7 * k, 3 * k);
  g.fillStyle(C.gold, 1);
  g.fillRect(-3 * k, -10 * k, 6 * k, 24 * k);
  g.fillCircle(-6 * k, -14 * k, 5 * k);
  g.fillCircle(6 * k, -14 * k, 5 * k);
  g.strokeCircle(-6 * k, -14 * k, 5 * k);
  g.strokeCircle(6 * k, -14 * k, 5 * k);
}

/** "Play" triangle inside a TV-ish rounded rect: marks buttons that show an optional ad. */
function v_iconAd(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(C.white, 1);
  g.fillRoundedRect(-15 * k, -11 * k, 30 * k, 22 * k, 6 * k);
  g.strokeRoundedRect(-15 * k, -11 * k, 30 * k, 22 * k, 6 * k);
  g.fillStyle(C.leaf, 1);
  g.fillTriangle(-5 * k, -6 * k, -5 * k, 6 * k, 7 * k, 0);
  g.strokeTriangle(-5 * k, -6 * k, -5 * k, 6 * k, 7 * k, 0);
}

function v_iconArrow(g: Pen, s: number, dir: 1 | -1 = 1): void {
  const k = (s / 40) * dir;
  g.fillStyle(C.white, 1);
  g.lineStyle(2.5 * Math.abs(k), C.ink, 1);
  const pts = [
    V(-12 * k, -5 * Math.abs(k)),
    V(2 * k, -5 * Math.abs(k)),
    V(2 * k, -12 * Math.abs(k)),
    V(14 * k, 0),
    V(2 * k, 12 * Math.abs(k)),
    V(2 * k, 5 * Math.abs(k)),
    V(-12 * k, 5 * Math.abs(k)),
  ];
  g.fillPoints(pts, true);
  g.strokePoints(pts, true);
}

function v_iconBook(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(C.teal, 1);
  g.fillRoundedRect(-14 * k, -14 * k, 28 * k, 28 * k, 4 * k);
  g.strokeRoundedRect(-14 * k, -14 * k, 28 * k, 28 * k, 4 * k);
  g.fillStyle(C.white, 1);
  g.fillRect(-10 * k, -10 * k, 4 * k, 20 * k);
  vStar(g, 3 * k, 0, 7 * k, C.gold);
}

function v_iconTool(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(0xb9c0c8, 1);
  g.fillRoundedRect(-3 * k, -6 * k, 6 * k, 22 * k, 2 * k);
  g.strokeRoundedRect(-3 * k, -6 * k, 6 * k, 22 * k, 2 * k);
  g.fillStyle(C.terracotta, 1);
  g.fillRoundedRect(-12 * k, -16 * k, 24 * k, 10 * k, 3 * k);
  g.strokeRoundedRect(-12 * k, -16 * k, 24 * k, 10 * k, 3 * k);
}

function v_iconCalendar(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(C.white, 1);
  g.fillRoundedRect(-14 * k, -12 * k, 28 * k, 26 * k, 4 * k);
  g.strokeRoundedRect(-14 * k, -12 * k, 28 * k, 26 * k, 4 * k);
  g.fillStyle(C.terracotta, 1);
  g.fillRect(-14 * k, -12 * k, 28 * k, 8 * k);
  vStar(g, 0, 5 * k, 7 * k, C.gold);
}

function v_iconShopBag(g: Pen, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  g.fillStyle(C.mustard, 1);
  g.fillRoundedRect(-13 * k, -6 * k, 26 * k, 20 * k, 4 * k);
  g.strokeRoundedRect(-13 * k, -6 * k, 26 * k, 20 * k, 4 * k);
  g.beginPath();
  g.arc(0, -6 * k, 7 * k, Math.PI, 0, false);
  g.strokePath();
  vStar(g, 0, 4 * k, 6 * k, C.white);
}

function v_iconSparkle(g: Pen, s: number): void {
  vStar(g, 0, 0, s * 0.42, C.gold);
}

/** Icon size in pixels for an on-screen size (about 3 logical units per art pixel). */
const gridFor = (s: number) => Math.max(12, Math.min(20, Math.round(s / 3)));

export function drawStepIcon(g: G, kind: StepKind, s: number): void {
  pixelDraw(g, `drawStepIcon|${kind}`, { grid: gridFor(s), extent: 40, size: s }, (p) =>
    v_drawStepIcon(p, kind, 40),
  );
}

export function iconCoin(g: G, s: number): void {
  pixelDraw(g, `iconCoin`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconCoin(p, 40));
}

export function iconStar(g: G, s: number, fill: number = C.gold): void {
  pixelDraw(g, `iconStar|${fill}`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconStar(p, 40, fill));
}

export function iconHeart(g: G, s: number): void {
  pixelDraw(g, `iconHeart`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconHeart(p, 40));
}

export function iconHome(g: G, s: number): void {
  pixelDraw(g, `iconHome`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconHome(p, 40));
}

export function iconGift(g: G, s: number): void {
  pixelDraw(g, `iconGift`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconGift(p, 40));
}

export function iconAd(g: G, s: number): void {
  pixelDraw(g, `iconAd`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconAd(p, 40));
}

export function iconArrow(g: G, s: number, dir: 1 | -1 = 1): void {
  pixelDraw(g, `iconArrow|${dir}`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconArrow(p, 40, dir));
}

export function iconBook(g: G, s: number): void {
  pixelDraw(g, `iconBook`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconBook(p, 40));
}

export function iconTool(g: G, s: number): void {
  pixelDraw(g, `iconTool`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconTool(p, 40));
}

export function iconCalendar(g: G, s: number): void {
  pixelDraw(g, `iconCalendar`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconCalendar(p, 40));
}

export function iconShopBag(g: G, s: number): void {
  pixelDraw(g, `iconShopBag`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconShopBag(p, 40));
}

export function iconSparkle(g: G, s: number): void {
  pixelDraw(g, `iconSparkle`, { grid: gridFor(s), extent: 40, size: s }, (p) => v_iconSparkle(p, 40));
}

/** Workshop signs: a toolbox (Repair Shop), a computer (Computer Workshop), a car (Car Garage). */
function v_iconWorkshop(g: Pen, id: string, s: number): void {
  const k = s / 40;
  g.lineStyle(2.5 * k, C.ink, 1);
  if (id === 'computer') {
    g.fillStyle(0xd9d4c4, 1);
    g.fillRoundedRect(-17 * k, -15 * k, 34 * k, 24 * k, 3 * k);
    g.strokeRoundedRect(-17 * k, -15 * k, 34 * k, 24 * k, 3 * k);
    g.fillStyle(C.teal, 1);
    g.fillRect(-13 * k, -11 * k, 26 * k, 16 * k);
    g.fillStyle(C.tealLight, 1);
    g.fillRect(-10 * k, -8 * k, 8 * k, 3 * k);
    g.fillStyle(0xd9d4c4, 1);
    g.fillRect(-4 * k, 9 * k, 8 * k, 5 * k);
    g.fillRoundedRect(-12 * k, 13 * k, 24 * k, 5 * k, 2 * k);
    g.strokeRoundedRect(-12 * k, 13 * k, 24 * k, 5 * k, 2 * k);
  } else if (id === 'garage') {
    g.fillStyle(C.terracotta, 1);
    g.fillPoints(
      [
        V(-18 * k, 8 * k),
        V(-18 * k, -1 * k),
        V(-9 * k, -3 * k),
        V(-4 * k, -11 * k),
        V(8 * k, -11 * k),
        V(13 * k, -3 * k),
        V(18 * k, -1 * k),
        V(18 * k, 8 * k),
      ],
      true,
    );
    g.strokePoints(
      [
        V(-18 * k, 8 * k),
        V(-18 * k, -1 * k),
        V(-9 * k, -3 * k),
        V(-4 * k, -11 * k),
        V(8 * k, -11 * k),
        V(13 * k, -3 * k),
        V(18 * k, -1 * k),
        V(18 * k, 8 * k),
      ],
      true,
    );
    g.fillStyle(C.tealLight, 1);
    g.fillPoints([V(-6 * k, -3 * k), V(-2 * k, -8 * k), V(6 * k, -8 * k), V(9 * k, -3 * k)], true);
    g.fillStyle(C.ink, 1);
    g.fillCircle(-10 * k, 9 * k, 6 * k);
    g.fillCircle(10 * k, 9 * k, 6 * k);
    g.fillStyle(0xc0cbdc, 1);
    g.fillCircle(-10 * k, 9 * k, 2.5 * k);
    g.fillCircle(10 * k, 9 * k, 2.5 * k);
  } else {
    g.fillStyle(C.terracotta, 1);
    g.fillRoundedRect(-17 * k, -6 * k, 34 * k, 22 * k, 3 * k);
    g.strokeRoundedRect(-17 * k, -6 * k, 34 * k, 22 * k, 3 * k);
    g.fillStyle(C.terracottaDark, 1);
    g.fillRect(-17 * k, 1 * k, 34 * k, 4 * k);
    g.beginPath();
    g.moveTo(-8 * k, -6 * k);
    g.lineTo(-8 * k, -13 * k);
    g.lineTo(8 * k, -13 * k);
    g.lineTo(8 * k, -6 * k);
    g.strokePath();
    g.fillStyle(C.mustard, 1);
    g.fillRect(-3 * k, 0, 6 * k, 6 * k);
    g.strokeRect(-3 * k, 0, 6 * k, 6 * k);
  }
}

export function iconWorkshop(g: G, id: string, s: number): void {
  pixelDraw(g, `iconWorkshop|${id}`, { grid: gridFor(s), extent: 40, size: s }, (p) =>
    v_iconWorkshop(p, id, 40),
  );
}
