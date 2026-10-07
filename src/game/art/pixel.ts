/**
 * Pixel-art pipeline. All art is still described as simple vector shapes (easy to author and to
 * replace), but it is *shown* as pixel art:
 *
 * 1. the shapes are drawn into a small canvas at 4x the target pixel grid,
 * 2. each 4x4 block becomes one pixel using its most common colour (no muddy blends),
 * 3. a 1-pixel ink outline and light/shadow rims are added,
 * 4. the result is either blitted with nearest-neighbour scaling (Canvas 2D) or emitted as solid
 *    rectangles into a Phaser Graphics object (UI icons, characters, decorations).
 *
 * Bitmaps are cached, so each piece of art is rasterised once.
 */
import Phaser from 'phaser';
import { C } from '../theme';

/** The subset of Phaser's Graphics API our vector art uses; implemented for Canvas 2D below. */
export interface Pen {
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  fillRoundedRect(x: number, y: number, w: number, h: number, r?: number | RadiusObj): unknown;
  strokeRoundedRect(x: number, y: number, w: number, h: number, r?: number | RadiusObj): unknown;
  fillCircle(x: number, y: number, r: number): unknown;
  strokeCircle(x: number, y: number, r: number): unknown;
  fillEllipse(x: number, y: number, w: number, h: number): unknown;
  strokeEllipse(x: number, y: number, w: number, h: number): unknown;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
  fillPoints(pts: Array<{ x: number; y: number }>, close?: boolean): unknown;
  strokePoints(pts: Array<{ x: number; y: number }>, close?: boolean, closePath?: boolean): unknown;
  lineBetween(x0: number, y0: number, x1: number, y1: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  arc(x: number, y: number, r: number, a0: number, a1: number, anticlockwise?: boolean): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  strokePath(): unknown;
}

type RadiusObj = { tl?: number; tr?: number; bl?: number; br?: number };

const rgba = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Canvas 2D implementation of {@link Pen}. */
export class CanvasPen implements Pen {
  constructor(private x: CanvasRenderingContext2D) {
    x.lineJoin = 'round';
    x.lineCap = 'round';
  }
  fillStyle(color: number, alpha = 1): this {
    this.x.fillStyle = rgba(color, alpha);
    return this;
  }
  lineStyle(width: number, color: number, alpha = 1): this {
    this.x.lineWidth = width;
    this.x.strokeStyle = rgba(color, alpha);
    return this;
  }
  fillRect(x: number, y: number, w: number, h: number): this {
    this.x.fillRect(x, y, w, h);
    return this;
  }
  strokeRect(x: number, y: number, w: number, h: number): this {
    this.x.strokeRect(x, y, w, h);
    return this;
  }
  private rr(x: number, y: number, w: number, h: number, r: number | RadiusObj = 20): void {
    const o = typeof r === 'number' ? { tl: r, tr: r, bl: r, br: r } : r;
    const lim = Math.min(w, h) / 2;
    const tl = Math.min(o.tl ?? 0, lim);
    const tr = Math.min(o.tr ?? 0, lim);
    const bl = Math.min(o.bl ?? 0, lim);
    const br = Math.min(o.br ?? 0, lim);
    const c = this.x;
    c.beginPath();
    c.moveTo(x + tl, y);
    c.lineTo(x + w - tr, y);
    c.arcTo(x + w, y, x + w, y + tr, tr);
    c.lineTo(x + w, y + h - br);
    c.arcTo(x + w, y + h, x + w - br, y + h, br);
    c.lineTo(x + bl, y + h);
    c.arcTo(x, y + h, x, y + h - bl, bl);
    c.lineTo(x, y + tl);
    c.arcTo(x, y, x + tl, y, tl);
    c.closePath();
  }
  fillRoundedRect(x: number, y: number, w: number, h: number, r?: number | RadiusObj): this {
    this.rr(x, y, w, h, r);
    this.x.fill();
    return this;
  }
  strokeRoundedRect(x: number, y: number, w: number, h: number, r?: number | RadiusObj): this {
    this.rr(x, y, w, h, r);
    this.x.stroke();
    return this;
  }
  fillCircle(x: number, y: number, r: number): this {
    this.x.beginPath();
    this.x.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
    this.x.fill();
    return this;
  }
  strokeCircle(x: number, y: number, r: number): this {
    this.x.beginPath();
    this.x.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
    this.x.stroke();
    return this;
  }
  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.x.beginPath();
    this.x.ellipse(x, y, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, Math.PI * 2);
    this.x.fill();
    return this;
  }
  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.x.beginPath();
    this.x.ellipse(x, y, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, Math.PI * 2);
    this.x.stroke();
    return this;
  }
  private tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
    this.x.beginPath();
    this.x.moveTo(x0, y0);
    this.x.lineTo(x1, y1);
    this.x.lineTo(x2, y2);
    this.x.closePath();
  }
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.tri(x0, y0, x1, y1, x2, y2);
    this.x.fill();
    return this;
  }
  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.tri(x0, y0, x1, y1, x2, y2);
    this.x.stroke();
    return this;
  }
  private poly(pts: Array<{ x: number; y: number }>, close: boolean): void {
    this.x.beginPath();
    pts.forEach((p, i) => (i === 0 ? this.x.moveTo(p.x, p.y) : this.x.lineTo(p.x, p.y)));
    if (close) this.x.closePath();
  }
  fillPoints(pts: Array<{ x: number; y: number }>): this {
    this.poly(pts, true);
    this.x.fill();
    return this;
  }
  strokePoints(pts: Array<{ x: number; y: number }>, close = false, closePath = false): this {
    this.poly(pts, close || closePath);
    this.x.stroke();
    return this;
  }
  lineBetween(x0: number, y0: number, x1: number, y1: number): this {
    this.x.beginPath();
    this.x.moveTo(x0, y0);
    this.x.lineTo(x1, y1);
    this.x.stroke();
    return this;
  }
  beginPath(): this {
    this.x.beginPath();
    return this;
  }
  moveTo(x: number, y: number): this {
    this.x.moveTo(x, y);
    return this;
  }
  lineTo(x: number, y: number): this {
    this.x.lineTo(x, y);
    return this;
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, anticlockwise = false): this {
    this.x.arc(x, y, r, a0, a1, anticlockwise);
    return this;
  }
  closePath(): this {
    this.x.closePath();
    return this;
  }
  fillPath(): this {
    this.x.fill();
    return this;
  }
  strokePath(): this {
    this.x.stroke();
    return this;
  }
}

