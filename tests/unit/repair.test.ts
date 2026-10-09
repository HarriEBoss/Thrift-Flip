import { describe, expect, it } from 'vitest';
import { TWIST_NEEDED, angleDelta, panelGeom, rigFor, screwLayout, wireLayout } from '../../src/core/repair';
import { ITEMS, RECIPES } from '../../src/core/data';

describe('repair rigs', () => {
  it('lamps open at the base, radios at the back, watches twist off', () => {
    expect(rigFor('lamps', 0).view).toBe('base');
    expect(rigFor('lamps', 0).mains).toBe(true);
    expect(rigFor('radios', 0).view).toBe('back');
    expect(rigFor('radios', 0).inside).toBe('tubes');
    expect(rigFor('clocks', 3).lid).toBe('twist');
    expect(screwLayout(rigFor('clocks', 3))).toEqual([]);
  });

  it('every item that can need wiring has a rig, and screws sit on the cover', () => {
    const wired = Object.entries(RECIPES)
      .filter(([, steps]) => steps.some((s) => s.k === 'wire'))
      .map(([cat]) => cat);
    for (const it of ITEMS.filter((i) => wired.includes(i.cat))) {
      const r = rigFor(it.cat, it.shape);
      const g = panelGeom(r);
      const screws = screwLayout(r);
      expect(screws.length).toBe(r.lid === 'twist' ? 0 : r.screws);
      for (const s of screws) {
        expect(Math.abs(s.u - g.cx)).toBeLessThanOrEqual(g.rx);
        expect(Math.abs(s.v - g.cy)).toBeLessThanOrEqual(g.ry);
      }
    }
  });

  it('wire layout: terminals in a row inside the panel, loose ends below them, deterministic', () => {
    for (const r of [rigFor('lamps', 2), rigFor('radios', 2), rigFor('clocks', 3)]) {
      const g = panelGeom(r);
      const a = wireLayout(r, 5, 42);
      const b = wireLayout(r, 5, 42);
      expect(a).toEqual(b);
      expect(a.terminals).toHaveLength(5);
      expect(a.loose).toHaveLength(5);
      for (let i = 1; i < 5; i++) expect(a.terminals[i].u).toBeGreaterThan(a.terminals[i - 1].u);
      for (const p of [...a.terminals, ...a.loose, a.entry, a.glow]) {
        expect(Math.abs(p.u - g.cx)).toBeLessThanOrEqual(g.rx);
        expect(Math.abs(p.v - g.cy)).toBeLessThanOrEqual(g.ry);
      }
      for (const l of a.loose) expect(l.v).toBeGreaterThan(a.terminals[0].v);
    }
  });

  it('twist gestures accumulate the shortest angle, across the -pi/pi seam', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2);
    expect(angleDelta(-3.1, 3.1)).toBeCloseTo(-(2 * Math.PI - 6.2));
    let total = 0;
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const a = Math.atan2(Math.sin(i * 0.2), Math.cos(i * 0.2));
      total += Math.abs(angleDelta(last, a));
      last = a;
    }
    expect(total).toBeGreaterThan(TWIST_NEEDED);
  });
});
