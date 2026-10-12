import Phaser from 'phaser';
import {
  LEAK_DROP_RATE,
  LEAK_FIX_SECONDS,
  LEAK_PUMP_RATE,
  LEAK_TEST,
  SERVO_BAND,
  SERVO_RATE,
  SNUG_SECONDS,
  TENSIONER_SECONDS,
  TORQUE_BAND,
  TORQUE_RATE,
  TORQUE_STRIP,
  beltLayout,
  chipStartTurn,
  flippedPlugs,
  headerLayout,
  leakLayout,
  plugSeat,
  ramLayout,
  servoStart,
  socketLayout,
  torqueLayout,
  type BeltLayout,
  type HeaderLayout,
  type LeakLayout,
  type RamLayout,
  type SocketLayout,
  type TorqueLayout,
} from '../../../core/assembly';
import { hashSeed } from '../../../core/prng';
import type { Pt, TorqueAt } from '../../../core/repair';
import { drawBolt } from '../../art/repairArt';
import { makeText } from '../../ui/widgets';
import { C, FS } from '../../theme';
import { STAGE } from '../MiniGame';
import {
  RepairTask,
  at,
  drawGauge,
  drawRatchet,
  drawSlot,
  near,
  type BotAction,
  type TaskHost,
} from './host';

/** Mistakes cost a little each (a bent pin, a wrong slot, an over-tightened bolt). */
function scoreFor(mistakes: number): number {
  return Math.max(0.55, 1 - mistakes * 0.12);
}

/** A dark "magnified" panel for small parts (pin headers, the belt drive, a servo). */
function inset(g: Phaser.GameObjects.Graphics, c: Pt, w: number, h: number): void {
  const p = at(c);
  const pw = w * 2 * STAGE;
  const ph = h * 2 * STAGE;
  g.fillStyle(0x000000, 0.45);
  g.fillRoundedRect(p.x - pw / 2 + 6, p.y - ph / 2 + 8, pw, ph, 18);
  g.fillStyle(0x1b1d24, 0.97);
  g.fillRoundedRect(p.x - pw / 2, p.y - ph / 2, pw, ph, 18);
  g.lineStyle(4, 0xc9ced6, 1);
  g.strokeRoundedRect(p.x - pw / 2, p.y - ph / 2, pw, ph, 18);
}

function tapped(d: { u: number; v: number }, u: number, v: number): boolean {
  return Math.hypot(d.u - u, d.v - v) < 0.025;
}

// ---------------------------------------------------------------- chip socket

/** Open the lever, turn the chip to line up its corner mark, drop it in, close the lever. */
export class SocketTask extends RepairTask {
  private L: SocketLayout;
  private stage: 'open' | 'place' | 'close' | 'done' = 'open';
  private turn: number;
  private chipAt: Pt;
  private lever = 0;
  private g!: Phaser.GameObjects.Graphics;
  private down: { u: number; v: number; dragging: boolean } | null = null;
  private mistakes = 0;

  constructor(
    h: TaskHost,
    private chip: 'cpu' | 'mcu',
  ) {
    super(h);
    this.L = socketLayout(h.rig, chip);
    this.turn = chipStartTurn(h.inst.s, this.L.turns);
    this.chipAt = this.L.tray;
  }

  override init(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.draw();
  }

  start(): void {
    this.stage = 'open';
    this.draw();
  }

  instruction(): string {
    return {
      open: 'mg.asm.socketOpen',
      place: 'mg.asm.socketPlace',
      close: 'mg.asm.socketClose',
      done: 'mg.asm.socketClose',
    }[this.stage];
  }

