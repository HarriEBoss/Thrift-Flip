import Phaser from 'phaser';
import { connectWire, wireScore, wireSolved, type WirePuzzle } from '../../../core/minigame';
import {
  BOLT_SECONDS,
  DRAIN_DONE,
  DUST_SECONDS,
  PASTE_BAND,
  POUR_BAND,
  POUR_RATE,
  boltLayout,
  cableSet,
  cableStyle,
  dustLayout,
  hoistLayout,
  pourLayout,
  pourScore,
  pourStep,
  swapLayout,
  type CableDef,
  type CableSetId,
  type Fluid,
  type PartKind,
  type PourLayout,
  type Pt,
  type SwapLayout,
  type TaskSpec,
  type WireLayout,
  type Zone,
} from '../../../core/repair';
import { hashSeed } from '../../../core/prng';
import {
  drawAirCan,
  drawBolt,
  drawCan,
  drawDust,
  drawEngine,
  drawPart,
  drawScrew,
} from '../../art/repairArt';
import { makeText } from '../../ui/widgets';
import { BeltTask, HeaderTask, LeakTask, RamTask, ServoTask, SocketTask, TorqueTask } from './assembly';
import { BatteryTask, FilterTask, FuseTask, ObdTask, PlugsTask, UnplugTask } from './carTasks';
import { LockoutTask, PackTask, PropsTask, UartTask } from './robotTasks';
import { GimbalTask, RbfTask, TilesTask, VentTask } from './rocketTasks';
import { cableLook, cableThickness, drawCableBody, drawPlug, drawSocket, strokeWire } from './cableArt';
import { C, FS } from '../../theme';
import { STAGE } from '../MiniGame';
import {
  RepairTask,
  at,
  drawGauge,
  drawRatchet,
  drawSlot,
  near,
  toUnit,
  type BotAction,
  type TaskHost,
} from './host';

/** Mains cable colours (brown, blue, green-yellow earth, black, grey) and low-voltage ones. */
const MAINS = [0x8b5a2b, 0x2f6fd0, 0x3fae49, 0x2a2a2e, 0x9a9aa2];
const LOW = [0xe03c31, 0x2a2a2e, 0xf2c12e, 0xf4f4f4, 0x2fa14d];
const SYMBOLS = ['●', '■', '▲', '◆', '★'];
const FLUID_COL: Record<Fluid, number> = { oil: 0xffc23d, coolant: 0x4fb6ff, fuel: 0xff8a3c };

function bezier(
  a: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  b: { x: number; y: number },
  steps = 22,
): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k0 = (1 - t) ** 3;
    const k1 = 3 * (1 - t) ** 2 * t;
    const k2 = 3 * (1 - t) * t * t;
    const k3 = t ** 3;
    pts.push(
      new Phaser.Math.Vector2(
        k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x,
        k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y,
      ),
    );
  }
  return pts;
}

// ---------------------------------------------------------------- wires

/** Connect each loose wire to the terminal with the same colour and symbol. */
export class WiresTask extends RepairTask {
  private colors: number[];
  private g!: Phaser.GameObjects.Graphics;
  private slots!: Phaser.GameObjects.Graphics;
  private termScrews: Phaser.GameObjects.Image[] = [];
  private termAngles: number[] = [];
  private tags: Phaser.GameObjects.Text[] = [];
  private drag: { l: number; u: number; v: number } | null = null;
  private built = false;

  constructor(
    h: TaskHost,
    private lay: WireLayout,
    private puzzle: WirePuzzle,
    /** Shown as soon as the cover is off (the only or first job), else when its turn comes. */
    private first: boolean,
  ) {
    super(h);
    this.colors = h.rig.mains ? MAINS : LOW;
  }

  private get n(): number {
    return this.lay.terminals.length;
  }

  override init(): void {
    if (this.first) this.build(false);
  }

  start(): void {
    if (!this.built) this.build(true);
  }

  private build(fade: boolean): void {
    this.built = true;
    const sc = this.h.scene;
    const brass = this.h.shared('repair_brass2', () => drawScrew(96, true));
    const pieces: Phaser.GameObjects.GameObject[] = [];
    this.g = this.put(sc.add.graphics());
    pieces.push(this.g);
    this.lay.terminals.forEach((tp, r) => {
      const p = at(tp);
      const s = this.put(sc.add.image(p.x, p.y, brass).setDisplaySize(STAGE * 0.07, STAGE * 0.07));
      this.termScrews.push(s);
      this.termAngles.push(0.6);
      const want = this.puzzle.rightOrder[r];
      const tag = this.put(sc.add.graphics());
      tag.fillStyle(this.colors[want], 1);
      tag.lineStyle(3, C.ink, 1);
      tag.fillRoundedRect(p.x - 20, p.y + STAGE * 0.045, 40, 30, 6);
      tag.strokeRoundedRect(p.x - 20, p.y + STAGE * 0.045, 40, 30, 6);
      const sym = this.put(
        makeText(sc, p.x, p.y + STAGE * 0.045 + 15, SYMBOLS[want], FS.tiny, C.white, {
          stroke: C.ink,
          strokeW: 4,
        }),
      );
      pieces.push(s, tag, sym);
    });
    // Loose wire tags (same symbols, so colour is never the only cue).
    this.lay.loose.forEach((lp, l) => {
      const p = at(lp);
      const t = this.put(
        makeText(sc, p.x + 26, p.y + 4, SYMBOLS[l], FS.tiny, C.white, { stroke: C.ink, strokeW: 4 }),
      );
      this.tags.push(t);
      pieces.push(t);
    });
    this.slots = this.put(sc.add.graphics());
    pieces.push(this.slots);
    this.redraw();
    if (fade) this.tw({ targets: pieces, alpha: { from: 0, to: 1 }, duration: this.ms(260) });
  }

  instruction(): string {
    return 'mg.wire';
  }

  progress(): number {
    return this.puzzle.connected.filter(Boolean).length / this.n;
  }

  override score(): number {
    return wireScore(this.puzzle);
  }

  bot(): BotAction {
    const l = this.puzzle.connected.findIndex((c) => !c);
    if (l < 0) return { a: 'wait' };
    return { a: 'drag', from: this.lay.loose[l], to: this.lay.terminals[this.puzzle.rightOrder.indexOf(l)] };
  }

  override pointerDown(u: number, v: number): void {
    for (let l = 0; l < this.n; l++) {
      if (this.puzzle.connected[l] || !near(this.lay.loose[l], u, v, 0.08)) continue;
      this.drag = { l, u, v };
      this.h.sfx('snap');
      this.haptic('light');
      this.redraw();
      return;
    }
  }

  override pointerMove(u: number, v: number): void {
    if (!this.drag) return;
    this.drag.u = u;
    this.drag.v = v;
    this.redraw();
  }

