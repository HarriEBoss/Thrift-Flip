/**
 * Item art: layered vector parts (src/data/categories.json) rendered with Canvas 2D into textures.
 * The same part data drives the silhouette masks used by the restoration mini-games.
 * Replaceable: assets/manifest.json can map an item id to a hand-made image instead (see ARCHITECTURE.md).
 */
import { BALANCE, ITEMS, category, paletteHex } from '../../core/data';
import type { ColorToken, ItemArchetype, Part } from '../../core/types';

export const FIXED: Record<Exclude<ColorToken, 'B' | 'A' | 'S' | 'H'>, string> = {
  K: '#2a1f3d',
  M: '#c0cbdc',
  W: '#b8723f',
  G: '#c8f4ff',
  L: '#fffbea',
  Y: '#fee761',
  R: '#e43b44',
};

/** Outline width (in 100-unit part space): thin, like a real edge rather than a cartoon line. */
const EDGE = 1.7;

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

/**
 * Draws an item. `mode`:
 *  - 'color': full art with ink outlines and a soft drop shadow
 *  - 'mask':  solid white silhouette (for compositing / coverage masks)
 */
export function drawItem(
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
    // Soft contact shadow: a radial gradient squashed into an ellipse.
    ctx.save();
    ctx.translate(ox + 50 * k, oy + 95 * k);
    ctx.scale(1, 0.16);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 38 * k);
    sh.addColorStop(0, 'rgba(42,31,61,0.34)');
    sh.addColorStop(0.6, 'rgba(42,31,61,0.16)');
    sh.addColorStop(1, 'rgba(42,31,61,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, 38 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const p of parts) {
    tracePart(ctx, p, k, ox, oy);
    if (p.t === 'l' || p.t === 'a') {
      const w = (p.w + EDGE) * k;
      if (mode === 'mask') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w;
        ctx.stroke();
      } else {
        // Tube look: dark edge, colour, then a thin highlight along the top.
        const col = resolve(p.c, cols);
        ctx.strokeStyle = shade(col, -0.55);
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = p.w * k;
        ctx.stroke();
        ctx.save();
        ctx.translate(-0.18 * p.w * k, -0.22 * p.w * k);
        tracePart(ctx, p, k, ox, oy);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.6, p.w * k * 0.3);
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    if (mode === 'mask') {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = EDGE * k;
      ctx.stroke();
    } else {
      const col = resolve(p.c, cols);
      ctx.fillStyle = col;
      ctx.fill();
      shadePart(ctx, p, k, ox, oy, p.c === 'G' || p.c === 'M');
      if (p.o !== 0) {
        tracePart(ctx, p, k, ox, oy);
        ctx.strokeStyle = shade(col, -0.6);
        ctx.lineWidth = EDGE * k;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Bounding box of a filled part in canvas pixels. */
function partBox(p: Part, k: number, ox: number, oy: number): { x: number; y: number; w: number; h: number } {
  switch (p.t) {
    case 'r':
      return { x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k };
    case 'e':
      return { x: ox + (p.x - p.rx) * k, y: oy + (p.y - p.ry) * k, w: 2 * p.rx * k, h: 2 * p.ry * k };
    case 'p': {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < p.pts.length; i += 2) {
        x0 = Math.min(x0, p.pts[i]);
        x1 = Math.max(x1, p.pts[i]);
        y0 = Math.min(y0, p.pts[i + 1]);
        y1 = Math.max(y1, p.pts[i + 1]);
      }
      return { x: ox + x0 * k, y: oy + y0 * k, w: (x1 - x0) * k, h: (y1 - y0) * k };
    }
    default:
      return { x: ox, y: oy, w: 0, h: 0 };
  }
}

/**
 * Soft lighting on a filled part (clipped to its shape): light from the top-left gives it volume,
 * the bottom falls into shade, and glossy parts (glass, metal) get a bright specular spot.
 */
function shadePart(
  ctx: CanvasRenderingContext2D,
  p: Part,
  k: number,
  ox: number,
  oy: number,
  glossy: boolean,
): void {
  const b = partBox(p, k, ox, oy);
  if (b.w < 1 || b.h < 1) return;
  ctx.save();
  tracePart(ctx, p, k, ox, oy);
  ctx.clip();
  const r = Math.max(b.w, b.h);
  const light = ctx.createRadialGradient(
    b.x + b.w * 0.3,
    b.y + b.h * 0.22,
    0,
    b.x + b.w * 0.45,
    b.y + b.h * 0.45,
    r * 0.85,
  );
  light.addColorStop(0, 'rgba(255,255,255,0.32)');
  light.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  light.addColorStop(0.8, 'rgba(20,10,40,0.12)');
  light.addColorStop(1, 'rgba(20,10,40,0.26)');
  ctx.fillStyle = light;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  const fall = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  fall.addColorStop(0, 'rgba(255,255,255,0.10)');
  fall.addColorStop(0.55, 'rgba(0,0,0,0)');
  fall.addColorStop(1, 'rgba(20,10,40,0.18)');
  ctx.fillStyle = fall;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  if ((glossy || p.t === 'e') && b.w > 6 * k && b.h > 6 * k) {
    const hx = b.x + b.w * 0.3;
    const hy = b.y + b.h * 0.24;
    const hr = Math.min(b.w, b.h) * (glossy ? 0.22 : 0.16);
    const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    spec.addColorStop(0, `rgba(255,255,255,${glossy ? 0.8 : 0.45})`);
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
  }
  ctx.restore();
}

/** Standard square art box inside a canvas of `size` px (7% margin). */
export function boxFor(size: number): ArtBox {
  const m = size * 0.07;
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