  progress(): number {
    return { open: 0, place: 0.3, close: 0.8, done: 1 }[this.stage];
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  private leverEnd(): Pt {
    const { closed, open } = this.L.lever;
    return { u: closed.u + (open.u - closed.u) * this.lever, v: closed.v + (open.v - closed.v) * this.lever };
  }

  bot(): BotAction {
    if (this.stage === 'open' || this.stage === 'close') return { a: 'tap', p: this.leverEnd() };
    if (this.stage !== 'place') return { a: 'wait' };
    if (this.turn % this.L.turns !== 0) return { a: 'tap', p: this.chipAt };
    return { a: 'drag', from: this.chipAt, to: this.L.socket };
  }

  private swing(to: number, then: () => void): void {
    const o = { v: this.lever };
    this.h.sfx('snap');
    this.haptic('light');
    this.tw({
      targets: o,
      v: to,
      duration: this.ms(260),
      ease: 'Sine.inOut',
      onUpdate: () => {
        this.lever = o.v;
        this.draw();
      },
      onComplete: then,
    });
  }

  override pointerDown(u: number, v: number): void {
    if ((this.stage === 'open' || this.stage === 'close') && near(this.leverEnd(), u, v, 0.08)) {
      if (this.stage === 'open') {
        this.stage = 'place';
        this.swing(1, () => this.draw());
      } else {
        this.stage = 'done';
        this.swing(0, () => {
          this.h.sfx('stamp');
          this.h.burst(this.L.socket.u, this.L.socket.v, 'p_spark', 8, [0xffffff, 0xffe08a], 120);
          this.finish();
        });
      }
      return;
    }
    if (this.stage === 'place' && near(this.chipAt, u, v, this.L.size * 0.75))
      this.down = { u, v, dragging: false };
  }

  override pointerMove(u: number, v: number): void {
    if (!this.down) return;
    if (!tapped(this.down, u, v)) this.down.dragging = true;
    if (this.down.dragging) {
      this.chipAt = { u, v };
      this.draw();
    }
  }

  override pointerUp(u: number, v: number): void {
    const d = this.down;
    this.down = null;
    if (!d || this.stage !== 'place') return;
    if (!d.dragging) {
      // A tap turns the chip.
      this.turn = (this.turn + 1) % this.L.turns;
      this.h.sfx('tick');
      this.draw();
      return;
    }
    if (near(this.L.socket, u, v, this.L.size * 0.6)) {
      if (this.turn % this.L.turns === 0) {
        this.chipAt = this.L.socket;
        this.stage = 'close';
        this.h.sfx('snap');
        this.haptic('success');
      } else {
        // The wrong way round: it does not drop in (pressing would bend the pins).
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
        this.chipAt = this.L.tray;
      }
    } else this.chipAt = this.L.tray;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const s = at(this.L.socket);
    const half = (this.L.size * STAGE) / 2;
    const mcu = this.chip === 'mcu';
    const sw = mcu ? half * 1.6 : half;
    const sh = mcu ? half * 0.7 : half;
    // The socket: an empty frame with its corner mark (top left), or a DIP socket with its notch.
    g.fillStyle(0x23201a, 1);
    g.fillRect(s.x - sw, s.y - sh, sw * 2, sh * 2);
    g.lineStyle(3, 0xc9ced6, 1);
    g.strokeRect(s.x - sw - 3, s.y - sh - 3, sw * 2 + 6, sh * 2 + 6);
    if (mcu) {
      g.fillStyle(0x1b1d24, 1);
      g.fillCircle(s.x - sw, s.y, sh * 0.35);
      g.fillStyle(0xd9b04a, 1);
      for (let i = 0; i < 8; i++) {
        g.fillRect(s.x - sw + 8 + i * ((sw * 2 - 16) / 7) - 2, s.y - sh + 3, 4, 5);
        g.fillRect(s.x - sw + 8 + i * ((sw * 2 - 16) / 7) - 2, s.y + sh - 8, 4, 5);
      }
    } else {
      g.fillStyle(0xd9b04a, 0.8);
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < 9; j++)
          g.fillRect(s.x - sw * 0.8 + i * sw * 0.2, s.y - sh * 0.8 + j * sh * 0.2, 2, 2);
      g.fillStyle(0xffd34d, 1);
      g.fillTriangle(s.x - sw - 2, s.y - sh - 2, s.x - sw + 16, s.y - sh - 2, s.x - sw - 2, s.y - sh + 16);
    }
    // The retention lever (CPU) or locking arm (ZIF socket).
    const p = at(this.L.lever.pivot);
    const e = at(this.leverEnd());
    g.lineStyle(9, 0x15121b, 1);
    g.lineBetween(p.x, p.y, e.x, e.y);
    g.lineStyle(5, 0xd9dde4, 1);
    g.lineBetween(p.x, p.y, e.x, e.y);
    g.fillStyle(0xd9dde4, 1);
    g.fillCircle(e.x, e.y, 7);
    if (this.stage === 'open' || this.stage === 'close') {
      g.lineStyle(3, 0xffd34d, 0.9);
      g.strokeCircle(e.x, e.y, 16);
    }
    if (this.stage === 'open') return;
    // The chip: square with a gold triangle in one corner, or long with a notch at one end.
    const c = at(this.chipAt);
    const k = this.turn % this.L.turns;
    g.fillStyle(0x000000, 0.35);
    g.fillRect(c.x - sw + 4, c.y - sh + 6, sw * 2, sh * 2);
    if (mcu) {
      g.fillStyle(0x1d1c21, 1);
      g.fillRect(c.x - sw * 0.92, c.y - sh * 0.8, sw * 1.84, sh * 1.6);
      g.fillStyle(0xc9ced6, 1);
      for (let i = 0; i < 8; i++) {
        const x = c.x - sw * 0.92 + 6 + i * ((sw * 1.84 - 12) / 7) - 2;
        g.fillRect(x, c.y - sh, 4, sh * 0.25);
        g.fillRect(x, c.y + sh * 0.75, 4, sh * 0.25);
      }
      g.fillStyle(0x0c0b10, 1);
      g.fillCircle(k === 0 ? c.x - sw * 0.92 : c.x + sw * 0.92, c.y, sh * 0.3);
    } else {
      g.fillStyle(0x2f6b3c, 1);
      g.fillRect(c.x - sw, c.y - sh, sw * 2, sh * 2);
      g.fillStyle(0xc9ccd3, 1);
      g.fillRect(c.x - sw * 0.7, c.y - sh * 0.7, sw * 1.4, sh * 1.4);
      g.fillStyle(0x9aa0ab, 1);
      g.fillRect(c.x - sw * 0.55, c.y - sh * 0.55, sw * 1.1, sh * 0.25);
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const [dx, dy] = corners[k];
      const x0 = c.x + dx * sw;
      const y0 = c.y + dy * sh;
      g.fillStyle(0xffd34d, 1);
      g.fillTriangle(x0, y0, x0 - dx * 18, y0, x0, y0 - dy * 18);
    }
  }
}

// ---------------------------------------------------------------- torque sequence

interface TBolt {
  p: Pt;
  img: Phaser.GameObjects.Image;
  a: number;
  snug: boolean;
  done: boolean;
}

