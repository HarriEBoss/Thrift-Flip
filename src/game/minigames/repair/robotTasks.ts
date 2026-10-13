import Phaser from 'phaser';
import {
  DEAD_VOLTS,
  DESOLDER_SECONDS,
  ESTOP_TWIST,
  SOLDER_BAND,
  SOLDER_RATE,
  UART_BOOT_SECONDS,
  UART_LEADS,
  cellUp,
  lockoutLayout,
  lockoutSteps,
  packLayout,
  propLayout,
  robotFault,
  uartLayout,
  uartTarget,
  type LockStep,
  type LockoutLayout,
  type PackLayout,
  type PropLayout,
  type UartLayout,
} from '../../../core/robotRepair';
import type { Pt } from '../../../core/repair';
import { makeText } from '../../ui/widgets';
import { FS } from '../../theme';
import { t } from '../../../i18n';
import { STAGE } from '../MiniGame';
import { RepairTask, at, drawGauge, near, type BotAction, type TaskHost } from './host';
import { inset, scoreFor } from './assembly';
import { Twist, pinNote } from './carTasks';

/** A small label in a magnified panel. */
function label(
  h: TaskHost,
  p: Pt,
  text: string,
  color: number = 0xf2f2ee,
  scale = 0.7,
): Phaser.GameObjects.Text {
  const q = at(p);
  return makeText(h.scene, q.x, q.y, text, FS.tiny, color, { stroke: 0x0d0d10, strokeW: 4 }).setScale(scale);
}

/** A curved arrow round a centre showing a direction of spin (1 = clockwise). */
export function drawSpin(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  dir: 1 | -1,
  color: number,
): void {
  const a0 = -Math.PI * 0.85;
  const a1 = Math.PI * 0.35;
  g.lineStyle(4, color, 1);
  g.beginPath();
  g.arc(x, y, r, a0, a1, false);
  g.strokePath();
  // Arrowhead at the end the spin goes towards.
  const end = dir > 0 ? a1 : a0;
  const ex = x + Math.cos(end) * r;
  const ey = y + Math.sin(end) * r;
  const tang = end + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const back = tang + Math.PI;
  g.fillStyle(color, 1);
  g.fillTriangle(
    ex + Math.cos(tang) * 9,
    ey + Math.sin(tang) * 9,
    ex + Math.cos(back + 0.7) * 9,
    ey + Math.sin(back + 0.7) * 9,
    ex + Math.cos(back - 0.7) * 9,
    ey + Math.sin(back - 0.7) * 9,
  );
}

// ---------------------------------------------------------------- lockout / tagout

/** E-stop, key, padlock and tag before working on a robot; the reverse (and reset) after. */
export class LockoutTask extends RepairTask {
  private L: LockoutLayout = lockoutLayout();
  private steps: LockStep[];
  private k = 0;
  private lockAt: Pt;
  private dragging = false;
  private twist: Twist;
  private turned = 0;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(
    h: TaskHost,
    private on: boolean,
  ) {
    super(h);
    this.steps = lockoutSteps(on);
    this.lockAt = on ? this.L.tray : this.L.hasp;
    this.twist = new Twist(this.L.estop);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const L = this.L;
    this.put(label(this.h, { u: L.estop.u, v: L.estop.v + 0.085 }, 'E-STOP'));
    this.put(label(this.h, { u: L.key.u - 0.05, v: L.key.v - 0.07 }, t('robot.off'), 0xffb4a8, 0.6));
    this.put(label(this.h, { u: L.key.u + 0.05, v: L.key.v - 0.07 }, t('robot.run'), 0x9cf0a6, 0.6));
    this.put(label(this.h, { u: L.reset.u, v: L.reset.v + 0.07 }, 'RESET'));
    this.draw();
  }

  private get step(): LockStep | undefined {
    return this.steps[this.k];
  }

  instruction(): string {
    return `mg.robot.lock.${this.step ?? this.steps[this.steps.length - 1]}`;
  }

  progress(): number {
    return this.k / this.steps.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    switch (this.step) {
      case 'estop':
        return { a: 'tap', p: this.L.estop };
      case 'key':
      case 'keyOn':
        return { a: 'tap', p: this.L.key };
      case 'reset':
        return { a: 'tap', p: this.L.reset };
      case 'lock':
        return { a: 'drag', from: this.lockAt, to: this.L.hasp };
      case 'unlock':
        return { a: 'drag', from: this.lockAt, to: this.L.tray };
      case 'release':
        return { a: 'circle', c: this.L.estop, r: 0.04, turns: 0.6 };
      default:
        return { a: 'wait' };
    }
  }

