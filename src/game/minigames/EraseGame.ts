import Phaser from 'phaser';
import { MiniGame, STAGE, type MiniCtx } from './MiniGame';
import { gridFromLayer } from '../art/damage';
import { ctx2d } from '../art/itemArt';
import {
  CircularityMeter,
  CoverageGrid,
  DONE_AT,
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

/**
 * Erase-style restoration (scrub, rust, sand, polish). The damage layer canvas is erased with
 * soft brush stamps interpolated along each stroke; the same stamps update a 64x64 CPU grid
 * from which completion and score are computed.
 */
export class EraseGame extends MiniGame {
  private grid!: CoverageGrid;
  private canvas!: HTMLCanvasElement;
  private texture!: Phaser.Textures.CanvasTexture;
  private dirty = false;
  private last: { u: number; v: number } | null = null;
  private spec!: EraseSpec;
  private circle = new CircularityMeter();
  private circSum = 0;
  private circN = 0;
  private shine: Phaser.GameObjects.Graphics | null = null;
  private lastMilestone = 0;

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
      polish: {
        radius: 0.095,
        power: 0.3 * tools.polishRate,
        particle: 'p_spark',
        tints: [C.gold, 0xffffff, 0xfff2b0],
        sound: 'squeak',
      },
    };
    this.spec = specs[this.kind];
    this.makeCursor();
    if (this.kind === 'polish') {
      this.shine = this.add(this.ctx.scene.add.graphics());
      this.shine.setAlpha(0);
    }
  }

  instruction(): string {
    return `mg.${this.kind}`;
  }

  progress(): number {
    const p = this.kind === 'rust' ? this.grid.removedFraction() : this.grid.clearedFraction();
    return Math.min(1, p / DONE_AT);
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
    this.apply(u, v, u, v, 0.016);
    session.haptic('light');
  }

  override pointerMove(u: number, v: number, down: boolean, dt: number): void {
    this.moveCursor(u, v, true);
    if (!down || !this.last) return;
    this.apply(this.last.u, this.last.v, u, v, dt);
    this.last = { u, v };
  }

  override pointerUp(): void {
    this.last = null;
    this.cursor?.setVisible(false);
  }

  private apply(u0: number, v0: number, u1: number, v1: number, dt: number): void {
    const { radius } = this.spec;
    let power = this.spec.power;
    if (this.kind === 'polish') {
      const c = this.circle.add(u1, v1);
      this.circle.decay(0.97);
      this.circSum += c;
      this.circN++;
      power *= 0.35 + 0.65 * c;
    }
    const removed = this.grid.stroke(u0, v0, u1, v1, radius, power);
    // Visual erase along the same path.
    const ctx = ctx2d(this.canvas);
    const size = this.canvas.width;
    const dist = Math.hypot(u1 - u0, v1 - v0);
    const spacing = radius * 0.35;
    const steps = Math.max(1, Math.ceil(dist / spacing));
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const r = radius * size;
    const hard = this.kind === 'rust' ? 0.55 : this.kind === 'polish' ? 0.6 : 0.85;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = (u0 + (u1 - u0) * t) * size;
      const y = (v0 + (v1 - v0) * t) * size;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = Math.min(1, power * hard * 1.6);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.6, `rgba(0,0,0,${a * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.dirty = true;
    const speed = dist / Math.max(0.001, dt);
    if (removed > 0.01) {
      this.sfx(this.spec.sound, Math.min(1, speed / 2.5));
      if (Math.random() < 0.5) this.burst(u1, v1, this.spec.particle, 3, this.spec.tints, 140);
    }
    const p = this.progress();
    const milestone = Math.floor(p * 4);
    if (milestone > this.lastMilestone && milestone < 4) {
      this.lastMilestone = milestone;
      session.haptic('light');
    }
  }

  override update(): void {
    if (this.dirty) {
      this.texture.refresh();
      this.dirty = false;
      if (this.shine) this.shine.setAlpha(this.progress() * 0.8);
    }
  }

  override finishVisuals(): void {
    // Wipe whatever is left so the item looks finished; the score already reflects the work.
    const img = this.ctx.layerImages[this.kind];
    if (img) this.ctx.scene.tweens.add({ targets: img, alpha: 0, duration: 350 });
    this.burst(0.5, 0.5, 'p_spark', 24, [C.gold, 0xffffff], 260);
  }
}

export { STAGE };