/** Snug every bolt in the stamped order, then torque each in order and stop the gauge in the green. */
export class TorqueTask extends RepairTask {
  private L: TorqueLayout;
  private bolts: TBolt[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private pass: 1 | 2 = 1;
  private k = 0;
  private holding: number | null = null;
  private held = 0;
  private gauge = 0;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;
  private tickT = 0;

  constructor(
    h: TaskHost,
    private where: TorqueAt,
  ) {
    super(h);
    this.L = torqueLayout(h.rig, where);
  }

  start(): void {
    const key = this.h.shared('repair_bolt', () => drawBolt(96));
    const size = this.L.size * STAGE;
    this.L.pts.forEach((p, i) => {
      const q = at(p);
      const img = this.put(this.h.scene.add.image(q.x, q.y, key).setDisplaySize(size, size));
      this.tw({
        targets: img,
        alpha: { from: 0, to: 1 },
        y: { from: q.y - 50, to: q.y },
        duration: 240,
        delay: i * 70,
      });
      this.bolts.push({ p, img, a: i * 0.8, snug: false, done: false });
      // The sequence number stamped beside each bolt, as on a real torque diagram.
      this.labels.push(
        this.put(
          makeText(
            this.h.scene,
            q.x - size * 0.75,
            q.y - size * 0.75,
            String(this.L.labels[i]),
            FS.tiny,
            C.white,
            {
              stroke: C.ink,
              strokeW: 5,
            },
          ),
        ),
      );
    });
    this.g = this.put(this.h.scene.add.graphics());
  }

  instruction(): string {
    return this.pass === 1 ? 'mg.asm.torqueSnug' : 'mg.asm.torqueFinal';
  }

  progress(): number {
    const n = this.bolts.length || 1;
    return this.pass === 1 ? (0.5 * this.k) / n : 0.5 + (0.5 * this.k) / n;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number | undefined {
    return this.pass === 2 ? this.gauge : undefined;
  }

  private target(): number {
    return this.L.order[this.k];
  }

  bot(): BotAction {
    if (!this.bolts.length || this.k >= this.bolts.length) return { a: 'wait' };
    const p = this.bolts[this.target()].p;
    if (this.pass === 1) return { a: 'hold', p };
    return { a: 'holdLevel', p, until: (TORQUE_BAND[0] + TORQUE_BAND[1]) / 2 };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.bolts.findIndex((b) => near(b.p, u, v, 0.06));
    if (i < 0 || this.k >= this.bolts.length) return;
    if (i !== this.target()) {
      // Out of order: the part would sit crooked.
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
      this.labels[this.target()]?.setScale(1.5);
      this.tw({ targets: this.labels[this.target()], scale: 1, duration: 400 });
      return;
    }
    this.holding = i;
    this.held = 0;
    this.haptic('light');
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding !== null && !near(this.bolts[this.holding].p, u, v, 0.09)) this.release();
  }

  override pointerUp(): void {
    this.release();
  }

  private release(): void {
    if (this.holding === null) return;
    const i = this.holding;
    this.holding = null;
    if (this.pass === 2) {
      if (this.gauge >= TORQUE_BAND[0]) {
        if (this.gauge > TORQUE_STRIP) {
          this.mistakes++;
          this.h.sfx('buzz');
        } else this.h.sfx('ding');
        this.next(i);
      }
    }
  }

  private next(i: number): void {
    const b = this.bolts[i];
    if (this.pass === 1) b.snug = true;
    else b.done = true;
    this.h.sfx('stamp');
    this.haptic('medium');
    this.labels[i].setColor(this.pass === 2 ? '#7dff8a' : '#ffe08a');
    this.k++;
    this.gauge = 0;
    if (this.k < this.bolts.length) return;
    if (this.pass === 1) {
      this.pass = 2;
      this.k = 0;
      this.h.sfx('pop');
      return;
    }
    this.h.burst(this.L.pts[0].u, this.L.pts[0].v, 'p_spark', 6, [0xffffff, 0x7dff8a], 90);
    this.h.scene.time.delayedCall(this.ms(300), () => {
      this.fadeOut(this.labels);
      this.finish();
    });
  }

  override update(dt: number): void {
    if (!this.g) return;
    const g = this.g;
    g.clear();
    for (const b of this.bolts) drawSlot(g, b.img.x, b.img.y, b.img.displayWidth * 0.3, b.a, b.img.alpha);
    if (this.k < this.bolts.length && this.holding === null) {
      // A soft ring on the bolt that comes next.
      const q = at(this.bolts[this.target()].p);
      g.lineStyle(3, 0xffd34d, 0.4 + 0.3 * Math.sin(this.h.scene.time.now / 160));
      g.strokeCircle(q.x, q.y, this.L.size * STAGE * 0.75);
    }
    if (this.holding === null) {
      if (this.pass === 2 && this.k < this.bolts.length)
        drawGauge(
          g,
          { u: this.bolts[this.target()].p.u + 0.08, v: this.bolts[this.target()].p.v },
          this.gauge,
          0xff9a3c,
          TORQUE_BAND,
        );
      return;
    }
    const b = this.bolts[this.holding];
    b.a += dt * (this.pass === 1 ? 9 : 3);
    drawRatchet(g, b.img.x, b.img.y, -0.9 + Math.sin(this.held * 10) * 0.4);
    this.held += dt;
    this.tickT += dt;
    if (this.tickT > 0.1) {
      this.tickT = 0;
      this.h.sfx('tick', 0.6);
    }
    if (this.pass === 1) {
      if (this.held >= SNUG_SECONDS) {
        this.holding = null;
        this.next(this.target());
      }
      return;
    }
    // Final pass: the click-type wrench's gauge climbs while you hold.
    this.gauge = Math.min(1, this.gauge + dt * TORQUE_RATE);
    drawGauge(
      g,
      { u: b.p.u + 0.08, v: b.p.v },
      this.gauge,
      this.gauge > TORQUE_STRIP ? 0xe03c31 : 0xff9a3c,
      TORQUE_BAND,
    );
  }
}

// ---------------------------------------------------------------- memory

/** Open the A2 latches, turn the stick so the notch matches, slot it in and press until it clicks. */
export class RamTask extends RepairTask {
  private L: RamLayout;
  private stage: 'latch' | 'insert' | 'press' = 'latch';
  private started = false;
  private open: [boolean, boolean] = [false, false];
  private flipped: boolean;
  private stickAt: Pt;
  private down: { u: number; v: number; dragging: boolean } | null = null;
  private pressT = 0;
  private pressing = false;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = ramLayout(h.rig);
    this.flipped = hashSeed(h.inst.s, 'ramflip') % 2 === 0;
    this.stickAt = this.L.tray;
  }

