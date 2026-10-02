import { describe, expect, it } from 'vitest';
import { cappedDpr, computeFrame, distribute, gridPositions } from '../../src/game/ui/layout';

const RATIOS: Array<[string, number, number]> = [
  ['9:32', 9, 32],
  ['9:21', 9, 21],
  ['9:16', 9, 16],
  ['3:4', 3, 4],
  ['1:1', 1, 1],
  ['4:3', 4, 3],
  ['16:9', 16, 9],
  ['21:9', 21, 9],
  ['32:9', 32, 9],
];

describe('computeFrame', () => {
  for (const [name, w, h] of RATIOS) {
    it(`fits the frame inside the screen at ${name}`, () => {
      const sw = w * 100;
      const sh = h * 100;
      const f = computeFrame(sw, sh);
      expect(Math.min(f.w, f.h)).toBe(720);
      expect(Math.max(f.w, f.h)).toBeGreaterThanOrEqual(720);
      expect(Math.max(f.w, f.h)).toBeLessThanOrEqual(1280);
      expect(f.w * f.scale).toBeLessThanOrEqual(sw + 1e-6);
      expect(f.h * f.scale).toBeLessThanOrEqual(sh + 1e-6);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      // centred
      expect(Math.abs(f.x * 2 + f.w * f.scale - sw)).toBeLessThan(1e-6);
      expect(Math.abs(f.y * 2 + f.h * f.scale - sh)).toBeLessThan(1e-6);
      // at least one axis is filled
      expect(Math.min(sw - f.w * f.scale, sh - f.h * f.scale)).toBeLessThan(1e-6);
    });
  }
  it('uses portrait for tall and landscape for wide screens', () => {
    expect(computeFrame(900, 1600).portrait).toBe(true);
    expect(computeFrame(1600, 900).portrait).toBe(false);
  });
  it('handles zero sizes', () => {
    expect(computeFrame(0, 0).scale).toBeGreaterThan(0);
  });
});

describe('layout helpers', () => {
  it('caps DPR at 3 and floors at 1', () => {
    expect(cappedDpr(5)).toBe(3);
    expect(cappedDpr(0.5)).toBe(1);
    expect(cappedDpr(undefined)).toBe(1);
    expect(cappedDpr(2)).toBe(2);
  });
  it('distributes cells', () => {
    expect(distribute(0, 100, 2)).toEqual([25, 75]);
    expect(distribute(0, 100, 0)).toEqual([]);
  });
  it('grid fits all items', () => {
    const g = gridPositions(7, { x: 0, y: 0, w: 700, h: 500 });
    expect(g.pos).toHaveLength(7);
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(7);
    expect(gridPositions(0, { x: 0, y: 0, w: 1, h: 1 }).pos).toEqual([]);
  });
});
