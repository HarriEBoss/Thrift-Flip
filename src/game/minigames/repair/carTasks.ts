import Phaser from 'phaser';
import {
  CIRCUITS,
  FILTER_TURNS,
  FUSE_COLOUR,
  GAP_BAND,
  GAP_RATE,
  OBD_READ_SECONDS,
  PLUG_TORQUE,
  PLUG_TURNS,
  TERMINAL_SECONDS,
  batteryConnector,
  batteryLayout,
  batterySteps,
  filterLayout,
  fuseLayout,
  misfireCylinder,
  obdLayout,
  plugLayout,
  troubleCode,
  type BatteryLayout,
  type BatteryStep,
  type FilterLayout,
  type FuseLayout,
  type ObdLayout,
  type PlugLayout,
} from '../../../core/carRepair';
import { angleDelta, type Pt } from '../../../core/repair';
import { makeText } from '../../ui/widgets';
import { C, FS } from '../../theme';
import { t } from '../../../i18n';
import { STAGE } from '../MiniGame';
import { RepairTask, at, drawGauge, drawRatchet, near, type BotAction, type TaskHost } from './host';
import { inset, scoreFor, tapped } from './assembly';

/** Follows a finger going round a centre; adds up the turning (clockwise is positive on screen). */
export class Twist {
  private last: number | null = null;
  total = 0;
  constructor(public c: Pt) {}
  down(u: number, v: number, r: number): boolean {
    if (!near(this.c, u, v, r)) return false;
    this.last = Math.atan2(v - this.c.v, u - this.c.u);
    return true;
  }
  /** The signed turn since the last move (0 when not twisting). */
  move(u: number, v: number): number {
    if (this.last === null) return 0;
    const a = Math.atan2(v - this.c.v, u - this.c.u);
    const d = angleDelta(this.last, a);
    this.last = a;
    return d;
  }
  up(): void {
    this.last = null;
  }
  get active(): boolean {
    return this.last !== null;
  }
}

/** A diagnosis stays pinned on a sticky note (top left) for the rest of the job. */
export function pinNote(h: TaskHost, code: string, text: string): void {
  const sc = h.scene;
  const p = at({ u: 0.2, v: 0.075 });
  const note = sc.add.container(p.x, p.y);
  const bg = sc.add.graphics();
  bg.fillStyle(0x000000, 0.25);
  bg.fillRect(-96, -24, 196, 54);
  bg.fillStyle(0xfff07a, 1);
  bg.fillRect(-100, -28, 196, 54);
  const desc = makeText(sc, -2, 12, text, FS.tiny, C.inkSoft, { bold: false }).setScale(0.75);
  if (desc.displayWidth > 186) desc.setScale((0.75 * 186) / desc.displayWidth);
  note.add([bg, makeText(sc, -2, -12, code, FS.small, C.ink), desc]);
  note.setAngle(-3);
  h.layer.add(note);
  h.sfx('pop');
}

// ---------------------------------------------------------------- OBD-II diagnosis

/** Plug the scanner into the OBD-II port, wait for it to read, note the trouble code. */
export class ObdTask extends RepairTask {
  private L: ObdLayout;
  private stage: 'plug' | 'read' | 'code' = 'plug';
  private plugAt: Pt;
  private drag: { u: number; v: number } | null = null;
  private readT = 0;
  private g!: Phaser.GameObjects.Graphics;
  private screen!: Phaser.GameObjects.Text;

  constructor(h: TaskHost) {
    super(h);
    this.L = obdLayout();
    this.plugAt = this.L.plug;
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    const s = at(this.L.screen);
    this.screen = this.put(makeText(sc, s.x, s.y, 'OBD-II', FS.tiny, 0x7dff8a, { wrap: 150 }));
    const p = at(this.L.port);
    this.put(makeText(sc, p.x, p.y - 46, t('obd.port'), FS.tiny, 0xf2f2ee, { bold: false }).setScale(0.75));
    this.draw();
  }

  instruction(): string {
    return { plug: 'mg.car.obdPlug', read: 'mg.car.obdRead', code: 'mg.car.obdCode' }[this.stage];
  }

  progress(): number {
    return { plug: 0, read: 0.4 + 0.4 * Math.min(1, this.readT / OBD_READ_SECONDS), code: 0.9 }[this.stage];
  }

  bot(): BotAction {
    if (this.stage === 'plug') return { a: 'drag', from: this.plugAt, to: this.L.port };
    if (this.stage === 'code') return { a: 'tap', p: this.L.ok };
    return { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'plug' && near(this.plugAt, u, v, 0.06)) this.drag = { u, v };
    if (this.stage === 'code' && near(this.L.ok, u, v, 0.06)) this.done();
  }

  override pointerMove(u: number, v: number): void {
    if (!this.drag) return;
    this.plugAt = { u, v };
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    if (!this.drag) return;
    this.drag = null;
    if (near(this.L.port, u, v, 0.06)) {
      this.plugAt = this.L.port;
      this.stage = 'read';
      this.h.sfx('snap');
      this.haptic('light');
      this.screen.setText(t('obd.reading'));
    } else this.plugAt = this.L.plug;
    this.draw();
  }

