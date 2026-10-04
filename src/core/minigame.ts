/**
 * Pure mini-game logic (no rendering): coverage grids for erase-style games, path-following for
 * glue, circularity for polish, peel speed for stickers and the wire puzzle. The Phaser layer
 * stamps the same brushes onto textures for visuals; completion is always computed here, on a
 * low-res CPU grid, never by reading GPU pixels.
 */
import { Rng } from './prng';

export const GRID = 64;

/**
 * A GRID x GRID grid over a unit square. `mask` marks cells that count; `amount` is the remaining
 * damage in each masked cell (1 = one full pass to clear; rust can need 2-3 passes).
 */
export class CoverageGrid {
  readonly n: number;
  readonly mask: Uint8Array;
  readonly start: Float32Array;
  readonly amount: Float32Array;
  /** Total brush work applied per cell (for evenness / overspray scoring). */
  readonly work: Float32Array;
  private maskCount = 0;
  private startTotal = 0;

  constructor(n = GRID) {
    this.n = n;
    this.mask = new Uint8Array(n * n);
    this.start = new Float32Array(n * n);
    this.amount = new Float32Array(n * n);
    this.work = new Float32Array(n * n);
  }

  /** Sets a cell's initial damage (0 = clean / not part of the task). */
  setCell(cx: number, cy: number, amount: number): void {
    const i = cy * this.n + cx;
    const wasMasked = this.mask[i] === 1;
    if (amount > 0) {
      if (!wasMasked) this.maskCount++;
      this.mask[i] = 1;
      this.startTotal += amount - this.start[i];
      this.start[i] = amount;
      this.amount[i] = amount;
    } else if (wasMasked) {
      this.mask[i] = 0;
      this.maskCount--;
      this.startTotal -= this.start[i];
      this.start[i] = 0;
      this.amount[i] = 0;
    }
  }

  get size(): number {
    return this.maskCount;
  }

  /**
   * Applies a circular brush at unit coords (u, v) with radius r (unit), removing `power` per pass
   * at the centre (soft falloff). Returns the amount of damage removed.
   */
  stamp(u: number, v: number, r: number, power = 1): number {
    const n = this.n;
    const cx = u * n;
    const cy = v * n;
    const rr = r * n;
    let removed = 0;
    const x0 = Math.max(0, Math.floor(cx - rr));
    const x1 = Math.min(n - 1, Math.ceil(cx + rr));
    const y0 = Math.max(0, Math.floor(cy - rr));
    const y1 = Math.min(n - 1, Math.ceil(cy + rr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr) continue;
        const i = y * n + x;
        const fall = 1 - (Math.sqrt(d2) / Math.max(0.0001, rr)) * 0.5;
        const p = power * fall;
        this.work[i] += p;
        if (!this.mask[i] || this.amount[i] <= 0) continue;
        const take = Math.min(this.amount[i], p);
        this.amount[i] -= take;
        removed += take;
      }
    }
    return removed;
  }

  /**
   * Interpolated stamps from (u0,v0) to (u1,v1) so fast swipes never leave gaps.
   * Power is per unit of travel relative to the radius, so speed does not change total work much.
   */
  stroke(u0: number, v0: number, u1: number, v1: number, r: number, power = 1): number {
    const dist = Math.hypot(u1 - u0, v1 - v0);
    const spacing = Math.max(r * 0.35, 1e-4);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    let removed = 0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      removed += this.stamp(
        u0 + (u1 - u0) * t,
        v0 + (v1 - v0) * t,
        r,
        power * Math.min(1, dist / steps / spacing),
      );
    }
    return removed;
  }

  /** Fraction of masked cells that are fully cleared. */
  clearedFraction(): number {
    if (this.maskCount === 0) return 1;
    let c = 0;
    for (let i = 0; i < this.amount.length; i++) if (this.mask[i] && this.amount[i] <= 1e-6) c++;
    return c / this.maskCount;
  }

  /** Fraction of the total damage removed (weights harder cells more). */
  removedFraction(): number {
    if (this.startTotal <= 0) return 1;
    let left = 0;
    for (let i = 0; i < this.amount.length; i++) if (this.mask[i]) left += this.amount[i];
    return 1 - left / this.startTotal;
  }

  /** Work applied outside the mask, relative to the mask size (overspray). */
  outsideWork(): number {
    let w = 0;
    for (let i = 0; i < this.work.length; i++) if (!this.mask[i]) w += Math.min(1, this.work[i]);
    return this.maskCount ? w / this.maskCount : 0;
  }

  /** Fraction of masked cells that received far more work than needed (over-sanding). */
  overworkedFraction(limit: number): number {
    if (!this.maskCount) return 0;
    let c = 0;
    for (let i = 0; i < this.work.length; i++) if (this.mask[i] && this.work[i] - this.start[i] > limit) c++;
    return c / this.maskCount;
  }

  isMasked(cx: number, cy: number): boolean {
    return this.mask[cy * this.n + cx] === 1;
  }

  amountAt(cx: number, cy: number): number {
    return this.amount[cy * this.n + cx];
  }
}