  override init(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const sc = this.h.scene;
    // Silk-screen slot names.
    for (const s of this.L.slots) {
      const q = at({ u: s.c.u - this.L.w / 2 - 0.045, v: s.c.v });
      this.put(makeText(sc, q.x, q.y, s.id, FS.tiny, C.white, { stroke: C.ink, strokeW: 4 }).setScale(0.7));
    }
    this.draw();
  }

  start(): void {
    this.stage = 'latch';
    this.started = true;
    this.draw();
  }

  instruction(): string {
    return { latch: 'mg.asm.ramLatch', insert: 'mg.asm.ramInsert', press: 'mg.asm.ramPress' }[this.stage];
  }

  progress(): number {
    return {
      latch: 0.15 * this.open.filter(Boolean).length,
      insert: 0.35,
      press: 0.7 + 0.3 * Math.min(1, this.pressT / 0.5),
    }[this.stage];
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    const slot = this.L.slots[this.L.target];
    if (this.stage === 'latch') return { a: 'tap', p: slot.latches[this.open[0] ? 1 : 0] };
    if (this.stage === 'insert')
      return this.flipped ? { a: 'tap', p: this.stickAt } : { a: 'drag', from: this.stickAt, to: slot.c };
    return { a: 'hold', p: slot.c };
  }

  override pointerDown(u: number, v: number): void {
    const slot = this.L.slots[this.L.target];
    if (this.stage === 'latch') {
      const i = slot.latches.findIndex((p) => near(p, u, v, 0.045));
      if (i >= 0 && !this.open[i]) {
        this.open[i] = true;
        this.h.sfx('snap');
        this.haptic('light');
        if (this.open[0] && this.open[1]) this.stage = 'insert';
        this.draw();
      }
      return;
    }
    if (
      this.stage === 'insert' &&
      Math.abs(u - this.stickAt.u) < this.L.w / 2 &&
      Math.abs(v - this.stickAt.v) < 0.04
    )
      this.down = { u, v, dragging: false };
    if (this.stage === 'press' && Math.abs(u - slot.c.u) < this.L.w / 2 && Math.abs(v - slot.c.v) < 0.05)
      this.pressing = true;
  }

  override pointerMove(u: number, v: number): void {
    if (!this.down) return;
    if (!tapped(this.down, u, v)) this.down.dragging = true;
    if (this.down.dragging) {
      this.stickAt = { u, v };
      this.draw();
    }
  }

  override pointerUp(u: number, v: number): void {
    this.pressing = false;
    const d = this.down;
    this.down = null;
    if (!d || this.stage !== 'insert') return;
    if (!d.dragging) {
      this.flipped = !this.flipped;
      this.h.sfx('tick');
      this.draw();
      return;
    }
    const hit = this.L.slots.findIndex(
      (s) => Math.abs(s.c.u - u) < this.L.w / 2 && Math.abs(s.c.v - v) < 0.025,
    );
    if (hit === this.L.target && !this.flipped) {
      this.stickAt = this.L.slots[hit].c;
      this.stage = 'press';
      this.h.sfx('snap');
    } else {
      if (hit >= 0) {
        // The wrong slot, or the notch the wrong way: it will not go in.
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      }
      this.stickAt = this.L.tray;
    }
    this.draw();
  }

  override update(dt: number): void {
    if (this.stage !== 'press' || !this.pressing) return;
    this.pressT += dt;
    if (this.pressT >= 0.5) {
      this.pressing = false;
      this.open = [false, false];
      this.h.sfx('stamp');
      this.h.sfx('ding');
      this.haptic('success');
      this.stage = 'press';
      this.pressT = 0.5;
      this.draw(true);
      this.finish();
    } else this.draw();
  }

  private draw(seated = false): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const slot = this.L.slots[this.L.target];
    // Latches: white clips at both ends of every slot (open ones lean out).
    for (const [si, s] of this.L.slots.entries()) {
      s.latches.forEach((p, i) => {
        const q = at(p);
        const isOpen = si === this.L.target && this.open[i];
        g.fillStyle(0xe8e6df, 1);
        const lean = isOpen ? (i === 0 ? -8 : 8) : 0;
        g.fillRect(q.x - 4 + lean, q.y - 7, 8, 14);
        if (this.started && si === this.L.target && this.stage === 'latch' && !this.open[i]) {
          g.lineStyle(3, 0xffd34d, 0.9);
          g.strokeCircle(q.x, q.y, 14);
        }
      });
    }
    const q = at(slot.c);
    if (this.started && (this.stage === 'latch' || this.stage === 'insert')) {
      g.lineStyle(2, 0xffd34d, 0.8);
      g.strokeRect(q.x - (this.L.w * STAGE) / 2, q.y - 8, this.L.w * STAGE, 16);
    }
    if (this.stage === 'latch') return;
    // The stick: green PCB with memory chips, gold contacts, the notch off-centre.
    const c = at(this.stickAt);
    const w = this.L.w * STAGE;
    const h = this.stage === 'insert' ? 46 : seated ? 22 : 30;
    const x0 = c.x - w / 2;
    const y0 = c.y - h + 6;
    g.fillStyle(0x000000, 0.3);
    g.fillRect(x0 + 4, y0 + 5, w, h);
    g.fillStyle(0x1f6b3a, 1);
    g.fillRect(x0, y0, w, h);
    g.fillStyle(0x15151a, 1);
    for (let i = 0; i < 8; i++) g.fillRect(x0 + 6 + i * ((w - 12) / 8), y0 + 4, (w - 12) / 8 - 4, h * 0.45);
    g.fillStyle(0xd9b04a, 1);
    g.fillRect(x0 + 3, y0 + h - 7, w - 6, 6);
    const notch = this.flipped ? 1 - this.L.notch : this.L.notch;
    g.fillStyle(0x1b1d24, 1);
    g.fillRect(x0 + w * notch - 3, y0 + h - 8, 6, 9);
    // The slot's key, to compare.
    if (this.stage === 'insert') {
      g.fillStyle(0xffd34d, 1);
      g.fillTriangle(
        q.x - w / 2 + w * this.L.notch - 6,
        q.y - 12,
        q.x - w / 2 + w * this.L.notch + 6,
        q.y - 12,
        q.x - w / 2 + w * this.L.notch,
        q.y - 2,
      );
    }
  }
}

