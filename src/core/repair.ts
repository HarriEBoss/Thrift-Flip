/**
 * The wiring repair, per object. Instead of an abstract puzzle board, the item is turned over to its
 * electrical compartment (the base of a lamp, the back of a radio, the case back of a watch), the
 * cover comes off, the loose wires are reconnected to their terminals, the repair is tested and the
 * cover goes back on. This module is pure: which way each object turns, what the compartment looks
 * like and where everything sits (in stage unit coordinates, 0..1).
 */
import { Rng } from './prng';
import type { CategoryId } from './types';

/**
 * How the item turns: tip it over to see the base, spin it round to see the back, or (cars and vans)
 * zoom in on the hood.
 */
export type RepairView = 'base' | 'back' | 'hood';
/** How the cover comes off: screws, a twist-off case back, or a hood you lift. */
export type LidKind = 'screws' | 'twist' | 'hood';
/** What is inside. */
export type Inside = 'socket' | 'board' | 'tubes' | 'movement' | 'battery' | 'pc' | 'engine';
/** What lights up (or starts) when the repair is tested. */
export type Glow = 'bulb' | 'tubes' | 'screen' | 'led' | 'engine';
/** Jobs inside the compartment, done in order. */
export type RepairTask = 'swap' | 'pour' | 'wires';
/** A part that gets swapped for a new one. */
export type PartKind = 'battery' | 'fan' | 'ram' | 'drive' | 'cell' | 'plug';
export type Fluid = 'oil' | 'coolant';

export interface Rig {
  view: RepairView;
  panel: 'round' | 'rect';
  lid: LidKind;
  /** Number of screws holding the cover (0 for a twist-off lid). */
  screws: number;
  inside: Inside;
  glow: Glow;
  /** Mains wiring (brown / blue / green-yellow) instead of low-voltage colours. */
  mains: boolean;
  /** Width / height of a rectangular panel. */
  aspect: number;
  /** What to do once the cover is off (the plain wire step only reconnects wires). */
  tasks: RepairTask[];
  part: PartKind;
  fluid: Fluid;
}

const rig = (r: Partial<Rig> & Pick<Rig, 'view' | 'panel' | 'inside' | 'glow'>): Rig => ({
  lid: 'screws',
  screws: 4,
  mains: false,
  aspect: 1.3,
  tasks: ['wires'],
  part: 'battery',
  fluid: 'oil',
  ...r,
});

/** One rig per item shape (category:shape index). */
const RIGS: Record<string, Rig> = {
  // Lamps: tip them over and open the base.
  'lamps:0': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:1': rig({ view: 'base', panel: 'round', screws: 4, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:2': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:3': rig({ view: 'base', panel: 'round', screws: 3, inside: 'battery', glow: 'bulb' }),
  'lamps:4': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  // Clocks: open the back.
  'clocks:0': rig({ view: 'back', panel: 'round', screws: 2, inside: 'movement', glow: 'led' }),
  'clocks:1': rig({ view: 'back', panel: 'round', lid: 'twist', screws: 0, inside: 'movement', glow: 'led' }),
  'clocks:2': rig({ view: 'back', panel: 'rect', screws: 4, inside: 'movement', glow: 'led', aspect: 1.1 }),
  'clocks:3': rig({ view: 'back', panel: 'round', lid: 'twist', screws: 0, inside: 'movement', glow: 'led' }),
  'clocks:4': rig({ view: 'back', panel: 'rect', screws: 4, inside: 'board', glow: 'screen', aspect: 1.5 }),
  // Radios and TVs: take the back off.
  'radios:0': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'tubes',
    glow: 'tubes',
    mains: true,
    aspect: 1.35,
  }),
  'radios:1': rig({ view: 'back', panel: 'rect', screws: 2, inside: 'battery', glow: 'led', aspect: 1.4 }),
  'radios:2': rig({ view: 'back', panel: 'rect', screws: 6, inside: 'board', glow: 'led', aspect: 1.7 }),
  'radios:3': rig({
    view: 'base',
    panel: 'rect',
    screws: 4,
    inside: 'board',
    glow: 'led',
    mains: true,
    aspect: 1.25,
  }),
  'radios:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'tubes',
    glow: 'screen',
    mains: true,
    aspect: 1.2,
  }),
  // Curiosities with a light or motor in them.
  'curios:0': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'curios:1': rig({
    view: 'base',
    panel: 'rect',
    screws: 4,
    inside: 'board',
    glow: 'led',
    mains: true,
    aspect: 1.5,
  }),
  'curios:2': rig({ view: 'back', panel: 'rect', screws: 2, inside: 'battery', glow: 'bulb', aspect: 1.5 }),
  'curios:3': rig({ view: 'base', panel: 'round', screws: 3, inside: 'battery', glow: 'led' }),
  'curios:4': rig({ view: 'base', panel: 'round', lid: 'twist', screws: 0, inside: 'battery', glow: 'led' }),
};