  override pointerUp(u: number, v: number): void {
    if (!this.drag) return;
    const l = this.drag.l;
    this.drag = null;
    for (let r = 0; r < this.n; r++) {
      const t = this.lay.terminals[r];
      if (!near(t, u, v, 0.08)) continue;
      if (connectWire(this.puzzle, l, r)) {
        this.h.sfx('snap');
        this.h.sfx('ding');
        this.haptic('success');
        this.h.burst(t.u, t.v, 'p_spark', 8, [0xffe08a, 0xffffff], 120);
        // The terminal screw tightens down on the wire.
        const ta = { a: this.termAngles[r] };
        this.tw({
          targets: ta,
          a: ta.a + Math.PI * 1.5,
          duration: 260,
          onUpdate: () => {
            this.termAngles[r] = ta.a;
          },
        });
        this.tags[l]?.setVisible(false);
      } else {
        this.h.sfx('buzz');
        this.haptic('medium');
        this.h.burst(t.u, t.v, 'p_spark', 10, [0xff9a3c, 0xffe08a], 180);
        this.h.shake();
      }
      break;
    }
    this.redraw();
    if (wireSolved(this.puzzle)) this.finish();
  }

  override update(): void {
    if (!this.built) return;
    const t = this.slots;
    t.clear();
    this.termScrews.forEach((im, i) =>
      drawSlot(t, im.x, im.y, (im.displayWidth / 2) * 0.66, this.termAngles[i], im.alpha),
    );
  }

  /**
   * Like real wiring: a multicore cable comes in through the grommet, its outer sheath stripped back,
   * and the insulated cores fan out. Mains cores end in twisted bare copper; low-voltage and vehicle
   * wiring ends in crimped ring terminals that go under the terminal screws.
   */
  private redraw(): void {
    const g = this.g;
    g.clear();
    const e = at(this.lay.entry);
    const mains = this.h.rig.mains;
    const sheathW = 12 + this.n * 7;
    const top = e.y - STAGE * 0.07;
    for (let l = 0; l < this.n; l++) {
      let end: Pt = this.lay.loose[l];
      const on = this.puzzle.connected[l];
      if (on) end = this.lay.terminals[this.puzzle.rightOrder.indexOf(l)];
      else if (this.drag?.l === l) end = { u: this.drag.u, v: this.drag.v };
      const p = at(end);
      // Connected cores come up under the screw from below; loose ones end a little short of the tip.
      const tip = { x: p.x, y: on ? p.y + 4 : p.y };
      const sx = e.x + (l - (this.n - 1) / 2) * 7;
      const pts = bezier(
        { x: sx, y: top },
        { x: sx, y: top - STAGE * 0.12 },
        { x: tip.x, y: tip.y + STAGE * 0.14 },
        { x: tip.x, y: tip.y + (mains ? 16 : 22) },
      );
      strokeWire(g, pts, 10, this.colors[l]);
      if (mains && l === 2) {
        // Green-yellow earth: yellow stripes along the green.
        for (let i = 0; i + 1 < pts.length; i += 2) {
          g.lineStyle(10, 0xf2d43a, 1);
          g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }
      }
      const last = pts[pts.length - 1];
      if (mains) {
        // Stripped end: a few twisted copper strands.
        for (let k = -1; k <= 1; k++) {
          g.lineStyle(2.4, k === 0 ? 0xe9b04a : 0xc98a2a, 1);
          g.beginPath();
          g.moveTo(last.x + k * 2, last.y);
          for (let q = 1; q <= 4; q++) g.lineTo(last.x + k * 2 + Math.sin(q * 1.7 + k) * 1.6, last.y - q * 4);
          g.strokePath();
        }
        g.fillStyle(0xfff1b8, 0.8);
        g.fillCircle(last.x, last.y - 15, 1.5);
      } else {
        // Crimp terminal: an insulated barrel (colour by wire size) and the ring.
        g.fillStyle(0x15121b, 1);
        g.fillRoundedRect(last.x - 7, last.y - 14, 14, 16, 3);
        g.fillStyle(l % 2 ? 0x2f6fd0 : 0xd8352a, 1);
        g.fillRoundedRect(last.x - 6, last.y - 13, 12, 14, 3);
        g.fillStyle(0xffffff, 0.3);
        g.fillRect(last.x - 4, last.y - 12, 3, 12);
        g.fillStyle(0xd0d4db, 1);
        g.fillRect(last.x - 3, last.y - 20, 6, 7);
        if (!on) {
          g.lineStyle(4, 0xd0d4db, 1);
          g.strokeCircle(last.x, last.y - 26, 6);
          g.lineStyle(1, 0xffffff, 0.6);
          g.strokeCircle(last.x - 1, last.y - 27, 5);
        }
      }
    }
    // The cable's outer sheath, stripped back above the grommet.
    const sheath = mains ? 0xdcdad3 : 0x232228;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(e.x - sheathW / 2 + 2, top, sheathW, e.y - top + 4, 5);
    g.fillStyle(sheath, 1);
    g.fillRoundedRect(e.x - sheathW / 2, top - 2, sheathW, e.y - top + 4, 5);
    g.fillStyle(0xffffff, mains ? 0.5 : 0.15);
    g.fillRect(e.x - sheathW / 2 + 3, top, 3, e.y - top - 2);
    g.lineStyle(1, 0x000000, 0.35);
    g.lineBetween(e.x - sheathW / 2 + 2, top + 1, e.x + sheathW / 2 - 2, top + 1);
  }
}

// ---------------------------------------------------------------- swap a part

/** Pull the broken part out to the bin, (fresh thermal paste,) then put the new part in its slot. */
export class SwapTask extends RepairTask {
  private sl: SwapLayout;
  private broken!: Phaser.GameObjects.Image;
  private fresh: Phaser.GameObjects.Image | null = null;
  private badge!: Phaser.GameObjects.Text;
  private stage: 'out' | 'paste' | 'in' = 'out';
  private drag: { u: number; v: number; ox: number; oy: number } | null = null;
  private paste: PasteStage | null = null;
  private bin: Phaser.GameObjects.Graphics | null = null;
  private socket: Phaser.GameObjects.Graphics | null = null;

  constructor(
    h: TaskHost,
    private spec: { part: PartKind; zone?: Zone; paste?: boolean; fit?: boolean },
  ) {
    super(h);
    this.sl = swapLayout(h.rig, spec);
  }

