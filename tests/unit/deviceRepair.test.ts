import { describe, expect, it } from 'vitest';
import {
  BEEP_CODES,
  STRIP_LEN,
  STRIP_MAX_SPEED,
  cmosLayout,
  esdSteps,
  lintLayout,
  postCode,
  postLayout,
  pullSpeed,
  zifLayout,
} from '../../src/core/deviceRepair';
import { fixRigFor, repairRig } from '../../src/core/repair';

const seeds = Array.from({ length: 40 }, (_, i) => (i + 1) * 7919);
const ks = (cat: 'phones' | 'tech', s: number) => fixRigFor(cat, s).tasks.map((t) => t.k);

describe('realistic phone repairs', () => {
  it('smartphones: strips before the battery comes out, the port is cleaned and a new seal goes on last', () => {
    const p = ks('phones', 2);
    expect(p[0]).toBe('unplug');
    expect(p.indexOf('strips')).toBeLessThan(p.indexOf('swap'));
    expect(p).toContain('lint');
    expect(p[p.length - 1]).toBe('seal');
    expect(ks('phones', 4)).toContain('seal');
    for (const s of [0, 1]) expect(ks('phones', s)).toContain('zif');
  });

  it('a strip pulled slowly comes out; a flick snaps it', () => {
    // 60 ms between moves over the whole length (the bot's pace) stays well under the limit.
    let v = 0;
    for (let i = 0; i < 30; i++) v = pullSpeed(v, STRIP_LEN / 30, 0.06);
    expect(v).toBeLessThan(STRIP_MAX_SPEED);
    let f = 0;
    for (let i = 0; i < 4; i++) f = pullSpeed(f, STRIP_LEN / 4, 0.03);
    expect(f).toBeGreaterThan(STRIP_MAX_SPEED);
  });

  it('ZIF: at least one ribbon has to be turned over', () => {
    for (const s of seeds) {
      for (const n of [1, 2] as const) {
        const L = zifLayout(s, n);
        expect(L.slots).toHaveLength(n);
        expect(L.up.some((u) => !u)).toBe(true);
      }
    }
  });

  it('the wooden pick and the metal pin swap places between phones', () => {
    const sides = new Set(seeds.map((s) => lintLayout(s).pick.u));
    expect(sides.size).toBe(2);
  });
});

describe('realistic computer repairs', () => {
  it('desktops power down safely and beep a code first; builds only need the strap', () => {
    const d = ks('tech', 0);
    expect(d.slice(0, 2)).toEqual(['esd', 'post']);
    expect(d).toContain('cmos');
    expect(esdSteps(false)).toEqual(['psu', 'unplug', 'drain', 'strap']);
    expect(esdSteps(true)).toEqual(['strap']);
    expect(repairRig('build', 'tech', 0, 'design').tasks[0]).toEqual({ k: 'esd', strapOnly: true });
    expect(ks('tech', 3)[0]).toBe('crt');
    expect(ks('tech', 4)[0]).toBe('contacts');
    expect(ks('tech', 1)).toContain('zif');
  });

  it('the beep code matches the fault, and it is always in the manual', () => {
    expect(postCode(fixRigFor('tech', 0).tasks).id).toBe('cpu');
    expect(postCode([{ k: 'swap', part: 'ram' }]).beeps).toBe('SSS');
    expect(postCode([{ k: 'swap', part: 'gpu' }]).id).toBe('gpu');
    expect(postCode([{ k: 'wires' }]).id).toBe('ok');
    expect(new Set(BEEP_CODES.map((b) => b.beeps)).size).toBe(BEEP_CODES.length);
    for (const s of seeds)
      for (const code of BEEP_CODES) {
        const L = postLayout(s, code);
        expect(L.rows).toHaveLength(5);
        expect(L.rows.filter((r) => r.id === code.id)).toHaveLength(1);
      }
  });

  it('the new coin cell comes both ways up', () => {
    expect(new Set(seeds.map((s) => cmosLayout(s).freshUp)).size).toBe(2);
  });
});