const DEFAULT_RIG = rig({ view: 'back', panel: 'rect', inside: 'board', glow: 'led' });

export function rigFor(cat: CategoryId, shape: number): Rig {
  return RIGS[`${cat}:${shape}`] ?? DEFAULT_RIG;
}

/**
 * The full "Repair" step of big-ticket items (computers, consoles, cars, bikes): open it up, swap the
 * broken part, top up the fluid where there is one, reconnect the wiring, then test it.
 */
const FIX_RIGS: Record<string, Rig> = {
  'tech:0': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.2,
    tasks: ['swap', 'wires'],
    part: 'fan',
  }),
  'tech:1': rig({
    view: 'base',
    panel: 'rect',
    screws: 6,
    inside: 'pc',
    glow: 'screen',
    aspect: 1.5,
    tasks: ['swap', 'wires'],
    part: 'ram',
  }),
  'tech:2': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'led',
    aspect: 1.6,
    tasks: ['swap', 'wires'],
    part: 'fan',
  }),
  'tech:3': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.05,
    tasks: ['swap', 'wires'],
    part: 'drive',
  }),
  'tech:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 2,
    inside: 'battery',
    glow: 'screen',
    aspect: 1.1,
    tasks: ['swap', 'wires'],
    part: 'cell',
  }),
  'vehicles:0': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: ['swap', 'pour', 'wires'],
    part: 'battery',
  }),
  'vehicles:1': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: ['swap', 'pour', 'wires'],
    part: 'battery',
  }),
  'vehicles:2': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.4,
    tasks: ['swap', 'pour'],
    part: 'plug',
  }),
  'vehicles:3': rig({
    view: 'back',
    panel: 'rect',
    screws: 2,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.4,
    tasks: ['swap', 'pour', 'wires'],
    part: 'plug',
  }),
  'vehicles:4': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: ['swap', 'pour', 'wires'],
    part: 'battery',
    fluid: 'coolant',
  }),
};

const DEFAULT_FIX_RIG = rig({
  view: 'back',
  panel: 'rect',
  inside: 'pc',
  glow: 'led',
  tasks: ['swap', 'wires'],
  part: 'fan',
});

export function fixRigFor(cat: CategoryId, shape: number): Rig {
  return FIX_RIGS[`${cat}:${shape}`] ?? DEFAULT_FIX_RIG;
}

/** Where the broken part sits, where the new one waits, and where old parts are dropped. */
export interface SwapLayout {
  slot: Pt;
  fresh: Pt;
  bin: Pt;
  /** Part size in stage units (width, height). */
  w: number;
  h: number;
}

export function partSize(kind: PartKind): { w: number; h: number } {
  switch (kind) {
    case 'battery':
      return { w: 0.2, h: 0.15 };
    case 'fan':
      return { w: 0.16, h: 0.16 };
    case 'ram':
      return { w: 0.24, h: 0.07 };
    case 'drive':
      return { w: 0.2, h: 0.13 };
    case 'cell':
      return { w: 0.18, h: 0.07 };
    case 'plug':
      return { w: 0.07, h: 0.17 };
  }
}

export function swapLayout(r: Rig): SwapLayout {
  const g = panelGeom(r);
  const { w, h } = partSize(r.part);
  return {
    slot: { u: g.cx + g.rx * 0.6, v: g.cy - g.ry * 0.62 },
    fresh: { u: g.cx + g.rx * 0.62, v: g.cy + g.ry * 0.62 },
    bin: { u: g.cx - g.rx * 0.65, v: g.cy + g.ry * 0.66 },
    w,
    h,
  };
}

/** The oil / coolant filler cap and its level gauge. */
export interface PourLayout {
  cap: Pt;
  gauge: Pt;
}

export function pourLayout(r: Rig): PourLayout {
  const g = panelGeom(r);
  return {
    cap: { u: g.cx - g.rx * 0.6, v: g.cy - g.ry * 0.6 },
    gauge: { u: g.cx - g.rx * 0.3, v: g.cy - g.ry * 0.6 },
  };
}

/** Fill level band that counts as "just right". */
export const POUR_BAND: [number, number] = [0.7, 0.88];
/** Fill speed while holding (level per second). */
export const POUR_RATE = 0.45;

