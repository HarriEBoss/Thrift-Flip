/**
 * Layout maths for the in-game tablet's two apps (pure, unit-tested): the legacy tree drawn as a
 * graph from each node's `pos`, and the solar system map from each body's `orbit`.
 */
import { BALANCE } from './data';
import { hashSeed } from './prng';
import type { BodyDef, SkillNodeDef } from './types';

export interface XY {
  x: number;
  y: number;
}

export interface TreeLayout {
  /** Node centres inside a w × h area. */
  pos: Record<string, XY>;
  /** Node radius. */
  r: number;
  /** Prerequisite links: [from (the requirement), to]. */
  edges: Array<[string, string]>;
}

/**
 * Places the tree in a w × h area. Columns of `pos` run left to right and rows top to bottom; in a
 * tall area the tree is turned (columns run down) so it fills the screen.
 */
export function treeLayout(nodes: SkillNodeDef[], w: number, h: number): TreeLayout {
  const cols = Math.max(...nodes.map((n) => n.pos[0])) + 1;
  const rows = Math.max(...nodes.map((n) => n.pos[1])) + 1;
  const tall = h > w;
  const across = tall ? rows : cols;
  const down = tall ? cols : rows;
  const cw = w / across;
  const ch = h / down;
  const r = Math.max(10, Math.min(46, Math.min(cw, ch) * 0.3));
  const pos: Record<string, XY> = {};
  for (const n of nodes) {
    const [c, row] = n.pos;
    const a = tall ? row : c;
    const d = tall ? c : row;
    pos[n.id] = { x: cw * (a + 0.5), y: ch * (d + 0.5) };
  }
  const edges = nodes.flatMap((n) => n.req.map((q) => [q, n.id] as [string, string]));
  return { pos, r, edges };
}

/**
 * Radius of a body's orbit round the Sun on a map of radius `rmax`. Not to scale: orbits from 0.2
 * out are spread evenly over the map so the inner planets do not crowd the Sun.
 */
export function orbitRadius(orbit: number, rmax: number): number {
  const k = Math.max(0, Math.min(1, (orbit - 0.2) / 0.65));
  return (0.22 + 0.78 * k) * rmax;
}

/** Earth's orbit (the home planet: not a colony). */
export function earthOrbit(): number {
  return BALANCE.empire.space.earthOrbit;
}

/** Radius of a moon's little orbit round its planet. */
export function moonOrbitRadius(rmax: number): number {
  return rmax * 0.075;
}

/**
 * Where a body is on its orbit at time `t` (seconds): a fixed start angle per save, then a slow
 * drift, inner planets faster (one lap of Earth is about two minutes).
 */
export function orbitAngle(id: string, orbit: number, seed: number, t: number): number {
  const start = ((hashSeed(seed, 'orbit', id) % 3600) / 3600) * Math.PI * 2;
  const speed = (Math.PI * 2) / 120 / Math.pow(Math.max(0.1, orbit) / earthOrbit(), 1.5);
  return start + t * speed;
}

/** Position of a body on the map (Sun at 0,0), including moons round their planet. */
export function bodyPos(b: BodyDef, rmax: number, seed: number, t: number): XY {
  if (b.around === 'earth') {
    const e = earthPos(rmax, seed, t);
    const a = orbitAngle(b.id, 0.05, seed, t);
    const mr = moonOrbitRadius(rmax);
    return { x: e.x + Math.cos(a) * mr, y: e.y + Math.sin(a) * mr };
  }
  const a = orbitAngle(b.id, b.orbit, seed, t);
  const rr = orbitRadius(b.orbit, rmax);
  return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
}

export function earthPos(rmax: number, seed: number, t: number): XY {
  const a = orbitAngle('earth', earthOrbit(), seed, t);
  const rr = orbitRadius(earthOrbit(), rmax);
  return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
}

/** Clips a segment to a rectangle (Liang-Barsky); null when it is fully outside. */
export function clipSegment(
  a: XY,
  b: XY,
  rect: { x: number; y: number; w: number; h: number },
): [XY, XY] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: Array<[number, number]> = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.w - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}
