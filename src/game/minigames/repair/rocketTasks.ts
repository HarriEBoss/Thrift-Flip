import Phaser from 'phaser';
import {
  GIMBAL_RATE,
  GIMBAL_TOL,
  PRESS_SECONDS,
  PURGE_RATE,
  RTV_BAND,
  RTV_RATE,
  VAPOUR_SAFE,
  VAPOUR_START,
  VENT_RATE,
  VENT_START,
  VENT_TURNS,
  gimbalLayout,
  rbfLayout,
  tileLayout,
  ventLayout,
  type GimbalLayout,
  type RbfLayout,
  type TileLayout,
  type VentLayout,
} from '../../../core/robotRepair';
import type { Pt } from '../../../core/repair';
import { makeText } from '../../ui/widgets';
import { FS } from '../../theme';
import { t } from '../../../i18n';
import { STAGE } from '../MiniGame';
import { RepairTask, at, drawGauge, near, type BotAction, type TaskHost } from './host';
import { inset, scoreFor } from './assembly';
import { Twist } from './carTasks';
import { drawSpin } from './robotTasks';

function label(h: TaskHost, p: Pt, text: string, color = 0xf2f2ee, scale = 0.62): Phaser.GameObjects.Text {
  const q = at(p);
  return makeText(h.scene, q.x, q.y, text, FS.tiny, color, { stroke: 0x0d0d10, strokeW: 4 }).setScale(scale);
}

/** A handwheel valve, its spokes turned by `a`. */
function drawWheel(g: Phaser.GameObjects.Graphics, p: Pt, a: number, color: number): void {
  const q = at(p);
  g.lineStyle(9, color, 1);
  g.strokeCircle(q.x, q.y, 30);
  for (let i = 0; i < 3; i++) {
    const s = a + (i * Math.PI * 2) / 3;
    g.lineStyle(6, color, 1);
    g.lineBetween(q.x, q.y, q.x + Math.cos(s) * 28, q.y + Math.sin(s) * 28);
  }
  g.fillStyle(0xc9ced6, 1);
  g.fillCircle(q.x, q.y, 9);
}

// ---------------------------------------------------------------- vent and purge

type VentStage = 'open' | 'bleed' | 'hose' | 'purge' | 'close';

