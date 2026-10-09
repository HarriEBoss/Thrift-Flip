import { describe, expect, it } from 'vitest';
import { DESIGNS, designScore, designTotals, makeSpec, meetsSpec, solveDesign } from '../../src/core/design';
import { BUSINESSES } from '../../src/core/empire';

describe('custom engineering designs', () => {
  it('every business that takes design contracts has a blueprint with 3 parts per slot', () => {
    for (const b of BUSINESSES.filter((x) => x.contract?.design)) {
      const d = DESIGNS[b.id];
      expect(d, b.id).toBeTruthy();
      expect(d.slots.length).toBeGreaterThanOrEqual(4);
      for (const s of d.slots) {
        expect(d.parts[s.type]).toHaveLength(3);
        expect(s.u).toBeGreaterThan(0.1);
        expect(s.u).toBeLessThan(0.9);
      }
    }
  });

  it('every spec can be met, but not by just taking the best or the cheapest of everything', () => {
    for (const [id, def] of Object.entries(DESIGNS)) {
      for (let seed = 1; seed <= 60; seed++) {
        const spec = makeSpec(def, seed);
        expect(makeSpec(def, seed)).toEqual(spec);
        const sol = solveDesign(def, spec);
        expect(sol, `${id} ${seed}`).not.toBeNull();
        expect(meetsSpec(designTotals(def, sol!), spec)).toBe(true);
        expect(designScore(designTotals(def, sol!), spec)).toBe(1);
      }
      // Taking the strongest part everywhere is always too heavy or too expensive for some specs.
      const strongest = def.slots.map((s) => {
        const ps = def.parts[s.type];
        return ps.indexOf(ps.reduce((a, b) => (b.power > a.power ? b : a)));
      });
      const fails = Array.from({ length: 60 }, (_, i) => makeSpec(def, i + 1)).filter(
        (spec) => !meetsSpec(designTotals(def, strongest), spec),
      );
      expect(fails.length, id).toBeGreaterThan(0);
    }
  });

  it('totals add up the chosen parts; empty slots count nothing; the score rewards meeting the spec', () => {
    const def = DESIGNS.computer;
    const t = designTotals(def, [0, 0, 0, 0]);
    const sum = (k: 'power' | 'weight' | 'cost') =>
      def.slots.reduce((n, s) => n + def.parts[s.type][0][k], 0);
    expect(t).toEqual({ power: sum('power'), weight: sum('weight'), cost: sum('cost') });
    expect(designTotals(def, [-1, -1, -1, -1])).toEqual({ power: 0, weight: 0, cost: 0 });
    const spec = { power: 100, weight: 10, cost: 100 };
    expect(designScore({ power: 50, weight: 10, cost: 100 }, spec)).toBeCloseTo(0.5 / 3 + 2 / 3);
    expect(designScore({ power: 100, weight: 20, cost: 200 }, spec)).toBeCloseTo(1 / 3 + 1 / 6 + 1 / 6);
  });
});