/** A small RGBA bitmap (one entry per art pixel). */
export interface Bitmap {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export const INK = C.ink;
const SS = 4;

/** Most-common-colour downsample of an SS-times supersampled canvas region into a bitmap. */
export function modeDownsample(src: ImageData, w: number, h: number, ss = SS): Bitmap {
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = src.width;
  const d = src.data;
  const counts = new Map<number, number>();
  const half = (ss * ss) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.clear();
      let opaque = 0;
      let best = 0;
      let bestN = 0;
      let alphaSum = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * sw + (x * ss + sx)) * 4;
          const a = d[i + 3];
          if (a < 110) continue;
          opaque++;
          alphaSum += a;
          // 5 bits per channel is plenty to tell colours apart and merges anti-aliasing noise.
          const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          if (n > bestN) {
            bestN = n;
            best = i;
          }
        }
      }
      if (opaque < half) continue;
      const o = (y * w + x) * 4;
      out[o] = d[best];
      out[o + 1] = d[best + 1];
      out[o + 2] = d[best + 2];
      out[o + 3] = alphaSum / opaque > 200 ? 255 : Math.round(alphaSum / opaque);
    }
  }
  return { w, h, data: out };
}

const lum = (d: Uint8ClampedArray, i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;

/**
 * Adds a 1-pixel outline in transparent pixels that touch a coloured (not already dark) pixel, so
 * art that already has an ink outline does not get a double one.
 */
export function addOutline(b: Bitmap, color = INK): void {
  const { w, h, data } = b;
  const src = data.slice();
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const bl = color & 255;
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    return src[i + 3] > 127 && lum(src, i) >= 70;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 127) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = bl;
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Light from the top: the top pixel row of each colour area gets a highlight and the bottom row a
 * shadow, which gives flat shapes a chunky, sculpted pixel-art look. Dark (ink) pixels are left alone.
 */
export function addRims(b: Bitmap, light = 0.32, dark = 0.2): void {
  const { w, h, data } = b;
  const src = data.slice();
  const same = (i: number, j: number) =>
    src[j + 3] > 127 && src[i] === src[j] && src[i + 1] === src[j + 1] && src[i + 2] === src[j + 2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 128 || lum(src, i) < 70) continue;
      const up = y > 0 ? i - w * 4 : -1;
      const down = y < h - 1 ? i + w * 4 : -1;
      const down2 = y < h - 2 ? i + w * 8 : -1;
      const upSame = up >= 0 && same(i, up);
      const downSame = down >= 0 && same(i, down);
      if (!upSame && downSame && down2 >= 0 && same(i, down2)) {
        for (let c = 0; c < 3; c++) data[i + c] = src[i + c] + (255 - src[i + c]) * light;
      } else if (!downSame && upSame) {
        for (let c = 0; c < 3; c++) data[i + c] = src[i + c] * (1 - dark);
      }
    }
  }
}