  override init(): void {
    const sc = this.h.scene;
    const part = this.spec.part;
    const sp = at(this.sl.slot);
    if (this.spec.fit) {
      // Building: an empty mount with its screw holes, waiting for the part.
      const g = this.put(sc.add.graphics());
      const w = this.sl.w * STAGE;
      const hh = this.sl.h * STAGE;
      g.fillStyle(0x0c0a10, 0.35);
      g.fillRoundedRect(sp.x - w / 2, sp.y - hh / 2, w, hh, 6);
      g.lineStyle(3, 0xe8e4f0, 0.75);
      const dash = 12;
      for (let x = sp.x - w / 2; x < sp.x + w / 2; x += dash * 2) {
        const e = Math.min(x + dash, sp.x + w / 2);
        g.lineBetween(x, sp.y - hh / 2, e, sp.y - hh / 2);
        g.lineBetween(x, sp.y + hh / 2, e, sp.y + hh / 2);
      }
      for (let y = sp.y - hh / 2; y < sp.y + hh / 2; y += dash * 2) {
        const e = Math.min(y + dash, sp.y + hh / 2);
        g.lineBetween(sp.x - w / 2, y, sp.x - w / 2, e);
        g.lineBetween(sp.x + w / 2, y, sp.x + w / 2, e);
      }
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        g.fillStyle(0x9aa0ab, 1);
        g.fillCircle(sp.x + dx * (w / 2 - 9), sp.y + dy * (hh / 2 - 9), 5);
        g.fillStyle(0x1a1720, 1);
        g.fillCircle(sp.x + dx * (w / 2 - 9), sp.y + dy * (hh / 2 - 9), 2.5);
      }
      this.socket = g;
      return;
    }
    const key = this.h.shared(`repair_partx_${part}`, () => drawPart(part, true));
    this.broken = this.put(
      sc.add.image(sp.x, sp.y, key).setDisplaySize(this.sl.w * STAGE, this.sl.h * STAGE),
    );
    this.badge = this.put(
      makeText(sc, sp.x + (this.sl.w * STAGE) / 2, sp.y - (this.sl.h * STAGE) / 2, '!', FS.small, C.white, {
        stroke: C.terracottaDark,
        strokeW: 8,
      }),
    );
  }

  start(): void {
    if (this.spec.fit) {
      // Nothing to take out: paste first if it needs it, then the new part.
      if (this.spec.paste) {
        this.stage = 'paste';
        this.paste = new PasteStage(this, this.h, this.sl.slot, () => {
          this.stage = 'in';
          this.showFresh();
        });
      } else {
        this.stage = 'in';
        this.showFresh();
      }
      return;
    }
    this.stage = 'out';
    // Parts bin where the broken part goes.
    const b = at(this.sl.bin);
    const bin = this.put(this.h.scene.add.graphics());
    const bw = STAGE * 0.15;
    const bh = STAGE * 0.11;
    bin.fillStyle(0x15121b, 0.9);
    bin.fillRoundedRect(b.x - bw / 2 - 4, b.y - bh / 2 - 4, bw + 8, bh + 8, 10);
    bin.fillStyle(0x5b616b, 1);
    bin.fillRoundedRect(b.x - bw / 2, b.y - bh / 2, bw, bh, 8);
    bin.fillStyle(0x2f333b, 1);
    bin.fillRoundedRect(b.x - bw / 2 + 6, b.y - bh / 2 + 6, bw - 12, bh * 0.35, 5);
    bin.lineStyle(3, 0xe03c31, 1);
    bin.lineBetween(b.x - 9, b.y + bh * 0.12, b.x + 9, b.y + bh * 0.32);
    bin.lineBetween(b.x + 9, b.y + bh * 0.12, b.x - 9, b.y + bh * 0.32);
    this.bin = bin;
    this.tw({ targets: bin, alpha: { from: 0, to: 1 }, duration: 200 });
    this.h.layer.bringToTop(this.broken);
    this.h.layer.bringToTop(this.badge);
    this.tw({ targets: this.badge, scale: { from: 1, to: 1.3 }, duration: 260, yoyo: true, repeat: 2 });
  }

  /** The new part slides in next to the bin. */
  private showFresh(): void {
    const key = this.h.shared(`repair_part_${this.spec.part}`, () => drawPart(this.spec.part, false));
    const fp = at(this.sl.fresh);
    this.fresh = this.put(
      this.h.scene.add.image(fp.x, fp.y, key).setDisplaySize(this.sl.w * STAGE, this.sl.h * STAGE),
    );
    this.tw({
      targets: this.fresh,
      alpha: { from: 0, to: 1 },
      y: { from: fp.y + 40, to: fp.y },
      duration: 240,
    });
  }

  instruction(): string {
    if (this.stage === 'paste') return 'mg.rep.paste';
    return this.stage === 'out' ? 'mg.rep.swapOut' : 'mg.rep.swapIn';
  }

  progress(): number {
    if (this.stage === 'out') return 0;
    if (this.stage === 'paste') return 0.33 + 0.33 * Math.min(1, (this.paste?.level ?? 0) / PASTE_BAND[0]);
    return 0.66;
  }

  override score(): number {
    return this.paste?.result ?? 1;
  }

  override level(): number | undefined {
    return this.stage === 'paste' ? this.paste?.level : undefined;
  }

  bot(): BotAction {
    if (this.stage === 'out')
      return { a: 'drag', from: toUnit(this.broken.x, this.broken.y), to: this.sl.bin };
    if (this.stage === 'paste') return { a: 'holdLevel', p: this.sl.slot, until: PASTE_BAND[0] + 0.07 };
    if (!this.fresh) return { a: 'wait' };
    return { a: 'drag', from: toUnit(this.fresh.x, this.fresh.y), to: this.sl.slot };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'paste') {
      this.paste?.down(u, v);
      return;
    }
    const img = this.stage === 'out' ? this.broken : this.fresh;
    if (!img) return;
    const p = toUnit(img.x, img.y);
    if (Math.abs(u - p.u) < this.sl.w / 2 + 0.04 && Math.abs(v - p.v) < this.sl.h / 2 + 0.04) {
      this.drag = { u, v, ox: img.x, oy: img.y };
      this.h.sfx('snap');
      this.haptic('light');
    }
  }

  override pointerMove(u: number, v: number): void {
    if (!this.drag) return;
    const img = this.stage === 'out' ? this.broken : this.fresh;
    img?.setPosition(this.drag.ox + (u - this.drag.u) * STAGE, this.drag.oy + (v - this.drag.v) * STAGE);
    if (this.stage === 'out')
      this.badge.setPosition(
        this.broken.x + this.broken.displayWidth / 2,
        this.broken.y - this.broken.displayHeight / 2,
      );
  }

  override pointerUp(u: number, v: number): void {
    if (this.stage === 'paste') {
      this.paste?.up();
      return;
    }
    if (!this.drag) return;
    this.drag = null;
    const sl = this.sl;
    if (this.stage === 'out') {
      const p = toUnit(this.broken.x, this.broken.y);
      if (Math.hypot(p.u - sl.slot.u, p.v - sl.slot.v) > 0.14) {
        const b = at(sl.bin);
        this.h.sfx('pop');
        this.badge.setVisible(false);
        this.tw({
          targets: this.broken,
          x: b.x,
          y: b.y,
          alpha: 0,
          scale: this.broken.scale * 0.6,
          duration: 320,
        });
        if (this.bin) this.tw({ targets: this.bin, alpha: 0, delay: 340, duration: 200 });
        if (this.spec.paste) {
          this.stage = 'paste';
          this.paste = new PasteStage(this, this.h, sl.slot, () => {
            this.stage = 'in';
            this.showFresh();
          });
        } else {
          this.stage = 'in';
          this.showFresh();
        }
      } else {
        const s0 = at(sl.slot);
        this.tw({ targets: this.broken, x: s0.x, y: s0.y, duration: 160 });
        this.badge.setPosition(s0.x + (sl.w * STAGE) / 2, s0.y - (sl.h * STAGE) / 2);
      }
    } else if (this.fresh) {
      if (near(sl.slot, u, v, 0.12)) {
        const s0 = at(sl.slot);
        this.fresh.setPosition(s0.x, s0.y);
        this.h.sfx('stamp');
        this.h.sfx('ding');
        this.haptic('success');
        this.h.burst(sl.slot.u, sl.slot.v, 'p_spark', 10, [0xffffff, 0xffe08a], 140);
        if (this.socket) this.tw({ targets: this.socket, alpha: 0, duration: 200 });
        this.finish();
      } else {
        const f0 = at(sl.fresh);
        this.tw({ targets: this.fresh, x: f0.x, y: f0.y, duration: 200 });
      }
    }
  }

  override update(dt: number): void {
    if (this.stage === 'paste') this.paste?.update(dt);
  }

  /** Lets the paste stage add its pieces to this task's objects. */
  add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    return this.put(o);
  }
}