/** Make the tank safe to open: vent the pressure, purge the fuel vapour with nitrogen, close the vent. */
export class VentTask extends RepairTask {
  private L: VentLayout = ventLayout();
  private stage: VentStage = 'open';
  private pressure = VENT_START;
  private vapour = VAPOUR_START;
  private twist: Twist;
  private turned = 0;
  private hoseAt: Pt;
  private dragging = false;
  private purging = false;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.twist = new Twist(this.L.vent);
    this.hoseAt = this.L.hose;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const L = this.L;
    this.put(label(this.h, { u: L.vent.u, v: L.vent.v - 0.08 }, t('rocket.vent')));
    this.put(label(this.h, { u: L.gauge.u + 0.07, v: L.gauge.v + 0.075 }, t('rocket.tank')));
    this.put(label(this.h, { u: L.port.u, v: L.port.v - 0.07 }, 'N₂'));
    this.put(label(this.h, { u: L.purge.u, v: L.purge.v - 0.08 }, t('rocket.purge')));
    this.put(label(this.h, { u: L.meter.u - 0.06, v: L.meter.v + 0.09 }, t('rocket.vapour')));
    this.draw();
  }

  instruction(): string {
    return `mg.rocket.vent.${this.stage}`;
  }

  progress(): number {
    const order: VentStage[] = ['open', 'bleed', 'hose', 'purge', 'close'];
    return order.indexOf(this.stage) / order.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number | undefined {
    return this.stage === 'purge' ? this.vapour : this.stage === 'bleed' ? this.pressure : undefined;
  }

  bot(): BotAction {
    switch (this.stage) {
      case 'open':
        return { a: 'circle', c: this.L.vent, r: 0.045, ccw: true, turns: 1.15 };
      case 'close':
        return { a: 'circle', c: this.L.vent, r: 0.045, turns: 1.15 };
      case 'hose':
        return { a: 'drag', from: this.hoseAt, to: this.L.port };
      case 'purge':
        return { a: 'holdLevel', p: this.L.purge, until: VAPOUR_SAFE - 0.04, below: true };
      default:
        return { a: 'wait' };
    }
  }

  private next(s: VentStage): void {
    this.stage = s;
    this.h.sfx('snap');
    this.haptic('light');
    this.draw();
  }

  override pointerDown(u: number, v: number): void {
    const L = this.L;
    if (near(this.hoseAt, u, v, 0.05)) {
      if (this.stage === 'hose') this.dragging = true;
      else if (this.stage === 'open' || this.stage === 'bleed') {
        // Never couple a purge line to a tank that is still under pressure.
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      }
      return;
    }
    if (this.stage === 'open' || this.stage === 'close') this.twist.down(u, v, 0.11);
    if (this.stage === 'purge' && near(L.purge, u, v, 0.06)) this.purging = true;
  }

  override pointerMove(u: number, v: number): void {
    if (this.dragging) {
      this.hoseAt = { u, v };
      this.draw();
      return;
    }
    if (!this.twist.active) return;
    const d = this.twist.move(u, v);
    // Open anticlockwise, close clockwise.
    const want = this.stage === 'open' ? -1 : 1;
    if (Math.sign(d) === want) this.turned += Math.abs(d);
    if (this.turned >= VENT_TURNS) {
      this.twist.up();
      this.turned = 0;
      if (this.stage === 'open') {
        this.h.sfx('spray', 0.7);
        this.next('bleed');
      } else {
        this.h.sfx('ding');
        this.haptic('success');
        this.stage = 'close';
        this.fadeOut();
        this.finish();
      }
    }
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    this.twist.up();
    if (this.dragging) {
      this.dragging = false;
      if (near(this.L.port, u, v, 0.06)) {
        this.hoseAt = this.L.port;
        this.next('purge');
      } else this.hoseAt = this.L.hose;
      this.draw();
      return;
    }
    if (this.purging) {
      this.purging = false;
      if (this.vapour <= VAPOUR_SAFE) this.next('close');
    }
  }

  override update(dt: number): void {
    if (!this.g || this.finished) return;
    if (this.stage === 'bleed') {
      this.pressure = Math.max(0, this.pressure - dt * VENT_RATE);
      if (this.pressure <= 0) this.next('hose');
    }
    if (this.purging) this.vapour = Math.max(0, this.vapour - dt * PURGE_RATE);
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The vent line out of the tank, the vent handwheel (turned as it opens).
    const vq = at(L.vent);
    const pq = at(L.port);
    const uq = at(L.purge);
    g.lineStyle(14, 0x8a8f99, 1);
    g.lineBetween(vq.x - 80, vq.y, uq.x + 40, uq.y);
    const open =
      this.stage === 'open'
        ? this.turned / VENT_TURNS
        : this.stage === 'close'
          ? 1 - this.turned / VENT_TURNS
          : 1;
    drawWheel(g, L.vent, -open * Math.PI * 2, 0xe03c31);
    if (this.stage === 'open' || this.stage === 'close')
      drawSpin(g, vq.x, vq.y, 46, this.stage === 'open' ? -1 : 1, 0xffd34d);
    // Venting gas while the pressure bleeds off.
    if (this.stage === 'bleed') {
      const tt = this.h.scene.time.now / 300;
      for (let i = 0; i < 5; i++) {
        const k = (tt + i / 5) % 1;
        g.fillStyle(0xe8f6ff, 0.5 * (1 - k));
        g.fillCircle(vq.x - 80 - k * 40, vq.y - 20 - k * 50, 8 + k * 14);
      }
    }
    drawGauge(g, L.gauge, this.pressure, 0xff9a3c, null);
    // The nitrogen quick-connect and its green hose.
    g.fillStyle(0xb9bfc9, 1);
    g.fillRect(pq.x - 14, pq.y - 22, 28, 30);
    const h = at(this.hoseAt);
    g.lineStyle(10, 0x2f8f4a, 1);
    g.beginPath();
    g.moveTo(at(L.hose).x - 60, at(L.hose).y + 60);
    g.lineTo(h.x, h.y + 20);
    g.strokePath();
    g.fillStyle(0x3fae49, 1);
    g.fillRoundedRect(h.x - 14, h.y - 8, 28, 30, 5);
    if (this.stage === 'hose') {
      g.lineStyle(3, 0xffd34d, 0.85);
      g.strokeCircle(pq.x, pq.y, 30);
    }
    // The purge valve (a blue lever, turned down while held) and the vapour meter.
    g.fillStyle(0x15121b, 1);
    g.fillCircle(uq.x, uq.y, 24);
    const la = this.purging ? Math.PI / 2 : 0;
    g.lineStyle(12, 0x2f6fd0, 1);
    g.lineBetween(uq.x, uq.y, uq.x + Math.cos(la) * 46, uq.y + Math.sin(la) * 46);
    if (this.stage === 'purge') {
      g.lineStyle(3, 0xffd34d, 0.85);
      g.strokeCircle(uq.x, uq.y, 34);
    }
    drawGauge(g, L.meter, this.vapour, 0xd8352a, [0, VAPOUR_SAFE]);
  }
}

