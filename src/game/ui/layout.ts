/**
 * Responsive "design frame" system.
 *
 * All UI is authored in logical units inside a frame whose short side is always 720.
 * - Portrait (aspect < 1.1): 720 wide, 960..1280 tall.
 * - Landscape: 720 tall, 960..1280 wide.
 * Aspects beyond those ranges are letterboxed/pillarboxed (frame centred, background fills).
 * Scenes lay out for either orientation; the frame is recomputed on every resize so state
 * is never lost (objects are repositioned, not recreated).
 */
export interface Frame {
  /** Logical frame width / height. */
  w: number;
  h: number;
  /** Device pixels per logical unit. */
  scale: number;
  /** Frame origin in device pixels. */
  x: number;
  y: number;
  portrait: boolean;
  /** Screen size in device pixels. */
  screenW: number;
  screenH: number;
}

export const SHORT_SIDE = 720;
export const LONG_MIN = 960;
export const LONG_MAX = 1280;

export function computeFrame(screenW: number, screenH: number): Frame {
  const sw = Math.max(1, screenW);
  const sh = Math.max(1, screenH);
  const aspect = sw / sh;
  const portrait = aspect < 1.1;
  let w: number;
  let h: number;
  if (portrait) {
    w = SHORT_SIDE;
    h = clamp(SHORT_SIDE / aspect, LONG_MIN, LONG_MAX);
  } else {
    h = SHORT_SIDE;
    w = clamp(SHORT_SIDE * aspect, LONG_MIN, LONG_MAX);
  }
  const scale = Math.min(sw / w, sh / h);
  const x = (sw - w * scale) / 2;
  const y = (sh - h * scale) / 2;
  return { w, h, scale, x, y, portrait, screenW: sw, screenH: sh };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Device pixel ratio capped at 3 (crisp but bounded fill-rate). */
export function cappedDpr(raw: number | undefined): number {
  const d = typeof raw === 'number' && isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(3, Math.max(1, d));
}

/** Splits a span into n cells with gap; returns cell centres. */
export function distribute(start: number, span: number, n: number, gap = 0): number[] {
  if (n <= 0) return [];
  const cell = (span - gap * (n - 1)) / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start + i * (cell + gap) + cell / 2);
  return out;
}

/** Grid layout: returns positions for count items in a box with the best column count. */
export function gridPositions(
  count: number,
  box: { x: number; y: number; w: number; h: number },
  cellAspect = 1,
  gap = 16,
): { cols: number; rows: number; cell: number; pos: Array<{ x: number; y: number }> } {
  if (count <= 0) return { cols: 0, rows: 0, cell: 0, pos: [] };
  let best = { cols: 1, rows: count, cell: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const ch = (box.h - gap * (rows - 1)) / rows;
    const cell = Math.min(cw, ch / cellAspect);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  const { cols, rows, cell } = best;
  const totalW = cols * cell + (cols - 1) * gap;
  const totalH = rows * cell * cellAspect + (rows - 1) * gap;
  const ox = box.x + (box.w - totalW) / 2;
  const oy = box.y + (box.h - totalH) / 2;
  const pos: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pos.push({
      x: ox + c * (cell + gap) + cell / 2,
      y: oy + r * (cell * cellAspect + gap) + (cell * cellAspect) / 2,
    });
  }
  return { cols, rows, cell, pos };
}
