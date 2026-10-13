import { describe, expect, it } from 'vitest';
import {
  CIRCUITS,
  batteryLayout,
  batterySteps,
  filterLayout,
  fuseLayout,
  misfireCylinder,
  plugLayout,
  troubleCode,
} from '../../src/core/carRepair';
import { cableSet, fixRigFor, pourLayout, repairRig, type Pt } from '../../src/core/repair';

const dist = (a: Pt, b: Pt) => Math.hypot(a.u - b.u, a.v - b.v);

describe('realistic car repairs', () => {
  it('car repairs start by diagnosing and include the real jobs', () => {
    const ks = (s: number) => fixRigFor('vehicles', s).tasks.map((t) => t.k);
    expect(ks(0).slice(0, 2)).toEqual(['obd', 'plugs']);
    expect(ks(1)).toEqual(expect.arrayContaining(['drain', 'filter', 'battery']));
    expect(ks(1).indexOf('drain')).toBeLessThan(ks(1).indexOf('filter'));
    expect(ks(1).indexOf('filter')).toBeLessThan(ks(1).indexOf('pour'));
    expect(ks(4)).toContain('fuse');
    for (const s of [2, 3]) expect(ks(s).slice(0, 2)).toEqual(['obd', 'plugs']);
    expect(repairRig('fix', 'vehicles', 0, 'engine').tasks.some((t) => t.k === 'battery')).toBe(true);
  });

  it('the trouble code names the misfiring cylinder the plug job works on', () => {
    const rig = fixRigFor('vehicles', 0);
    for (let s = 1; s < 40; s++) {
      const seed = s * 7919;
      const c = misfireCylinder(seed, 4);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(4);
      expect(troubleCode(rig.tasks, seed)).toEqual({ code: `P030${c + 1}`, key: 'obd.misfire', n: c + 1 });
    }
    expect(troubleCode([{ k: 'battery' }], 1).code).toBe('P0562');
    expect(troubleCode([{ k: 'wires' }], 1).code).toBe('P0000');
  });

  it('battery: negative off first, positive on first', () => {
    const s = batterySteps(false);
    expect(s.indexOf('negOff')).toBeLessThan(s.indexOf('posOff'));
    expect(s.indexOf('posOn')).toBeLessThan(s.indexOf('negOn'));
    expect(s.indexOf('out')).toBeLessThan(s.indexOf('in'));
    expect(batterySteps(true)).toEqual(['in', 'holdOn', 'posOn', 'negOn']);
  });

  it('fuse box: the spares hold exactly one fuse of the blown rating, all ratings different', () => {
    for (let s = 0; s < 40; s++) {
      const L = fuseLayout(s * 104729);
      const want = CIRCUITS[L.blown].amps;
      expect(L.spares.filter((a) => a === want)).toHaveLength(1);
      expect(new Set(L.spares).size).toBe(L.spares.length);
      expect(L.slots).toHaveLength(CIRCUITS.length);
    }
  });

  it('nothing sits on top of anything else under the hood', () => {
    const rig = fixRigFor('vehicles', 1);
    const bat = batteryLayout(rig);
    const fil = filterLayout(rig);
    const caps = [
      pourLayout(rig, 'pour', 'oil').cap,
      pourLayout(rig, 'pour', 'coolant').cap,
      pourLayout(rig, 'drain', 'oil').cap,
    ];
    for (const p of [bat.c, bat.fresh, fil.c, fil.fresh])
      for (const c of caps) expect(dist(p, c)).toBeGreaterThan(0.1);
    expect(dist(bat.fresh, fil.c)).toBeGreaterThan(0.15);
    const plugs = plugLayout(fixRigFor('vehicles', 0), 4);
    for (const c of plugs.coils)
      expect(dist(c, pourLayout(fixRigFor('vehicles', 0), 'pour', 'oil').cap)).toBeGreaterThan(0.1);
    for (const p of [bat.c, bat.fresh, fil.c, fil.fresh, ...plugs.coils])
      expect(p.u > 0.03 && p.u < 0.97 && p.v > 0.03 && p.v < 0.97).toBe(true);
  });

  it('phones and robots plug power in last', () => {
    for (const set of ['phone', 'harness'] as const) {
      const defs = cableSet(fixRigFor(set === 'phone' ? 'phones' : 'robots', 0), set, 5);
      expect(defs.filter((d) => d.last)).toHaveLength(1);
    }
    for (let s = 0; s < 5; s++) expect(fixRigFor('phones', s).tasks[0].k).toBe('unplug');
  });
});