/** Thermal paste on the CPU: hold to squeeze, let go when the dot is pea-sized (green band). */
class PasteStage {
  level = 0;
  result: number | null = null;
  private holding = false;
  private dot: Phaser.GameObjects.Graphics;
  private gauge: Phaser.GameObjects.Graphics;
  private gp: Pt;

  constructor(
    private owner: { add<T extends Phaser.GameObjects.GameObject>(o: T): T },
    private h: TaskHost,
    private p: Pt,
    private done: () => void,
  ) {
    this.dot = owner.add(h.scene.add.graphics());
    this.gauge = owner.add(h.scene.add.graphics());
    this.gp = { u: p.u + 0.13, v: p.v };
    this.draw();
  }

  down(u: number, v: number): void {
    if (this.result === null && near(this.p, u, v, 0.11)) this.holding = true;
  }

  up(): void {
    if (!this.holding) return;
    this.holding = false;
    if (this.level >= PASTE_BAND[0]) this.end();
  }

  update(dt: number): void {
    if (!this.holding || this.result !== null) return;
    this.level = pourStep(this.level, dt, 0.4);
    this.draw();
    if (this.level >= 1) {
      this.holding = false;
      this.end();
    }
  }

  private end(): void {
    this.result = pourScore(this.level, PASTE_BAND);
    this.h.sfx(this.result >= 1 ? 'ding' : 'fail');
    this.h.scene.tweens.add({ targets: this.gauge, alpha: 0, duration: 200 });
    this.done();
  }

  private draw(): void {
    const { x, y } = at(this.p);
    const r = 4 + this.level * STAGE * 0.04;
    const g = this.dot;
    g.clear();
    g.fillStyle(0x9aa0a8, 1);
    g.fillCircle(x, y, r);
    g.fillStyle(0xe8ebf0, 0.8);
    g.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.4);
    this.gauge.clear();
    drawGauge(this.gauge, this.gp, this.level, 0xd0d4da, PASTE_BAND);
  }
}

// ---------------------------------------------------------------- fluids

/** Pour oil or coolant to the green band, drain the old oil, or squeeze thermal paste. */
export class LevelTask extends RepairTask {
  private pl: PourLayout;
  private lvl: number;
  private holding = false;
  private result = 1;
  private ended = false;
  private glugT = 0;
  private gauge!: Phaser.GameObjects.Graphics;
  private can: Phaser.GameObjects.Image | null = null;
  private dot: Phaser.GameObjects.Graphics | null = null;
  private canHome = { x: 0, y: 0 };

  constructor(
    h: TaskHost,
    private mode: 'pour' | 'drain' | 'paste',
    private fluid: Fluid = 'oil',
  ) {
    super(h);
    this.pl = pourLayout(h.rig, mode, fluid);
    this.lvl = mode === 'drain' ? 0.9 : mode === 'paste' ? 0 : 0.15;
  }

  private get band(): [number, number] | null {
    return this.mode === 'pour' ? POUR_BAND : this.mode === 'paste' ? PASTE_BAND : null;
  }

  start(): void {
    const sc = this.h.scene;
    const cp = at(this.pl.cap);
    if (this.mode === 'pour') {
      if (this.h.rig.inside === 'bay' && this.fluid === 'oil') {
        // Oil filler cap on top of the new engine.
        const g = this.put(sc.add.graphics());
        g.fillStyle(0x1b1b20, 1);
        g.fillCircle(cp.x, cp.y, STAGE * 0.052);
        g.fillStyle(0xffd34d, 1);
        g.fillCircle(cp.x, cp.y, STAGE * 0.042);
        g.fillStyle(0xfff1b8, 0.7);
        g.fillCircle(cp.x - 5, cp.y - 5, STAGE * 0.014);
      }
      const key = this.h.shared(`repair_can_${this.fluid}`, () => drawCan(this.fluid, 160, 200));
      this.canHome = { x: cp.x + STAGE * 0.06, y: cp.y - STAGE * 0.1 };
      this.can = this.put(
        sc.add.image(this.canHome.x, this.canHome.y, key).setDisplaySize(STAGE * 0.13, STAGE * 0.16),
      );
      this.tw({ targets: this.can, alpha: { from: 0, to: 1 }, duration: 220 });
    } else if (this.mode === 'drain') {
      // Drain pan under the plug.
      const g = this.put(sc.add.graphics());
      g.fillStyle(0x15121b, 0.9);
      g.fillEllipse(cp.x, cp.y + STAGE * 0.07, STAGE * 0.2, STAGE * 0.06);
      g.fillStyle(0x3d4250, 1);
      g.fillEllipse(cp.x, cp.y + STAGE * 0.065, STAGE * 0.18, STAGE * 0.045);
    } else {
      this.dot = this.put(sc.add.graphics());
    }
    this.gauge = this.put(sc.add.graphics());
    this.draw();
  }