/** New level after pouring for dt seconds (never above 1). */
export function pourStep(level: number, dt: number, rate = POUR_RATE): number {
  return Math.min(1, level + Math.max(0, dt) * rate);
}

/** Score for stopping at `level`: full marks in the band, a little less when overfilled. */
export function pourScore(level: number, band: [number, number] = POUR_BAND): number {
  if (level < band[0]) return 0;
  if (level <= band[1]) return 1;
  return Math.max(0.6, 1 - (level - band[1]) * 2.5);
}

export interface Pt {
  u: number;
  v: number;
}

/** The cover in stage units: round (centre + radius) or rectangle (centre + size). */
export interface PanelGeom {
  cx: number;
  cy: number;
  /** Radius for round panels, half width for rectangles. */
  rx: number;
  /** Radius for round panels, half height for rectangles. */
  ry: number;
}

export function panelGeom(r: Rig): PanelGeom {
  if (r.panel === 'round') return { cx: 0.5, cy: 0.48, rx: 0.4, ry: 0.4 };
  // Big repairs need room for parts and fluids: they use a taller panel.
  const busy = r.tasks.length > 1;
  const hw = busy ? 0.44 : 0.42;
  const hh = Math.min(busy ? 0.42 : 0.4, hw / (busy ? Math.min(r.aspect, 1.1) : r.aspect));
  return { cx: 0.5, cy: 0.48, rx: hw, ry: hh };
}

/** Screw positions on the cover. */
export function screwLayout(r: Rig): Pt[] {
  const g = panelGeom(r);
  if (r.lid === 'twist' || r.screws <= 0) return [];
  if (r.panel === 'round') {
    const out: Pt[] = [];
    for (let i = 0; i < r.screws; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / r.screws;
      out.push({ u: g.cx + Math.cos(a) * g.rx * 0.8, v: g.cy + Math.sin(a) * g.ry * 0.8 });
    }
    return out;
  }
  const ix = g.rx - 0.05;
  const iy = g.ry - 0.05;
  const corners: Pt[] = [
    { u: g.cx - ix, v: g.cy - iy },
    { u: g.cx + ix, v: g.cy - iy },
    { u: g.cx + ix, v: g.cy + iy },
    { u: g.cx - ix, v: g.cy + iy },
  ];
  if (r.screws <= 2) return [corners[0], corners[2]];
  if (r.screws >= 6) return [...corners, { u: g.cx, v: g.cy - iy }, { u: g.cx, v: g.cy + iy }];
  return corners;
}

export interface WireLayout {
  /** Where the cable comes into the compartment. */
  entry: Pt;
  /** Terminal positions (left to right). */
  terminals: Pt[];
  /** Where each loose wire end lies before it is connected. */
  loose: Pt[];
  /** Where the test light shows. */
  glow: Pt;
}

/** Terminals in a row on the component; loose wire ends scattered near the cable entry. */
export function wireLayout(r: Rig, n: number, seed: number): WireLayout {
  const g = panelGeom(r);
  const rng = new Rng(seed);
  const span = Math.min(0.56, g.rx * 1.35);
  const ty = g.cy - g.ry * 0.28;
  const terminals: Pt[] = [];
  for (let i = 0; i < n; i++) terminals.push({ u: g.cx - span / 2 + (span * (i + 0.5)) / n, v: ty });
  const entry = { u: g.cx, v: g.cy + g.ry * 0.92 };
  const loose: Pt[] = [];
  // Big repairs keep the loose ends in the middle so the corners stay free for parts.
  const looseSpan = r.tasks.length > 1 ? span * 0.6 : span;
  for (let i = 0; i < n; i++) {
    const base = g.cx - looseSpan / 2 + (looseSpan * (i + 0.5)) / n;
    loose.push({
      u: base + rng.range(-0.035, 0.035),
      v: g.cy + g.ry * rng.range(0.32, 0.58),
    });
  }
  // Shuffle which wire end lies where, so wires cross a little like in real life.
  const order = rng.shuffle(loose.map((_, i) => i));
  const glow = { u: g.cx, v: g.cy - g.ry * 0.68 };
  return { entry, terminals, loose: order.map((i) => loose[i]), glow };
}

/** Seconds of holding the screwdriver on a screw to take it out. */
export const SCREW_SECONDS = 0.55;

/** Signed smallest angle difference (radians), for twist gestures. */
export function angleDelta(prev: number, next: number): number {
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Total twist (radians, either direction) needed to undo a twist-off case back. */
export const TWIST_NEEDED = Math.PI * 2.5;