  override update(dt: number): void {
    if (this.stage !== 'read') return;
    this.readT += dt;
    if (this.readT >= OBD_READ_SECONDS) {
      this.stage = 'code';
      const tc = troubleCode(this.h.rig.tasks, this.h.inst.s);
      this.screen.setText(`${tc.code}\n${t(tc.key, { n: tc.n ?? 0 })}`);
      this.h.sfx('ding');
      this.draw();
    }
  }

  private done(): void {
    const tc = troubleCode(this.h.rig.tasks, this.h.inst.s);
    pinNote(this.h, tc.code, t(tc.key, { n: tc.n ?? 0 }));
    this.fadeOut();
    this.finish();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    inset(g, this.L.panel.c, this.L.panel.w, this.L.panel.h);
    // Under the dash: the trapezoid 16-pin port.
    const p = at(this.L.port);
    g.fillStyle(0x0c0c10, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(p.x - 40, p.y - 18),
        new Phaser.Math.Vector2(p.x + 40, p.y - 18),
        new Phaser.Math.Vector2(p.x + 32, p.y + 18),
        new Phaser.Math.Vector2(p.x - 32, p.y + 18),
      ],
      true,
    );
    g.fillStyle(0xd9b04a, 1);
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 8; i++) g.fillRect(p.x - 30 + i * 8.5 + r * 2, p.y - 9 + r * 12, 3, 5);
    // The scanner: a yellow handheld with a screen and an OK button, its cable to the plug.
    const s = at(this.L.screen);
    const q = at(this.plugAt);
    g.lineStyle(7, 0x1d1c21, 1);
    g.beginPath();
    g.moveTo(s.x - 70, s.y + 60);
    g.lineTo((s.x - 70 + q.x) / 2, Math.max(s.y + 60, q.y) + 50);
    g.lineTo(q.x, q.y + 18);
    g.strokePath();
    g.fillStyle(0xf2c12e, 1);
    g.fillRoundedRect(s.x - 90, s.y - 70, 180, 190, 18);
    g.lineStyle(4, 0x7a5a08, 1);
    g.strokeRoundedRect(s.x - 90, s.y - 70, 180, 190, 18);
    g.fillStyle(0x0e1a12, 1);
    g.fillRect(s.x - 75, s.y - 55, 150, 95);
    const ok = at(this.L.ok);
    g.fillStyle(this.stage === 'code' ? 0x4cc65a : 0x2a2833, 1);
    g.fillCircle(ok.x, ok.y, 20);
    if (this.stage === 'code') {
      g.lineStyle(3, 0xffffff, 0.9);
      g.strokeCircle(ok.x, ok.y, 26);
    }
    // The scanner's plug.
    g.fillStyle(0x2a2833, 1);
    g.fillRect(q.x - 34, q.y - 16, 68, 32);
    g.fillStyle(0x4a4a52, 1);
    g.fillRect(q.x - 30, q.y - 12, 60, 8);
  }
}

// ---------------------------------------------------------------- spark plugs

type PlugStage = 'unclip' | 'pull' | 'out' | 'gap' | 'in' | 'torque' | 'refit' | 'clip';

/** The full spark plug job on the misfiring cylinder. */
export class PlugsTask extends RepairTask {
  private L: PlugLayout;
  private bad: number;
  private stage: PlugStage = 'unclip';
  private coilAt: Pt;
  private drag: { u: number; v: number } | null = null;
  private twist: Twist;
  private turned = 0;
  private gap = 0.15;
  private torque = 0;
  private holding = false;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(
    h: TaskHost,
    private n: 1 | 4,
  ) {
    super(h);
    this.L = plugLayout(h.rig, n);
    this.bad = misfireCylinder(h.inst.s, n);
    this.coilAt = this.L.coils[this.bad];
    this.twist = new Twist(this.L.coils[this.bad]);
  }

  override init(): void {
    this.g = this.put(this.h.scene.add.graphics());
    // Cylinder numbers cast into the valve cover (no hint which one is bad: read the code).
    if (this.n > 1)
      this.L.coils.forEach((p, i) => {
        const q = at(p);
        this.labels.push(
          this.put(
            makeText(this.h.scene, q.x, q.y + 46, String(i + 1), FS.tiny, C.white, {
              stroke: C.ink,
              strokeW: 4,
            }),
          ),
        );
      });
    this.draw();
  }

  start(): void {
    this.stage = 'unclip';
    this.draw();
  }

  instruction(): string {
    return `mg.car.plug.${this.stage}`;
  }