  instruction(): string {
    if (this.mode === 'drain') return 'mg.rep.drain';
    if (this.mode === 'paste') return 'mg.rep.paste';
    return { oil: 'mg.rep.pourOil', coolant: 'mg.rep.pourCoolant', fuel: 'mg.rep.pourFuel' }[this.fluid];
  }

  progress(): number {
    if (this.mode === 'drain') return Math.min(1, (0.9 - this.lvl) / (0.9 - DRAIN_DONE));
    return Math.min(1, this.lvl / (this.band ?? POUR_BAND)[0]);
  }

  override score(): number {
    return this.result;
  }

  override level(): number {
    return this.lvl;
  }

  bot(): BotAction {
    if (this.mode === 'drain') return { a: 'hold', p: this.pl.cap };
    const band = this.band ?? POUR_BAND;
    return { a: 'holdLevel', p: this.pl.cap, until: band[0] + (this.mode === 'paste' ? 0.07 : 0.04) };
  }

  override pointerDown(u: number, v: number): void {
    if (this.ended || !near(this.pl.cap, u, v, 0.11)) return;
    this.holding = true;
    this.can?.setPosition(this.canHome.x - STAGE * 0.02, this.canHome.y + STAGE * 0.03);
    if (this.mode === 'drain') this.h.sfx('pop');
  }

  override pointerUp(): void {
    if (!this.holding) return;
    this.holding = false;
    this.can?.setPosition(this.canHome.x, this.canHome.y);
    const band = this.band;
    if (band && this.lvl >= band[0]) this.end();
  }

  override update(dt: number): void {
    if (!this.holding || this.ended) return;
    const cap = this.pl.cap;
    if (this.mode === 'drain') this.lvl = Math.max(0, this.lvl - dt * POUR_RATE * 1.3);
    else this.lvl = pourStep(this.lvl, dt, this.mode === 'paste' ? 0.4 : POUR_RATE);
    this.glugT += dt;
    if (this.glugT > 0.22 && this.mode !== 'paste') {
      this.glugT = 0;
      this.h.sfx('glug');
    }
    if (this.mode === 'pour' && Math.random() < 0.4)
      this.h.burst(cap.u, cap.v - 0.02, 'p_dot', 1, [FLUID_COL[this.fluid]], 40);
    if (this.mode === 'drain' && Math.random() < 0.5)
      this.h.burst(cap.u, cap.v + 0.03, 'p_dot', 1, [0x2a1d0c, 0x5a3d14], 30);
    this.draw();
    if (this.mode === 'drain' ? this.lvl <= DRAIN_DONE : this.lvl >= 1) {
      this.holding = false;
      this.end();
    }
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    const band = this.band;
    this.result = band ? pourScore(this.lvl, band) : 1;
    if (this.result >= 1) {
      this.h.sfx('ding');
      this.haptic('success');
    } else {
      this.h.sfx('fail');
      this.h.burst(this.pl.cap.u, this.pl.cap.v, 'p_dot', 10, [0x3a2a10, 0xc78d14], 120);
    }
    if (this.mode === 'drain') this.h.sfx('stamp');
    this.tw({
      targets: [this.gauge, ...(this.can ? [this.can] : [])],
      alpha: 0,
      duration: 260,
      onComplete: () => this.finish(),
    });
  }

  private draw(): void {
    const col = this.mode === 'drain' ? 0x6a4a1c : this.mode === 'paste' ? 0xd0d4da : FLUID_COL[this.fluid];
    this.gauge.clear();
    drawGauge(this.gauge, this.pl.gauge, this.lvl, col, this.band);
    if (this.dot) {
      const { x, y } = at(this.pl.cap);
      const r = 4 + this.lvl * STAGE * 0.04;
      this.dot.clear();
      this.dot.fillStyle(0x9aa0a8, 1);
      this.dot.fillCircle(x, y, r);
    }
  }
}

// ---------------------------------------------------------------- bolts

interface Bolt {
  p: Pt;
  img: Phaser.GameObjects.Image;
  t: number;
  done: boolean;
  a: number;
}

/** Hold the ratchet on each bolt to undo it (engine mounts) or tighten it (new engine, GPU bracket). */
export class BoltsTask extends RepairTask {
  private bolts: Bolt[] = [];
  private holding: number | null = null;
  private ratchet!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private tickT = 0;
  private size: number;

  constructor(
    h: TaskHost,
    private spec: { n: number; dir: 'out' | 'in'; at: 'engine' | 'card' },
  ) {
    super(h);
    this.size = spec.at === 'card' ? STAGE * 0.045 : STAGE * 0.07;
  }

  override init(): void {
    if (this.spec.dir === 'out') this.make(false);
  }

  start(): void {
    if (this.spec.dir === 'in') this.make(true);
    this.ratchet = this.put(this.h.scene.add.graphics());
  }

  private make(loose: boolean): void {
    const key = this.h.shared('repair_bolt', () => drawBolt(96));
    this.marks = this.put(this.h.scene.add.graphics());
    boltLayout(this.h.rig, this.spec).forEach((p, i) => {
      const q = at(p);
      const img = this.put(this.h.scene.add.image(q.x, q.y, key).setDisplaySize(this.size, this.size));
      if (loose) {
        // A new bolt drops into its hole, still loose.
        img.setScale(img.scale * 1.35);
        this.tw({
          targets: img,
          alpha: { from: 0, to: 1 },
          y: { from: q.y - 60, to: q.y },
          duration: 260,
          delay: i * 80,
        });
      }
      this.bolts.push({ p, img, t: 0, done: false, a: i * 0.7 });
    });
    this.h.layer.bringToTop(this.marks);
  }

  instruction(): string {
    return this.spec.dir === 'out' ? 'mg.rep.boltsOut' : 'mg.rep.boltsIn';
  }

  progress(): number {
    return this.bolts.filter((b) => b.done).length / Math.max(1, this.bolts.length);
  }

  bot(): BotAction {
    const b = this.bolts.find((x) => !x.done);
    return b ? { a: 'hold', p: b.p } : { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.bolts.findIndex((b) => !b.done && near(b.p, u, v, 0.08));
    if (i < 0) return;
    this.holding = i;
    this.haptic('light');
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding === null) return;
    if (!near(this.bolts[this.holding].p, u, v, 0.11)) this.holding = null;
  }

  override pointerUp(): void {
    this.holding = null;
  }