  private wrong(): void {
    this.mistakes++;
    this.h.sfx('buzz');
    this.h.shake();
  }

  private advance(): void {
    this.k++;
    this.h.sfx(this.step === undefined ? 'ding' : 'snap');
    this.haptic('light');
    this.draw();
    if (this.step !== undefined) return;
    this.haptic('success');
    this.h.scene.time.delayedCall(this.ms(450), () => {
      this.fadeOut();
      this.finish();
    });
  }

  override pointerDown(u: number, v: number): void {
    const s = this.step;
    if (!s) return;
    const L = this.L;
    if (near(this.lockAt, u, v, 0.05)) {
      if (s === 'lock' || s === 'unlock') this.dragging = true;
      // Hanging your lock before the robot is stopped and keyed off does nothing safe.
      else if (this.on) this.wrong();
      return;
    }
    if (near(L.estop, u, v, 0.06)) {
      if (s === 'estop') this.advance();
      else if (s === 'release') this.twist.down(u, v, 0.12);
      return;
    }
    if (near(L.key, u, v, 0.05)) {
      // The key only turns once the robot is stopped, and not while a lock is on it.
      if (s === 'key' || s === 'keyOn') this.advance();
      else this.wrong();
      return;
    }
    if (near(L.reset, u, v, 0.05)) {
      if (s === 'reset') this.advance();
      else if (!this.on) this.wrong();
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.dragging) {
      this.lockAt = { u, v };
      this.draw();
      return;
    }
    if (!this.twist.active || this.step !== 'release') return;
    const d = this.twist.move(u, v);
    if (d > 0) this.turned += d;
    if (this.turned >= ESTOP_TWIST) {
      this.twist.up();
      this.advance();
    }
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    this.twist.up();
    if (!this.dragging) return;
    this.dragging = false;
    const L = this.L;
    if (this.step === 'lock' && near(L.hasp, u, v, 0.06)) {
      this.lockAt = L.hasp;
      this.advance();
    } else if (this.step === 'unlock' && Math.hypot(u - L.hasp.u, v - L.hasp.v) > 0.1) {
      this.lockAt = L.tray;
      this.advance();
    } else this.lockAt = this.step === 'lock' ? L.tray : L.hasp;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    const k = this.k;
    const estopIn = this.on ? k >= 1 : k < 3;
    const keyOff = this.on ? k >= 2 : k < 2;
    const light = estopIn ? 0xe03c31 : this.on || k < 4 ? 0xffb02e : 0x4cc65a;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The control cabinet's door.
    const c = at(L.panel.c);
    g.fillStyle(0xd9a52a, 1);
    g.fillRoundedRect(c.x - 190, c.y - 135, 380, 220, 14);
    g.lineStyle(3, 0x6b4f0d, 1);
    g.strokeRoundedRect(c.x - 190, c.y - 135, 380, 220, 14);
    // E-stop: yellow collar, red mushroom (lower when pushed in), twist arrow when it must be released.
    const e = at(L.estop);
    g.fillStyle(0xf2c12e, 1);
    g.fillCircle(e.x, e.y, 40);
    g.lineStyle(3, 0x15121b, 1);
    g.strokeCircle(e.x, e.y, 40);
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(e.x + 3, e.y + (estopIn ? 2 : 6), 29);
    g.fillStyle(estopIn ? 0xb02a22 : 0xe03c31, 1);
    g.fillCircle(e.x, e.y, estopIn ? 26 : 30);
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(e.x - 8, e.y - 9, 8);
    if (this.step === 'release') {
      const a = (this.turned / ESTOP_TWIST) * Math.PI;
      g.lineStyle(4, 0xffffff, 0.8);
      g.lineBetween(
        e.x - Math.cos(a) * 20,
        e.y - Math.sin(a) * 20,
        e.x + Math.cos(a) * 20,
        e.y + Math.sin(a) * 20,
      );
      drawSpin(g, e.x, e.y, 50, 1, 0xffd34d);
    }
    // Key switch (the key points at OFF or RUN) and its lockout hasp below.
    const q = at(L.key);
    g.fillStyle(0x2a2833, 1);
    g.fillCircle(q.x, q.y, 26);
    g.fillStyle(0xc9ced6, 1);
    const ka = keyOff ? -Math.PI * 0.75 : -Math.PI * 0.25;
    g.lineStyle(10, 0xc9ced6, 1);
    g.lineBetween(q.x, q.y, q.x + Math.cos(ka) * 30, q.y + Math.sin(ka) * 30);
    g.fillCircle(q.x, q.y, 9);
    const hs = at(L.hasp);
    g.lineStyle(6, 0x8a8f99, 1);
    g.strokeRect(hs.x - 22, hs.y - 30, 44, 26);
    // Reset button and status light.
    const r = at(L.reset);
    g.fillStyle(0x2f6fd0, 1);
    g.fillCircle(r.x, r.y, 24);
    g.lineStyle(3, 0x15121b, 1);
    g.strokeCircle(r.x, r.y, 24);
    const li = at(L.light);
    g.fillStyle(light, 1);
    g.fillCircle(li.x, li.y, 16);
    g.fillStyle(light, 0.25);
    g.fillCircle(li.x, li.y, 26);
    // Your padlock with its red DANGER tag.
    const p = at(this.lockAt);
    g.lineStyle(7, 0xb9bfc9, 1);
    g.beginPath();
    g.arc(p.x, p.y - 12, 14, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0xe03c31, 1);
    g.fillRoundedRect(p.x - 18, p.y - 12, 36, 30, 5);
    g.fillStyle(0xffffff, 1);
    g.fillRect(p.x + 14, p.y + 10, 26, 36);
    g.fillStyle(0xe03c31, 1);
    g.fillRect(p.x + 14, p.y + 10, 26, 10);
    g.fillStyle(0x15121b, 0.7);
    for (let i = 0; i < 3; i++) g.fillRect(p.x + 18, p.y + 25 + i * 6, 18, 2);
    // Where to act next.
    const next: Pt | null =
      this.step === 'estop' || this.step === 'release'
        ? L.estop
        : this.step === 'key' || this.step === 'keyOn'
          ? L.key
          : this.step === 'reset'
            ? L.reset
            : this.step === 'lock'
              ? L.hasp
              : null;
    if (next && this.step !== 'release') {
      const n = at(next);
      g.lineStyle(3, 0xffd34d, 0.8);
      g.strokeCircle(n.x, n.y, 48);
    }
  }
}