// ---------------------------------------------------------------- front-panel header

/** Fit the four tiny front-panel plugs onto their pins; LED plugs need + on the + pin. */
export class HeaderTask extends RepairTask {
  private L: HeaderLayout;
  private flipped: boolean[];
  private pos: Pt[];
  private done: boolean[];
  private drag: { i: number; u: number; v: number; dragging: boolean } | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = headerLayout();
    this.flipped = flippedPlugs(h.inst.s);
    this.pos = this.L.trays.map((p) => ({ ...p }));
    this.done = this.L.plugs.map(() => false);
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    const L = this.L;
    // Silk-screen: a name over (or under) each pair of pins, + and − beside the LED pins.
    for (const p of L.plugs) {
      const a = at(L.pins[p.pins[0]]);
      const b = at(L.pins[p.pins[1]]);
      const topRow = p.pins[0] < 5;
      const y = a.y + (topRow ? -40 : 40);
      const name = { pled: 'PLED', pwrsw: 'PWR SW', hdd: 'HDD', rstsw: 'RESET' }[p.id];
      this.put(makeText(sc, (a.x + b.x) / 2, y, name, FS.tiny, 0xf2f2ee, { bold: false }).setScale(0.75));
      if (p.polar) {
        this.put(makeText(sc, a.x, a.y + (topRow ? -20 : 20), '+', FS.tiny, 0xf2f2ee).setScale(0.75));
        this.put(makeText(sc, b.x, b.y + (topRow ? -20 : 20), '−', FS.tiny, 0xf2f2ee).setScale(0.75));
      }
    }
    const names: Record<string, string> = {
      pled: 'PWR LED',
      pwrsw: 'PWR SW',
      hdd: 'HDD LED',
      rstsw: 'RESET',
    };
    for (const p of L.plugs)
      this.texts.push(
        this.put(
          makeText(sc, 0, 0, names[p.id], FS.tiny, C.white, { stroke: C.ink, strokeW: 4 }).setScale(0.75),
        ),
      );
    this.draw();
  }

  instruction(): string {
    return 'mg.asm.header';
  }

  progress(): number {
    return this.done.filter(Boolean).length / this.done.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    const i = this.done.findIndex((d) => !d);
    if (i < 0) return { a: 'wait' };
    if (this.flipped[i]) return { a: 'tap', p: this.pos[i] };
    return { a: 'drag', from: this.pos[i], to: plugSeat(this.L, this.L.plugs[i]) };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.pos.findIndex(
      (p, k) => !this.done[k] && Math.abs(p.u - u) < 0.05 && Math.abs(p.v - v) < 0.04,
    );
    if (i >= 0) this.drag = { i, u, v, dragging: false };
  }

  override pointerMove(u: number, v: number): void {
    const d = this.drag;
    if (!d) return;
    if (!tapped(d, u, v)) d.dragging = true;
    if (d.dragging) {
      this.pos[d.i] = { u, v };
      this.draw();
    }
  }

  override pointerUp(u: number, v: number): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const i = d.i;
    const plug = this.L.plugs[i];
    if (!d.dragging) {
      if (plug.polar) {
        this.flipped[i] = !this.flipped[i];
        this.h.sfx('tick');
      }
      this.draw();
      return;
    }
    const hit = this.L.plugs.findIndex((p) => near(plugSeat(this.L, p), u, v, 0.04));
    if (hit === i && !this.flipped[i]) {
      this.done[i] = true;
      this.pos[i] = plugSeat(this.L, plug);
      this.h.sfx('snap');
      this.haptic('success');
      if (this.done.every(Boolean))
        this.h.scene.time.delayedCall(this.ms(400), () => {
          this.fadeOut();
          this.finish();
        });
    } else {
      if (hit >= 0) {
        // Wrong pins, or an LED the wrong way round (it would not light).
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      }
      this.pos[i] = { ...this.L.trays[i] };
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // Silk-screen box and the pins (the key pin is missing).
    const a = at(L.pins[0]);
    const b = at(L.pins[9]);
    g.lineStyle(2, 0xf2f2ee, 0.8);
    g.strokeRect(a.x - 22, a.y - 22, b.x - a.x + 44, b.y - a.y + 44);
    L.pins.forEach((p, i) => {
      if (i === L.key) return;
      const q = at(p);
      g.fillStyle(0x0f0f12, 1);
      g.fillRect(q.x - 9, q.y - 9, 18, 18);
      g.fillStyle(0xe2c25a, 1);
      g.fillRect(q.x - 4, q.y - 4, 8, 8);
    });
    L.plugs.forEach((p, i) => {
      const q = at(this.pos[i]);
      const colour = [0x3fae49, 0xe03c31, 0xf2c12e, 0x2f6fd0][i];
      // Two wires out of the bottom: coloured (+) and white (-) on the LEDs.
      const left = p.polar ? (this.flipped[i] ? 0xf2f2ee : colour) : colour;
      const right = p.polar ? (this.flipped[i] ? colour : 0xf2f2ee) : 0xf2f2ee;
      if (!this.done[i]) {
        g.lineStyle(5, left, 1);
        g.lineBetween(q.x - 9, q.y + 14, q.x - 12, q.y + 18);
        g.lineStyle(5, right, 1);
        g.lineBetween(q.x + 9, q.y + 14, q.x + 12, q.y + 18);
      }
      g.fillStyle(0x121215, 1);
      g.fillRect(q.x - 26, q.y - 14, 52, 28);
      g.lineStyle(2, this.done[i] ? 0x4cc65a : 0x3a3a42, 1);
      g.strokeRect(q.x - 26, q.y - 14, 52, 28);
      if (p.polar) {
        // "+" printed on the plug side of the coloured wire.
        const px = this.flipped[i] ? q.x + 14 : q.x - 14;
        g.lineStyle(3, 0xffffff, 1);
        g.lineBetween(px - 5, q.y, px + 5, q.y);
        g.lineBetween(px, q.y - 5, px, q.y + 5);
      }
      const tx = this.texts[i];
      tx.setPosition(q.x, q.y + 30).setVisible(!this.done[i]);
    });
  }
}