  override update(dt: number): void {
    if (!this.marks) return;
    this.marks.clear();
    for (const b of this.bolts)
      if (b.img.alpha > 0.01)
        drawSlot(this.marks, b.img.x, b.img.y, b.img.displayWidth * 0.3, b.a, b.img.alpha);
    if (!this.ratchet) return;
    this.ratchet.clear();
    if (this.holding === null) return;
    const b = this.bolts[this.holding];
    b.t += dt;
    const turn = this.spec.dir === 'out' ? -1 : 1;
    b.a += dt * 9 * turn;
    // The ratchet handle swings back and forth while the bolt turns.
    drawRatchet(this.ratchet, b.img.x, b.img.y, -0.9 + Math.sin(b.t * 10) * 0.45);
    this.tickT += dt;
    if (this.tickT > 0.1) {
      this.tickT = 0;
      this.h.sfx('tick', 0.7);
    }
    if (b.t < BOLT_SECONDS) return;
    b.done = true;
    this.holding = null;
    this.ratchet.clear();
    const i = this.bolts.filter((x) => x.done).length - 1;
    if (this.spec.dir === 'out') {
      this.h.sfx('pop');
      this.haptic('medium');
      this.h.scene.tweens.chain({
        targets: b.img,
        tweens: [
          { y: b.img.y - STAGE * 0.05, scale: b.img.scale * 1.3, duration: 140, ease: 'Sine.out' },
          {
            x: -STAGE * 0.42 + i * STAGE * 0.06,
            y: -STAGE * 0.45,
            scale: b.img.scale,
            duration: 320,
            ease: 'Sine.inOut',
          },
        ],
      });
    } else {
      this.h.sfx('stamp');
      this.haptic('medium');
      this.tw({ targets: b.img, scale: b.img.scale / 1.35, duration: 160, ease: 'Back.out' });
      this.h.burst(b.p.u, b.p.v, 'p_spark', 5, [0xffffff, 0xc9ced6], 90);
    }
    if (this.bolts.every((x) => x.done)) this.h.scene.time.delayedCall(this.ms(380), () => this.finish());
  }
}

// ---------------------------------------------------------------- engine hoist

/** Engine swap: drag the old engine up out of the bay on the hoist, or lower the new one in. */
export class HoistTask extends RepairTask {
  private lay: ReturnType<typeof hoistLayout>;
  private eng: Phaser.GameObjects.Image | null = null;
  private chain!: Phaser.GameObjects.Graphics;
  private drag: { v: number; oy: number } | null = null;
  private moving = false;
  private hang: Pt;

  constructor(
    h: TaskHost,
    private dir: 'out' | 'in',
  ) {
    super(h);
    this.lay = hoistLayout(h.rig);
    const s = this.lay.seat;
    // The new engine hangs on the hoist where you can see and grab it.
    this.hang = { u: s.u, v: s.v - (s.v - this.lay.up.v) * 0.62 };
  }

  start(): void {
    const sc = this.h.scene;
    this.h.layer.bringToTop(this.h.engine);
    this.chain = this.h.scene.add.graphics();
    this.h.engine.add(this.chain);
    this.h.engine.sendToBack(this.chain);
    if (this.dir === 'out') {
      this.eng = this.h.engine.getByName('engine') as Phaser.GameObjects.Image | null;
    } else {
      const w = Math.round(this.lay.w * STAGE * 1.3);
      const hh = Math.round(this.lay.h * STAGE * 1.3);
      const key = this.h.shared('repair_engine_new', () => drawEngine(w, hh, false));
      const hp = at(this.hang);
      this.eng = sc.add.image(hp.x, hp.y, key).setDisplaySize(this.lay.w * STAGE, this.lay.h * STAGE);
      this.eng.setName('engine');
      this.h.engine.add(this.eng);
      this.moving = true;
      this.h.sfx('whoosh');
      this.tw({
        targets: this.eng,
        y: { from: hp.y - STAGE * 0.6, to: hp.y },
        duration: this.ms(520),
        ease: 'Sine.out',
        onComplete: () => (this.moving = false),
      });
    }
  }

  instruction(): string {
    return this.dir === 'out' ? 'mg.rep.hoistOut' : 'mg.rep.hoistIn';
  }

  progress(): number {
    if (!this.eng) return 0;
    const v = toUnit(this.eng.x, this.eng.y).v;
    const s = this.lay.seat.v;
    return this.dir === 'out'
      ? Math.min(1, Math.max(0, (s - v) / (s - this.lay.up.v)))
      : Math.min(1, Math.max(0, (v - this.hang.v) / (s - this.hang.v)));
  }

  bot(): BotAction {
    if (!this.eng || this.moving || this.finished) return { a: 'wait' };
    const from = toUnit(this.eng.x, this.eng.y + this.eng.displayHeight * 0.2);
    const s = this.lay.seat;
    const to =
      this.dir === 'out'
        ? { u: from.u, v: from.v - (s.v - this.lay.up.v) * 0.75 }
        : { u: from.u, v: from.v + (s.v - this.hang.v) };
    return { a: 'drag', from, to: { u: to.u, v: Math.max(0.03, Math.min(0.97, to.v)) } };
  }

  override pointerDown(u: number, v: number): void {
    if (!this.eng || this.moving || this.finished) return;
    const p = toUnit(this.eng.x, this.eng.y);
    if (Math.abs(u - p.u) < this.lay.w / 2 && Math.abs(v - p.v) < this.lay.h / 2 + 0.03) {
      this.drag = { v, oy: this.eng.y };
      this.h.sfx('snap');
      this.haptic('light');
    }
  }

  override pointerMove(_u: number, v: number): void {
    if (!this.drag || !this.eng) return;
    const top = at(this.lay.up).y;
    const seat = at(this.lay.seat).y;
    this.eng.y = Math.max(top, Math.min(seat, this.drag.oy + (v - this.drag.v) * STAGE));
  }

  override pointerUp(): void {
    if (!this.drag || !this.eng) return;
    this.drag = null;
    const eng = this.eng;
    const p = this.progress();
    if (p < 0.5) {
      // Not far enough: it swings back.
      const y = this.dir === 'out' ? at(this.lay.seat).y : at(this.hang).y;
      this.tw({ targets: eng, y, duration: this.ms(240), ease: 'Back.out' });
      return;
    }
    this.moving = true;
    if (this.dir === 'out') {
      this.h.sfx('whoosh');
      this.tw({
        targets: eng,
        y: at(this.lay.up).y - STAGE * 0.3,
        alpha: 0,
        duration: this.ms(420),
        ease: 'Sine.in',
        onComplete: () => {
          eng.destroy();
          this.chain.clear();
          this.h.layer.sendToBack(this.h.engine);
          this.finish();
        },
      });
    } else {
      this.tw({
        targets: eng,
        y: at(this.lay.seat).y,
        duration: this.ms(220),
        ease: 'Bounce.out',
        onComplete: () => {
          this.h.sfx('stamp');
          this.haptic('success');
          this.h.shake();
          this.h.burst(
            this.lay.seat.u,
            this.lay.seat.v + this.lay.h / 2,
            'p_dot',
            12,
            [0xb9b4c4, 0x8a8494],
            120,
          );
          this.h.scene.time.delayedCall(this.ms(380), () => {
            this.chain.clear();
            this.h.layer.sendToBack(this.h.engine);
            this.finish();
          });
        },
      });
    }
  }

