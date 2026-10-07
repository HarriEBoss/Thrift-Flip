import Phaser from 'phaser';
import { MiniGame, STAGE, type MiniCtx } from './MiniGame';
import { gridFromLayer } from '../art/damage';
import {
  CircularityMeter,
  CoverageGrid,
  DONE_AT,
  POLISH_DONE,
  eraseScore,
  polishScore,
  rustScore,
  sandScore,
} from '../../core/minigame';
import { session } from '../session';
import { C } from '../theme';

type EraseKind = 'scrub' | 'rust' | 'sand' | 'polish';

interface EraseSpec {
  radius: number;
  power: number;
  particle: string;
  tints: number[];
  sound: 'scrub' | 'brush' | 'sand' | 'squeak';
}

interface Segment {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  dt: number;
}

/**
 * Erase-style restoration (scrub, rust, sand, polish). Pointer moves are queued and processed
 * once per frame: the same interpolated brush stamps update a 64x64 CPU grid (completion and
 * score) and erase the layer canvas with a pre-rendered brush image. One texture upload and at
 * most one particle burst per frame keep it smooth on phones.
 */
export class EraseGame extends MiniGame {
  private grid!: CoverageGrid;
  private canvas!: HTMLCanvasElement;
  private texture!: Phaser.Textures.CanvasTexture;
  private orig!: ImageData;
  private out!: ImageData;
  private pending: Segment[] = [];
  private last: { u: number; v: number } | null = null;
  private spec!: EraseSpec;
  private circle = new CircularityMeter();
  private circSum = 0;
  private circN = 0;
  private lastMilestone = 0;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lastFx = 0;

  constructor(
    ctx: MiniCtx,
    private kind: EraseKind,
  ) {
    super(ctx);
  }

  start(): void {
    const { set, tools } = this.ctx;
    this.canvas = set.layers[this.kind]!;
    const img = this.ctx.layerImages[this.kind]!;
    this.texture = img.texture as Phaser.Textures.CanvasTexture;
    const hardness = this.kind === 'rust' && set.rustHardness ? set.rustHardness : () => 1;
    this.grid = gridFromLayer(
      this.canvas,
      (u, v) => Math.max(1, hardness(u, v)),
      this.kind === 'polish' ? 20 : 40,
    );
    const specs: Record<EraseKind, EraseSpec> = {
      scrub: {
        radius: 0.075 * tools.scrubBrush,
        power: 0.34,
        particle: 'p_ring',
        tints: [0xffffff, 0xd8f3ff, 0xbfe8ff],
        sound: 'scrub',
      },
      rust: {
        radius: 0.06 * tools.rustBrush,
        power: 0.2 * tools.rustPower,
        particle: 'p_flake',
        tints: [0xc46a2b, 0xa0522d, 0x73371e],
        sound: 'brush',
      },
      sand: {
        radius: 0.08 * tools.sandBrush,
        power: 0.3,
        particle: 'p_dot',
        tints: [0xe2cfa9, 0xcbb38a, 0xf1e3c5],
        sound: 'sand',
      },
      // Polish: bigger, stronger cloth so it is quick even with small, wobbly circles.
      polish: {
        radius: 0.11,
        power: 0.45 * tools.polishRate,
        particle: 'p_spark',
        tints: [C.gold, 0xffffff, 0xfff2b0],
        sound: 'squeak',
      },
    };
    this.spec = specs[this.kind];
    const lx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.orig = lx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.out = lx.createImageData(this.canvas.width, this.canvas.height);
    this.emitter = this.add(
      this.ctx.scene.add.particles(0, 0, this.spec.particle, {
        speed: { min: 50, max: 150 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 600 },
        gravityY: this.spec.particle === 'p_flake' || this.spec.particle === 'p_dot' ? 300 : -60,
        tint: this.spec.tints,
        emitting: false,
      }),
    );
    this.makeCursor();
  }

  instruction(): string {
    return `mg.${this.kind}`;
  }