// ---------------------------------------------------------------- serpentine belt

/** Route the belt round the pulleys in the diagram's order, then pull the tensioner to slip it on. */
export class BeltTask extends RepairTask {
  private L: BeltLayout;
  private placed: number[] = [];
  private stage: 'route' | 'tension' | 'done' = 'route';
  private holding = false;
  private held = 0;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = beltLayout();
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    // The routing diagram sticker (as under a real hood), with the order numbered.
    const d = at(this.L.diagram);
    const k = 0.45;
    const sg = this.put(sc.add.graphics());
    sg.fillStyle(0xf4f1e8, 1);
    sg.fillRoundedRect(d.x - 90, d.y - 85, 180, 170, 10);
    sg.lineStyle(2, C.ink, 1);
    sg.strokeRoundedRect(d.x - 90, d.y - 85, 180, 170, 10);
    const P = (p: Pt) => ({
      x: d.x + (p.u - this.L.panel.c.u) * STAGE * k,
      y: d.y + 8 + (p.v - this.L.panel.c.v) * STAGE * k,
    });
    sg.lineStyle(4, 0x1b1d24, 1);
    const pts = [...this.L.route, this.L.route[0]].map((i) => P(this.L.pulleys[i].c));
    for (let i = 0; i + 1 < pts.length; i++) sg.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    this.L.route.forEach((pi, n) => {
      const pl = this.L.pulleys[pi];
      const q = P(pl.c);
      sg.fillStyle(pl.grooved ? 0x9aa0ab : 0xe8e6df, 1);
      sg.fillCircle(q.x, q.y, pl.r * STAGE * k);
      sg.lineStyle(2, 0x1b1d24, 1);
      sg.strokeCircle(q.x, q.y, pl.r * STAGE * k);
      this.put(makeText(sc, q.x, q.y, String(n + 1), FS.tiny, C.ink).setScale(0.7));
    });
    this.put(makeText(sc, d.x, d.y - 70, 'BELT ROUTING', FS.tiny, C.ink).setScale(0.7));
    this.draw();
  }

  instruction(): string {
    return this.stage === 'route' ? 'mg.asm.beltRoute' : 'mg.asm.beltTension';
  }

  progress(): number {
    if (this.stage === 'route') return (0.8 * this.placed.length) / this.L.route.length;
    return 0.8 + 0.2 * Math.min(1, this.held / TENSIONER_SECONDS);
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    if (this.stage === 'route') return { a: 'tap', p: this.L.pulleys[this.L.route[this.placed.length]].c };
    if (this.stage === 'tension') return { a: 'hold', p: this.L.pulleys[this.L.tensioner].c };
    return { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.L.pulleys.findIndex((p) => near(p.c, u, v, Math.max(0.045, p.r + 0.01)));
    if (i < 0) return;
    if (this.stage === 'tension') {
      if (i === this.L.tensioner) this.holding = true;
      return;
    }
    if (this.stage !== 'route' || this.placed.includes(i)) return;
    if (i === this.L.route[this.placed.length]) {
      this.placed.push(i);
      this.h.sfx('snap');
      this.haptic('light');
      if (this.placed.length === this.L.route.length) this.stage = 'tension';
    } else {
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
    }
    this.draw();
  }

  override pointerUp(): void {
    this.holding = false;
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding && !near(this.L.pulleys[this.L.tensioner].c, u, v, 0.08)) this.holding = false;
  }

  override update(dt: number): void {
    if (this.stage !== 'tension' || !this.holding) return;
    this.held += dt;
    this.draw();
    if (this.held >= TENSIONER_SECONDS) {
      this.stage = 'done';
      this.holding = false;
      this.h.sfx('stamp');
      this.h.sfx('ding');
      this.haptic('success');
      this.draw();
      this.h.scene.time.delayedCall(this.ms(400), () => {
        this.fadeOut();
        this.finish();
      });
    }
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The belt so far: ribbed black rubber between the pulleys.
    const pts = this.placed.map((i) => at(L.pulleys[i].c));
    if (this.stage === 'done') pts.push(at(L.pulleys[L.route[0]].c));
    for (let i = 0; i + 1 < pts.length; i++) {
      g.lineStyle(14, 0x0d0d10, 1);
      g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      g.lineStyle(2, 0x4a4a52, 1);
      g.lineBetween(pts[i].x, pts[i].y - 3, pts[i + 1].x, pts[i + 1].y - 3);
    }
    // Tensioner arm, pulled back while you hold it.
    const tp = L.pulleys[L.tensioner].c;
    const pull =
      this.stage === 'tension' ? Math.min(1, this.held / TENSIONER_SECONDS) : this.stage === 'done' ? 0 : 0;
    const tq = at({ u: tp.u + pull * 0.03, v: tp.v + pull * 0.02 });
    g.lineStyle(10, 0x6d727c, 1);
    g.lineBetween(tq.x, tq.y, tq.x + 40, tq.y + 30);
    L.pulleys.forEach((p, i) => {
      const q = i === L.tensioner ? tq : at(p.c);
      const r = p.r * STAGE;
      g.fillStyle(0x0a0a0d, 1);
      g.fillCircle(q.x, q.y, r + 4);
      g.fillStyle(p.grooved ? 0x8d939d : 0xd9dde4, 1);
      g.fillCircle(q.x, q.y, r);
      if (p.grooved) {
        g.lineStyle(1.5, 0x4a4f58, 1);
        for (let k = 1; k <= 3; k++) g.strokeCircle(q.x, q.y, r * (0.45 + k * 0.15));
      }
      g.fillStyle(0x2a2d33, 1);
      g.fillCircle(q.x, q.y, r * 0.3);
      if (this.placed.includes(i)) {
        g.lineStyle(3, 0x4cc65a, 1);
        g.strokeCircle(q.x, q.y, r + 6);
      }
      if (this.stage === 'tension' && i === L.tensioner) {
        g.lineStyle(3, 0xffd34d, 0.9);
        g.strokeCircle(q.x, q.y, r + 10);
      }
    });
  }
}

