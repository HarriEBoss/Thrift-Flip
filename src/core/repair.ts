/**
 * The wiring repair, per object. Instead of an abstract puzzle board, the item is turned over to its
 * electrical compartment (the base of a lamp, the back of a radio, the case back of a watch), the
 * cover comes off, the loose wires are reconnected to their terminals, the repair is tested and the
 * cover goes back on. This module is pure: which way each object turns, what the compartment looks
 * like and where everything sits (in stage unit coordinates, 0..1).
 */
import { Rng } from './prng';
import type { CategoryId } from './types';

/** How the item turns: tip it over to see the base, or spin it round to see the back. */
export type RepairView = 'base' | 'back';
/** How the cover comes off: screws, or a twist-off case back. */
export type LidKind = 'screws' | 'twist';
/** What is inside. */
export type Inside = 'socket' | 'board' | 'tubes' | 'movement' | 'battery';
/** What lights up when the repair is tested. */
export type Glow = 'bulb' | 'tubes' | 'screen' | 'led';

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
}

const rig = (r: Partial<Rig> & Pick<Rig, 'view' | 'panel' | 'inside' | 'glow'>): Rig => ({
  lid: 'screws',
  screws: 4,
  mains: false,
  aspect: 1.3,
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
  const hw = 0.42;
  const hh = Math.min(0.4, hw / r.aspect);
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
  for (let i = 0; i < n; i++) {
    const base = g.cx - span / 2 + (span * (i + 0.5)) / n;
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