// ---------------- scoring helpers ----------------

/** Scrub/rust/sand completion: done at >= 95% cleared. */
export const DONE_AT = 0.95;

export function eraseScore(cleared: number): number {
  return Math.max(0, Math.min(1, cleared / DONE_AT));
}

/** Rust: % cleared weighted by hardness. */
export function rustScore(grid: CoverageGrid): number {
  return Math.max(0, Math.min(1, grid.removedFraction() / DONE_AT));
}

/** Sand: coverage x evenness (over-sanded cells reduce evenness). */
export function sandScore(grid: CoverageGrid): number {
  const coverage = Math.min(1, grid.clearedFraction() / DONE_AT);
  const evenness = 1 - 0.6 * grid.overworkedFraction(3.5);
  return Math.max(0, coverage * evenness);
}

/** Paint: coverage - overspray penalty (+ small bonus for the weekly trend colour). */
export function paintScore(grid: CoverageGrid, oversprayMult = 1, trendBonus = false): number {
  const coverage = Math.min(1, grid.clearedFraction() / DONE_AT);
  const penalty = Math.min(0.6, grid.outsideWork() * 0.9 * oversprayMult);
  return Math.max(0, Math.min(1, coverage - penalty + (trendBonus ? 0.08 : 0)));
}

/**
 * Polish circularity: tracks heading changes; smooth consistent turning (circles) scores high,
 * straight back-and-forth scores low.
 */
export class CircularityMeter {
  private lastAngle: number | null = null;
  private lastTurn = 0;
  private sumTurn = 0;
  private sumLen = 0;
  private lx: number | null = null;
  private ly = 0;

  add(x: number, y: number): number {
    if (this.lx === null) {
      this.lx = x;
      this.ly = y;
      return this.value();
    }
    const dx = x - this.lx;
    const dy = y - this.ly;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return this.value();
    const a = Math.atan2(dy, dx);
    if (this.lastAngle !== null) {
      let d = a - this.lastAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      // Reversals (back-and-forth) are not circular motion.
      const consistent = Math.sign(d) === Math.sign(this.lastTurn) || this.lastTurn === 0;
      if (Math.abs(d) < 2.2 && consistent) this.sumTurn += Math.abs(d);
      this.lastTurn = d;
    }
    this.sumLen += len;
    this.lastAngle = a;
    this.lx = x;
    this.ly = y;
    return this.value();
  }

  /** 0..1: radians turned per unit of travel, normalised for a comfortable circle size. */
  value(): number {
    if (this.sumLen < 1e-3) return 0;
    const turnPerLen = this.sumTurn / this.sumLen;
    return Math.max(0, Math.min(1, turnPerLen / 8));
  }

  /** Decays history so the meter reflects recent motion. */
  decay(f = 0.92): void {
    this.sumTurn *= f;
    this.sumLen *= f;
  }
}

/** Polish completes at 85% shine: it is the longest erase game, so it finishes a little earlier. */
export const POLISH_DONE = 0.85;

export function polishScore(coverage: number, circularity: number): number {
  return Math.max(0, Math.min(1, Math.min(1, coverage / POLISH_DONE) * (0.75 + 0.25 * circularity)));
}

/** Glue: how well the player traced the crack path. */
export class PathTracer {
  readonly visited: boolean[];
  private offPath = 0;
  private onPath = 0;

  constructor(
    readonly path: Array<{ x: number; y: number }>,
    readonly tolerance: number,
  ) {
    this.visited = path.map(() => false);
  }

  /** Feed pointer positions (unit coords) while the nozzle is pressed. */
  add(x: number, y: number, travel: number): void {
    let near = false;
    for (let i = 0; i < this.path.length; i++) {
      const p = this.path[i];
      if (Math.hypot(p.x - x, p.y - y) <= this.tolerance) {
        this.visited[i] = true;
        near = true;
      }
    }
    if (near || this.distanceToPath(x, y) <= this.tolerance * 1.4) this.onPath += travel;
    else this.offPath += travel;
  }

  distanceToPath(x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i + 1 < this.path.length; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
      best = Math.min(best, Math.hypot(a.x + abx * t - x, a.y + aby * t - y));
    }
    return best;
  }

  coverage(): number {
    return this.visited.filter(Boolean).length / Math.max(1, this.visited.length);
  }

  accuracy(): number {
    const total = this.onPath + this.offPath;
    return total <= 0 ? 1 : this.onPath / total;
  }

  score(): number {
    return Math.max(0, Math.min(1, this.coverage() * (0.55 + 0.45 * this.accuracy())));
  }
}