// ---------------------------------------------------------------- serial console

/** Wire the USB-serial adapter to the debug header (crossed over), boot and read the fault log. */
export class UartTask extends RepairTask {
  private L: UartLayout;
  private stage: 'wire' | 'boot' | 'log' = 'wire';
  private leadAt: Pt[];
  private placed: Array<number | null> = [null, null, null];
  private drag: number | null = null;
  private bootT = 0;
  private g!: Phaser.GameObjects.Graphics;
  private screen!: Phaser.GameObjects.Text;
  private tags: Phaser.GameObjects.Text[] = [];
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = uartLayout(h.inst.s);
    this.leadAt = [...this.L.leads];
  }

  start(): void {
    const sc = this.h.scene;
    this.g = this.put(sc.add.graphics());
    // Silkscreen pin names over the header (the order is different on every board).
    this.L.pins.forEach((p, i) =>
      this.put(label(this.h, { u: p.u, v: p.v - 0.06 }, this.L.names[i], 0xf4f1e8, 0.62)),
    );
    this.put(
      label(this.h, { u: this.L.pins[0].u - 0.03, v: this.L.pins[0].v + 0.06 }, 'DEBUG', 0x9cf0a6, 0.5),
    );
    this.tags = UART_LEADS.map((n) => this.put(label(this.h, { u: 0, v: 0 }, n, 0xffffff, 0.55)));
    const s = at(this.L.screen);
    this.screen = this.put(
      makeText(sc, s.x, s.y, '$ screen /dev/ttyUSB0', FS.tiny, 0x7dff8a, { wrap: 260, bold: false }).setScale(
        0.62,
      ),
    );
    this.draw();
  }

  instruction(): string {
    return { wire: 'mg.robot.uartWire', boot: 'mg.robot.uartBoot', log: 'mg.robot.uartLog' }[this.stage];
  }

  progress(): number {
    if (this.stage === 'wire') return (this.placed.filter((p) => p !== null).length / 3) * 0.6;
    return this.stage === 'boot' ? 0.7 : 0.9;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    if (this.stage === 'log') return { a: 'tap', p: this.L.ok };
    if (this.stage === 'boot') return { a: 'wait' };
    const i = this.placed.findIndex((p) => p === null);
    const pin = this.L.names.indexOf(uartTarget(UART_LEADS[i]));
    return { a: 'drag', from: this.leadAt[i], to: this.L.pins[pin] };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'log' && near(this.L.ok, u, v, 0.06)) {
      const f = robotFault(this.h.rig.tasks, this.h.inst.s);
      pinNote(this.h, f.code, t(f.key, { n: f.n ?? 0 }));
      this.fadeOut();
      this.finish();
      return;
    }
    if (this.stage !== 'wire') return;
    const i = this.leadAt.findIndex((p, k) => this.placed[k] === null && near(p, u, v, 0.045));
    if (i >= 0) this.drag = i;
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag === null) return;
    this.leadAt[this.drag] = { u, v };
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    const i = this.drag;
    if (i === null) return;
    this.drag = null;
    const pin = this.L.pins.findIndex((p) => near(p, u, v, 0.035));
    if (pin >= 0 && !this.placed.includes(pin)) {
      if (this.L.names[pin] === uartTarget(UART_LEADS[i])) {
        this.placed[i] = pin;
        this.leadAt[i] = this.L.pins[pin];
        this.h.sfx('snap');
        this.haptic('light');
        if (this.placed.every((p) => p !== null)) {
          this.stage = 'boot';
          this.screen.setText(t('uart.booting'));
        }
        this.draw();
        return;
      }
      // TX on TX (both talking, nobody listening), or worse, a lead on the 3.3 V power pin.
      this.mistakes++;
      this.h.sfx('buzz');
      this.h.shake();
    }
    this.leadAt[i] = this.L.leads[i];
    this.draw();
  }

  override update(dt: number): void {
    if (this.stage !== 'boot') return;
    this.bootT += dt;
    if (this.bootT < UART_BOOT_SECONDS) return;
    this.stage = 'log';
    const f = robotFault(this.h.rig.tasks, this.h.inst.s);
    this.screen.setText(`${t('uart.log')}\n> ${f.code}\n${t(f.key, { n: f.n ?? 0 })}`);
    this.h.sfx('ding');
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The controller board and its 4-pin debug header.
    const a = at({ u: L.pins[0].u - 0.06, v: L.pins[0].v - 0.1 });
    g.fillStyle(0x1f6b3a, 1);
    g.fillRoundedRect(a.x, a.y, STAGE * 0.38, STAGE * 0.19, 8);
    g.fillStyle(0x15121b, 1);
    const p0 = at(L.pins[0]);
    g.fillRect(p0.x - 18, p0.y - 14, STAGE * 0.075 * 3 + 36, 28);
    for (const p of L.pins) {
      const q = at(p);
      g.fillStyle(0xd9b04a, 1);
      g.fillRect(q.x - 4, q.y - 10, 8, 20);
    }
    // The laptop running a serial terminal, and its OK key.
    const s = at(L.screen);
    g.fillStyle(0x3a3a42, 1);
    g.fillRoundedRect(s.x - 100, s.y - 75, 200, 150, 10);
    g.fillStyle(0x0b0f0c, 1);
    g.fillRect(s.x - 90, s.y - 65, 180, 130);
    const ok = at(L.ok);
    g.fillStyle(this.stage === 'log' ? 0x4cc65a : 0x2a2833, 1);
    g.fillRoundedRect(ok.x - 40, ok.y - 20, 80, 40, 8);
    if (this.stage === 'log') {
      g.lineStyle(3, 0xffffff, 0.9);
      g.strokeRoundedRect(ok.x - 46, ok.y - 26, 92, 52, 10);
    }
    // The USB-serial adapter and its three leads: black ground, orange TX, yellow RX.
    const ad = at({ u: L.leads[1].u, v: L.leads[1].v + 0.09 });
    g.fillStyle(0xc4302b, 1);
    g.fillRoundedRect(ad.x - 50, ad.y - 16, 100, 32, 6);
    g.fillStyle(0xb9bfc9, 1);
    g.fillRect(ad.x - 20, ad.y + 16, 40, 16);
    const cols = [0x1d1c21, 0xff8a1f, 0xffd23e];
    UART_LEADS.forEach((_, i) => {
      const q = at(this.leadAt[i]);
      g.lineStyle(7, cols[i], 1);
      g.beginPath();
      g.moveTo(ad.x - 30 + i * 30, ad.y - 16);
      g.lineTo(q.x, q.y + 14);
      g.strokePath();
      g.fillStyle(0x15121b, 1);
      g.fillRect(q.x - 7, q.y - 6, 14, 22);
      g.fillStyle(cols[i], 1);
      g.fillRect(q.x - 5, q.y + 6, 10, 8);
      this.tags[i]?.setPosition(q.x, q.y + 36);
    });
  }
}

