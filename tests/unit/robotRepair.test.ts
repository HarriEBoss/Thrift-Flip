import { describe, expect, it } from 'vitest';
import {
  DEAD_VOLTS,
  GIMBAL_TOL,
  SOLDER_BAND,
  UART_LEADS,
  cellUp,
  gimbalLayout,
  lockoutSteps,
  packLayout,
  propLayout,
  rbfLayout,
  robotFault,
  tileLayout,
  uartLayout,
  uartTarget,
} from '../../src/core/robotRepair';
import { buildRigFor, fixRigFor, type Pt } from '../../src/core/repair';

const dist = (a: Pt, b: Pt) => Math.hypot(a.u - b.u, a.v - b.v);
const seeds = Array.from({ length: 40 }, (_, i) => (i + 1) * 7919);

describe('realistic robot repairs', () => {
  it('the factory arm is locked out first and released last, after the fault log', () => {
    const ks = fixRigFor('robots', 0).tasks;
    expect(ks[0]).toEqual({ k: 'lockout', on: true });
    expect(ks[1]).toEqual({ k: 'uart' });
    expect(ks[ks.length - 1]).toEqual({ k: 'lockout', on: false });
    expect(fixRigFor('robots', 3).tasks.map((t) => t.k)).toContain('props');
    for (const s of [1, 2, 3]) expect(fixRigFor('robots', s).tasks.map((t) => t.k)).toContain('pack');
  });

  it('lockout: stop, key off, lock; then unlock, key on, release, reset', () => {
    expect(lockoutSteps(true)).toEqual(['estop', 'key', 'lock']);
    const off = lockoutSteps(false);
    expect(off[0]).toBe('unlock');
    expect(off.indexOf('release')).toBeLessThan(off.indexOf('reset'));
  });

  it('serial: TX and RX cross over, ground to ground, power pin left alone', () => {
    expect(UART_LEADS.map(uartTarget)).toEqual(['GND', 'RX', 'TX']);
    expect(UART_LEADS.map(uartTarget)).not.toContain('3V3');
    const orders = new Set(seeds.map((s) => uartLayout(s).names.join()));
    expect(orders.size).toBeGreaterThan(5);
    for (const s of seeds) expect(new Set(uartLayout(s).names).size).toBe(4);
  });

  it('the fault log names what the job fixes', () => {
    const f = robotFault(fixRigFor('robots', 0).tasks, 3);
    expect(f.key).toBe('uart.joint');
    expect(f.n).toBeGreaterThanOrEqual(1);
    expect(f.n).toBeLessThanOrEqual(4);
    expect(robotFault([{ k: 'pack' }], 1).code).toBe('E43');
    expect(robotFault([{ k: 'wires' }], 1).code).toBe('E00');
  });

  it('battery pack: exactly one dead cell, cells alternate in series', () => {
    for (const s of seeds) {
      const L = packLayout(s);
      expect(L.volts.filter((v) => v < DEAD_VOLTS)).toHaveLength(1);
      expect(L.volts[L.dead]).toBeLessThan(DEAD_VOLTS);
      for (const v of L.volts) if (v >= DEAD_VOLTS) expect(v).toBeGreaterThan(3.6);
    }
    expect([0, 1, 2, 3].map(cellUp)).toEqual([true, false, true, false]);
    expect(SOLDER_BAND[0]).toBeLessThan(SOLDER_BAND[1]);
    // Both orientations of the new cell come up.
    expect(new Set(seeds.map((s) => packLayout(s).freshUp)).size).toBe(2);
  });

  it('props: two of each direction, diagonal motors spin the same way', () => {
    for (const s of seeds.slice(0, 10)) {
      const L = propLayout(s);
      expect(L.spin[0]).toBe(L.spin[2]);
      expect(L.spin[1]).toBe(L.spin[3]);
      expect(L.spin[0]).toBe(-L.spin[1]);
      expect(L.propSpin.filter((d) => d > 0)).toHaveLength(2);
    }
  });
});

describe('realistic rocket repairs', () => {
  it('rockets are safed with RBF pins first and every pin is pulled last', () => {
    for (const s of [0, 1, 2, 3]) {
      const ks = fixRigFor('rockets', s).tasks;
      expect(ks[0]).toEqual({ k: 'rbf', dir: 'in' });
      expect(ks[ks.length - 1]).toEqual({ k: 'rbf', dir: 'out' });
    }
    const r0 = fixRigFor('rockets', 0).tasks.map((t) => t.k);
    expect(r0.indexOf('drain')).toBeLessThan(r0.indexOf('vent'));
    expect(r0.indexOf('vent')).toBeLessThan(r0.indexOf('swap'));
    expect(fixRigFor('rockets', 2).tasks.map((t) => t.k)).toContain('gimbal');
    expect(fixRigFor('rockets', 3).tasks.map((t) => t.k)).toContain('tiles');
    expect(buildRigFor('rockets', 0).tasks.map((t) => t.k)).toContain('gimbal');
  });

  it('RBF devices sit apart on the panel', () => {
    const L = rbfLayout(fixRigFor('rockets', 0));
    for (let i = 0; i < L.spots.length; i++)
      for (let j = i + 1; j < L.spots.length; j++) expect(dist(L.spots[i], L.spots[j])).toBeGreaterThan(0.15);
  });

  it('gimbal starts visibly off target on both axes', () => {
    for (const s of seeds) {
      const L = gimbalLayout(s);
      for (const o of L.start) {
        expect(Math.abs(o)).toBeGreaterThan(GIMBAL_TOL * 3);
        expect(Math.abs(o)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('heat shield: two cracked tiles, spares hold their part numbers and look-alikes', () => {
    for (const s of seeds) {
      const L = tileLayout(s);
      expect(L.cracked).toHaveLength(2);
      expect(new Set(L.tiles.map((t) => t.id)).size).toBe(L.tiles.length);
      expect(new Set(L.spares).size).toBe(L.spares.length);
      for (const i of L.cracked) expect(L.spares).toContain(L.tiles[i].id);
      expect(L.spares).toHaveLength(4);
    }
  });
});