// ---------------------------------------------------------------- servo centring

/** Hold + / − to turn the servo horn and let go at exactly 90 degrees. */
export class ServoTask extends RepairTask {
  private angle: number;
  private dir = 0;
  private done = false;
  private g!: Phaser.GameObjects.Graphics;
  private plus: Pt = { u: 0.66, v: 0.62 };
  private minus: Pt = { u: 0.34, v: 0.62 };
  private c: Pt = { u: 0.5, v: 0.42 };

  constructor(h: TaskHost) {
    super(h);
    this.angle = servoStart(h.inst.s);
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    for (const [p, s] of [
      [this.minus, '−'],
      [this.plus, '+'],
    ] as const) {
      const q = at(p);
      this.put(makeText(sc, q.x, q.y, s, FS.h2, C.white, { stroke: C.ink, strokeW: 6 }));
    }
    this.put(
      makeText(sc, at(this.c).x, at({ u: 0, v: this.c.v - 0.2 }).y, '90°', FS.small, 0x7dff8a, {
        stroke: C.ink,
        strokeW: 5,
      }),
    );
    this.draw();
  }

  instruction(): string {
    return 'mg.asm.servo';
  }

  progress(): number {
    return this.done ? 1 : Math.min(0.9, this.angle / 0.5);
  }

  override level(): number {
    return this.angle;
  }

  bot(): BotAction {
    if (this.done) return { a: 'wait' };
    const mid = (SERVO_BAND[0] + SERVO_BAND[1]) / 2;
    // Went past 90 degrees: turn it back with −.
    if (this.angle > SERVO_BAND[1]) return { a: 'holdLevel', p: this.minus, until: mid, below: true };
    return { a: 'holdLevel', p: this.plus, until: mid };
  }

  override pointerDown(u: number, v: number): void {
    if (this.done) return;
    if (near(this.plus, u, v, 0.07)) this.dir = 1;
    else if (near(this.minus, u, v, 0.07)) this.dir = -1;
  }

  override pointerUp(): void {
    if (!this.dir) return;
    this.dir = 0;
    if (this.angle >= SERVO_BAND[0] && this.angle <= SERVO_BAND[1]) {
      this.done = true;
      this.h.sfx('ding');
      this.haptic('success');
      this.draw();
      this.h.scene.time.delayedCall(this.ms(300), () => {
        this.fadeOut();
        this.finish();
      });
    }
  }

  override update(dt: number): void {
    if (!this.dir || this.done) return;
    this.angle = Math.max(0, Math.min(1, this.angle + this.dir * dt * SERVO_RATE));
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    inset(g, { u: 0.5, v: 0.5 }, 0.32, 0.25);
    const c = at(this.c);
    const R = STAGE * 0.17;
    // Scale from 0 to 180 degrees, the green band at 90.
    for (let i = 0; i <= 18; i++) {
      const a = Math.PI + (i / 18) * Math.PI;
      g.lineStyle(i % 9 === 0 ? 4 : 2, 0xf2f2ee, 0.8);
      g.lineBetween(
        c.x + Math.cos(a) * R,
        c.y + Math.sin(a) * R,
        c.x + Math.cos(a) * (R - (i % 9 === 0 ? 18 : 10)),
        c.y + Math.sin(a) * (R - (i % 9 === 0 ? 18 : 10)),
      );
    }
    g.lineStyle(10, 0x4cc65a, 0.85);
    g.beginPath();
    g.arc(c.x, c.y, R + 8, Math.PI + SERVO_BAND[0] * Math.PI, Math.PI + SERVO_BAND[1] * Math.PI, false);
    g.strokePath();
    // Servo body (blue case, output spline) and the white horn.
    g.fillStyle(0x2a63c8, 1);
    g.fillRoundedRect(c.x - 60, c.y - 30, 120, 70, 8);
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(c.x - 54, c.y - 26, 108, 8);
    const a = Math.PI + this.angle * Math.PI;
    g.lineStyle(18, 0x0d0d10, 1);
    g.lineBetween(c.x, c.y, c.x + Math.cos(a) * (R - 26), c.y + Math.sin(a) * (R - 26));
    g.lineStyle(13, 0xf4f1e8, 1);
    g.lineBetween(c.x, c.y, c.x + Math.cos(a) * (R - 26), c.y + Math.sin(a) * (R - 26));
    g.fillStyle(0xd9dde4, 1);
    g.fillCircle(c.x, c.y, 14);
    g.fillStyle(0x6d727c, 1);
    g.fillCircle(c.x, c.y, 6);
    // + / − buttons.
    for (const [p, on] of [
      [this.minus, this.dir < 0],
      [this.plus, this.dir > 0],
    ] as const) {
      const q = at(p);
      g.fillStyle(on ? 0x4cc65a : 0x4a4656, 1);
      g.fillCircle(q.x, q.y, 34);
      g.lineStyle(3, 0x0d0d10, 1);
      g.strokeCircle(q.x, q.y, 34);
    }
  }
}

