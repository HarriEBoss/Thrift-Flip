import { describe, expect, it } from 'vitest';
import { SKILL_NODES } from '../../src/core/skilltree';
import { BODIES } from '../../src/core/space';
import {
  bodyPos,
  clipSegment,
  earthOrbit,
  earthPos,
  moonOrbitRadius,
  orbitAngle,
  orbitRadius,
  treeLayout,
} from '../../src/core/tablet';

describe('tablet: legacy tree map', () => {
  for (const [w, h] of [
    [900, 380],
    [540, 620],
    [480, 480],
  ])
    it(`fits every node in a ${w} x ${h} area without overlaps`, () => {
      const L = treeLayout(SKILL_NODES, w, h);
      const ids = SKILL_NODES.map((n) => n.id);
      for (const id of ids) {
        const p = L.pos[id];
        expect(p.x - L.r, id).toBeGreaterThanOrEqual(0);
        expect(p.y - L.r, id).toBeGreaterThanOrEqual(0);
        expect(p.x + L.r, id).toBeLessThanOrEqual(w);
        expect(p.y + L.r, id).toBeLessThanOrEqual(h);
      }
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const a = L.pos[ids[i]];
          const b = L.pos[ids[j]];
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${ids[i]} ${ids[j]}`).toBeGreaterThan(L.r * 2);
        }
      expect(L.edges.length).toBe(SKILL_NODES.reduce((n, x) => n + x.req.length, 0));
    });

  it('turns the tree in a tall area so branches run down the screen', () => {
    const wide = treeLayout(SKILL_NODES, 900, 400);
    const tall = treeLayout(SKILL_NODES, 400, 900);
    const n = SKILL_NODES.find((x) => x.pos[0] > 0 && x.pos[1] === 0)!;
    expect(wide.pos[n.id].x).toBeGreaterThan(wide.pos[n.id].y);
    expect(tall.pos[n.id].y).toBeGreaterThan(tall.pos[n.id].x);
  });
});

describe('tablet: solar system map', () => {
  it('orbits get wider outwards and stay on the map', () => {
    const rmax = 300;
    const sorted = [...BODIES.filter((b) => !b.around).map((b) => b.orbit), earthOrbit()].sort(
      (a, b) => a - b,
    );
    const radii = sorted.map((o) => orbitRadius(o, rmax));
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    expect(radii[0]).toBeGreaterThan(rmax * 0.15);
    expect(radii[radii.length - 1]).toBeLessThanOrEqual(rmax);
  });

  it('bodies sit on their orbits; the Moon circles Earth', () => {
    const rmax = 300;
    for (const t of [0, 13.7, 250]) {
      for (const b of BODIES) {
        const p = bodyPos(b, rmax, 42, t);
        if (b.around === 'earth') {
          const e = earthPos(rmax, 42, t);
          expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeCloseTo(moonOrbitRadius(rmax), 5);
        } else expect(Math.hypot(p.x, p.y)).toBeCloseTo(orbitRadius(b.orbit, rmax), 5);
      }
    }
    expect(BODIES.find((b) => b.id === 'moon')?.around).toBe('earth');
  });

  it('start angles are fixed per save; inner planets go round faster', () => {
    expect(orbitAngle('mars', 0.42, 7, 0)).toBe(orbitAngle('mars', 0.42, 7, 0));
    expect(orbitAngle('mars', 0.42, 7, 0)).not.toBe(orbitAngle('mars', 0.42, 8, 0));
    const inner = orbitAngle('x', 0.28, 1, 10) - orbitAngle('x', 0.28, 1, 0);
    const outer = orbitAngle('x', 0.85, 1, 10) - orbitAngle('x', 0.85, 1, 0);
    expect(inner).toBeGreaterThan(outer);
  });

  it('clips lines to the map area', () => {
    const r = { x: 0, y: 0, w: 100, h: 100 };
    expect(clipSegment({ x: 10, y: 10 }, { x: 90, y: 90 }, r)).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]);
    expect(clipSegment({ x: -50, y: 50 }, { x: 150, y: 50 }, r)).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(clipSegment({ x: -50, y: -10 }, { x: 150, y: -10 }, r)).toBeNull();
  });
});
