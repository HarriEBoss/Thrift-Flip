import { describe, expect, it } from 'vitest';
import {
  SERVO_BAND,
  TORQUE_BAND,
  TORQUE_STRIP,
  beltLayout,
  chipStartTurn,
  flippedPlugs,
  headerLayout,
  leakLayout,
  plugSeat,
  ramLayout,
  servoStart,
  socketLayout,
  torqueLayout,
} from '../../src/core/assembly';
import { panelGeom, repairRig, type Pt } from '../../src/core/repair';

const inStage = (p: Pt) => p.u > 0.03 && p.u < 0.97 && p.v > 0.03 && p.v < 0.97;

describe('realistic assembly', () => {
  it('builds use the detailed steps in a real order', () => {
    const ks = (cat: Parameters<typeof repairRig>[1]) =>
      repairRig('build', cat, 0, 'design').tasks.map((t) => t.k);
    const pc = ks('tech');
    // Grounded first, then the CPU in the socket, paste and the cooler, the cooler screws in a cross.
    expect(pc.slice(0, 4)).toEqual(['esd', 'socket', 'swap', 'torque']);
    expect(pc).toContain('ram');
    expect(pc[pc.length - 1]).toBe('header');
    const car = ks('vehicles');
    expect(car.indexOf('hoist')).toBeLessThan(car.indexOf('torque'));
    expect(car.indexOf('torque')).toBeLessThan(car.indexOf('belt'));
    expect(ks('robots')).toEqual(expect.arrayContaining(['servo', 'socket']));
    const rocket = ks('rockets');
    expect(rocket.indexOf('cables')).toBeLessThan(rocket.indexOf('leak'));
    expect(rocket.indexOf('leak')).toBeLessThan(rocket.indexOf('pour'));
  });

  it('torque sequences follow the real patterns', () => {
    const rig = repairRig('build', 'tech', 0, 'design');
    // Cooler: a cross (each next screw is the diagonal opposite, or the other diagonal).
    const c = torqueLayout(rig, 'cooler');
    expect(c.order).toEqual([0, 2, 1, 3]);
    const [a, b] = [c.pts[c.order[0]], c.pts[c.order[1]]];
    expect(a.u).not.toBe(b.u);
    expect(a.v).not.toBe(b.v);
    // Nozzle: a star (each next bolt about opposite the last).
    const n = torqueLayout(repairRig('build', 'rockets', 0, 'design'), 'nozzle');
    for (let k = 0; k + 1 < n.order.length; k++) {
      const p = n.pts[n.order[k]];
      const q = n.pts[n.order[k + 1]];
      expect(Math.hypot(p.u - q.u, p.v - q.v)).toBeGreaterThan(0.2);
    }
    // Engine: from the middle outwards.
    const e = torqueLayout(repairRig('build', 'vehicles', 0, 'design'), 'engine');
    const g = panelGeom(repairRig('build', 'vehicles', 0, 'design'));
    const dist = e.order.map((i) => Math.abs(e.pts[i].u - g.cx));
    expect(dist[0]).toBeLessThan(dist[dist.length - 1]);
    for (const L of [c, n, e]) {
      expect([...L.order].sort()).toEqual(L.pts.map((_, i) => i));
      expect(L.labels.map((x) => x - 1).every((k, i) => L.order[k] === i)).toBe(true);
      L.pts.forEach((p) => expect(inStage(p)).toBe(true));
    }
    expect(TORQUE_BAND[1]).toBeLessThan(TORQUE_STRIP);
  });

  it('a chip always arrives turned the wrong way, and the socket lever opens away from it', () => {
    for (const chip of ['cpu', 'mcu'] as const) {
      const L = socketLayout(repairRig('build', chip === 'cpu' ? 'tech' : 'robots', 0, 'design'), chip);
      for (let s = 0; s < 50; s++) {
        const k = chipStartTurn(s * 7919, L.turns);
        expect(k).toBeGreaterThan(0);
        expect(k).toBeLessThan(L.turns);
      }
      expect(
        Math.hypot(L.lever.open.u - L.lever.closed.u, L.lever.open.v - L.lever.closed.v),
      ).toBeGreaterThan(0.05);
      expect(inStage(L.tray) && inStage(L.socket)).toBe(true);
    }
  });

  it('memory goes in A2 first; the notch is off-centre so the stick fits one way only', () => {
    const L = ramLayout(repairRig('build', 'tech', 0, 'design'));
    expect(L.slots.map((s) => s.id)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(L.slots[L.target].id).toBe('A2');
    expect(L.notch).not.toBe(0.5);
  });

  it('front panel: the standard pin-out, the key pin left free, LEDs polarised', () => {
    const L = headerLayout();
    const used = L.plugs.flatMap((p) => p.pins);
    expect(new Set(used).size).toBe(used.length);
    expect(used).not.toContain(L.key);
    expect(
      L.plugs
        .filter((p) => p.polar)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['hdd', 'pled']);
    const seats = L.plugs.map((p) => plugSeat(L, p));
    for (let i = 0; i < seats.length; i++)
      for (let j = i + 1; j < seats.length; j++)
        expect(Math.hypot(seats[i].u - seats[j].u, seats[i].v - seats[j].v)).toBeGreaterThan(0.06);
    const f = flippedPlugs(123);
    L.plugs.forEach((p, i) => {
      if (!p.polar) expect(f[i]).toBe(false);
    });
  });

  it('serpentine belt: every pulley once, ending at the tensioner', () => {
    const L = beltLayout();
    expect([...L.route].sort()).toEqual(L.pulleys.map((_, i) => i));
    expect(L.route[L.route.length - 1]).toBe(L.tensioner);
    expect(L.pulleys[L.tensioner].grooved).toBe(false);
    expect(L.pulleys.some((p) => !p.grooved && p.id === 'idler')).toBe(true);
  });

  it('a servo starts off-centre (below the 90 degree band); the leak is on one of the fuel fittings', () => {
    for (let s = 0; s < 30; s++) expect(servoStart(s * 31)).toBeLessThan(SERVO_BAND[0]);
    const rig = repairRig('build', 'rockets', 0, 'design');
    const L = leakLayout(rig, 99);
    expect(L.fittings.length).toBe(4);
    expect(L.leak).toBeGreaterThanOrEqual(0);
    expect(L.leak).toBeLessThan(4);
  });
});