// ---------------------------------------------------------------- fuel line pressure test

/** Pressurise the lines, find the fitting that bubbles, tighten it, and see the pressure hold. */
export class LeakTask extends RepairTask {
  private L: LeakLayout;
  private stage: 'pump' | 'find' | 'hold' | 'done' = 'pump';
  private pressure = 0;
  private pumping = false;
  private fixing = false;
  private fixT = 0;
  private holdT = 0;
  private t = 0;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = leakLayout(h.rig, hashSeed(h.inst.s, 'cables_fuel'));
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const q = at(this.L.valve);
    this.put(makeText(this.h.scene, q.x, q.y + 44, 'TEST', FS.tiny, C.white, { stroke: C.ink, strokeW: 4 }));
  }

  instruction(): string {
    return {
      pump: 'mg.asm.leakPump',
      find: 'mg.asm.leakFind',
      hold: 'mg.asm.leakHold',
      done: 'mg.asm.leakHold',
    }[this.stage];
  }

  progress(): number {
    if (this.stage === 'pump') return 0.4 * (this.pressure / LEAK_TEST);
    if (this.stage === 'find') return 0.5 + 0.3 * (this.fixT / LEAK_FIX_SECONDS);
    return 0.85 + 0.15 * Math.min(1, this.holdT);
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number {
    return this.pressure;
  }

  bot(): BotAction {
    if (this.stage === 'pump') return { a: 'holdLevel', p: this.L.valve, until: LEAK_TEST + 0.02 };
    if (this.stage === 'find') return { a: 'hold', p: this.L.fittings[this.L.leak] };
    return { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'pump' && near(this.L.valve, u, v, 0.07)) this.pumping = true;
    if (this.stage !== 'find') return;
    const i = this.L.fittings.findIndex((p) => near(p, u, v, 0.06));
    if (i < 0) return;
    if (i === this.L.leak) this.fixing = true;
    else {
      // That one is tight already: no bubbles there.
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.fixing && !near(this.L.fittings[this.L.leak], u, v, 0.09)) this.fixing = false;
  }

  override pointerUp(): void {
    this.pumping = false;
    this.fixing = false;
  }

  override update(dt: number): void {
    if (!this.g) return;
    this.t += dt;
    if (this.stage === 'pump' && this.pumping) {
      this.pressure = Math.min(1, this.pressure + dt * LEAK_PUMP_RATE);
      if (this.pressure >= LEAK_TEST) {
        this.stage = 'find';
        this.pumping = false;
        this.h.sfx('spray', 0.5);
      }
    } else if (this.stage === 'find') {
      // The leak lets the pressure creep down until it is fixed.
      this.pressure = Math.max(LEAK_TEST * 0.6, this.pressure - dt * LEAK_DROP_RATE);
      if (this.fixing) {
        this.fixT += dt;
        if (this.fixT >= LEAK_FIX_SECONDS) {
          this.stage = 'hold';
          this.fixing = false;
          this.pressure = LEAK_TEST;
          this.h.sfx('stamp');
          this.haptic('success');
        }
      }
    } else if (this.stage === 'hold') {
      this.holdT += dt;
      if (this.holdT >= 1) {
        this.stage = 'done';
        this.h.sfx('ding');
        this.fadeOut();
        this.finish();
      }
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    // Test valve (a red handle) and the pressure gauge with the test band.
    const v = at(this.L.valve);
    g.fillStyle(0x0d0d10, 1);
    g.fillCircle(v.x, v.y, 30);
    g.fillStyle(this.stage === 'pump' ? 0xe03c31 : 0x8a3a30, 1);
    g.fillRect(v.x - 28, v.y - 7, 56, 14);
    g.fillStyle(0xc9ced6, 1);
    g.fillCircle(v.x, v.y, 9);
    if (this.stage === 'pump') {
      g.lineStyle(3, 0xffd34d, 0.9);
      g.strokeCircle(v.x, v.y, 38);
    }
    drawGauge(g, this.L.gauge, this.pressure, this.stage === 'find' ? 0xff9a3c : 0x4fb6ff, [
      LEAK_TEST - 0.02,
      1,
    ]);
    if (this.stage !== 'find') return;
    // Soapy bubbles at the leaking fitting.
    const f = at(this.L.fittings[this.L.leak]);
    for (let i = 0; i < 6; i++) {
      const k = (this.t * 0.8 + i / 6) % 1;
      g.lineStyle(2, 0xe8f6ff, 1 - k);
      g.strokeCircle(f.x - 18 + i * 7, f.y - 10 - k * 40, 4 + k * 6);
    }
    if (this.fixing) drawRatchet(g, f.x, f.y, -0.9 + Math.sin(this.fixT * 12) * 0.4);
  }
}