/** A wobbly crack path across the item (unit coords), deterministic per seed. */
export function crackPath(seed: number, points = 9): Array<{ x: number; y: number }> {
  const rng = new Rng(seed);
  const horizontal = rng.chance(0.5);
  const out: Array<{ x: number; y: number }> = [];
  const base = rng.range(0.38, 0.62);
  for (let i = 0; i < points; i++) {
    const t = 0.24 + (0.52 * i) / (points - 1);
    const wob = rng.range(-0.06, 0.06);
    out.push(horizontal ? { x: t, y: base + wob } : { x: base + wob, y: t });
  }
  return out;
}

/**
 * A crack that stays inside the item: finds the longest straight run through the item outline
 * (horizontal or vertical, near the middle), trims the ends and wobbles points only where they stay
 * inside. `inside(u, v)` reports whether a unit-coordinate point is well inside the item.
 */
export function crackPathInMask(
  seed: number,
  inside: (u: number, v: number) => boolean,
  points = 9,
): Array<{ x: number; y: number }> {
  const rng = new Rng(seed);
  const samples = 64;
  const longestRun = (horizontal: boolean) => {
    let best = { len: 0, a: 0, b: 0, line: 0.5 };
    for (let i = 0; i <= 16; i++) {
      const line = 0.28 + (0.44 * i) / 16;
      let start = -1;
      for (let k = 0; k <= samples; k++) {
        const t = (k + 0.5) / samples;
        const ok = k < samples && (horizontal ? inside(t, line) : inside(line, t));
        if (ok && start < 0) start = k;
        if (!ok && start >= 0) {
          const len = (k - start) / samples;
          if (len > best.len) best = { len, a: start / samples, b: k / samples, line };
          start = -1;
        }
      }
    }
    return best;
  };
  const h = longestRun(true);
  const v = longestRun(false);
  const wantH = rng.chance(0.5);
  const horizontal = wantH ? h.len >= Math.max(0.22, v.len * 0.6) : !(v.len >= Math.max(0.22, h.len * 0.6));
  const run = horizontal ? h : v;
  if (run.len < 0.1) return crackPath(seed, points);
  const a = run.a + run.len * 0.12;
  const b = run.b - run.len * 0.12;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points; i++) {
    const t = a + ((b - a) * i) / (points - 1);
    const wob = rng.range(-0.035, 0.035);
    let p = horizontal ? { x: t, y: run.line + wob } : { x: run.line + wob, y: t };
    if (!inside(p.x, p.y)) p = horizontal ? { x: t, y: run.line } : { x: run.line, y: t };
    out.push(p);
  }
  return out;
}

/** Sticker peel: peel progress from a corner; moving faster than the safe speed tears it. */
export interface PeelState {
  progress: number;
  torn: boolean;
}

export function peelStep(s: PeelState, delta: number, speed: number, safeSpeed: number): PeelState {
  if (s.torn || s.progress >= 1) return s;
  const torn = speed > safeSpeed && delta > 0;
  let progress = Math.max(0, Math.min(1, s.progress + Math.max(0, delta)));
  if (progress > 0.995) progress = 1;
  return { progress, torn };
}

export function stickerScore(s: PeelState): number {
  if (s.torn) return 0.6;
  return s.progress >= 1 ? 1 : 0.6 * s.progress;
}

/** Wire puzzle: N wires; right side order shuffled deterministically. */
export interface WirePuzzle {
  colors: number[];
  rightOrder: number[];
  connected: boolean[];
  mistakes: number;
}

export function makeWirePuzzle(seed: number, n: number): WirePuzzle {
  const rng = new Rng(seed);
  const colors = Array.from({ length: n }, (_, i) => i);
  let right = rng.shuffle([...colors]);
  // Never trivially aligned.
  if (right.every((c, i) => c === i) && n > 1) right = [...right.slice(1), right[0]];
  return { colors, rightOrder: right, connected: colors.map(() => false), mistakes: 0 };
}

/** Try connecting left wire `l` to right slot `r`. Returns true when correct. */
export function connectWire(p: WirePuzzle, l: number, r: number): boolean {
  if (p.connected[l]) return false;
  if (p.rightOrder[r] === l) {
    p.connected[l] = true;
    return true;
  }
  p.mistakes++;
  return false;
}

export function wireSolved(p: WirePuzzle): boolean {
  return p.connected.every(Boolean);
}

export function wireScore(p: WirePuzzle): number {
  return Math.max(0.4, 1 - 0.15 * p.mistakes);
}