/** Snaps alpha to hard steps so soft canvas drawing reads as pixel art. */
export function crispenAlpha(data: Uint8ClampedArray, steps: number[] = [0, 150, 255]): void {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    let best = steps[0];
    for (const s of steps) if (Math.abs(s - a) < Math.abs(best - a)) best = s;
    data[i] = best;
  }
}

/**
 * Rasterises vector drawing into a pixel bitmap.
 * `draw` works in world units; the region `extent` x `extent` centred on (cx, cy) becomes `grid` pixels.
 */
export function rasterize(
  grid: number,
  extent: number,
  draw: (pen: Pen) => void,
  opts: {
    cx?: number;
    cy?: number;
    outline?: boolean;
    rims?: boolean;
    gridH?: number;
    extentH?: number;
  } = {},
): Bitmap {
  const gw = grid;
  const gh = opts.gridH ?? grid;
  const eh = opts.extentH ?? extent;
  const c = document.createElement('canvas');
  c.width = gw * SS;
  c.height = gh * SS;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.save();
  x.scale((gw * SS) / extent, (gh * SS) / eh);
  x.translate(extent / 2 - (opts.cx ?? 0), eh / 2 - (opts.cy ?? 0));
  draw(new CanvasPen(x));
  x.restore();
  const bmp = modeDownsample(x.getImageData(0, 0, c.width, c.height), gw, gh);
  c.width = 0;
  c.height = 0;
  if (opts.rims !== false) addRims(bmp);
  if (opts.outline !== false) addOutline(bmp);
  return bmp;
}

/** Bitmap -> canvas at 1 pixel per art pixel. */
export function bitmapCanvas(b: Bitmap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(b.w, b.h);
  img.data.set(b.data);
  x.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Pixel art into Phaser Graphics (keeps every call site that draws into a Graphics unchanged).

const cache = new Map<string, Bitmap>();
const MAX_CACHE = 600;

function cached(key: string, make: () => Bitmap): Bitmap {
  let b = cache.get(key);
  if (b) {
    cache.delete(key);
    cache.set(key, b);
    return b;
  }
  b = make();
  cache.set(key, b);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
  return b;
}

/**
 * Draws pixel art into a Graphics object as solid rectangles (one per horizontal run of equal
 * pixels). `size` is the on-screen size (logical units) of the `extent` region; the art is centred
 * on (ox, oy).
 */
export function pixelDraw(
  g: Pick<Phaser.GameObjects.Graphics, 'fillStyle' | 'fillRect'>,
  key: string,
  opts: {
    grid: number;
    extent: number;
    size: number;
    cx?: number;
    cy?: number;
    ox?: number;
    oy?: number;
    outline?: boolean;
    rims?: boolean;
  },
  draw: (pen: Pen) => void,
): void {
  const b = cached(`${key}|${opts.grid}|${opts.extent}`, () =>
    rasterize(opts.grid, opts.extent, draw, {
      cx: opts.cx,
      cy: opts.cy,
      outline: opts.outline,
      rims: opts.rims,
    }),
  );
  blitRuns(g, b, (opts.ox ?? 0) - opts.size / 2, (opts.oy ?? 0) - opts.size / 2, opts.size / b.w);
}

/** Emits a bitmap as fillRects of size `px`, top-left at (x0, y0). */
export function blitRuns(
  g: Pick<Phaser.GameObjects.Graphics, 'fillStyle' | 'fillRect'>,
  b: Bitmap,
  x0: number,
  y0: number,
  px: number,
): void {
  const { w, h, data } = b;
  // A hair of overlap hides seams between neighbouring rectangles at fractional positions.
  const eps = Math.min(0.6, px * 0.08);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a === 0) {
        x++;
        continue;
      }
      const col = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let run = 1;
      while (x + run < w) {
        const j = (y * w + x + run) * 4;
        if (data[j + 3] !== a || ((data[j] << 16) | (data[j + 1] << 8) | data[j + 2]) !== col) break;
        run++;
      }
      g.fillStyle(col, a / 255);
      const o = a === 255 ? eps : 0;
      g.fillRect(x0 + x * px, y0 + y * px, run * px + o, px + o);
      x += run;
    }
  }
}

/** Adds a canvas as a texture that is drawn with hard pixel edges (nearest-neighbour). */
export function addPixelCanvas(
  tm: Phaser.Textures.TextureManager,
  key: string,
  canvas: HTMLCanvasElement,
): Phaser.Textures.CanvasTexture {
  const tex = tm.addCanvas(key, canvas)!;
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return tex;
}