// ---------------------------------------------------------------- remove before flight

/** Safing pins with red flags: in each safe-and-arm device before work, all pulled before closing. */
export class RbfTask extends RepairTask {
  private L: RbfLayout;
  private pos: Pt[];
  private inSpot: boolean[];
  /** Which device each pin is in (or was in). */
  private slot: number[];
  private drag: number | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private count!: Phaser.GameObjects.Text;

  constructor(
    h: TaskHost,
    private dir: 'in' | 'out',
  ) {
    super(h);
    this.L = rbfLayout(h.rig);
    this.inSpot = this.L.spots.map(() => dir === 'out');
    this.pos = dir === 'out' ? [...this.L.spots] : [...this.L.rack];
    this.slot = this.L.spots.map((_, i) => i);
  }

  start(): void {
    // The pins put in earlier in this repair: these are the same ones, drawn by this task now.
    for (const o of this.h.shelf.get('rbf') ?? []) o.destroy();
    this.h.shelf.delete('rbf');
    this.g = this.put(this.h.scene.add.graphics());
    this.count = this.put(label(this.h, { u: this.L.board.u, v: this.L.board.v - 0.045 }, '', 0xffffff, 0.6));
    this.draw();
  }

  instruction(): string {
    return this.dir === 'in' ? 'mg.rocket.rbfIn' : 'mg.rocket.rbfOut';
  }

  private get done(): number {
    return this.inSpot.filter((x) => x === (this.dir === 'in')).length;
  }

  progress(): number {
    return this.done / this.inSpot.length;
  }