  progress(): number {
    const order: PlugStage[] = ['unclip', 'pull', 'out', 'gap', 'in', 'torque', 'refit', 'clip'];
    return order.indexOf(this.stage) / order.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number | undefined {
    return this.stage === 'gap' ? this.gap : this.stage === 'torque' ? this.torque : undefined;
  }

  private conn(i: number): Pt {
    const c = i === this.bad ? this.coilAt : this.L.coils[i];
    return { u: c.u + 0.03, v: c.v - 0.04 };
  }

  bot(): BotAction {
    const hole = this.L.coils[this.bad];
    switch (this.stage) {
      case 'unclip':
      case 'clip':
        return { a: 'tap', p: this.conn(this.bad) };
      case 'pull':
        return { a: 'drag', from: this.coilAt, to: this.L.rest };
      case 'refit':
        return { a: 'drag', from: this.coilAt, to: hole };
      case 'out':
        return { a: 'circle', c: hole, r: 0.05, ccw: true };
      case 'in':
        return { a: 'circle', c: hole, r: 0.05 };
      case 'gap':
        return { a: 'holdLevel', p: this.L.gauge, until: (GAP_BAND[0] + GAP_BAND[1]) / 2 };
      case 'torque':
        return { a: 'holdLevel', p: hole, until: (PLUG_TORQUE[0] + PLUG_TORQUE[1]) / 2 };
    }
  }

  private wrong(): void {
    this.mistakes++;
    this.h.sfx('buzz');
    this.h.shake();
  }

  private next(s: PlugStage): void {
    this.stage = s;
    this.h.sfx('snap');
    this.haptic('light');
    this.draw();
  }

  override pointerDown(u: number, v: number): void {
    const hole = this.L.coils[this.bad];
    switch (this.stage) {
      case 'unclip': {
        const i = this.L.coils.findIndex((_, k) => near(this.conn(k), u, v, 0.035));
        if (i < 0) return;
        if (i !== this.bad) this.wrong();
        else this.next('pull');
        return;
      }
      case 'clip':
        if (near(this.conn(this.bad), u, v, 0.04)) {
          this.h.sfx('stamp');
          this.haptic('success');
          this.fadeOut(this.labels);
          this.finish();
          this.draw();
        }
        return;
      case 'pull':
      case 'refit':
        if (near(this.coilAt, u, v, 0.05)) this.drag = { u, v };
        else if (this.stage === 'pull' && this.L.coils.some((c, k) => k !== this.bad && near(c, u, v, 0.04)))
          this.wrong();
        return;
      case 'out':
      case 'in':
        this.twist.down(u, v, 0.12);
        return;
      case 'gap':
        if (near(this.L.gauge, u, v, 0.06)) this.holding = true;
        return;
      case 'torque':
        if (near(hole, u, v, 0.06)) this.holding = true;
        return;
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag) {
      this.coilAt = { u, v };
      this.draw();
      return;
    }
    if (!this.twist.active) return;
    const d = this.twist.move(u, v);
    // Lefty loosey, righty tighty: out turns anticlockwise, in turns clockwise.
    const want = this.stage === 'out' ? -1 : 1;
    if (Math.sign(d) === want) this.turned += Math.abs(d);
    if (this.turned >= PLUG_TURNS) {
      this.twist.up();
      this.turned = 0;
      if (this.stage === 'out') {
        this.h.sfx('pop');
        this.next('gap');
      } else this.next('torque');
    }
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    this.twist.up();
    if (this.drag) {
      this.drag = null;
      const hole = this.L.coils[this.bad];
      if (this.stage === 'pull' && Math.hypot(u - hole.u, v - hole.v) > 0.1) {
        this.coilAt = this.L.rest;
        this.next('out');
      } else if (this.stage === 'refit' && near(hole, u, v, 0.05)) {
        this.coilAt = hole;
        this.next('clip');
      } else this.coilAt = this.stage === 'pull' ? hole : this.L.rest;
      this.draw();
      return;
    }
    if (!this.holding) return;
    this.holding = false;
    if (this.stage === 'gap') {
      if (this.gap >= GAP_BAND[0] && this.gap <= GAP_BAND[1]) this.next('in');
      else if (this.gap > GAP_BAND[1]) {
        // Too wide: start the gap again (the plug would misfire).
        this.wrong();
        this.gap = 0.15;
      }
    } else if (this.stage === 'torque' && this.torque >= PLUG_TORQUE[0]) {
      if (this.torque > PLUG_TORQUE[1]) this.wrong();
      this.next('refit');
    }
    this.draw();
  }

  override update(dt: number): void {
    if (!this.holding) return;
    if (this.stage === 'gap') this.gap = Math.min(1, this.gap + dt * GAP_RATE);
    if (this.stage === 'torque') this.torque = Math.min(1, this.torque + dt * 0.8);
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const working = ['out', 'gap', 'in', 'torque'].includes(this.stage);
    this.L.coils.forEach((c, i) => {
      const hole = at(c);
      // Plug well (an open hole when the coil is out).
      g.fillStyle(0x0d0d10, 1);
      g.fillCircle(hole.x, hole.y, 14);
      if (i !== this.bad || !working || this.stage === 'gap') return;
      // The spark plug: white insulator over a steel hex, rising as it comes out.
      const k = this.turned / PLUG_TURNS;
      const rise = this.stage === 'out' ? k * 26 : this.stage === 'in' ? (1 - k) * 26 : 0;
      g.fillStyle(0xf4f1e8, 1);
      g.fillRoundedRect(hole.x - 7, hole.y - 22 - rise, 14, 26, 5);
      g.fillStyle(0xb9bfc9, 1);
      g.fillRect(hole.x - 11, hole.y - rise, 22, 10);
      if (this.stage === 'torque') {
        drawGauge(g, { u: c.u + 0.07, v: c.v }, this.torque, 0xff9a3c, PLUG_TORQUE);
        if (this.holding) drawRatchet(g, hole.x, hole.y, -0.9);
      }
    });
    this.L.coils.forEach((c, i) => this.coil(g, i === this.bad ? this.coilAt : c, i));
    // Gap gauge: the new plug's electrode over a feeler gauge, with the green band.
    if (this.stage === 'gap') {
      const q = at(this.L.gauge);
      drawGauge(g, { u: this.L.gauge.u, v: this.L.gauge.v - 0.12 }, this.gap, 0x4fb6ff, GAP_BAND);
      g.fillStyle(0xf4f1e8, 1);
      g.fillRoundedRect(q.x - 8, q.y - 50, 16, 32, 5);
      g.fillStyle(0xb9bfc9, 1);
      g.fillRect(q.x - 12, q.y - 18, 24, 12);
      g.fillRect(q.x - 3, q.y - 6, 6, 14);
      g.fillRect(q.x - 3, q.y + 8 + this.gap * 16, 14, 4);
      g.lineStyle(3, 0xffd34d, 0.9);
      g.strokeCircle(q.x, q.y, 34);
    }
  }

  /** An ignition coil pack with its connector clip. */
  private coil(g: Phaser.GameObjects.Graphics, c: Pt, i: number): void {
    const q = at(c);
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(q.x - 15, q.y - 28, 34, 56, 6);
    g.fillStyle(0x1d1c21, 1);
    g.fillRoundedRect(q.x - 18, q.y - 32, 34, 56, 6);
    g.fillStyle(0x3a3a42, 1);
    g.fillRect(q.x - 14, q.y - 26, 26, 6);
    const cn = at(this.conn(i));
    const clipped = this.finished || !(i === this.bad && this.stage !== 'unclip' && this.stage !== 'clip');
    g.fillStyle(clipped ? 0x6d727c : 0x4a4f58, 1);
    g.fillRect(cn.x - 10 + (clipped ? 0 : 8), cn.y - 8, 20, 16);
    g.lineStyle(3, 0x2a63c8, 1);
    g.lineBetween(cn.x + 10, cn.y, cn.x + 26, cn.y - 10);
    if (this.stage === 'clip' && i === this.bad && !this.finished) {
      g.lineStyle(3, 0xffd34d, 0.9);
      g.strokeCircle(cn.x, cn.y, 16);
    }
  }
}

// ---------------------------------------------------------------- battery

/** Disconnect negative first, take the hold-down off, swap the battery, positive back on first. */
export class BatteryTask extends RepairTask {
  private L: BatteryLayout;
  private steps: BatteryStep[];
  private k = 0;
  private holding: 'pos' | 'neg' | 'hold' | null = null;
  private held = 0;
  private batAt: Pt;
  private oldGone = false;
  private drag: { u: number; v: number } | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;
  private attached = { pos: true, neg: true, hold: true };

