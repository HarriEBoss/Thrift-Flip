import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../../src/core/prng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs across seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('produces values in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 5);
      expect([3, 4, 5]).toContain(n);
      const f = r.range(2, 4);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThan(4);
    }
  });
  it('picks, chances, weights and shuffles', () => {
    const r = new Rng(9);
    expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    expect(() => r.pick([])).toThrow();
    let trues = 0;
    for (let i = 0; i < 1000; i++) if (r.chance(0.3)) trues++;
    expect(trues).toBeGreaterThan(200);
    expect(trues).toBeLessThan(400);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[r.weighted([1, 0, 3])]++;
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBeGreaterThan(counts[0]);
    expect(r.weighted([0, 0])).toBe(0);
    const arr = [1, 2, 3, 4, 5];
    expect(r.shuffle([...arr]).sort()).toEqual(arr);
  });
  it('forks without advancing and exposes state', () => {
    const r = new Rng(5);
    const s = r.state;
    const f1 = r.fork('x').next();
    expect(r.state).toBe(s);
    expect(r.fork('x').next()).toBe(f1);
    expect(r.fork('y').next()).not.toBe(f1);
  });
  it('hashSeed mixes strings and numbers distinctly', () => {
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
    expect(hashSeed(1)).not.toBe(hashSeed('1'));
  });
});
