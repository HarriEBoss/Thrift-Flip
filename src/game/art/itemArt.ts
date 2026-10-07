/**
 * Item art: layered vector parts (src/data/categories.json) rendered with Canvas 2D into textures.
 * The same part data drives the silhouette masks used by the restoration mini-games.
 * Replaceable: assets/manifest.json can map an item id to a hand-made image instead (see ARCHITECTURE.md).
 */
import { BALANCE, ITEMS, category, paletteHex } from '../../core/data';
import type { ColorToken, ItemArchetype, Part } from '../../core/types';
import { addOutline, addRims, bitmapCanvas, modeDownsample } from './pixel';

export const FIXED: Record<Exclude<ColorToken, 'B' | 'A' | 'S' | 'H'>, string> = {
  K: '#2a1f3d',
  M: '#c0cbdc',
  W: '#be6f3a',
  G: '#c8f4ff',
  L: '#fffbea',
  Y: '#fee761',
  R: '#e43b44',
};

const OUTLINE = '#2a1f3d';

/** Hand-made art overrides loaded from assets/manifest.json (item id -> image). */
const overrides = new Map<string, CanvasImageSource>();

export function registerArtOverride(id: string, img: CanvasImageSource): void {
  overrides.set(id, img);
}

export interface Colors {
  body: string;
  accent: string;
}

/** Colour-blind-friendly (Okabe-Ito based) replacements for the paint colours. */
const CB_HEX: Record<string, string> = {
  red: '#d55e00',
  orange: '#e69f00',
  yellow: '#f0e442',
  green: '#009e73',
  teal: '#56b4e9',
  blue: '#0072b2',
  purple: '#cc79a7',
  pink: '#f5b7d3',
};
let cbMode = false;
export function setColorBlindMode(on: boolean): void {
  cbMode = on;
}
export function displayHex(id: string): string {
  return (cbMode && CB_HEX[id]) || paletteHex(id);
}