  constructor(
    h: TaskHost,
    private fit: boolean,
  ) {
    super(h);
    this.L = batteryLayout(h.rig);
    this.steps = batterySteps(fit);
    this.batAt = fit ? this.L.fresh : this.L.c;
    if (fit) {
      this.attached = { pos: false, neg: false, hold: false };
      this.oldGone = true;
    }
  }

  override init(): void {
    this.g = this.put(this.h.scene.add.graphics());
    if (!this.fit) this.draw();
  }

  start(): void {
    this.draw();
  }

  private step(): BatteryStep | undefined {
    return this.steps[this.k];
  }

  instruction(): string {
    return `mg.car.bat.${this.step() ?? 'negOn'}`;
  }

  progress(): number {
    return this.k / this.steps.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  private target(s: BatteryStep): 'pos' | 'neg' | 'hold' | null {
    if (s === 'negOff' || s === 'negOn') return 'neg';
    if (s === 'posOff' || s === 'posOn') return 'pos';
    if (s === 'holdOff' || s === 'holdOn') return 'hold';
    return null;
  }

  private spot(w: 'pos' | 'neg' | 'hold'): Pt {
    return this.L[w];
  }

  bot(): BotAction {
    const s = this.step();
    if (!s) return { a: 'wait' };
    if (s === 'out') return { a: 'drag', from: this.L.c, to: this.L.bin };
    if (s === 'in') return { a: 'drag', from: this.batAt, to: this.L.c };
    return { a: 'hold', p: this.spot(this.target(s)!) };
  }

  override pointerDown(u: number, v: number): void {
    const s = this.step();
    if (!s) return;
    if (s === 'out' || s === 'in') {
      if (Math.abs(u - this.batAt.u) < this.L.w / 2 && Math.abs(v - this.batAt.v) < this.L.h / 2)
        this.drag = { u, v };
      return;
    }
    const hit = (['neg', 'pos', 'hold'] as const).find((w) => near(this.spot(w), u, v, 0.04));
    if (!hit) return;
    if (hit !== this.target(s)) {
      // Positive before negative (or the wrong bolt): the spanner touches the body. Sparks!
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
      const p = this.spot(hit);
      this.h.burst(p.u, p.v, 'p_spark', 14, [0xffe08a, 0xffffff, 0x9fd8ff], 200);
      return;
    }
    this.holding = hit;
    this.held = 0;
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag) {
      this.batAt = { u, v };
      this.draw();
      return;
    }
    if (this.holding && !near(this.spot(this.holding), u, v, 0.07)) this.holding = null;
  }