  override update(): void {
    if (!this.chain || !this.eng || !this.eng.active || this.finished) return;
    // Hoist chain from the top down to a hook, then two chains to the engine's lifting eyes.
    const g = this.chain;
    g.clear();
    const e = this.eng;
    const top = e.y - e.displayHeight / 2 + e.displayHeight * 0.1;
    const hookY = Math.min(top - STAGE * 0.1, -STAGE * 0.3);
    chainLine(g, e.x, -STAGE / 2, e.x, hookY);
    for (const fx of [-0.2, 0.2]) chainLine(g, e.x, hookY, e.x + e.displayWidth * fx, top);
    // Hook.
    g.fillStyle(0x15121b, 1);
    g.fillCircle(e.x, hookY, 14);
    g.fillStyle(0xf2c12e, 1);
    g.fillCircle(e.x, hookY, 10);
  }
}

/** A chain as alternating light and dark links. */
function chainLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
  for (let i = 0; i < n; i++) {
    const ax = x0 + ((x1 - x0) * i) / n;
    const ay = y0 + ((y1 - y0) * i) / n;
    const bx = x0 + ((x1 - x0) * (i + 1)) / n;
    const by = y0 + ((y1 - y0) * (i + 1)) / n;
    g.lineStyle(9, 0x15121b, 0.9);
    g.lineBetween(ax, ay, bx, by);
    g.lineStyle(5, i % 2 ? 0xc9ced6 : 0x8d939d, 1);
    g.lineBetween(ax, ay, bx, by);
  }
}

// ---------------------------------------------------------------- cables and hoses

/** Plug each cable (motherboard) or hose (engine) into its matching socket, by shape and label. */
export class CablesTask extends RepairTask {
  private defs: CableDef[];
  private done: boolean[];
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private drag: { i: number; u: number; v: number } | null = null;
  private mistakes = 0;
  private bottom: number;
  private lastWarn = false;

  constructor(
    h: TaskHost,
    private set: CableSetId,
  ) {
    super(h);
    this.defs = cableSet(h.rig, set, hashSeed(h.inst.s, `cables_${set}`));
    this.done = this.defs.map(() => false);
    this.bottom = this.defs[0] ? this.defs[0].plug.v + 0.1 : 0.95;
  }

  start(): void {
    const sc = this.h.scene;
    const sockets = this.put(sc.add.graphics());
    for (const d of this.defs) {
      const s = at(d.socket);
      drawSocket(sockets, cableLook(this.set, d.id), s.x, s.y, d.w * STAGE, d.h * STAGE);
    }
    this.g = this.put(sc.add.graphics());
    // Socket labels go above the cables so a hose never hides them.
    const socketLabels = this.defs.map((d) => {
      const s = at(d.socket);
      return this.put(
        makeText(sc, s.x, s.y - (d.h * STAGE) / 2 - 20, d.label, FS.tiny, C.white, {
          stroke: C.ink,
          strokeW: 5,
        }),
      );
    });
    for (const d of this.defs) {
      const p = at(d.plug);
      this.labels.push(
        this.put(makeText(sc, p.x, p.y, d.label, FS.tiny, C.white, { stroke: C.ink, strokeW: 5 })),
      );
    }
    this.redraw();
    this.tw({
      targets: [sockets, this.g, ...socketLabels, ...this.labels],
      alpha: { from: 0, to: 1 },
      duration: 240,
    });
  }

  instruction(): string {
    if (this.lastWarn) return 'mg.car.powerLast';
    return cableStyle(this.set) === 'pins' ? 'mg.rep.cables' : 'mg.rep.hoses';
  }

  progress(): number {
    return this.done.filter(Boolean).length / this.defs.length;
  }

  override score(): number {
    return Math.max(0.6, 1 - this.mistakes * 0.12);
  }

  bot(): BotAction {
    const open = this.defs.map((_, k) => k).filter((k) => !this.done[k]);
    const i = open.find((k) => !this.defs[k].last) ?? open[0];
    if (i === undefined) return { a: 'wait' };
    return { a: 'drag', from: this.defs[i].plug, to: this.defs[i].socket };
  }

  private plugAt(i: number): Pt {
    if (this.done[i]) return this.defs[i].socket;
    if (this.drag?.i === i) return { u: this.drag.u, v: this.drag.v };
    return this.defs[i].plug;
  }

  override pointerDown(u: number, v: number): void {
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i];
      if (this.done[i]) continue;
      if (Math.abs(u - d.plug.u) < d.w / 2 + 0.035 && Math.abs(v - d.plug.v) < d.h / 2 + 0.035) {
        this.drag = { i, u, v };
        this.h.sfx('snap');
        this.haptic('light');
        this.redraw();
        return;
      }
    }
  }

  override pointerMove(u: number, v: number): void {
    if (!this.drag) return;
    this.drag.u = u;
    this.drag.v = v;
    this.redraw();
  }

  override pointerUp(u: number, v: number): void {
    if (!this.drag) return;
    const i = this.drag.i;
    this.drag = null;
    const hit = this.defs.findIndex(
      (d, j) => !this.done[j] && near(d.socket, u, v, Math.max(0.07, d.w * 0.7)),
    );
    if (hit === i && this.defs[i].last && this.defs.some((d, k) => k !== i && !this.done[k])) {
      // Power goes on last: anything plugged in live can short out.
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
      this.lastWarn = true;
    } else if (hit === i) {
      this.done[i] = true;
      const s = this.defs[i].socket;
      this.h.sfx('snap');
      this.h.sfx('ding');
      this.haptic('success');
      this.h.burst(s.u, s.v, 'p_spark', 8, [0xffffff, 0xffe08a], 110);
    } else if (hit >= 0) {
      // Wrong socket: it does not fit.
      this.mistakes++;
      this.h.sfx('buzz');
      this.haptic('medium');
      this.h.shake();
    }
    this.redraw();
    if (this.done.every(Boolean)) this.h.scene.time.delayedCall(this.ms(300), () => this.finish());
  }

  private redraw(): void {
    const g = this.g;
    g.clear();
    this.defs.forEach((d, i) => {
      const look = cableLook(this.set, d.id);
      const p = at(this.plugAt(i));
      const a = at({ u: d.plug.u, v: this.bottom });
      const w = d.w * STAGE;
      const hh = d.h * STAGE;
      const pts = bezier(
        a,
        { x: a.x, y: a.y - STAGE * 0.05 },
        { x: p.x, y: p.y + STAGE * 0.12 },
        { x: p.x, y: p.y + hh / 2 },
      );
      drawCableBody(g, look, pts, cableThickness(look, w));
      drawPlug(g, look, p.x, p.y, w, hh);
      if (this.done[i]) {
        g.lineStyle(3, 0x4cc65a, 0.9);
        g.strokeRoundedRect(p.x - w / 2 - 7, p.y - hh / 2 - 7, w + 14, hh + 14, 6);
      }
      this.labels[i]?.setPosition(p.x, p.y - hh / 2 - 16).setVisible(!this.done[i]);
    });
  }
}