export function colorsFor(arch: ItemArchetype, paint?: string): Colors {
  return { body: displayHex(paint || arch.body), accent: displayHex(arch.accent) };
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt < 0) {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  } else {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function resolve(c: ColorToken, cols: Colors): string {
  switch (c) {
    case 'B':
      return cols.body;
    case 'A':
      return cols.accent;
    case 'S':
      return shade(cols.body, -0.22);
    case 'H':
      return shade(cols.body, 0.35);
    default:
      return FIXED[c];
  }
}

export function partsFor(arch: ItemArchetype): Part[] {
  return category(arch.cat).shapes[arch.shape];
}

/** Maps the 100x100 part space into a square canvas region with a margin. */
export interface ArtBox {
  x: number;
  y: number;
  size: number;
}

function tracePart(ctx: CanvasRenderingContext2D, p: Part, k: number, ox: number, oy: number): void {
  ctx.beginPath();
  switch (p.t) {
    case 'r': {
      const r = Math.min((p.r ?? 0) * k, (p.w * k) / 2, (p.h * k) / 2);
      roundRect(ctx, ox + p.x * k, oy + p.y * k, p.w * k, p.h * k, r);
      break;
    }
    case 'e':
      ctx.ellipse(
        ox + p.x * k,
        oy + p.y * k,
        Math.max(0.1, p.rx * k),
        Math.max(0.1, p.ry * k),
        0,
        0,
        Math.PI * 2,
      );
      break;
    case 'p':
      for (let i = 0; i < p.pts.length; i += 2) {
        const x = ox + p.pts[i] * k;
        const y = oy + p.pts[i + 1] * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'l':
      for (let i = 0; i < p.pts.length; i += 2) {
        const x = ox + p.pts[i] * k;
        const y = oy + p.pts[i + 1] * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      break;
    case 'a':
      ctx.arc(ox + p.x * k, oy + p.y * k, p.r * k, (p.a0 * Math.PI) / 180, (p.a1 * Math.PI) / 180);
      break;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Item sprites are this many pixels across (the 100x100 part space maps onto it). */
export const SPRITE = 56;

const sprites = new Map<string, HTMLCanvasElement>();

/** The item as pixel art: SPRITE x SPRITE canvas (cached). */
function itemSprite(
  arch: ItemArchetype,
  mode: 'color' | 'mask',
  paint: string | undefined,
  shadow: boolean,
): HTMLCanvasElement {
  const key = `${arch.id}|${mode}|${paint ?? ''}|${shadow ? 1 : 0}|${cbMode ? 1 : 0}|${overrides.has(arch.id) ? 1 : 0}`;
  const hit = sprites.get(key);
  if (hit) {
    sprites.delete(key);
    sprites.set(key, hit);
    return hit;
  }
  let out: HTMLCanvasElement;
  if (mode === 'mask') {
    // The mask is exactly the coloured sprite's footprint, so masks and art always line up.
    out = makeCanvas(SPRITE);
    const x = ctx2d(out);
    x.drawImage(itemSprite(arch, 'color', paint, false), 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, SPRITE, SPRITE);
  } else {
    const big = makeCanvas(SPRITE * 4);
    const bx = big.getContext('2d', { willReadFrequently: true })!;
    drawItemVector(bx, arch, { x: 0, y: 0, size: SPRITE * 4 }, { paint, shadow: false });
    const bmp = modeDownsample(bx.getImageData(0, 0, big.width, big.height), SPRITE, SPRITE, 4);
    releaseCanvas(big);
    addRims(bmp);
    addOutline(bmp);
    if (shadow) {
      // Hard-edged pixel shadow under the item (only where the item is not).
      const cx = SPRITE * 0.5;
      const cy = SPRITE * 0.95;
      const rx = SPRITE * 0.34;
      const ry = Math.max(1.5, SPRITE * 0.045);
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          if (x < 0 || y < 0 || x >= SPRITE || y >= SPRITE) continue;
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy > 1) continue;
          const i = (y * SPRITE + x) * 4;
          if (bmp.data[i + 3] > 0) continue;
          bmp.data[i] = 42;
          bmp.data[i + 1] = 31;
          bmp.data[i + 2] = 61;
          bmp.data[i + 3] = 56;
        }
      }
    }
    out = bitmapCanvas(bmp);
  }
  sprites.set(key, out);
  if (sprites.size > 400) {
    const old = sprites.keys().next().value as string;
    releaseCanvas(sprites.get(old));
    sprites.delete(old);
  }
  return out;
}

/**
 * Draws an item as pixel art, scaled with hard pixel edges into `box`. `mode`:
 *  - 'color': full art with outlines, light/shadow rims and a pixel drop shadow
 *  - 'mask':  solid white silhouette (for compositing / coverage masks)
 */
export function drawItem(
  ctx: CanvasRenderingContext2D,
  arch: ItemArchetype,
  box: ArtBox,
  opts: { mode?: 'color' | 'mask'; paint?: string; shadow?: boolean } = {},
): void {
  const mode = opts.mode ?? 'color';
  const sprite = itemSprite(arch, mode, opts.paint, mode === 'color' && opts.shadow !== false);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, box.x, box.y, box.size, box.size);
  ctx.restore();
}

/** The vector source art (rendered large, then turned into pixels by {@link itemSprite}). */
function drawItemVector(
  ctx: CanvasRenderingContext2D,
  arch: ItemArchetype,
  box: ArtBox,
  opts: { mode?: 'color' | 'mask'; paint?: string; shadow?: boolean } = {},
): void {
  const mode = opts.mode ?? 'color';
  const override = overrides.get(arch.id);
  if (override) {
    ctx.save();
    ctx.drawImage(override, box.x, box.y, box.size, box.size);
    if (mode === 'mask') {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(box.x, box.y, box.size, box.size);
    } else if (opts.paint) {
      // Repaint: multiply the paint colour over the art, keep its alpha.
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = displayHex(opts.paint);
      ctx.fillRect(box.x, box.y, box.size, box.size);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(override, box.x, box.y, box.size, box.size);
    }
    ctx.restore();
    return;
  }
  const parts = partsFor(arch);
  const k = box.size / 100;
  const cols = colorsFor(arch, opts.paint);
  const ox = box.x;
  const oy = box.y;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (mode === 'color' && opts.shadow !== false) {
    ctx.fillStyle = 'rgba(42,31,61,0.18)';
    ctx.beginPath();
    ctx.ellipse(ox + 50 * k, oy + 95 * k, 34 * k, 4.5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of parts) {
    tracePart(ctx, p, k, ox, oy);
    if (p.t === 'l' || p.t === 'a') {
      if (mode === 'mask') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (p.w + 3) * k;
        ctx.stroke();
      } else {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = (p.w + 3) * k;
        ctx.stroke();
        ctx.strokeStyle = resolve(p.c, cols);
        ctx.lineWidth = p.w * k;
        ctx.stroke();
      }
      continue;
    }
    if (mode === 'mask') {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.6 * k;
      ctx.stroke();
    } else {
      ctx.fillStyle = resolve(p.c, cols);
      ctx.fill();
      if (p.o !== 0) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.6 * k;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Standard square art box inside a canvas of `size` px (7% margin, whole pixels). */
export function boxFor(size: number): ArtBox {
  const m = Math.round(size * 0.07);
  return { x: m, y: m, size: size - 2 * m };
}

export function makeCanvas(w: number, h: number = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Frees a canvas's pixel memory now. iOS Safari counts canvas memory until garbage collection and
 * refuses new canvases past its limit, so canvases we are done with are shrunk to 0x0 straight away.
 */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d', { willReadFrequently: false });
  if (!x) throw new Error('2D canvas unavailable');
  return x;
}

/** A silhouette canvas (white on transparent). */
export function silhouette(arch: ItemArchetype, size: number): HTMLCanvasElement {
  const c = makeCanvas(size);
  drawItem(ctx2d(c), arch, boxFor(size), { mode: 'mask' });
  return c;
}

export function archetypeByIndex(a: number): ItemArchetype {
  return ITEMS[a];
}

export const PAINT_COLORS = BALANCE.paintColors;