  progress(): number {
    if (this.kind === 'rust') return Math.min(1, this.grid.removedFraction() / DONE_AT);
    return Math.min(1, this.grid.clearedFraction() / (this.kind === 'polish' ? POLISH_DONE : DONE_AT));
  }

  score(): number {
    switch (this.kind) {
      case 'scrub':
        return eraseScore(this.grid.clearedFraction());
      case 'rust':
        return rustScore(this.grid);
      case 'sand':
        return sandScore(this.grid);
      case 'polish':
        return polishScore(this.grid.clearedFraction(), this.circN ? this.circSum / this.circN : 0);
    }
  }

  autoComplete(): boolean {
    return this.progress() >= 1;
  }

  override pointerDown(u: number, v: number): void {
    this.last = { u, v };
    this.moveCursor(u, v);
    this.pending.push({ u0: u, v0: v, u1: u, v1: v, dt: 0.016 });
    session.haptic('light');
  }

  override pointerMove(u: number, v: number, down: boolean, dt: number): void {
    this.moveCursor(u, v, true);
    if (!down || !this.last) return;
    this.pending.push({ u0: this.last.u, v0: this.last.v, u1: u, v1: v, dt });
    this.last = { u, v };
  }

  override pointerUp(): void {
    this.last = null;
    this.cursor?.setVisible(false);
  }

  override update(): void {
    if (!this.pending.length) return;
    const segs = this.pending;
    this.pending = [];
    const { radius } = this.spec;
    let removed = 0;
    let travel = 0;
    let time = 0;
    for (const sg of segs) {
      let power = this.spec.power;
      if (this.kind === 'polish') {
        const c = this.circle.add(sg.u1, sg.v1);
        this.circle.decay(0.97);
        this.circSum += c;
        this.circN++;
        // Circles help, but straight rubbing still works.
        power *= 0.6 + 0.4 * c;
      }
      removed += this.grid.stroke(sg.u0, sg.v0, sg.u1, sg.v1, radius, power);
      travel += Math.hypot(sg.u1 - sg.u0, sg.v1 - sg.v0);
      time += sg.dt;
    }
    this.renderLayer();
    this.texture.refresh();
    const end = segs[segs.length - 1];
    const now = performance.now();
    if (removed > 0.01) {
      this.sfx(this.spec.sound, Math.min(1, travel / Math.max(0.001, time) / 2.5));
      if (now - this.lastFx > 90 && !session.settings().reducedMotion) {
        this.lastFx = now;
        this.emitter?.explode(3, end.u1 * STAGE, end.v1 * STAGE);
      }
    }
    const milestone = Math.floor(this.progress() * 4);
    if (milestone > this.lastMilestone && milestone < 4) {
      this.lastMilestone = milestone;
      session.haptic('light');
    }
  }

  /**
   * Pixel-art erasing: each layer pixel shows its original grime scaled by how much damage is left
   * in its grid cell, in a few chunky steps (full, 70%, 40%, gone).
   */
  private renderLayer(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const n = this.grid.n;
    const { mask, amount, start } = this.grid;
    const src = this.orig.data;
    const dst = this.out.data;
    for (let y = 0; y < h; y++) {
      const cy = Math.min(n - 1, Math.floor((y * n) / h)) * n;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const cell = cy + Math.min(n - 1, Math.floor((x * n) / w));
        let level = 1;
        if (mask[cell]) {
          const f = start[cell] > 0 ? amount[cell] / start[cell] : 0;
          level = f <= 0.02 ? 0 : f < 0.4 ? 0.4 : f < 0.75 ? 0.7 : 1;
        }
        dst[i] = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = src[i + 3] * level;
      }
    }
    this.canvas.getContext('2d')!.putImageData(this.out, 0, 0);
  }

  override finishVisuals(): void {
    // Wipe whatever is left so the item looks finished; the score already reflects the work.
    const img = this.ctx.layerImages[this.kind];
    if (img) this.ctx.scene.tweens.add({ targets: img, alpha: 0, duration: 350 });
    this.burst(0.5, 0.5, 'p_spark', 24, [C.gold, 0xffffff], 260);
  }
}

export { STAGE };