  bot(): BotAction {
    const i = this.inSpot.findIndex((x) => x !== (this.dir === 'in'));
    if (i < 0) return { a: 'wait' };
    return { a: 'drag', from: this.pos[i], to: this.dir === 'in' ? this.L.spots[i] : this.L.rack[i] };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.pos.findIndex((p, k) => this.inSpot[k] !== (this.dir === 'in') && near(p, u, v, 0.05));
    if (i >= 0) this.drag = i;
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag === null) return;
    this.pos[this.drag] = { u, v };
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    const i = this.drag;
    if (i === null) return;
    this.drag = null;
    if (this.dir === 'in') {
      // Any free safe-and-arm device takes a pin.
      const s = this.L.spots.findIndex(
        (p) =>
          near(p, u, v, 0.06) &&
          !this.pos.some((q, j) => j !== i && this.inSpot[j] && near(q, p.u, p.v, 0.01)),
      );
      if (s >= 0) {
        this.pos[i] = this.L.spots[s];
        this.inSpot[i] = true;
        this.slot[i] = s;
        this.h.sfx('snap');
      } else this.pos[i] = this.L.rack[i];
    } else if (Math.hypot(u - this.L.spots[this.slot[i]].u, v - this.L.spots[this.slot[i]].v) > 0.12) {
      this.pos[i] = this.L.rack[i];
      this.inSpot[i] = false;
      this.h.sfx('pop');
    } else this.pos[i] = this.L.spots[this.slot[i]];
    this.draw();
    if (this.done < this.inSpot.length) return;
    this.h.sfx('ding');
    this.haptic('success');
    if (this.dir === 'in') {
      // The flags stay in for the rest of the job; the pull task at the end takes them over.
      this.count.destroy();
      this.h.shelf.set('rbf', [this.g]);
      this.objs = this.objs.filter((o) => o !== this.g && o !== this.count);
      this.finish();
      this.draw();
    } else {
      this.h.scene.time.delayedCall(this.ms(350), () => {
        this.fadeOut();
        this.finish();
      });
    }
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    // Safe-and-arm devices: grey boxes with a pin socket.
    for (const s of this.L.spots) {
      const q = at(s);
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(q.x - 22, q.y - 18, 48, 40, 6);
      g.fillStyle(0x6d727c, 1);
      g.fillRoundedRect(q.x - 26, q.y - 22, 48, 40, 6);
      g.fillStyle(0x15121b, 1);
      g.fillCircle(q.x - 2, q.y - 2, 7);
    }
    if (!this.finished) {
      // The board below the panel where the pins hang when they are not in (one hook each).
      const b = at(this.L.board);
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(b.x - 86, b.y - 38, 178, 40, 8);
      g.fillStyle(0x3a3640, 1);
      g.fillRoundedRect(b.x - 90, b.y - 42, 178, 40, 8);
      for (const r of this.L.rack) {
        const q = at(r);
        g.fillStyle(0xc9ced6, 1);
        g.fillCircle(q.x, q.y - 4, 5);
      }
    }
    // Pins with their long red REMOVE BEFORE FLIGHT streamers (hanging clear of the parts).
    this.pos.forEach((p, i) => {
      const q = at(p);
      const side = this.inSpot[i] && this.drag !== i ? this.L.side[this.slot[i]] : 1;
      const fx = side > 0 ? q.x + 10 : q.x - 32;
      g.lineStyle(5, 0xc9ced6, 1);
      g.lineBetween(q.x - 2, q.y - 2, q.x + side * 14, q.y - 18);
      g.fillStyle(0xd8352a, 1);
      g.fillRect(fx, q.y - 22, 22, 74);
      g.fillStyle(0xffffff, 0.9);
      for (let k = 0; k < 5; k++) g.fillRect(fx + 5, q.y - 14 + k * 13, 12, 6);
    });
    if (!this.finished) this.count.setText(t('rocket.rbfCount', { n: this.done, of: this.inSpot.length }));
  }
}

// ---------------------------------------------------------------- gimbal alignment