// ---------------------------------------------------------------- battery pack

type PackStage = 'measure' | 'pick' | 'desolder' | 'out' | 'in' | 'solder' | 'check';

/** Find the dead cell with the multimeter, cut it out, solder a new one in the right way round. */
export class PackTask extends RepairTask {
  private L: PackLayout;
  private stage: PackStage = 'measure';
  private measured: boolean[];
  private probe: number | null = null;
  private holdTab: number | null = null;
  private tabT = [0, 0];
  private heat = [0, 0];
  private soldered = [false, false];
  private freed = [false, false];
  private deadAt: Pt;
  private freshAt: Pt;
  private freshUp: boolean;
  private down: { u: number; v: number; what: 'dead' | 'fresh' } | null = null;
  private checkT = 0;
  private g!: Phaser.GameObjects.Graphics;
  private readings: Phaser.GameObjects.Text[] = [];
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = packLayout(h.inst.s);
    this.measured = this.L.cells.map(() => false);
    this.deadAt = this.L.cells[this.L.dead];
    this.freshAt = this.L.fresh;
    this.freshUp = this.L.freshUp;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    // The holder's moulded + marks show which way each cell goes.
    this.L.cells.forEach((c, i) =>
      this.put(label(this.h, { u: c.u + 0.042, v: c.v + (cellUp(i) ? -0.08 : 0.08) }, '+', 0xff6b5e, 0.9)),
    );
    this.readings = this.L.cells.map((c) =>
      this.put(label(this.h, { u: c.u, v: c.v - 0.155 }, '', 0x7dff8a, 0.62)),
    );
    this.draw();
  }

  instruction(): string {
    return `mg.robot.pack.${this.stage}`;
  }

  progress(): number {
    const order: PackStage[] = ['measure', 'pick', 'desolder', 'out', 'in', 'solder', 'check'];
    return order.indexOf(this.stage) / order.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  override level(): number | undefined {
    return this.stage === 'solder' && this.holdTab !== null ? this.heat[this.holdTab] : undefined;
  }

  private tabs(): [Pt, Pt] {
    return this.L.tabs(this.L.dead);
  }

  bot(): BotAction {
    const tabs = this.tabs();
    switch (this.stage) {
      case 'measure':
        return { a: 'tap', p: this.L.cells[this.measured.indexOf(false)] };
      case 'pick':
        return { a: 'tap', p: this.L.cells[this.L.dead] };
      case 'desolder':
        return { a: 'hold', p: tabs[this.freed.indexOf(false)] };
      case 'out':
        return { a: 'drag', from: this.deadAt, to: this.L.bin };
      case 'in':
        return this.freshUp !== cellUp(this.L.dead)
          ? { a: 'tap', p: this.freshAt }
          : { a: 'drag', from: this.freshAt, to: this.L.cells[this.L.dead] };
      case 'solder':
        return {
          a: 'holdLevel',
          p: tabs[this.soldered.indexOf(false)],
          until: (SOLDER_BAND[0] + SOLDER_BAND[1]) / 2,
        };
      default:
        return { a: 'wait' };
    }
  }

  private wrong(): void {
    this.mistakes++;
    this.h.sfx('buzz');
    this.h.shake();
  }

  private next(s: PackStage): void {
    this.stage = s;
    this.h.sfx('snap');
    this.haptic('light');
    this.draw();
  }

  private cellAt(u: number, v: number): number {
    return this.L.cells.findIndex((c) => Math.abs(c.u - u) < 0.04 && Math.abs(c.v - v) < 0.09);
  }

  override pointerDown(u: number, v: number): void {
    const tabs = this.tabs();
    switch (this.stage) {
      case 'measure': {
        const i = this.cellAt(u, v);
        if (i < 0) return;
        this.probe = i;
        this.measured[i] = true;
        this.readings[i].setText(`${this.L.volts[i].toFixed(2)} V`);
        this.readings[i].setColor(this.L.volts[i] < DEAD_VOLTS ? '#ff6b5e' : '#7dff8a');
        this.h.sfx('tick');
        if (this.measured.every(Boolean)) this.next('pick');
        else this.draw();
        return;
      }
      case 'pick': {
        const i = this.cellAt(u, v);
        if (i < 0) return;
        // Cutting a good cell out of the pack would be a costly mistake.
        if (i !== this.L.dead) this.wrong();
        else this.next('desolder');
        return;
      }
      case 'desolder':
      case 'solder': {
        const j = tabs.findIndex((p) => near(p, u, v, 0.04));
        if (j < 0) return;
        if (this.stage === 'desolder' ? !this.freed[j] : !this.soldered[j]) this.holdTab = j;
        return;
      }
      case 'out':
        if (near(this.deadAt, u, v, 0.07)) this.down = { u, v, what: 'dead' };
        return;
      case 'in':
        if (near(this.freshAt, u, v, 0.07)) this.down = { u, v, what: 'fresh' };
        return;
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.holdTab !== null && !near(this.tabs()[this.holdTab], u, v, 0.07)) this.releaseTab();
    if (!this.down) return;
    if (this.down.what === 'dead') this.deadAt = { u, v };
    else if (Math.hypot(u - this.down.u, v - this.down.v) > 0.02) this.freshAt = { u, v };
    this.draw();
  }

  override pointerUp(u: number, v: number): void {
    if (this.holdTab !== null) {
      this.releaseTab();
      return;
    }
    const d = this.down;
    if (!d) return;
    this.down = null;
    const slot = this.L.cells[this.L.dead];
    if (d.what === 'dead') {
      if (near(this.L.bin, u, v, 0.08)) {
        this.deadAt = this.L.bin;
        this.next('in');
      } else this.deadAt = slot;
    } else if (Math.hypot(u - d.u, v - d.v) <= 0.02) {
      // A tap turns the new cell over.
      this.freshUp = !this.freshUp;
      this.h.sfx('click');
    } else if (near(slot, u, v, 0.06)) {
      if (this.freshUp === cellUp(this.L.dead)) {
        this.freshAt = slot;
        this.next('solder');
      } else {
        // Backwards in a series pack: it would short the cells next to it.
        this.wrong();
        this.freshAt = this.L.fresh;
      }
    } else this.freshAt = this.L.fresh;
    this.draw();
  }

  private releaseTab(): void {
    const j = this.holdTab;
    this.holdTab = null;
    if (j === null || this.stage !== 'solder') return;
    const h = this.heat[j];
    if (h < SOLDER_BAND[0]) {
      // A cold, grey joint: heat it again.
      this.heat[j] = 0;
    } else {
      if (h > SOLDER_BAND[1]) this.wrong();
      this.soldered[j] = true;
      this.h.sfx('snap');
      if (this.soldered.every(Boolean)) {
        this.stage = 'check';
        const healthy = this.L.volts.filter((_, i) => i !== this.L.dead);
        const avg = healthy.reduce((a, b) => a + b, 0) / healthy.length;
        this.readings[this.L.dead].setText(`${avg.toFixed(2)} V`).setColor('#7dff8a');
      }
    }
    this.draw();
  }

  override update(dt: number): void {
    if (!this.g) return;
    const j = this.holdTab;
    if (j !== null && this.stage === 'desolder') {
      this.tabT[j] += dt;
      if (this.tabT[j] >= DESOLDER_SECONDS) {
        this.freed[j] = true;
        this.holdTab = null;
        this.h.sfx('pop');
        if (this.freed.every(Boolean)) this.next('out');
      }
      this.draw();
    } else if (j !== null && this.stage === 'solder') {
      this.heat[j] = Math.min(1, this.heat[j] + dt * SOLDER_RATE);
      this.draw();
    } else if (this.stage === 'check' && !this.finished) {
      this.checkT += dt;
      if (this.checkT >= 0.8) {
        this.h.sfx('ding');
        this.haptic('success');
        this.fadeOut();
        this.finish();
      }
    }
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The holder.
    const first = at(L.cells[0]);
    const last = at(L.cells[L.cells.length - 1]);
    g.fillStyle(0x2a2833, 1);
    g.fillRoundedRect(first.x - 36, first.y - 72, last.x - first.x + 72, 144, 10);
    // Nickel strips: in series, bottoms join 0-1 and 2-3, tops join 1-2; the pack leads on 0 and 3.
    const strip = (a: number, b: number, top: boolean, broken: boolean) => {
      const y = at(L.cells[a]).y + (top ? -56 : 56);
      g.fillStyle(0xc9ced6, broken ? 0.35 : 1);
      g.fillRect(at(L.cells[a]).x - 14, y - 6, at(L.cells[b]).x - at(L.cells[a]).x + 28, 12);
    };
    const n = L.cells.length;
    const inPack = this.stage === 'measure' || this.stage === 'pick' || this.stage === 'desolder';
    for (let i = 0; i + 1 < n; i++) {
      // A strip to the dead cell is cut once its tabs are desoldered.
      const cut = !inPack && (i === L.dead || i + 1 === L.dead) && this.stage !== 'check';
      strip(i, i + 1, i % 2 === 1, cut);
    }
    // The pack's leads leave from the end cells, sideways.
    g.lineStyle(6, 0xe03c31, 1);
    g.lineBetween(first.x - 10, first.y - 56, first.x - 60, first.y - 56);
    g.lineStyle(6, 0x8a8f99, 1);
    g.lineBetween(
      last.x + 10,
      last.y + (n % 2 === 0 ? -56 : 56),
      last.x + 50,
      last.y + (n % 2 === 0 ? -56 : 56),
    );
    // The cells (the dead one moves when it is cut out).
    L.cells.forEach((c, i) => {
      if (i === L.dead) return;
      this.cell(g, c, cellUp(i), 0x3a7bd5);
    });
    if (inPack || this.stage === 'out') this.cell(g, this.deadAt, cellUp(L.dead), 0x3a7bd5);
    else this.cell(g, this.freshAt, this.freshUp, 0x3fae49);
    // The bin for the old cell.
    const b = at(L.bin);
    g.lineStyle(3, 0x8a8f99, 1);
    g.strokeRect(b.x - 34, b.y - 26, 68, 52);
    // Tabs being worked on: solder blobs with the iron and its heat gauge.
    const tabs = this.tabs();
    tabs.forEach((p, j) => {
      const q = at(p);
      const work = this.stage === 'desolder' || this.stage === 'solder';
      if (!work) return;
      const done = this.stage === 'desolder' ? this.freed[j] : this.soldered[j];
      g.fillStyle(this.stage === 'solder' && done ? 0xe9edf2 : 0x9aa0a8, 1);
      g.fillCircle(q.x, q.y, done && this.stage === 'desolder' ? 4 : 8);
      if (!done) {
        g.lineStyle(3, 0xffd34d, 0.85);
        g.strokeCircle(q.x, q.y, 20);
      }
    });
    if (this.holdTab !== null) {
      const q = at(tabs[this.holdTab]);
      g.lineStyle(9, 0x1d1c21, 1);
      g.lineBetween(q.x + 6, q.y - 4, q.x + 80, q.y - 70);
      g.lineStyle(4, 0xb9bfc9, 1);
      g.lineBetween(q.x, q.y, q.x + 24, q.y - 20);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(q.x, q.y - 14, 5);
    }
    if (this.stage === 'solder') {
      const j = this.holdTab ?? this.soldered.indexOf(false);
      if (j >= 0)
        drawGauge(g, { u: L.cells[L.dead].u + 0.07, v: tabs[j].v }, this.heat[j], 0xff9a3c, SOLDER_BAND);
    }
    // The multimeter's probes on the last cell measured.
    if (this.probe !== null && (this.stage === 'measure' || this.stage === 'pick')) {
      const q = at(L.cells[this.probe]);
      g.lineStyle(5, 0xe03c31, 1);
      g.lineBetween(q.x - 6, q.y - 58, q.x - 40, q.y - 110);
      g.lineStyle(5, 0x1d1c21, 1);
      g.lineBetween(q.x + 6, q.y + 58, q.x + 40, q.y + 100);
    }
  }

  /** An 18650 cell standing up: coloured wrap, the + button at one end. */
  private cell(g: Phaser.GameObjects.Graphics, p: Pt, up: boolean, wrap: number): void {
    const q = at(p);
    g.fillStyle(wrap, 1);
    g.fillRoundedRect(q.x - 18, q.y - 50, 36, 100, 8);
    g.fillStyle(0xffffff, 0.22);
    g.fillRect(q.x - 12, q.y - 46, 6, 92);
    g.fillStyle(0xc9ced6, 1);
    const ny = up ? q.y - 50 : q.y + 50;
    g.fillRect(q.x - 8, ny - 5, 16, 10);
    // A printed + near the button end.
    g.lineStyle(3, 0xffffff, 0.9);
    const py = up ? q.y - 28 : q.y + 28;
    g.lineBetween(q.x - 6, py, q.x + 6, py);
    g.lineBetween(q.x, py - 6, q.x, py + 6);
  }
}