  override pointerUp(u: number, v: number): void {
    this.holding = null;
    if (!this.drag) return;
    this.drag = null;
    const s = this.step();
    if (s === 'out' && Math.hypot(u - this.L.c.u, v - this.L.c.v) > 0.15) {
      this.oldGone = true;
      this.h.sfx('pop');
      this.batAt = this.L.fresh;
      this.advance();
    } else if (s === 'in' && near(this.L.c, u, v, 0.08)) {
      this.batAt = this.L.c;
      this.h.sfx('stamp');
      this.advance();
    } else this.batAt = s === 'out' ? this.L.c : this.fit || this.oldGone ? this.L.fresh : this.L.c;
    this.draw();
  }

  private advance(): void {
    this.k++;
    this.haptic('medium');
    if (this.k >= this.steps.length) {
      this.h.sfx('ding');
      this.h.scene.time.delayedCall(this.ms(250), () => this.finish());
    }
    this.draw();
  }

  override update(dt: number): void {
    if (!this.holding) return;
    this.held += dt;
    this.draw();
    if (this.held < TERMINAL_SECONDS) return;
    const w = this.holding;
    this.holding = null;
    const s = this.step()!;
    this.attached[w] = s.endsWith('On');
    this.h.sfx(s.endsWith('On') ? 'stamp' : 'snap');
    this.advance();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    const w = L.w * STAGE;
    const h = L.h * STAGE;
    const c = at(this.batAt);
    const fresh = this.oldGone;
    // The battery: black case, red + and black - posts, a label.
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(c.x - w / 2 + 5, c.y - h / 2 + 7, w, h, 8);
    g.fillStyle(fresh ? 0x2a2d33 : 0x24221f, 1);
    g.fillRoundedRect(c.x - w / 2, c.y - h / 2, w, h, 8);
    g.fillStyle(fresh ? 0x2f6fd0 : 0x6d5a3a, 1);
    g.fillRect(c.x - w / 2 + 10, c.y - 4, w - 20, h * 0.28);
    const posX = c.x - w * 0.3;
    const negX = c.x + w * 0.3;
    const postY = c.y - h * 0.42;
    g.fillStyle(0xb9bfc9, 1);
    g.fillRect(posX - 7, postY - 8, 14, 12);
    g.fillRect(negX - 7, postY - 8, 14, 12);
    // Cables and clamps where attached (red to +, black to -), loose and lifted off when not.
    const settled = this.batAt === L.c;
    for (const [side, x, col] of [
      ['pos', posX, 0xd8352a],
      ['neg', negX, 0x1d1c21],
    ] as const) {
      const on = this.attached[side] && settled;
      const end = on ? { x, y: postY } : { x: x + (side === 'pos' ? -40 : 40), y: postY - 34 };
      const from = at({ u: L.c.u + (side === 'pos' ? -0.16 : 0.16), v: L.c.v - 0.16 });
      g.lineStyle(9, 0x000000, 0.4);
      g.lineBetween(from.x + 2, from.y + 3, end.x + 2, end.y + 3);
      g.lineStyle(8, col, 1);
      g.lineBetween(from.x, from.y, end.x, end.y);
      g.fillStyle(0xc9a43a, 1);
      g.fillRect(end.x - 10, end.y - 9, 20, 14);
      g.fillStyle(col, 1);
      g.fillCircle(end.x, end.y - 16, 7);
    }
    // Hold-down bar across the base and its bolt.
    const hd = at(L.hold);
    if (this.attached.hold && settled) {
      g.fillStyle(0x6d727c, 1);
      g.fillRect(c.x - w / 2 - 6, hd.y - 6, w + 12, 10);
    }
    g.fillStyle(0xc9ced6, 1);
    g.fillCircle(hd.x, hd.y, 9);
    // Marks: what to do next.
    const s = this.step();
    const tw = s ? this.target(s) : null;
    if (tw) {
      const p = at(this.spot(tw));
      g.lineStyle(3, 0xffd34d, 0.5 + 0.3 * Math.sin(this.h.scene.time.now / 150));
      g.strokeCircle(p.x, p.y, 22);
      if (this.holding) drawRatchet(g, p.x, p.y, -0.9 + Math.sin(this.held * 10) * 0.4);
    }
    // + and - stamped on the case.
    g.lineStyle(3, 0xffffff, 0.9);
    g.lineBetween(posX - 6, c.y + h * 0.3, posX + 6, c.y + h * 0.3);
    g.lineBetween(posX, c.y + h * 0.3 - 6, posX, c.y + h * 0.3 + 6);
    g.lineBetween(negX - 6, c.y + h * 0.3, negX + 6, c.y + h * 0.3);
  }
}

// ---------------------------------------------------------------- oil filter

/** Twist the old filter off, oil the new one's rubber seal, put it on and spin it hand-tight. */
export class FilterTask extends RepairTask {
  private L: FilterLayout;
  private stage: 'off' | 'oil' | 'place' | 'on' = 'off';
  private twist: Twist;
  private turned = 0;
  private angle = 0;
  private newAt: Pt;
  private drag: { u: number; v: number } | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = filterLayout(h.rig);
    this.twist = new Twist(this.L.c);
    this.newAt = this.L.fresh;
  }

