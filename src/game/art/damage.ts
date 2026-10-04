/**
 * Procedural damage layers, generated per item instance with the seeded PRNG.
 * Each layer is a Canvas 2D drawing clipped to the item silhouette.
 */
import { Rng, hashSeed } from '../../core/prng';
import { GRID, CoverageGrid, crackPathInMask } from '../../core/minigame';
import { recipeFor } from '../../core/items';
import type { ItemInstance } from '../../core/state';
import type { StepKind } from '../../core/types';
import { ITEMS } from '../../core/data';
import { boxFor, ctx2d, drawItem, makeCanvas, silhouette } from './itemArt';

export interface StickerInfo {
  /** Unit coords of the sticker centre, size and rotation. */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** Corner the peel starts from (unit coords). */
  cx: number;
  cy: number;
  label: string;
  color: string;
}

const STICKER_LABELS = ['50¢', 'SALE', '$1', '2 FOR 1', 'OLD', '25¢', 'LOT 7', '??'];

function clipToSilhouette(layer: HTMLCanvasElement, sil: HTMLCanvasElement): void {
  const c = ctx2d(layer);
  c.save();
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(sil, 0, 0, layer.width, layer.height);
  c.restore();
}

/** Brown grime blotches and specks. Heavier damage = more coverage. */
export function drawDirt(size: number, seed: number, d: number, sil: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const rng = new Rng(hashSeed(seed, 'dirt'));
  const blobs = 18 + d * 12;
  for (let i = 0; i < blobs; i++) {
    const cx = rng.range(0.08, 0.92) * size;
    const cy = rng.range(0.08, 0.92) * size;
    const r = rng.range(0.07, 0.17) * size;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const tone = rng.pick(['107,79,42', '92,70,40', '125,98,58', '80,66,52']);
    g.addColorStop(0, `rgba(${tone},0.85)`);
    g.addColorStop(0.7, `rgba(${tone},0.7)`);
    g.addColorStop(1, `rgba(${tone},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }
  // Full grime wash so the whole item looks dusty.
  x.fillStyle = `rgba(110,86,52,${0.32 + d * 0.1})`;
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    x.fillStyle = `rgba(60,44,30,${rng.range(0.4, 0.9)})`;
    x.beginPath();
    x.arc(rng.next() * size, rng.next() * size, rng.range(0.003, 0.012) * size, 0, Math.PI * 2);
    x.fill();
  }
  clipToSilhouette(c, sil);
  return c;
}

/** Rust patches; returns the canvas and a hardness map (1..3 passes) per grid cell. */
export function drawRust(
  size: number,
  seed: number,
  d: number,
  sil: HTMLCanvasElement,
): { canvas: HTMLCanvasElement; hardness: (u: number, v: number) => number } {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const rng = new Rng(hashSeed(seed, 'rust'));
  const patches: Array<{ x: number; y: number; r: number; h: number }> = [];
  const n = 7 + d * 4;
  for (let i = 0; i < n; i++) {
    patches.push({
      x: rng.range(0.15, 0.85),
      y: rng.range(0.15, 0.85),
      r: rng.range(0.1, 0.22),
      h: rng.int(1, 2 + Math.min(1, d)),
    });
  }
  for (const p of patches.sort((a, b) => a.h - b.h)) {
    const cx = p.x * size;
    const cy = p.y * size;
    const r = p.r * size;
    const col = p.h === 1 ? '196,106,43' : p.h === 2 ? '160,82,45' : '115,55,30';
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${col},1)`);
    g.addColorStop(0.75, `rgba(${col},0.95)`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    for (let k = 0; k < 14; k++) {
      x.fillStyle = `rgba(80,38,20,${rng.range(0.3, 0.8)})`;
      x.beginPath();
      x.arc(
        cx + rng.range(-r, r) * 0.7,
        cy + rng.range(-r, r) * 0.7,
        rng.range(0.006, 0.016) * size,
        0,
        Math.PI * 2,
      );
      x.fill();
    }
  }
  clipToSilhouette(c, sil);
  const hardness = (u: number, v: number) => {
    let h = 0;
    for (const p of patches) if (Math.hypot(p.x - u, p.y - v) < p.r * 0.9) h = Math.max(h, p.h);
    return h;
  };
  return { canvas: c, hardness };
}

/** Rough, scratched varnish for sanding. */
export function drawWorn(size: number, seed: number, sil: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const rng = new Rng(hashSeed(seed, 'worn'));
  x.fillStyle = 'rgba(214,204,190,0.92)';
  x.fillRect(0, 0, size, size);
  x.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(150,135,118,${rng.range(0.3, 0.8)})`;
    x.lineWidth = rng.range(0.003, 0.01) * size;
    const sx = rng.next() * size;
    const sy = rng.next() * size;
    const a = rng.range(-0.5, 0.5);
    const l = rng.range(0.05, 0.2) * size;
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    x.stroke();
  }
  clipToSilhouette(c, sil);
  return c;
}

/** Faded, chipped old paint shown before repainting. */
export function drawFaded(size: number, seed: number, sil: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const rng = new Rng(hashSeed(seed, 'faded'));
  x.fillStyle = 'rgba(235,228,214,0.55)';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 30; i++) {
    x.fillStyle = `rgba(200,190,175,${rng.range(0.4, 0.8)})`;
    x.beginPath();
    const cx = rng.next() * size;
    const cy = rng.next() * size;
    const r = rng.range(0.02, 0.06) * size;
    x.moveTo(cx + r, cy);
    for (let k = 1; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = r * rng.range(0.6, 1.3);
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  }
  clipToSilhouette(c, sil);
  return c;
}

/** Dull grey haze for polishing. */
export function drawDull(size: number, sil: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  x.fillStyle = 'rgba(140,140,150,0.5)';
  x.fillRect(0, 0, size, size);
  clipToSilhouette(c, sil);
  return c;
}

export function drawCrack(
  ctx: CanvasRenderingContext2D,
  size: number,
  path: Array<{ x: number; y: number }>,
  color = '#2a1d17',
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.012;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * size, p.y * size) : ctx.lineTo(p.x * size, p.y * size)));
  ctx.stroke();
  // little side cracks
  ctx.lineWidth = size * 0.006;
  for (let i = 1; i < path.length - 1; i += 2) {
    const p = path[i];
    ctx.beginPath();
    ctx.moveTo(p.x * size, p.y * size);
    ctx.lineTo((p.x + 0.03) * size, (p.y + 0.035) * size);
    ctx.stroke();
  }
  ctx.restore();
}

/** A crack drawn on its own canvas and clipped to the item outline, so it never spills off the item. */
export function crackCanvas(
  size: number,
  path: Array<{ x: number; y: number }>,
  sil: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = makeCanvas(size);
  drawCrack(ctx2d(c), size, path);
  clipToSilhouette(c, sil);
  return c;
}

/** "Well inside the item" test from a silhouette (one small CPU read; edges are eroded by one cell). */
export function insideTest(sil: HTMLCanvasElement): (u: number, v: number) => boolean {
  const n = 48;
  const small = makeCanvas(n);
  const x = small.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(sil, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data;
  const at = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < n && cy < n && d[(cy * n + cx) * 4 + 3] > 160;
  return (u, v) => {
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    return at(cx, cy) && at(cx - 1, cy) && at(cx + 1, cy) && at(cx, cy - 1) && at(cx, cy + 1);
  };
}

export function stickerFor(seed: number): StickerInfo {
  const rng = new Rng(hashSeed(seed, 'sticker'));
  const x = rng.range(0.38, 0.62);
  const y = rng.range(0.42, 0.62);
  const w = rng.range(0.22, 0.28);
  const h = w * 0.62;
  const rot = rng.range(-0.25, 0.25);
  const corner = rng.int(0, 3);
  return {
    x,
    y,
    w,
    h,
    rot,
    cx: corner % 2 === 0 ? -1 : 1,
    cy: corner < 2 ? -1 : 1,
    label: rng.pick(STICKER_LABELS),
    color: rng.pick(['#fff4b8', '#ffd6e0', '#d9f2ff', '#ffffff']),
  };
}

/** Draws a sticker (unit coords), optionally partially peeled (progress 0..1). */
export function drawSticker(ctx: CanvasRenderingContext2D, size: number, s: StickerInfo, progress = 0): void {
  const keep = 1 - progress;
  if (keep <= 0.001) return;
  ctx.save();
  ctx.translate(s.x * size, s.y * size);
  ctx.rotate(s.rot);
  const w = s.w * size;
  const h = s.h * size;
  // Peel from the corner: shrink the remaining part towards the opposite corner.
  const ow = w * keep;
  const oh = h;
  const ox = s.cx < 0 ? -w / 2 + (w - ow) : -w / 2;
  ctx.fillStyle = 'rgba(61,44,37,0.25)';
  ctx.fillRect(ox + 3, -oh / 2 + 4, ow, oh);
  ctx.fillStyle = s.color;
  ctx.strokeStyle = '#3d2c25';
  ctx.lineWidth = size * 0.006;
  ctx.beginPath();
  ctx.rect(ox, -oh / 2, ow, oh);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, -oh / 2, ow, oh);
  ctx.clip();
  ctx.fillStyle = '#c0392b';
  ctx.font = `bold ${Math.round(h * 0.42)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.label, 0, 0);
  ctx.restore();
  ctx.restore();
}

/** Sticky glue residue left by a torn sticker. */
export function drawResidue(ctx: CanvasRenderingContext2D, size: number, s: StickerInfo): void {
  ctx.save();
  ctx.translate(s.x * size, s.y * size);
  ctx.rotate(s.rot);
  ctx.fillStyle = 'rgba(230,214,160,0.85)';
  ctx.fillRect((-s.w * size) / 2, (-s.h * size) / 2, s.w * size * 0.6, s.h * size);
  ctx.restore();
}

/**
 * All damage of an instance, as layers. Used for market thumbnails, the workshop and the
 * "before" half of the reveal.
 */
export interface DamageSet {
  size: number;
  /** Resolution of the editable damage layers (capped so phones can erase them smoothly). */
  layerSize: number;
  base: HTMLCanvasElement;
  sil: HTMLCanvasElement;
  layers: Partial<Record<StepKind, HTMLCanvasElement>>;
  rustHardness: ((u: number, v: number) => number) | null;
  crack: Array<{ x: number; y: number }> | null;
  sticker: StickerInfo | null;
  steps: StepKind[];
}

/** Editable layers never exceed this many pixels per side (keeps erasing smooth on phones). */
export const MAX_LAYER = 512;

export function buildDamage(
  inst: ItemInstance,
  size: number,
  opts: { paint?: string; layerSize?: number } = {},
): DamageSet {
  const arch = ITEMS[inst.a];
  const ls = Math.min(size, opts.layerSize ?? MAX_LAYER);
  const sil = silhouette(arch, ls);
  const base = makeCanvas(size);
  drawItem(ctx2d(base), arch, boxFor(size), { paint: opts.paint ?? inst.col });
  const steps = recipeFor(inst).map((r) => r.k);
  const set: DamageSet = {
    size,
    layerSize: ls,
    base,
    sil,
    layers: {},
    rustHardness: null,
    crack: null,
    sticker: null,
    steps,
  };
  for (const k of steps) {
    switch (k) {
      case 'scrub':
        set.layers.scrub = drawDirt(ls, inst.s, inst.d, sil);
        break;
      case 'rust': {
        const r = drawRust(ls, inst.s, inst.d, sil);
        set.layers.rust = r.canvas;
        set.rustHardness = r.hardness;
        break;
      }
      case 'sand':
        set.layers.sand = drawWorn(ls, inst.s, sil);
        break;
      case 'paint':
        set.layers.paint = drawFaded(ls, inst.s, sil);
        break;
      case 'polish':
        set.layers.polish = drawDull(ls, sil);
        break;
      case 'glue':
        set.crack = crackPathInMask(hashSeed(inst.s, 'crack'), insideTest(sil));
        break;
      case 'sticker':
        set.sticker = stickerFor(inst.s);
        break;
      case 'wire':
        break;
    }
  }
  return set;
}

/** Draw order of overlay layers (top-most last). */
export const LAYER_ORDER: StepKind[] = ['paint', 'polish', 'sand', 'rust', 'scrub'];

/** Composites the full damaged look (for thumbnails and the reveal "before"). */
export function compositeDamaged(set: DamageSet, target?: HTMLCanvasElement): HTMLCanvasElement {
  const out = target ?? makeCanvas(set.size);
  const x = ctx2d(out);
  x.clearRect(0, 0, out.width, out.height);
  x.drawImage(set.base, 0, 0, out.width, out.height);
  if (set.crack) x.drawImage(crackCanvas(out.width, set.crack, set.sil), 0, 0, out.width, out.height);
  for (const k of LAYER_ORDER) {
    const l = set.layers[k];
    if (l) x.drawImage(l, 0, 0, out.width, out.height);
  }
  if (set.sticker) drawSticker(x, out.width, set.sticker);
  return out;
}

/** Builds a coverage grid from a layer's alpha (one-time CPU read of a small canvas). */
export function gridFromLayer(
  layer: HTMLCanvasElement,
  amount: (u: number, v: number) => number = () => 1,
  threshold = 40,
): CoverageGrid {
  const g = new CoverageGrid(GRID);
  const small = makeCanvas(GRID);
  const x = small.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(layer, 0, 0, GRID, GRID);
  const data = x.getImageData(0, 0, GRID, GRID).data;
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const a = data[(cy * GRID + cx) * 4 + 3];
      if (a > threshold) g.setCell(cx, cy, Math.max(1, amount((cx + 0.5) / GRID, (cy + 0.5) / GRID)));
    }
  }
  return g;
}

/** Item thumbnail (dirty when not restored). */
export function thumbnailCanvas(inst: ItemInstance, size: number): HTMLCanvasElement {
  if (inst.q >= 0) {
    const c = makeCanvas(size);
    drawItem(ctx2d(c), ITEMS[inst.a], boxFor(size), { paint: inst.col });
    return c;
  }
  return compositeDamaged(buildDamage(inst, size));
}