// ---------------------------------------------------------------- dust

interface Bunny {
  p: Pt;
  img: Phaser.GameObjects.Image;
  t: number;
  gone: boolean;
}

/** Hold the air can over each dust bunny to blow it away. */
export class DustTask extends RepairTask {
  private bunnies: Bunny[] = [];
  private can!: Phaser.GameObjects.Image;
  private ptr: Pt | null = null;
  private puffT = 0;

  constructor(
    h: TaskHost,
    private n: number,
  ) {
    super(h);
  }

  override init(): void {
    dustLayout(this.h.rig, this.n, hashSeed(this.h.inst.s, 'dust')).forEach((p, i) => {
      const key = this.h.shared(`repair_dust${i % 3}`, () => drawDust(128, 11 + i * 7));
      const q = at(p);
      const img = this.put(this.h.scene.add.image(q.x, q.y, key).setDisplaySize(STAGE * 0.16, STAGE * 0.16));
      this.bunnies.push({ p, img, t: 0, gone: false });
    });
  }

  start(): void {
    const key = this.h.shared('repair_aircan', () => drawAirCan(90, 220));
    this.can = this.put(
      this.h.scene.add
        .image(0, 0, key)
        .setOrigin(0.3, 0.05)
        .setDisplaySize(STAGE * 0.075, STAGE * 0.18),
    );
    this.can.setVisible(false);
  }

  instruction(): string {
    return 'mg.rep.dust';
  }

  progress(): number {
    return this.bunnies.filter((b) => b.gone).length / Math.max(1, this.bunnies.length);
  }

  bot(): BotAction {
    const b = this.bunnies.find((x) => !x.gone);
    return b ? { a: 'hold', p: b.p } : { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    this.ptr = { u, v };
  }

  override pointerMove(u: number, v: number): void {
    if (this.ptr) this.ptr = { u, v };
  }

  override pointerUp(): void {
    this.ptr = null;
    this.can?.setVisible(false);
  }

  override update(dt: number): void {
    if (!this.ptr || !this.can || this.finished) return;
    const q = at(this.ptr);
    // The nozzle points at the finger from just below it, so the finger never hides the dust.
    this.can.setVisible(true).setPosition(q.x + STAGE * 0.02, q.y + STAGE * 0.04);
    this.puffT += dt;
    if (this.puffT > 0.12) {
      this.puffT = 0;
      this.h.sfx('spray', 0.5);
      this.h.burst(this.ptr.u, this.ptr.v, 'p_dot', 2, [0xffffff, 0xdfe6f0], 90);
    }
    let best: Bunny | null = null;
    for (const b of this.bunnies)
      if (
        !b.gone &&
        near(b.p, this.ptr.u, this.ptr.v, 0.09) &&
        (!best ||
          Math.hypot(b.p.u - this.ptr.u, b.p.v - this.ptr.v) <
            Math.hypot(best.p.u - this.ptr.u, best.p.v - this.ptr.v))
      )
        best = b;
    if (!best) return;
    best.t += dt;
    const k = 1 - (best.t / DUST_SECONDS) * 0.35;
    const q2 = at(best.p);
    best.img
      .setDisplaySize(STAGE * 0.16 * k, STAGE * 0.16 * k)
      .setPosition(q2.x + Math.sin(best.t * 50) * 3, q2.y);
    if (best.t < DUST_SECONDS) return;
    best.gone = true;
    const img = best.img;
    this.h.sfx('whoosh', 0.6);
    this.h.burst(best.p.u, best.p.v, 'p_dot', 10, [0x9a948a, 0xc8c2b6], 150);
    this.tw({
      targets: img,
      x: img.x + STAGE * 0.25,
      y: img.y - STAGE * 0.15,
      alpha: 0,
      scale: img.scale * 0.4,
      duration: 360,
    });
    if (this.bunnies.every((b) => b.gone)) {
      this.ptr = null;
      this.can.setVisible(false);
      this.h.scene.time.delayedCall(this.ms(300), () => this.finish());
    }
  }
}

/** The task object for one step of a rig. */
export function makeTask(
  h: TaskHost,
  spec: TaskSpec,
  wires: { lay: WireLayout; puzzle: WirePuzzle },
  first: boolean,
): RepairTask {
  switch (spec.k) {
    case 'wires':
      return new WiresTask(h, wires.lay, wires.puzzle, first);
    case 'swap':
      return new SwapTask(h, spec);
    case 'pour':
      return new LevelTask(h, 'pour', spec.fluid);
    case 'drain':
      return new LevelTask(h, 'drain', spec.fluid);
    case 'paste':
      return new LevelTask(h, 'paste');
    case 'bolts':
      return new BoltsTask(h, spec);
    case 'hoist':
      return new HoistTask(h, spec.dir);
    case 'cables':
      return new CablesTask(h, spec.set);
    case 'dust':
      return new DustTask(h, spec.n);
    case 'socket':
      return new SocketTask(h, spec.chip);
    case 'torque':
      return new TorqueTask(h, spec.at);
    case 'ram':
      return new RamTask(h);
    case 'header':
      return new HeaderTask(h);
    case 'belt':
      return new BeltTask(h);
    case 'servo':
      return new ServoTask(h);
    case 'leak':
      return new LeakTask(h);
    case 'obd':
      return new ObdTask(h);
    case 'plugs':
      return new PlugsTask(h, spec.n);
    case 'battery':
      return new BatteryTask(h, !!spec.fit);
    case 'filter':
      return new FilterTask(h);
    case 'fuse':
      return new FuseTask(h);
    case 'unplug':
      return new UnplugTask(h);
    case 'lockout':
      return new LockoutTask(h, spec.on);
    case 'uart':
      return new UartTask(h);
    case 'pack':
      return new PackTask(h);
    case 'props':
      return new PropsTask(h);
    case 'vent':
      return new VentTask(h);
    case 'rbf':
      return new RbfTask(h, spec.dir);
    case 'gimbal':
      return new GimbalTask(h);
    case 'tiles':
      return new TilesTask(h);
  }
}