/** Turn the pitch and yaw jackscrews until the engine's laser hits the target, then lock each one. */
export class GimbalTask extends RepairTask {
  private L: GimbalLayout;
  private off: [number, number];
  private locked: [boolean, boolean] = [false, false];
  private twists: [Twist, Twist];
  private turnedA: [number, number] = [0, 0];
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = gimbalLayout(h.inst.s);
    this.off = [...this.L.start];
    this.twists = [new Twist(this.L.knobs[0]), new Twist(this.L.knobs[1])];
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const L = this.L;
    this.put(label(this.h, { u: L.knobs[0].u, v: L.knobs[0].v - 0.075 }, t('rocket.pitch')));
    this.put(label(this.h, { u: L.knobs[1].u - 0.09, v: L.knobs[1].v }, t('rocket.yaw')));
    L.locks.forEach((p) =>
      this.put(label(this.h, { u: p.u, v: p.v + 0.06 }, t('rocket.lock'), 0xffffff, 0.55)),
    );
    this.draw();
  }

  instruction(): string {
    return 'mg.rocket.gimbal';
  }

  progress(): number {
    return (this.locked.filter(Boolean).length / 2) * 0.9;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    const i = this.locked.indexOf(false);
    if (i < 0) return { a: 'wait' };
    const o = this.off[i];
    if (Math.abs(o) <= GIMBAL_TOL * 0.5) return { a: 'tap', p: this.L.locks[i] };
    return {
      a: 'circle',
      c: this.L.knobs[i],
      r: 0.04,
      ccw: o > 0,
      turns: Math.abs(o) / (GIMBAL_RATE * Math.PI * 2),
    };
  }

  override pointerDown(u: number, v: number): void {
    const l = this.L.locks.findIndex((p, i) => !this.locked[i] && near(p, u, v, 0.045));
    if (l >= 0) {
      if (Math.abs(this.off[l]) <= GIMBAL_TOL) {
        this.locked[l] = true;
        this.h.sfx('stamp');
        this.haptic('light');
        if (this.locked.every(Boolean)) {
          this.h.sfx('ding');
          this.haptic('success');
          this.h.scene.time.delayedCall(this.ms(400), () => {
            this.fadeOut();
            this.finish();
          });
        }
      } else {
        // Locking it off-target: the engine would push the rocket sideways.
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      }
      this.draw();
      return;
    }
    this.twists.forEach((tw, i) => {
      if (!this.locked[i]) tw.down(u, v, 0.08);
    });
  }

  override pointerMove(u: number, v: number): void {
    this.twists.forEach((tw, i) => {
      if (!tw.active) return;
      const d = tw.move(u, v);
      this.off[i] = Math.max(-1, Math.min(1, this.off[i] + d * GIMBAL_RATE));
      this.turnedA[i] += d;
    });
    this.draw();
  }

  override pointerUp(): void {
    this.twists.forEach((tw) => tw.up());
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The alignment target on the test stand.
    const c = at(L.target);
    const R = STAGE * 0.15;
    g.fillStyle(0xf4f1e8, 1);
    g.fillCircle(c.x, c.y, R);
    g.lineStyle(2, 0x15121b, 0.6);
    for (const k of [1, 0.66, 0.33]) g.strokeCircle(c.x, c.y, R * k);
    g.lineBetween(c.x - R, c.y, c.x + R, c.y);
    g.lineBetween(c.x, c.y - R, c.x, c.y + R);
    g.fillStyle(0x4cc65a, 0.5);
    g.fillCircle(c.x, c.y, R * GIMBAL_TOL);
    // The laser dot: yaw moves it sideways, pitch up and down.
    const dx = c.x + this.off[1] * R * 0.95;
    const dy = c.y + this.off[0] * R * 0.95;
    g.fillStyle(0xff2a2a, 0.3);
    g.fillCircle(dx, dy, 14);
    g.fillStyle(0xff2a2a, 1);
    g.fillCircle(dx, dy, 6);
    // Actuators: jackscrew wheels (with a mark that turns) and their lock nuts.
    L.knobs.forEach((p, i) => {
      const q = at(p);
      g.fillStyle(this.locked[i] ? 0x4a4f58 : 0x8a8f99, 1);
      g.fillCircle(q.x, q.y, 32);
      g.lineStyle(3, 0x15121b, 1);
      g.strokeCircle(q.x, q.y, 32);
      const a = this.turnedA[i];
      g.lineStyle(6, 0xffd34d, 1);
      g.lineBetween(q.x, q.y, q.x + Math.cos(a) * 26, q.y + Math.sin(a) * 26);
      const n = at(L.locks[i]);
      g.fillStyle(this.locked[i] ? 0x4cc65a : 0xc9ced6, 1);
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k < 6; k++)
        pts.push(
          new Phaser.Math.Vector2(
            n.x + Math.cos((k * Math.PI) / 3) * 20,
            n.y + Math.sin((k * Math.PI) / 3) * 20,
          ),
        );
      g.fillPoints(pts, true);
      g.fillStyle(0x15121b, 1);
      g.fillCircle(n.x, n.y, 7);
    });
  }
}

// ---------------------------------------------------------------- heat shield tiles

type TileStage = 'remove' | 'rtv' | 'fit' | 'press';

