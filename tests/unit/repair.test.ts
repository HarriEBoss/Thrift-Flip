import { describe, expect, it } from 'vitest';
import {
  PASTE_BAND,
  POUR_BAND,
  POUR_RATE,
  TWIST_NEEDED,
  angleDelta,
  boltLayout,
  cableSet,
  dustLayout,
  engineSwapRig,
  fixRigFor,
  hoistLayout,
  panelGeom,
  pcRebuildRig,
  pourLayout,
  pourScore,
  pourStep,
  repairRig,
  rigFor,
  screwLayout,
  swapLayout,
  wireLayout,
  type Rig,
} from '../../src/core/repair';
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

describe('big repairs (computers, cars, workshop jobs)', () => {
  const inPanel = (r: Rig, p: { u: number; v: number }, k = 1.05) => {
    const g = panelGeom(r);
    return Math.abs(p.u - g.cx) <= g.rx * k && Math.abs(p.v - g.cy) <= g.ry * k;
  };

  it('every computer and vehicle has a multi-step Repair rig', () => {
    for (const it of ITEMS.filter((i) =>
      ['tech', 'vehicles', 'phones', 'robots', 'rockets'].includes(i.cat),
    )) {
      const r = repairRig('fix', it.cat, it.shape);
      expect(r).toBe(fixRigFor(it.cat, it.shape));
      expect(r.tasks.length).toBeGreaterThanOrEqual(2);
      if (it.cat === 'vehicles') expect(r.glow).toBe('engine');
      if (it.cat === 'phones') expect(r.inside).toBe('phone');
    }
  });

  it('workshop jobs: a full PC rebuild and an engine swap with lots to do', () => {
    const pc = repairRig('fix', 'tech', 0, 'pc');
    expect(pc.tasks.map((t) => t.k)).toEqual(['dust', 'swap', 'torque', 'swap', 'swap', 'bolts', 'cables']);
    expect(pc.tasks.some((t) => t.k === 'swap' && t.paste)).toBe(true);
    const eng = repairRig('fix', 'vehicles', 0, 'engine');
    expect(eng.inside).toBe('bay');
    expect(eng.tasks.length).toBeGreaterThanOrEqual(10);
    // Out comes before in, and the engine is unbolted before it is hoisted.
    const ks = eng.tasks.map((t) => (t.k === 'hoist' || t.k === 'bolts' ? `${t.k}:${t.dir}` : t.k));
    expect(ks.indexOf('bolts:out')).toBeLessThan(ks.indexOf('hoist:out'));
    expect(ks.indexOf('hoist:out')).toBeLessThan(ks.indexOf('hoist:in'));
    expect(ks.indexOf('hoist:in')).toBeLessThan(ks.indexOf('bolts:in'));
    // The wire step never turns into a job.
    expect(repairRig('wire', 'lamps', 0, 'engine')).toBe(rigFor('lamps', 0));
  });

  it('parts, caps, bolts, sockets and dust all sit inside the compartment', () => {
    const rigs = [
      pcRebuildRig(),
      engineSwapRig(),
      ...[0, 1, 2, 3, 4].flatMap((s) =>
        (['tech', 'vehicles', 'phones', 'robots', 'rockets'] as const).map((c) => fixRigFor(c, s)),
      ),
    ];
    for (const r of rigs) {
      for (const t of r.tasks) {
        if (t.k === 'swap') {
          const sl = swapLayout(r, t);
          for (const p of [sl.slot, sl.fresh, sl.bin]) expect(inPanel(r, p)).toBe(true);
        } else if (t.k === 'pour' || t.k === 'drain') {
          const pl = pourLayout(r, t.k, t.fluid);
          expect(inPanel(r, pl.cap)).toBe(true);
          expect(inPanel(r, pl.gauge)).toBe(true);
        } else if (t.k === 'bolts') {
          const b = boltLayout(r, t);
          expect(b).toHaveLength(t.n);
          for (const p of b) expect(inPanel(r, p)).toBe(true);
        } else if (t.k === 'cables') {
          const cs = cableSet(r, t.set, 7);
          expect(cableSet(r, t.set, 7)).toEqual(cs);
          expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
          for (const c of cs) {
            expect(inPanel(r, c.plug)).toBe(true);
            expect(inPanel(r, c.socket)).toBe(true);
          }
        } else if (t.k === 'dust') {
          const d = dustLayout(r, t.n, 3);
          expect(d).toHaveLength(t.n);
          for (const p of d) expect(inPanel(r, p)).toBe(true);
        }
      }
    }
  });

  it('two fluids never share a cap, and the hoist lifts the engine clear of the bay', () => {
    for (const r of [fixRigFor('vehicles', 1), engineSwapRig()]) {
      const oil = pourLayout(r, 'pour', 'oil').cap;
      const cool = pourLayout(r, 'pour', 'coolant').cap;
      expect(Math.hypot(oil.u - cool.u, oil.v - cool.v)).toBeGreaterThan(0.12);
    }
    const h = hoistLayout(engineSwapRig());
    expect(h.seat.v - h.up.v).toBeGreaterThan(h.h);
  });

  it('smartphones and tablets have a glued back (heat gun first), rockets drain and refuel', () => {
    expect(fixRigFor('phones', 2).lid).toBe('glued');
    expect(screwLayout(fixRigFor('phones', 2))).toEqual([]);
    const r = fixRigFor('rockets', 0);
    expect(r.tasks.map((t) => t.k)).toEqual([
      'drain',
      'bolts',
      'swap',
      'bolts',
      'cables',
      'leak',
      'pour',
      'wires',
    ]);
    expect(r.tasks.some((t) => t.k === 'pour' && t.fluid === 'fuel')).toBe(true);
  });

  it('pouring fills at a steady rate and scores the green band best', () => {
    let lvl = 0;
    for (let i = 0; i < 10; i++) lvl = pourStep(lvl, 0.1);
    expect(lvl).toBeCloseTo(POUR_RATE);
    expect(pourStep(0.95, 1)).toBe(1);
    expect(pourScore(0.5)).toBe(0);
    expect(pourScore((POUR_BAND[0] + POUR_BAND[1]) / 2)).toBe(1);
    expect(pourScore(1)).toBeLessThan(1);
    expect(pourScore(1)).toBeGreaterThanOrEqual(0.6);
    expect(pourScore(0.5, PASTE_BAND)).toBe(1);
  });
});

describe('building a custom design', () => {
  it('starts from an empty frame: every part is fitted, nothing is pulled out or unbolted', () => {
    for (const cat of ['tech', 'vehicles', 'robots', 'rockets'] as const) {
      const r = repairRig('build', cat, 0, 'design');
      expect(r.build, cat).toBe(true);
      const swaps = r.tasks.filter((t) => t.k === 'swap');
      expect(swaps.length, cat).toBeGreaterThan(0);
      for (const t of swaps) expect(t.k === 'swap' && t.fit, cat).toBe(true);
      for (const t of r.tasks) {
        expect(t.k === 'bolts' && t.dir === 'out', cat).toBe(false);
        expect(t.k === 'hoist' && t.dir === 'out', cat).toBe(false);
        expect(t.k, cat).not.toBe('drain');
        expect(t.k, cat).not.toBe('dust');
      }
    }
  });

  it('phones get a flat pouch battery, not a round cell', () => {
    for (let shape = 0; shape < 5; shape++) {
      const parts = fixRigFor('phones', shape).tasks.flatMap((t) => (t.k === 'swap' ? [t.part] : []));
      expect(parts).not.toContain('cell');
    }
  });
});