  override init(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.draw();
  }

  start(): void {
    this.draw();
  }

  instruction(): string {
    return `mg.car.filter.${this.stage}`;
  }

  progress(): number {
    return {
      off: (0.4 * this.turned) / FILTER_TURNS,
      oil: 0.45,
      place: 0.55,
      on: 0.6 + (0.4 * this.turned) / FILTER_TURNS,
    }[this.stage];
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    if (this.stage === 'off') return { a: 'circle', c: this.L.c, r: 0.045, ccw: true };
    if (this.stage === 'oil') return { a: 'tap', p: this.newAt };
    if (this.stage === 'place') return { a: 'drag', from: this.newAt, to: this.L.c };
    return { a: 'circle', c: this.L.c, r: 0.045 };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'off' || this.stage === 'on') {
      this.twist.down(u, v, 0.11);
      return;
    }
    if (near(this.newAt, u, v, this.L.r + 0.02)) this.drag = { u, v };
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag) {
      if (this.stage === 'oil') {
        if (!tapped(this.drag, u, v)) {
          // Fitting it with a dry seal: it would leak (and be stuck next time).
          this.drag = null;
          this.mistakes++;
          this.h.sfx('buzz');
          this.h.shake();
        }
        return;
      }
      this.newAt = { u, v };
      this.draw();
      return;
    }
    const d = this.twist.move(u, v);
    const want = this.stage === 'off' ? -1 : 1;
    if (Math.sign(d) !== want) return;
    this.turned += Math.abs(d);
    this.angle += d;
    if (this.turned >= FILTER_TURNS) {
      this.twist.up();
      this.turned = 0;
      if (this.stage === 'off') {
        this.h.sfx('pop');
        this.stage = 'oil';
      } else {
        this.h.sfx('stamp');
        this.h.sfx('ding');
        this.haptic('success');
        this.finish();
      }
    }
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    this.twist.up();
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (this.stage === 'oil') {
      if (tapped(d, u, v)) {
        // A fingertip of fresh oil round the seal.
        this.stage = 'place';
        this.h.sfx('spray', 0.4);
        this.h.burst(this.newAt.u, this.newAt.v, 'p_dot', 6, [0xffc23d, 0xffe27a], 60);
      }
    } else if (this.stage === 'place') {
      if (near(this.L.c, u, v, 0.06)) {
        this.newAt = this.L.c;
        this.stage = 'on';
        this.h.sfx('snap');
      } else this.newAt = this.L.fresh;
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const r = this.L.r * STAGE;
    const filter = (p: Pt, fresh: boolean, oiled: boolean, ang: number) => {
      const q = at(p);
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(q.x + 4, q.y + 5, r);
      g.fillStyle(fresh ? 0x2a63c8 : 0x6b5a3a, 1);
      g.fillCircle(q.x, q.y, r);
      // Grip flutes round the can (they turn as it turns).
      g.lineStyle(3, fresh ? 0x1a3f80 : 0x3f3420, 1);
      for (let i = 0; i < 12; i++) {
        const a = ang + (i / 12) * Math.PI * 2;
        g.lineBetween(
          q.x + Math.cos(a) * r * 0.78,
          q.y + Math.sin(a) * r * 0.78,
          q.x + Math.cos(a) * r,
          q.y + Math.sin(a) * r,
        );
      }
      g.fillStyle(0x1d1c21, 1);
      g.fillCircle(q.x, q.y, r * 0.55);
      g.lineStyle(4, oiled ? 0xffc23d : 0x0d0d10, 1);
      g.strokeCircle(q.x, q.y, r * 0.5);
      g.fillStyle(0xb9bfc9, 1);
      g.fillCircle(q.x, q.y, r * 0.18);
    };
    if (this.stage === 'off') filter(this.L.c, false, true, this.angle);
    else {
      const q = at(this.L.c);
      g.fillStyle(0x0d0d10, 1);
      g.fillCircle(q.x, q.y, r * 0.6);
      g.fillStyle(0xb9bfc9, 1);
      g.fillCircle(q.x, q.y, r * 0.2);
      filter(this.newAt, true, this.stage !== 'oil', this.stage === 'on' ? this.angle : 0);
    }
    const target = this.stage === 'oil' ? this.newAt : this.L.c;
    const tq = at(target);
    g.lineStyle(3, 0xffd34d, 0.6);
    g.strokeCircle(tq.x, tq.y, r + 10);
  }
}

// ---------------------------------------------------------------- fuse box

/** Find the circuit from the symptom, test it, pull the blown fuse, fit one of the same rating. */
export class FuseTask extends RepairTask {
  private L: FuseLayout;
  private stage: 'find' | 'pull' | 'fit' = 'find';
  private tested: boolean[];
  private pulledAt: Pt | null = null;
  private spareAt: Pt[];
  private fitted = -1;
  private drag: { kind: 'blown' | 'spare'; i: number; u: number; v: number; dragging: boolean } | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;
  private flash: { i: number; ok: boolean; t: number } | null = null;

