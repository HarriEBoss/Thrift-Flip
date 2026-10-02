import { describe, expect, it } from 'vitest';
import {
  CircularityMeter,
  CoverageGrid,
  DONE_AT,
  PathTracer,
  connectWire,
  crackPath,
  eraseScore,
  makeWirePuzzle,
  paintScore,
  peelStep,
  polishScore,
  rustScore,
  sandScore,
  stickerScore,
  wireScore,
  wireSolved,
} from '../../src/core/minigame';

function fullGrid(n = 16, amount = 1): CoverageGrid {
  const g = new CoverageGrid(n);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) g.setCell(x, y, amount);
  return g;
}

describe('CoverageGrid', () => {
  it('tracks the mask and un-masks cells', () => {
    const g = fullGrid();
    expect(g.size).toBe(64);
    g.setCell(4, 4, 0);
    expect(g.size).toBe(63);
    expect(g.isMasked(4, 4)).toBe(false);
    g.setCell(5, 5, 2);
    expect(g.size).toBe(63);
    expect(g.amountAt(5, 5)).toBe(2);
    g.setCell(0, 0, 0);
    expect(new CoverageGrid(4).clearedFraction()).toBe(1);
    expect(new CoverageGrid(4).removedFraction()).toBe(1);
    expect(new CoverageGrid(4).outsideWork()).toBe(0);
    expect(new CoverageGrid(4).overworkedFraction(1)).toBe(0);
  });
  it('interpolated strokes clear without gaps even for fast swipes', () => {
    const g = fullGrid();
    // A single fast swipe across each row centre.
    for (let y = 4; y < 12; y++) g.stroke(0.2, (y + 0.5) / 16, 0.8, (y + 0.5) / 16, 0.07, 1);
    expect(g.clearedFraction()).toBeGreaterThan(0.95);
    expect(eraseScore(g.clearedFraction())).toBe(1);
  });
  it('harder cells need more passes; rust score weights hardness', () => {
    const g = fullGrid(16, 3);
    g.stroke(0.25, 0.5, 0.75, 0.5, 0.05, 0.5);
    const once = g.removedFraction();
    expect(once).toBeGreaterThan(0);
    expect(g.clearedFraction()).toBeLessThan(once + 0.5);
    expect(rustScore(g)).toBeCloseTo(Math.min(1, once / DONE_AT));
  });
  it('outside work counts as overspray and lowers the paint score', () => {
    const clean = fullGrid();
    const messy = fullGrid();
    for (let y = 4; y < 12; y++) {
      clean.stroke(0.25, (y + 0.5) / 16, 0.75, (y + 0.5) / 16, 0.06, 1);
      messy.stroke(0.0, (y + 0.5) / 16, 1.0, (y + 0.5) / 16, 0.06, 1);
    }
    messy.stroke(0.05, 0.05, 0.95, 0.05, 0.1, 1);
    expect(messy.outsideWork()).toBeGreaterThan(clean.outsideWork());
    expect(paintScore(messy)).toBeLessThan(paintScore(clean));
    expect(paintScore(clean, 1, true)).toBeGreaterThanOrEqual(paintScore(clean));
  });
  it('over-sanding reduces evenness', () => {
    const even = fullGrid();
    const over = fullGrid();
    for (let y = 4; y < 12; y++) even.stroke(0.25, (y + 0.5) / 16, 0.75, (y + 0.5) / 16, 0.06, 1);
    for (let k = 0; k < 8; k++)
      for (let y = 4; y < 12; y++) over.stroke(0.25, (y + 0.5) / 16, 0.75, (y + 0.5) / 16, 0.06, 1);
    expect(sandScore(over)).toBeLessThan(sandScore(even));
  });
});

describe('polish circularity', () => {
  it('circles score higher than straight back-and-forth', () => {
    const c = new CircularityMeter();
    expect(c.value()).toBe(0);
    for (let i = 0; i < 80; i++) c.add(0.5 + 0.08 * Math.cos(i / 3), 0.5 + 0.08 * Math.sin(i / 3));
    const s = new CircularityMeter();
    for (let i = 0; i < 80; i++) s.add(i % 2 ? 0.2 : 0.8, 0.5);
    s.add(0.8, 0.5);
    expect(c.value()).toBeGreaterThan(0.6);
    expect(s.value()).toBeLessThan(0.2);
    c.decay();
    expect(polishScore(1, 1)).toBe(1);
    expect(polishScore(1, 0)).toBeCloseTo(0.7);
  });
});

describe('glue path tracing', () => {
  it('rewards following the crack', () => {
    const path = crackPath(42);
    expect(path).toHaveLength(9);
    expect(crackPath(42)).toEqual(path);
    const good = new PathTracer(path, 0.04);
    for (const p of path) good.add(p.x, p.y, 0.05);
    expect(good.coverage()).toBe(1);
    expect(good.accuracy()).toBe(1);
    expect(good.score()).toBe(1);
    const bad = new PathTracer(path, 0.04);
    bad.add(0.01, 0.99, 0.5);
    for (const p of path.slice(0, 4)) bad.add(p.x, p.y, 0.05);
    expect(bad.score()).toBeLessThan(0.5);
    expect(new PathTracer(path, 0.04).accuracy()).toBe(1);
  });
});

describe('sticker peel', () => {
  it('slow peel is clean, fast peel tears', () => {
    let s = { progress: 0, torn: false };
    for (let i = 0; i < 10; i++) s = peelStep(s, 0.1, 1, 2);
    expect(s.progress).toBeCloseTo(1);
    expect(stickerScore(s)).toBe(1);
    expect(peelStep(s, 0.1, 9, 2)).toBe(s);
    const torn = peelStep({ progress: 0.3, torn: false }, 0.1, 5, 2);
    expect(torn.torn).toBe(true);
    expect(stickerScore(torn)).toBe(0.6);
    expect(stickerScore({ progress: 0.5, torn: false })).toBeCloseTo(0.3);
    expect(peelStep({ progress: 0.2, torn: false }, -0.1, 99, 2).torn).toBe(false);
  });
});

describe('wire puzzle', () => {
  it('connects matching wires and counts mistakes', () => {
    const p = makeWirePuzzle(7, 4);
    expect(p.rightOrder).not.toEqual([0, 1, 2, 3]);
    const wrongSlot = p.rightOrder.findIndex((c) => c !== 0);
    expect(connectWire(p, 0, wrongSlot)).toBe(false);
    expect(p.mistakes).toBe(1);
    for (let l = 0; l < 4; l++) expect(connectWire(p, l, p.rightOrder.indexOf(l))).toBe(true);
    expect(connectWire(p, 0, p.rightOrder.indexOf(0))).toBe(false);
    expect(wireSolved(p)).toBe(true);
    expect(wireScore(p)).toBeCloseTo(0.85);
    // Never trivially aligned even for seeds that shuffle into order.
    for (let s = 0; s < 50; s++) expect(makeWirePuzzle(s, 3).rightOrder).not.toEqual([0, 1, 2]);
  });
});