/** Pull the cracked tiles, butter the adhesive, bond the new tile with the same part number, hold it. */
export class TilesTask extends RepairTask {
  private L: TileLayout;
  private stage: TileStage = 'remove';
  private removed: boolean[];
  /** Which hole (index into cracked) is being filled. */
  private hole = 0;
  private rtv: number[];
  private spareAt: Pt[];
  private used: boolean[];
  private drag: number | null = null;
  private holding = false;
  private pressT = 0;
  private g!: Phaser.GameObjects.Graphics;
  private ids: Phaser.GameObjects.Text[] = [];
  private spareIds: Phaser.GameObjects.Text[] = [];
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = tileLayout(h.inst.s);
    this.removed = this.L.cracked.map(() => false);
    this.rtv = this.L.cracked.map(() => 0);
    this.spareAt = [...this.L.trays];
    this.used = this.L.spares.map(() => false);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.ids = this.L.tiles.map((tl) =>
      this.put(label(this.h, { u: tl.p.u, v: tl.p.v + 0.028 }, tl.id, 0xd9dde4, 0.5)),
    );
    this.spareIds = this.L.spares.map((id, i) => this.put(label(this.h, this.L.trays[i], id, 0xffffff, 0.5)));
    this.draw();
  }

  private get tile(): number {
    return this.L.cracked[this.hole];
  }

  instruction(): string {
    return `mg.rocket.tiles.${this.stage}`;
  }

  progress(): number {
    if (this.stage === 'remove') return 0.2 * (this.removed.filter(Boolean).length / this.removed.length);
    const per = 0.8 / this.L.cracked.length;
    const k = { remove: 0, rtv: 0, fit: 0.4, press: 0.7 }[this.stage];
    return 0.2 + per * (this.hole + k);
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number | undefined {
    return this.stage === 'rtv' ? this.rtv[this.hole] : undefined;
  }

  bot(): BotAction {
    const p = this.L.tiles[this.tile]?.p;
    switch (this.stage) {
      case 'remove':
        return { a: 'tap', p: this.L.tiles[this.L.cracked[this.removed.indexOf(false)]].p };
      case 'rtv':
        return { a: 'holdLevel', p, until: (RTV_BAND[0] + RTV_BAND[1]) / 2 };
      case 'fit': {
        const s = this.L.spares.findIndex((id, i) => !this.used[i] && id === this.L.tiles[this.tile].id);
        return { a: 'drag', from: this.spareAt[s], to: p };
      }
      case 'press':
        return { a: 'hold', p };
    }
  }

  private wrong(): void {
    this.mistakes++;
    this.h.sfx('buzz');
    this.h.shake();
  }

  private hit(u: number, v: number): number {
    return this.L.tiles.findIndex((tl) => Math.abs(tl.p.u - u) < 0.06 && Math.abs(tl.p.v - v) < 0.05);
  }

  override pointerDown(u: number, v: number): void {
    switch (this.stage) {
      case 'remove': {
        const i = this.hit(u, v);
        if (i < 0) return;
        const k = this.L.cracked.indexOf(i);
        // Prying out a good tile damages it (and its neighbours).
        if (k < 0) return this.wrong();
        if (this.removed[k]) return;
        this.removed[k] = true;
        this.ids[i].setVisible(false);
        this.h.sfx('peel');
        if (this.removed.every(Boolean)) this.stage = 'rtv';
        this.draw();
        return;
      }
      case 'rtv':
      case 'press':
        if (this.hit(u, v) === this.tile) this.holding = true;
        return;
      case 'fit': {
        const s = this.spareAt.findIndex(
          (p, i) => !this.used[i] && Math.abs(p.u - u) < 0.06 && Math.abs(p.v - v) < 0.05,
        );
        if (s >= 0) this.drag = s;
        return;
      }
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag === null) return;
    this.spareAt[this.drag] = { u, v };
    this.spareIds[this.drag].setPosition(at({ u, v }).x, at({ u, v }).y);
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    if (this.holding) {
      this.holding = false;
      if (this.stage === 'rtv') {
        const r = this.rtv[this.hole];
        if (r > RTV_BAND[1]) {
          // Too much: it squeezes out and must be wiped off and done again.
          this.wrong();
          this.rtv[this.hole] = 0;
        } else if (r >= RTV_BAND[0]) {
          this.stage = 'fit';
          this.h.sfx('snap');
        }
      }
      this.draw();
      return;
    }
    const s = this.drag;
    if (s === null) return;
    this.drag = null;
    const into = this.hit(u, v) === this.tile;
    if (into && this.L.spares[s] === this.L.tiles[this.tile].id) {
      this.used[s] = true;
      this.spareAt[s] = this.L.tiles[this.tile].p;
      this.spareIds[s].setVisible(false);
      this.ids[this.tile].setVisible(true);
      this.stage = 'press';
      this.h.sfx('snap');
    } else {
      // Every tile is cut for its own spot: a different number doesn't fit.
      if (into) this.wrong();
      this.spareAt[s] = this.L.trays[s];
    }
    const q = at(this.spareAt[s]);
    this.spareIds[s].setPosition(q.x, q.y);
    this.draw();
  }

  override update(dt: number): void {
    if (!this.g || !this.holding) return;
    if (this.stage === 'rtv') this.rtv[this.hole] = Math.min(1, this.rtv[this.hole] + dt * RTV_RATE);
    if (this.stage === 'press') {
      this.pressT += dt;
      if (this.pressT >= PRESS_SECONDS) {
        this.holding = false;
        this.pressT = 0;
        this.h.sfx('stamp');
        this.haptic('light');
        if (this.hole + 1 < this.L.cracked.length) {
          this.hole++;
          this.stage = 'rtv';
        } else {
          this.h.sfx('ding');
          this.haptic('success');
          this.fadeOut([...this.objs]);
          this.finish();
          return;
        }
      }
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    const tw = STAGE * 0.13;
    const th = STAGE * 0.105;
    L.tiles.forEach((tl, i) => {
      const q = at(tl.p);
      const k = L.cracked.indexOf(i);
      const filled = k >= 0 && (k < this.hole || (k === this.hole && this.stage === 'press'));
      if (k >= 0 && this.removed[k] && !filled) {
        // Bare skin (green primer) with the adhesive buttered on.
        g.fillStyle(0x7e9a5a, 1);
        g.fillRect(q.x - tw / 2 + 2, q.y - th / 2 + 2, tw - 4, th - 4);
        const r = this.rtv[k];
        if (r > 0) {
          g.fillStyle(0xd9542a, 1);
          g.fillRoundedRect(q.x - (tw / 2 - 6) * r, q.y - (th / 2 - 6) * r, (tw - 12) * r, (th - 12) * r, 6);
        }
        if (k === this.hole && this.stage !== 'remove') {
          g.lineStyle(3, 0xffd34d, 0.9);
          g.strokeRect(q.x - tw / 2, q.y - th / 2, tw, th);
          if (this.stage === 'rtv') drawGauge(g, { u: tl.p.u + 0.085, v: tl.p.v }, r, 0xd9542a, RTV_BAND);
        }
        return;
      }
      // A black silica tile with its gap filler lines; cracked ones show the crack.
      g.fillStyle(filled ? 0x23252c : 0x15161b, 1);
      g.fillRect(q.x - tw / 2 + 2, q.y - th / 2 + 2, tw - 4, th - 4);
      g.lineStyle(2, 0x3a3d46, 1);
      g.strokeRect(q.x - tw / 2 + 2, q.y - th / 2 + 2, tw - 4, th - 4);
      if (k >= 0 && !this.removed[k]) {
        g.lineStyle(3, 0xf4f1e8, 0.9);
        g.beginPath();
        g.moveTo(q.x - tw * 0.35, q.y - th * 0.3);
        g.lineTo(q.x - tw * 0.05, q.y - th * 0.05);
        g.lineTo(q.x + tw * 0.1, q.y - th * 0.2);
        g.lineTo(q.x + tw * 0.35, q.y + th * 0.3);
        g.strokePath();
      }
      if (filled && this.stage === 'press' && k === this.hole && this.holding) {
        g.fillStyle(0xffffff, 0.15);
        g.fillCircle(q.x, q.y, 26);
      }
    });
    // New tiles in the tray, part number up.
    L.spares.forEach((_, i) => {
      if (this.used[i]) return;
      const q = at(this.spareAt[i]);
      g.fillStyle(0x000000, 0.4);
      g.fillRect(q.x - tw / 2 + 5, q.y - th / 2 + 6, tw - 4, th - 4);
      g.fillStyle(0x1b1c22, 1);
      g.fillRect(q.x - tw / 2 + 2, q.y - th / 2 + 2, tw - 4, th - 4);
      g.lineStyle(2, 0xc9ced6, 0.8);
      g.strokeRect(q.x - tw / 2 + 2, q.y - th / 2 + 2, tw - 4, th - 4);
    });
  }
}