  constructor(h: TaskHost) {
    super(h);
    this.L = fuseLayout(h.inst.s);
    this.tested = this.L.slots.map(() => false);
    this.spareAt = this.L.trays.map((p) => ({ ...p }));
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    const L = this.L;
    // Slot numbers and ratings moulded into the box.
    L.slots.forEach((p, i) => {
      const q = at(p);
      this.put(makeText(sc, q.x, q.y + 42, `${i + 1}`, FS.tiny, 0xf2f2ee).setScale(0.7));
    });
    // The legend on the lid: which slot feeds which circuit.
    const lx = at({ u: L.panel.c.u + L.panel.w - 0.12, v: L.panel.c.v - L.panel.h + 0.04 });
    const lg = this.put(sc.add.graphics());
    lg.fillStyle(0xf4f1e8, 1);
    lg.fillRoundedRect(lx.x - 70, lx.y - 10, 140, 26 + CIRCUITS.length * 24, 8);
    this.put(makeText(sc, lx.x, lx.y + 6, t('fuse.legend'), FS.tiny, C.ink).setScale(0.75));
    CIRCUITS.forEach((c, i) => {
      this.put(
        makeText(
          sc,
          lx.x - 60,
          lx.y + 30 + i * 24,
          `${i + 1} ${t(`fuse.${c.id}`)} ${c.amps}A`,
          FS.tiny,
          C.ink,
          {
            align: 'left',
            bold: false,
          },
        ).setScale(0.7),
      );
    });
    // The customer's complaint.
    const sym = at({ u: L.panel.c.u - 0.05, v: L.panel.c.v - L.panel.h + 0.035 });
    this.put(
      makeText(
        sc,
        sym.x,
        sym.y,
        t('fuse.symptom', { what: t(`fuse.sym.${CIRCUITS[L.blown].id}`) }),
        FS.tiny,
        0xffe08a,
        {
          wrap: 300,
        },
      ),
    );
    this.draw();
  }

  instruction(): string {
    return `mg.car.fuse.${this.stage}`;
  }

  progress(): number {
    return { find: 0.1, pull: 0.45, fit: 0.7 }[this.stage];
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    const L = this.L;
    if (this.stage === 'find') return { a: 'tap', p: L.slots[L.blown] };
    if (this.stage === 'pull') return { a: 'drag', from: L.slots[L.blown], to: L.bin };
    const i = L.spares.indexOf(CIRCUITS[L.blown].amps);
    return { a: 'drag', from: this.spareAt[i], to: L.slots[L.blown] };
  }

  override pointerDown(u: number, v: number): void {
    const L = this.L;
    const slot = L.slots.findIndex((p) => near(p, u, v, 0.035));
    if (this.stage === 'find' || this.stage === 'pull') {
      if (slot >= 0) this.drag = { kind: 'blown', i: slot, u, v, dragging: false };
      return;
    }
    const sp = this.spareAt.findIndex((p) => near(p, u, v, 0.035));
    if (sp >= 0) this.drag = { kind: 'spare', i: sp, u, v, dragging: false };
  }

  override pointerMove(u: number, v: number): void {
    const d = this.drag;
    if (!d) return;
    if (!tapped(d, u, v)) d.dragging = true;
    if (!d.dragging) return;
    if (d.kind === 'spare') this.spareAt[d.i] = { u, v };
    else if (this.stage === 'pull') this.pulledAt = { u, v };
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const L = this.L;
    if (!d.dragging) {
      if (d.kind !== 'blown') return;
      // The test light: it glows on a good fuse, stays dark on a blown one.
      const ok = d.i !== L.blown;
      this.tested[d.i] = true;
      this.flash = { i: d.i, ok, t: 0.6 };
      this.h.sfx(ok ? 'tick' : 'buzz');
      if (!ok && this.stage === 'find') this.stage = 'pull';
      this.draw();
      return;
    }
    if (d.kind === 'blown') {
      if (this.stage !== 'pull') return;
      if (d.i !== L.blown) {
        // Pulling a good fuse: that circuit goes dead too.
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      } else if (Math.hypot(u - L.slots[d.i].u, v - L.slots[d.i].v) > 0.08) {
        this.stage = 'fit';
        this.h.sfx('pop');
      }
      this.pulledAt = null;
      this.draw();
      return;
    }
    if (near(L.slots[L.blown], u, v, 0.045)) {
      if (L.spares[d.i] === CIRCUITS[L.blown].amps) {
        this.fitted = d.i;
        this.spareAt[d.i] = L.slots[L.blown];
        this.h.sfx('snap');
        this.h.sfx('ding');
        this.haptic('success');
        this.draw();
        this.h.scene.time.delayedCall(this.ms(400), () => {
          this.fadeOut();
          this.finish();
        });
        return;
      }
      // A bigger fuse could let the wires overheat; a smaller one blows at once.
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
    }
    this.spareAt[d.i] = { ...L.trays[d.i] };
    this.draw();
  }