// ---------------------------------------------------------------- drone propellers

/** Each prop on a motor that spins its way; diagonal motors spin the same way. */
export class PropsTask extends RepairTask {
  private L: PropLayout;
  private pos: Pt[];
  private on: Array<number | null>;
  private drag: number | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private mistakes = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = propLayout(h.inst.s);
    this.pos = [...this.L.props];
    this.on = this.L.props.map(() => null);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(
      label(this.h, { u: this.L.panel.c.u, v: this.L.motors[0].v - 0.1 }, t('robot.front'), 0xf4f1e8, 0.6),
    );
    this.draw();
  }

  instruction(): string {
    return 'mg.robot.props';
  }

  progress(): number {
    return this.on.filter((m) => m !== null).length / this.on.length;
  }

  override score(): number {
    return scoreFor(this.mistakes);
  }

  bot(): BotAction {
    const i = this.on.findIndex((m) => m === null);
    if (i < 0) return { a: 'wait' };
    const m = this.L.motors.findIndex(
      (_, k) => !this.on.includes(k) && this.L.spin[k] === this.L.propSpin[i],
    );
    return { a: 'drag', from: this.pos[i], to: this.L.motors[m] };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.pos.findIndex((p, k) => this.on[k] === null && near(p, u, v, 0.06));
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
    const m = this.L.motors.findIndex((p, k) => !this.on.includes(k) && near(p, u, v, 0.06));
    if (m >= 0 && this.L.spin[m] === this.L.propSpin[i]) {
      this.on[i] = m;
      this.pos[i] = this.L.motors[m];
      this.h.sfx('snap');
      this.haptic('light');
      if (this.on.every((x) => x !== null)) {
        this.h.sfx('ding');
        this.h.scene.time.delayedCall(this.ms(350), () => {
          this.fadeOut();
          this.finish();
        });
      }
    } else {
      // A prop on the wrong motor pushes air up: the drone flips on take-off.
      if (m >= 0) {
        this.mistakes++;
        this.h.sfx('buzz');
        this.h.shake();
      }
      this.pos[i] = this.L.props[i];
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The X frame and the body.
    const m = L.motors.map(at);
    g.lineStyle(14, 0x2a2833, 1);
    g.lineBetween(m[0].x, m[0].y, m[2].x, m[2].y);
    g.lineBetween(m[1].x, m[1].y, m[3].x, m[3].y);
    const c = at({ u: (L.motors[0].u + L.motors[2].u) / 2, v: (L.motors[0].v + L.motors[2].v) / 2 });
    g.fillStyle(0x3a3a42, 1);
    g.fillRoundedRect(c.x - 34, c.y - 44, 68, 88, 12);
    g.fillStyle(0x4cc65a, 1);
    g.fillTriangle(c.x, c.y - 36, c.x - 10, c.y - 20, c.x + 10, c.y - 20);
    // Motors with their spin arrows (white: clockwise, orange: anticlockwise).
    m.forEach((q, k) => {
      g.fillStyle(0x15121b, 1);
      g.fillCircle(q.x, q.y, 22);
      g.fillStyle(0xb9bfc9, 1);
      g.fillCircle(q.x, q.y, 6);
      drawSpin(g, q.x, q.y, 34, L.spin[k], L.spin[k] > 0 ? 0xf4f1e8 : 0xff9a3c);
    });
    // The props (each moulded for one direction, with the arrow on its hub).
    this.pos.forEach((p, i) => {
      const q = at(p);
      const col = L.propSpin[i] > 0 ? 0xf4f1e8 : 0xff9a3c;
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(q.x + 3, q.y + 5, 124, 16);
      g.fillStyle(0xb9bfc9, 0.95);
      g.fillEllipse(q.x - 30, q.y + (L.propSpin[i] > 0 ? -4 : 4), 62, 14);
      g.fillEllipse(q.x + 30, q.y + (L.propSpin[i] > 0 ? 4 : -4), 62, 14);
      g.fillStyle(col, 1);
      g.fillCircle(q.x, q.y, 9);
      drawSpin(g, q.x, q.y, 18, L.propSpin[i], col);
    });
  }
}
