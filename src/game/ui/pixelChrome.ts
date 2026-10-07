import Phaser from 'phaser';
import { PX } from '../theme';

type Radius = number | { tl?: number; tr?: number; bl?: number; br?: number };

/** How many pixel "stairs" a rounded corner of radius r becomes. */
function stairs(r: Radius | undefined, w: number, h: number, p: number): number {
  const v =
    r === undefined ? 20 : typeof r === 'number' ? r : Math.max(r.tl ?? 0, r.tr ?? 0, r.bl ?? 0, r.br ?? 0);
  const n = v <= 0 ? 0 : v < 10 ? 1 : v < 22 ? 2 : 3;
  return Math.max(0, Math.min(n, Math.floor(Math.min(w, h) / (2 * p))));
}

/** Outline of a rectangle whose corners are cut into pixel stairs (clockwise). */
export function steppedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r?: Radius,
  p = PX,
): Array<{ x: number; y: number }> {
  const n = stairs(r, w, h, p);
  if (n === 0)
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  // Top-right corner template, relative to the corner point, then rotated for the others.
  const t: Array<[number, number]> = [[-n * p, 0]];
  for (let k = n; k >= 1; k--) {
    t.push([-k * p, (n - k + 1) * p]);
    t.push([-(k - 1) * p, (n - k + 1) * p]);
  }
  const rot = (v: [number, number]): [number, number] => [-v[1], v[0]];
  const corners: Array<[number, number]> = [
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  const out: Array<{ x: number; y: number }> = [];
  let tmpl = t;
  for (const [cx, cy] of corners) {
    for (const [dx, dy] of tmpl) out.push({ x: cx + dx, y: cy + dy });
    tmpl = tmpl.map(rot);
  }
  return out;
}

let installed = false;

/**
 * Pixel-art UI chrome: every rounded rectangle drawn with Phaser Graphics (cards, buttons, bars,
 * bubbles, badges) gets stepped pixel corners instead of smooth curves. Installed once at boot.
 */
export function installPixelChrome(): void {
  if (installed) return;
  installed = true;
  const G = Phaser.GameObjects.Graphics.prototype as unknown as {
    fillRoundedRect(x: number, y: number, w: number, h: number, r?: Radius): unknown;
    strokeRoundedRect(x: number, y: number, w: number, h: number, r?: Radius): unknown;
    fillPoints(pts: Array<{ x: number; y: number }>, close?: boolean): unknown;
    strokePoints(pts: Array<{ x: number; y: number }>, close?: boolean, closePath?: boolean): unknown;
  };
  G.fillRoundedRect = function (this: typeof G, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return this;
    this.fillPoints(steppedRect(x, y, w, h, r), true);
    return this;
  };
  G.strokeRoundedRect = function (this: typeof G, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return this;
    this.strokePoints(steppedRect(x, y, w, h, r), true, true);
    return this;
  };
}