  override update(dt: number): void {
    if (!this.flash) return;
    this.flash.t -= dt;
    if (this.flash.t <= 0) this.flash = null;
    this.draw();
  }

  private blade(g: Phaser.GameObjects.Graphics, p: Pt, amps: keyof typeof FUSE_COLOUR, blown: boolean): void {
    const q = at(p);
    g.fillStyle(0xb9bfc9, 1);
    g.fillRect(q.x - 10, q.y + 10, 6, 12);
    g.fillRect(q.x + 4, q.y + 10, 6, 12);
    g.fillStyle(FUSE_COLOUR[amps], 0.95);
    g.fillRoundedRect(q.x - 14, q.y - 18, 28, 30, 4);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(q.x - 10, q.y - 14, 20, 6);
    // The metal link inside the clear top: broken when blown.
    g.lineStyle(2, 0xe8e6df, 1);
    if (blown) {
      g.lineBetween(q.x - 8, q.y - 2, q.x - 2, q.y - 6);
      g.lineBetween(q.x + 2, q.y - 2, q.x + 8, q.y - 6);
      g.fillStyle(0x1d1c21, 0.6);
      g.fillCircle(q.x, q.y - 4, 3);
    } else g.lineBetween(q.x - 8, q.y - 4, q.x + 8, q.y - 4);
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    L.slots.forEach((p, i) => {
      const q = at(p);
      g.fillStyle(0x0d0d10, 1);
      g.fillRect(q.x - 18, q.y - 22, 36, 48);
      const isBlown = i === L.blown;
      if (isBlown && this.stage !== 'find' && (this.stage === 'fit' || this.pulledAt)) return;
      this.blade(g, isBlown && this.pulledAt ? this.pulledAt : p, CIRCUITS[i].amps, isBlown);
      if (this.tested[i] && !(this.flash && this.flash.i === i)) {
        g.fillStyle(isBlown ? 0xe03c31 : 0x4cc65a, 1);
        g.fillCircle(q.x + 14, q.y - 20, 5);
      }
    });
    if (this.flash) {
      // The test light's probe on the fuse and its bulb.
      const q = at(L.slots[this.flash.i]);
      g.lineStyle(4, 0x2a2833, 1);
      g.lineBetween(q.x, q.y - 6, q.x + 40, q.y - 70);
      g.fillStyle(this.flash.ok ? 0xffe27a : 0x3a3a42, 1);
      g.fillCircle(q.x + 44, q.y - 76, 12);
      if (this.flash.ok) {
        g.fillStyle(0xffe27a, 0.3);
        g.fillCircle(q.x + 44, q.y - 76, 24);
      }
    }
    if (this.stage === 'fit')
      L.spares.forEach((a, i) => {
        if (i === this.fitted) return;
        this.blade(g, this.spareAt[i], a, false);
      });
    // The bin for the blown fuse.
    const b = at(L.bin);
    g.fillStyle(0x3a3a42, 1);
    g.fillRoundedRect(b.x - 30, b.y - 20, 60, 40, 8);
    if (this.fitted >= 0) this.blade(g, L.slots[L.blown], L.spares[this.fitted], false);
  }
}

// ---------------------------------------------------------------- phone battery connector

/** Phones: pop the battery flex connector off with a spudger before doing anything else. */
export class UnplugTask extends RepairTask {
  private p: Pt;
  private done = false;
  private g!: Phaser.GameObjects.Graphics;

  constructor(h: TaskHost) {
    super(h);
    this.p = batteryConnector(h.rig);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.draw();
  }

  instruction(): string {
    return 'mg.car.unplug';
  }

  progress(): number {
    return this.done ? 1 : 0;
  }

  bot(): BotAction {
    return this.done ? { a: 'wait' } : { a: 'tap', p: this.p };
  }

  override pointerDown(u: number, v: number): void {
    if (this.done || !near(this.p, u, v, 0.05)) return;
    this.done = true;
    this.h.sfx('snap');
    this.haptic('light');
    this.draw();
    this.h.scene.time.delayedCall(this.ms(300), () => {
      this.fadeOut();
      this.finish();
    });
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const q = at(this.p);
    // The battery's flex and its press-fit connector; lifted off once popped.
    const lift = this.done ? 14 : 0;
    g.fillStyle(0xd98a1c, 0.9);
    g.fillRect(q.x - 12, q.y + 6, 24, 40);
    g.fillStyle(0x16161a, 1);
    g.fillRect(q.x - 18, q.y - 10 - lift, 36, 16);
    g.fillStyle(0xd9b04a, 1);
    g.fillRect(q.x - 14, q.y - 6 - lift, 28, 3);
    if (!this.done) {
      // The spudger, ready to lever it up.
      g.lineStyle(8, 0x1d1c21, 1);
      g.lineBetween(q.x + 20, q.y - 4, q.x + 70, q.y - 40);
      g.lineStyle(3, 0xffd34d, 0.5 + 0.3 * Math.sin(this.h.scene.time.now / 150));
      g.strokeCircle(q.x, q.y, 26);
    }
  }

  override update(): void {
    if (!this.done && this.g) this.draw();
  }
}
