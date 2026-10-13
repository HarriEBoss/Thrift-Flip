import Phaser from 'phaser';
import {
  CLAMP_SECONDS,
  CRT_CHARGE,
  CRT_DRAIN_RATE,
  CRT_SAFE,
  DRAIN_SECONDS,
  BEEP_GAP,
  BEEP_LONG,
  BEEP_SHORT,
  IPA_NEEDED,
  IPA_RATE,
  LINT_SECONDS,
  RESIDUE_SECONDS,
  SCRUB_SECONDS,
  SEAL_NEAR,
  SEAL_TOL,
  STRIP_LEN,
  STRIP_MAX_SPEED,
  ZIF_DEPTH,
  cmosLayout,
  contactLayout,
  crtLayout,
  esdLayout,
  esdSteps,
  lintLayout,
  postCode,
  postLayout,
  pullSpeed,
  sealLayout,
  stripLayout,
  zifLayout,
  type BeepCode,
  type CmosLayout,
  type ContactLayout,
  type CrtLayout,
  type EsdLayout,
  type EsdStep,
  type LintLayout,
  type PostLayout,
  type SealLayout,
  type StripLayout,
  type ZifLayout,
} from '../../../core/deviceRepair';
import type { Pt } from '../../../core/repair';
import { makeText } from '../../ui/widgets';
import { FS } from '../../theme';
import { t } from '../../../i18n';
import { STAGE } from '../MiniGame';
import { RepairTask, at, drawGauge, near, type BotAction, type TaskHost } from './host';
import { inset, scoreFor } from './assembly';
import { pinNote } from './carTasks';

function label(h: TaskHost, p: Pt, text: string, color = 0xf2f2ee, scale = 0.62): Phaser.GameObjects.Text {
  const q = at(p);
  return makeText(h.scene, q.x, q.y, text, FS.tiny, color, { stroke: 0x0d0d10, strokeW: 4 }).setScale(scale);
}

/** A soft pulsing ring on what to touch next. */
function hint(g: Phaser.GameObjects.Graphics, h: TaskHost, p: Pt, r = 30): void {
  const q = at(p);
  g.lineStyle(3, 0xffd34d, 0.55 + 0.3 * Math.sin(h.scene.time.now / 160));
  g.strokeCircle(q.x, q.y, r);
}

/** Shared bits of a step-by-step task with mistakes. */
abstract class StepTask extends RepairTask {
  protected g!: Phaser.GameObjects.Graphics;
  protected mistakes = 0;

  override score(): number {
    return scoreFor(this.mistakes);
  }

  protected wrong(): void {
    this.mistakes++;
    this.h.sfx('buzz');
    this.h.shake();
  }

  protected done(delay = 350): void {
    this.h.sfx('ding');
    this.haptic('success');
    this.h.scene.time.delayedCall(this.ms(delay), () => {
      this.fadeOut();
      this.finish();
    });
  }

  override update(_dt: number): void {
    if (this.g && !this.finished) this.draw();
  }

  protected abstract draw(): void;
}

// ---------------------------------------------------------------- charge port

/** Wooden toothpick (never metal) to scrape the lint out of the charge port, then a USB meter test. */
export class LintTask extends StepTask {
  private L: LintLayout;
  private stage: 'tool' | 'scrape' | 'test' | 'ok' = 'tool';
  private left: number[];
  private holding: number | null = null;
  private plugAt: Pt;
  private dragging = false;
  private screen!: Phaser.GameObjects.Text;

  constructor(h: TaskHost) {
    super(h);
    this.L = lintLayout(h.inst.s);
    this.left = this.L.lint.map(() => LINT_SECONDS);
    this.plugAt = this.L.plug;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(label(this.h, { u: this.L.pick.u, v: this.L.pick.v + 0.08 }, t('dev.wood'), 0xf4e3c0, 0.55));
    this.put(label(this.h, { u: this.L.metal.u, v: this.L.metal.v + 0.08 }, t('dev.metal'), 0xd9dde4, 0.55));
    const m = at(this.L.meter);
    this.screen = this.put(
      makeText(this.h.scene, m.x, m.y, 'USB', FS.tiny, 0x7dff8a, { wrap: 140, bold: false }).setScale(0.62),
    );
    this.draw();
  }

  instruction(): string {
    return `mg.dev.lint.${this.stage === 'ok' ? 'test' : this.stage}`;
  }

  progress(): number {
    const cleaned = this.left.filter((x) => x <= 0).length / this.left.length;
    return { tool: 0, scrape: 0.15 + 0.5 * cleaned, test: 0.7, ok: 1 }[this.stage];
  }

  bot(): BotAction {
    if (this.stage === 'tool') return { a: 'tap', p: this.L.pick };
    if (this.stage === 'scrape') return { a: 'hold', p: this.L.lint[this.left.findIndex((x) => x > 0)] };
    if (this.stage === 'test') return { a: 'drag', from: this.plugAt, to: this.L.port };
    return { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'tool') {
      if (near(this.L.pick, u, v, 0.05)) {
        this.stage = 'scrape';
        this.h.sfx('click');
      } else if (near(this.L.metal, u, v, 0.05)) {
        // A metal pin can scratch the contacts and short them.
        this.wrong();
      }
      return;
    }
    if (this.stage === 'scrape') {
      const i = this.L.lint.findIndex((p, k) => this.left[k] > 0 && near(p, u, v, 0.045));
      if (i >= 0) this.holding = i;
      return;
    }
    if (this.stage === 'test' && near(this.plugAt, u, v, 0.06)) this.dragging = true;
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding !== null && !near(this.L.lint[this.holding], u, v, 0.07)) this.holding = null;
    if (this.dragging) this.plugAt = { u, v };
  }

  override pointerUp(u: number, v: number): void {
    this.holding = null;
    if (!this.dragging) return;
    this.dragging = false;
    if (near(this.L.port, u, v, 0.07)) {
      this.plugAt = this.L.port;
      this.stage = 'ok';
      this.h.sfx('snap');
      this.screen.setText(t('dev.charging'));
      this.done(700);
    } else this.plugAt = this.L.plug;
  }

  override update(dt: number): void {
    if (this.holding !== null && this.stage === 'scrape') {
      const i = this.holding;
      this.left[i] -= dt;
      if (this.left[i] <= 0) {
        this.holding = null;
        this.h.sfx('pop');
        if (this.left.every((x) => x <= 0)) {
          this.stage = 'test';
          this.h.sfx('snap');
        }
      }
    }
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The phone's bottom edge with the USB-C port, magnified: a stadium with a tongue of pins.
    const p = at(L.port);
    g.fillStyle(0x6d727c, 1);
    g.fillRoundedRect(p.x - 130, p.y - 60, 260, 120, 20);
    g.fillStyle(0x0d0d10, 1);
    g.fillRoundedRect(p.x - 100, p.y - 32, 200, 64, 32);
    g.fillStyle(0x2a2833, 1);
    g.fillRoundedRect(p.x - 74, p.y - 9, 148, 18, 6);
    g.fillStyle(0xd9b04a, 1);
    for (let i = 0; i < 12; i++) g.fillRect(p.x - 66 + i * 11.5, p.y - 7, 5, 4);
    // Grey pocket lint packed in.
    L.lint.forEach((c, i) => {
      if (this.left[i] <= 0) return;
      const q = at(c);
      const k = this.left[i] / LINT_SECONDS;
      g.fillStyle(0x9a8f86, 1);
      g.fillCircle(q.x - 8, q.y + 4, 13 * k + 4);
      g.fillCircle(q.x + 6, q.y - 4, 11 * k + 4);
      g.fillStyle(0xbcb2a8, 1);
      g.fillCircle(q.x + 2, q.y + 2, 7 * k + 2);
      if (this.stage === 'scrape' && this.holding === null) hint(g, this.h, c, 24);
    });
    if (this.holding !== null) {
      const q = at(L.lint[this.holding]);
      const w = Math.sin(this.h.scene.time.now / 50) * 6;
      g.lineStyle(9, 0xd9b27a, 1);
      g.lineBetween(q.x + w, q.y, q.x + 90 + w, q.y - 90);
    }
    // Tools: a wooden toothpick and a metal SIM pin.
    const w = at(L.pick);
    const m = at(L.metal);
    if (this.stage === 'tool') {
      g.lineStyle(8, 0xd9b27a, 1);
      g.lineBetween(w.x - 28, w.y + 20, w.x + 28, w.y - 20);
      g.lineStyle(6, 0xc9ced6, 1);
      g.lineBetween(m.x - 28, m.y + 20, m.x + 28, m.y - 20);
      g.fillStyle(0xc9ced6, 1);
      g.fillCircle(m.x - 28, m.y + 20, 9);
    }
    // The USB meter (a little screen) and its cable's plug.
    const s = at(L.meter);
    g.fillStyle(0x1d1c21, 1);
    g.fillRoundedRect(s.x - 75, s.y - 40, 150, 80, 10);
    g.fillStyle(0x0b0f0c, 1);
    g.fillRect(s.x - 65, s.y - 30, 130, 60);
    const q = at(this.plugAt);
    g.lineStyle(7, 0x1d1c21, 1);
    g.lineBetween(s.x - 60, s.y + 40, q.x, q.y + 30);
    g.fillStyle(0xd9dde4, 1);
    g.fillRoundedRect(q.x - 24, q.y - 12, 48, 30, 8);
    if (this.stage === 'test') hint(g, this.h, L.port, 40);
  }
}

// ---------------------------------------------------------------- battery adhesive strips

/** Pull each stretch-release adhesive strip slowly; a strip pulled too fast snaps (alcohol, then wait). */
export class StripsTask extends StepTask {
  private L: StripLayout = stripLayout();
  /** 'pull' or (after a snap) 'ipa', per strip; done when every strip is out. */
  private state: Array<'pull' | 'ipa' | 'out'>;
  private pulled: number[];
  private ipa: number[];
  private active: number | null = null;
  private last: { v: number; t: number } | null = null;
  private speed = 0;
  private dripping = false;

  constructor(h: TaskHost) {
    super(h);
    this.state = this.L.tabs.map(() => 'pull');
    this.pulled = this.L.tabs.map(() => 0);
    this.ipa = this.L.tabs.map(() => 0);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(label(this.h, { u: this.L.drip.u, v: this.L.drip.v + 0.1 }, 'IPA 99%', 0xffffff, 0.55));
    this.draw();
  }

  private get cur(): number {
    return this.state.findIndex((s) => s !== 'out');
  }

  instruction(): string {
    const i = this.cur;
    return i >= 0 && this.state[i] === 'ipa' ? 'mg.dev.strips.ipa' : 'mg.dev.strips.pull';
  }

  progress(): number {
    return this.state.filter((s) => s === 'out').length / this.state.length;
  }

  override level(): number | undefined {
    const i = this.cur;
    return i >= 0 && this.state[i] === 'ipa' ? this.ipa[i] : undefined;
  }

  bot(): BotAction {
    const i = this.cur;
    if (i < 0) return { a: 'wait' };
    if (this.state[i] === 'ipa') return { a: 'holdLevel', p: this.L.drip, until: IPA_NEEDED };
    const tab = this.tabAt(i);
    return { a: 'drag', from: tab, to: { u: tab.u, v: tab.v + STRIP_LEN + 0.04 }, ms: 1800 };
  }

  private tabAt(i: number): Pt {
    const t0 = this.L.tabs[i];
    return { u: t0.u, v: t0.v + this.pulled[i] };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.cur;
    if (i < 0) return;
    if (this.state[i] === 'ipa') {
      if (near(this.L.drip, u, v, 0.06)) this.dripping = true;
      return;
    }
    const k = this.L.tabs.findIndex((_, j) => this.state[j] === 'pull' && near(this.tabAt(j), u, v, 0.05));
    if (k < 0) return;
    this.active = k;
    this.last = { v, t: performance.now() };
    this.speed = 0;
  }

  override pointerMove(u: number, v: number): void {
    const i = this.active;
    if (i === null || !this.last) return;
    // Real time, not frame time: several moves can arrive within one frame.
    const now = performance.now();
    const d = Math.max(0, v - this.last.v);
    this.speed = pullSpeed(this.speed, d, (now - this.last.t) / 1000);
    this.last = { v, t: now };
    this.pulled[i] = Math.min(STRIP_LEN, Math.max(this.pulled[i], v - this.L.tabs[i].v));
    if (this.speed > STRIP_MAX_SPEED && this.pulled[i] > 0.02) {
      // Yanked: the strip snaps off under the battery.
      this.active = null;
      this.state[i] = 'ipa';
      this.pulled[i] = 0;
      this.h.sfx('tear');
      this.wrong();
      return;
    }
    if (this.pulled[i] >= STRIP_LEN) {
      this.active = null;
      this.state[i] = 'out';
      this.h.sfx('peel');
      this.haptic('light');
      if (this.cur < 0) this.done();
    }
  }

  override pointerUp(): void {
    this.active = null;
    this.dripping = false;
    this.speed = 0;
  }

  override update(dt: number): void {
    const i = this.cur;
    if (this.dripping && i >= 0 && this.state[i] === 'ipa') {
      this.ipa[i] = Math.min(IPA_NEEDED, this.ipa[i] + dt * IPA_RATE);
      if (this.ipa[i] >= IPA_NEEDED) {
        // The alcohol softened the glue: the battery lifts away on that side.
        this.dripping = false;
        this.state[i] = 'out';
        this.h.sfx('pop');
        if (this.cur < 0) this.done();
      }
    }
    if (this.active === null) this.speed = Math.max(0, this.speed - dt * 2);
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    const b = at(L.battery.c);
    const bw = L.battery.w * 2 * STAGE * 0.5;
    const bh = L.battery.h * 2 * STAGE * 0.5;
    g.fillStyle(0x15161b, 1);
    g.fillRoundedRect(b.x - bw - 8, b.y - bh - 8, bw * 2 + 16, bh * 2 + 16, 12);
    g.fillStyle(0x2a2a30, 1);
    g.fillRoundedRect(b.x - bw, b.y - bh, bw * 2, bh * 2, 10);
    g.fillStyle(0xd9b04a, 1);
    g.fillRect(b.x - 30, b.y - bh - 8, 60, 12);
    // Each strip: a white band from under the battery to its black pull tab, thinner as it stretches.
    L.tabs.forEach((t0, i) => {
      const a = at({ u: t0.u, v: L.battery.c.v + L.battery.h * 0.6 });
      if (this.state[i] === 'out') return;
      const tab = at(this.tabAt(i));
      if (this.state[i] === 'ipa') {
        g.fillStyle(0xf4f1e8, 0.5);
        g.fillRect(a.x - 14, a.y - 4, 28, 10);
        hint(g, this.h, L.drip, 34);
        return;
      }
      const k = this.pulled[i] / STRIP_LEN;
      g.fillStyle(0xf4f1e8, 0.95);
      g.fillRect(tab.x - 14 + k * 8, a.y, 28 - k * 16, tab.y - a.y);
      g.fillStyle(0x1d1c21, 1);
      g.fillRoundedRect(tab.x - 18, tab.y - 6, 36, 26, 5);
      if (this.active === null && i === this.cur) hint(g, this.h, this.tabAt(i), 26);
    });
    // Pull speed: green is slow and steady, red snaps it.
    const sp = Math.min(1, this.speed / (STRIP_MAX_SPEED * 1.3));
    const sx = at({ u: L.panel.c.u - 0.32, v: L.panel.c.v }).x;
    g.fillStyle(0x3a3640, 1);
    g.fillRect(sx - 8, b.y - 60, 16, 140);
    g.fillStyle(sp > 0.75 ? 0xe03c31 : sp > 0.5 ? 0xffb02e : 0x4cc65a, 1);
    g.fillRect(sx - 6, b.y + 78 - 136 * sp, 12, 136 * sp);
    // The alcohol dropper.
    const d = at(L.drip);
    g.fillStyle(0xe8f6ff, 0.9);
    g.fillRoundedRect(d.x - 16, d.y - 40, 32, 60, 8);
    g.fillStyle(0x2f6fd0, 1);
    g.fillRect(d.x - 6, d.y + 20, 12, 18);
    if (this.dripping) {
      g.fillStyle(0xbfe6ff, 1);
      g.fillCircle(d.x, d.y + 46 + ((this.h.scene.time.now / 4) % 20), 4);
    }
    const i = this.cur;
    if (i >= 0 && this.state[i] === 'ipa')
      drawGauge(g, { u: L.drip.u - 0.07, v: L.drip.v }, this.ipa[i] / IPA_NEEDED, 0xbfe6ff, null);
  }
}

// ---------------------------------------------------------------- ZIF connectors

/** Flip the latch up, turn the ribbon contacts-up, slide it fully in, flip the latch down. */
export class ZifTask extends StepTask {
  private L: ZifLayout;
  private k = 0;
  private stage: 'open' | 'insert' | 'close' = 'open';
  private up: boolean[];
  private depth: number[];
  private down: { u: number; v: number; d0: number } | null = null;

  constructor(
    h: TaskHost,
    private n: 1 | 2,
  ) {
    super(h);
    this.L = zifLayout(h.inst.s, n);
    this.up = [...this.L.up];
    this.depth = this.L.slots.map(() => 0);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.draw();
  }

  instruction(): string {
    return `mg.dev.zif.${this.k >= this.n ? 'close' : this.stage}`;
  }

  progress(): number {
    return (this.k + { open: 0, insert: 0.3, close: 0.8 }[this.stage]) / this.n;
  }

  private latch(i: number): Pt {
    return { u: this.L.slots[i].u, v: this.L.slots[i].v - 0.035 };
  }

  private ribbonEnd(i: number): Pt {
    const s = this.L.slots[i];
    const r = this.L.ribbons[i];
    return { u: r.u, v: r.v + (s.v - r.v) * this.depth[i] };
  }

  bot(): BotAction {
    const i = this.k;
    if (i >= this.n) return { a: 'wait' };
    if (this.stage !== 'insert') return { a: 'tap', p: this.latch(i) };
    if (!this.up[i]) return { a: 'tap', p: this.ribbonEnd(i) };
    return { a: 'drag', from: this.ribbonEnd(i), to: { u: this.L.slots[i].u, v: this.L.slots[i].v - 0.01 } };
  }

  override pointerDown(u: number, v: number): void {
    const i = this.k;
    if (i >= this.n) return;
    if (near(this.latch(i), u, v, 0.04)) {
      if (this.stage === 'open') {
        this.stage = 'insert';
        this.h.sfx('click');
      } else if (this.stage === 'close') {
        this.lock();
      } else if (this.stage === 'insert') {
        // Latching a ribbon that isn't fully in leaves it crooked: no contact.
        if (this.depth[i] > 0.05) this.wrong();
      }
      return;
    }
    if (this.stage === 'insert' && near(this.ribbonEnd(i), u, v, 0.06))
      this.down = { u, v, d0: this.depth[i] };
  }

  override pointerMove(u: number, v: number): void {
    const d = this.down;
    if (!d) return;
    const i = this.k;
    if (!this.up[i]) return;
    // The ribbon only slides straight along its own line.
    const span = this.L.ribbons[i].v - this.L.slots[i].v;
    this.depth[i] = Math.max(0, Math.min(1, d.d0 + (d.v - v) / span));
  }

  override pointerUp(u: number, v: number): void {
    const d = this.down;
    if (!d) return;
    this.down = null;
    const i = this.k;
    if (Math.hypot(u - d.u, v - d.v) < 0.02 && this.depth[i] < 0.05) {
      // A tap turns the ribbon over.
      this.up[i] = !this.up[i];
      this.h.sfx('click');
      return;
    }
    if (!this.up[i]) {
      // Contacts facing the wrong way: they can't touch the connector's pins.
      this.wrong();
      return;
    }
    if (this.depth[i] >= ZIF_DEPTH) {
      this.depth[i] = 1;
      this.stage = 'close';
      this.h.sfx('snap');
    }
  }

  private lock(): void {
    this.h.sfx('snap');
    this.haptic('light');
    this.k++;
    this.stage = 'open';
    if (this.k >= this.n) this.done();
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // A green board.
    const c = at(L.panel.c);
    g.fillStyle(0x1f6b3a, 1);
    g.fillRect(c.x - 200, c.y - 140, 400, 120);
    L.slots.forEach((s, i) => {
      const q = at(s);
      const open = i === this.k && this.stage !== 'open';
      // Connector body, and its latch (dark, flipped up when open).
      g.fillStyle(0xe9dcc0, 1);
      g.fillRect(q.x - 52, q.y - 14, 104, 26);
      g.fillStyle(0x15121b, 1);
      if (open) g.fillRect(q.x - 52, q.y - 46, 104, 14);
      else g.fillRect(q.x - 52, q.y - 20, 104, 12);
      if (i === this.k && this.stage !== 'insert') hint(g, this.h, this.latch(i), 30);
      // The ribbon: orange flex, gold fingers on one side (blue stiffener on the other).
      const r = at(this.ribbonEnd(i));
      const bottom = at({ u: L.ribbons[i].u, v: L.ribbons[i].v + 0.16 }).y;
      g.fillStyle(0xd98a1c, 0.95);
      g.fillRect(r.x - 40, r.y, 80, bottom - r.y);
      if (this.up[i]) {
        g.fillStyle(0xd9b04a, 1);
        for (let k = 0; k < 9; k++) g.fillRect(r.x - 36 + k * 8.5, r.y + 2, 5, 18);
      } else {
        g.fillStyle(0x2f6fd0, 1);
        g.fillRect(r.x - 40, r.y, 80, 22);
      }
      if (i === this.k && this.stage === 'insert' && this.down === null)
        hint(g, this.h, this.ribbonEnd(i), 34);
    });
  }
}

// ---------------------------------------------------------------- water seal

/** Scrape the old adhesive, peel the new seal's liner, lay it right on the frame, clamp it. */
export class SealTask extends StepTask {
  private L: SealLayout;
  private stage: 'clean' | 'peel' | 'place' | 'clamp' = 'clean';
  private left: number[];
  private holding: number | null = null;
  private sealAt: Pt;
  private dragging = false;
  private clamping = false;
  private clampT = 0;

  constructor(h: TaskHost) {
    super(h);
    this.L = sealLayout(h.rig.panel === 'round');
    this.left = this.L.residue.map(() => RESIDUE_SECONDS);
    this.sealAt = this.L.seal;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.draw();
  }

  instruction(): string {
    return `mg.dev.seal.${this.stage}`;
  }

  progress(): number {
    return { clean: 0.1, peel: 0.35, place: 0.55, clamp: 0.8 + 0.2 * (this.clampT / CLAMP_SECONDS) }[
      this.stage
    ];
  }

  bot(): BotAction {
    if (this.stage === 'clean') return { a: 'hold', p: this.L.residue[this.left.findIndex((x) => x > 0)] };
    if (this.stage === 'peel') return { a: 'tap', p: this.L.tab };
    if (this.stage === 'place') return { a: 'drag', from: this.sealAt, to: this.L.frame.c };
    return this.finished ? { a: 'wait' } : { a: 'hold', p: this.L.frame.c };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'clean') {
      const i = this.L.residue.findIndex((p, k) => this.left[k] > 0 && near(p, u, v, 0.045));
      if (i >= 0) this.holding = i;
    } else if (this.stage === 'peel' && near(this.L.tab, u, v, 0.05)) {
      this.stage = 'place';
      this.h.sfx('peel');
    } else if (this.stage === 'place' && near(this.sealAt, u, v, 0.1)) this.dragging = true;
    else if (this.stage === 'clamp' && near(this.L.frame.c, u, v, 0.12)) this.clamping = true;
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding !== null && !near(this.L.residue[this.holding], u, v, 0.07)) this.holding = null;
    if (this.dragging) this.sealAt = { u, v };
  }

  override pointerUp(u: number, v: number): void {
    this.holding = null;
    this.clamping = false;
    if (!this.dragging) return;
    this.dragging = false;
    const off = Math.hypot(u - this.L.frame.c.u, v - this.L.frame.c.v);
    if (off <= SEAL_TOL) {
      this.sealAt = this.L.frame.c;
      this.stage = 'clamp';
      this.h.sfx('snap');
      return;
    }
    // Crooked: it stuck down off the frame (the water would get in). Peel it back and try again.
    if (off <= SEAL_NEAR) this.wrong();
    this.sealAt = this.L.seal;
  }

  override update(dt: number): void {
    if (this.stage === 'clean' && this.holding !== null) {
      const i = this.holding;
      this.left[i] -= dt;
      if (this.left[i] <= 0) {
        this.holding = null;
        this.h.sfx('scrub');
        if (this.left.every((x) => x <= 0)) this.stage = 'peel';
      }
    }
    if (this.stage === 'clamp' && this.clamping && !this.finished) {
      this.clampT += dt;
      if (this.clampT >= CLAMP_SECONDS) {
        this.clamping = false;
        this.done();
      }
    }
    super.update(dt);
  }

  private outline(g: Phaser.GameObjects.Graphics, p: Pt, color: number, width: number, alpha = 1): void {
    const q = at(p);
    const w = this.L.frame.w * STAGE;
    const h = this.L.frame.h * STAGE;
    g.lineStyle(width, color, alpha);
    if (this.L.round) g.strokeCircle(q.x, q.y, w);
    else g.strokeRoundedRect(q.x - w, q.y - h, w * 2, h * 2, 18);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The device's frame (a metal lip) and what is left of the old adhesive.
    this.outline(g, L.frame.c, 0x8a8f99, 14);
    L.residue.forEach((p, i) => {
      if (this.left[i] <= 0) return;
      const q = at(p);
      const k = this.left[i] / RESIDUE_SECONDS;
      g.fillStyle(0xf2e6b8, 0.95);
      g.fillEllipse(q.x, q.y, 34 * k + 8, 16 * k + 6);
      if (this.holding === null) hint(g, this.h, p, 22);
    });
    if (this.holding !== null) {
      const q = at(L.residue[this.holding]);
      const w = Math.sin(this.h.scene.time.now / 45) * 7;
      g.fillStyle(0x2a2833, 1);
      g.fillRect(q.x + w - 4, q.y - 60, 8, 50);
      g.fillStyle(0xc9ced6, 1);
      g.fillRect(q.x + w - 10, q.y - 14, 20, 8);
    }
    // The new seal (black), on its liner until peeled.
    if (this.stage === 'clean' || this.stage === 'peel') {
      const q = at(L.seal);
      g.fillStyle(0xd9dde4, 0.9);
      g.fillRoundedRect(q.x - 66, q.y - 80, 132, 160, 12);
      const tb = at(L.tab);
      g.fillStyle(0x4cc65a, 1);
      g.fillRect(tb.x - 20, tb.y - 20, 40, 26);
      if (this.stage === 'peel') hint(g, this.h, L.tab, 26);
    }
    const sx = at(this.sealAt);
    const scale = this.stage === 'clean' || this.stage === 'peel' ? 0.5 : 1;
    if (scale === 1) this.outline(g, this.sealAt, 0x15121b, 9);
    else {
      g.lineStyle(7, 0x15121b, 1);
      if (L.round) g.strokeCircle(sx.x, sx.y, L.frame.w * STAGE * 0.5);
      else g.strokeRoundedRect(sx.x - 50, sx.y - 64, 100, 128, 10);
    }
    if (this.stage === 'place' && !this.dragging) this.outline(g, L.frame.c, 0xffd34d, 3, 0.6);
    if (this.stage === 'clamp' && this.clamping) {
      const q = at(L.frame.c);
      g.fillStyle(0xffffff, 0.12);
      g.fillCircle(q.x, q.y, L.frame.w * STAGE);
    }
  }
}

// ---------------------------------------------------------------- safe power-down and ESD

/** PSU switch off, mains plug out, hold power to drain, wrist strap clipped to bare metal. */
export class EsdTask extends StepTask {
  private L: EsdLayout = esdLayout();
  private steps: EsdStep[];
  private k = 0;
  private plugAt: Pt;
  private clipAt: Pt;
  private drag: 'plug' | 'clip' | null = null;
  private holdT = 0;
  private holding = false;

  constructor(h: TaskHost, strapOnly: boolean) {
    super(h);
    this.steps = esdSteps(strapOnly);
    this.plugAt = this.L.socket;
    this.clipAt = this.L.clip;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    const L = this.L;
    if (this.steps.length > 1) {
      this.put(label(this.h, { u: L.rocker.u, v: L.rocker.v - 0.07 }, 'PSU', 0xffffff, 0.55));
      this.put(label(this.h, { u: L.power.u, v: L.power.v - 0.07 }, 'POWER', 0xffffff, 0.55));
    }
    this.put(label(this.h, { u: L.metal.u, v: L.metal.v + 0.075 }, t('dev.bareMetal'), 0xffffff, 0.5));
    this.put(label(this.h, { u: L.paint.u, v: L.paint.v + 0.075 }, t('dev.painted'), 0xffffff, 0.5));
    this.draw();
  }

  private get step(): EsdStep | undefined {
    return this.steps[this.k];
  }

  instruction(): string {
    return `mg.dev.esd.${this.step ?? 'strap'}`;
  }

  progress(): number {
    return this.k / this.steps.length;
  }

  override level(): number | undefined {
    return this.step === 'drain' ? this.holdT / DRAIN_SECONDS : undefined;
  }

  bot(): BotAction {
    switch (this.step) {
      case 'psu':
        return { a: 'tap', p: this.L.rocker };
      case 'unplug':
        return { a: 'drag', from: this.plugAt, to: { u: this.L.socket.u, v: this.L.socket.v + 0.17 } };
      case 'drain':
        return { a: 'hold', p: this.L.power };
      case 'strap':
        return { a: 'drag', from: this.clipAt, to: this.L.metal };
      default:
        return { a: 'wait' };
    }
  }

  private advance(): void {
    this.k++;
    this.h.sfx('click');
    this.haptic('light');
    if (!this.step) this.done();
  }

  override pointerDown(u: number, v: number): void {
    const s = this.step;
    if (!s) return;
    const L = this.L;
    if (this.steps.length > 1 && near(L.rocker, u, v, 0.045)) {
      if (s === 'psu') this.advance();
      return;
    }
    if (this.steps.length > 1 && near(this.plugAt, u, v, 0.05)) {
      if (s === 'unplug') this.drag = 'plug';
      return;
    }
    if (this.steps.length > 1 && near(L.power, u, v, 0.05)) {
      // Pressing power with the mains still in just turns the PC on.
      if (s === 'drain') this.holding = true;
      else if (s === 'psu' || s === 'unplug') this.wrong();
      return;
    }
    if (near(this.clipAt, u, v, 0.05)) {
      // Touching the parts before you're grounded can zap them with static.
      if (s === 'strap') this.drag = 'clip';
      else this.wrong();
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag === 'plug') this.plugAt = { u: this.L.socket.u, v: Math.max(this.L.socket.v, v) };
    if (this.drag === 'clip') this.clipAt = { u, v };
    if (this.holding && !near(this.L.power, u, v, 0.07)) this.holding = false;
  }

  override pointerUp(u: number, v: number): void {
    this.holding = false;
    const d = this.drag;
    this.drag = null;
    if (d === 'plug') {
      if (this.plugAt.v - this.L.socket.v > 0.1) this.advance();
      else this.plugAt = this.L.socket;
    } else if (d === 'clip') {
      if (near(this.L.metal, u, v, 0.06)) {
        this.clipAt = this.L.metal;
        this.advance();
      } else {
        // Paint doesn't conduct: the strap wouldn't ground you.
        if (near(this.L.paint, u, v, 0.06)) this.wrong();
        this.clipAt = this.L.clip;
      }
    }
  }

  override update(dt: number): void {
    if (this.holding && this.step === 'drain') {
      this.holdT += dt;
      if (this.holdT >= DRAIN_SECONDS) {
        this.holding = false;
        this.advance();
      }
    }
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    if (this.steps.length > 1) {
      // The PSU's back: rocker switch (I / O) and the mains socket with its plug.
      const r = at(L.rocker);
      const off = this.k >= 1;
      g.fillStyle(0x2a2833, 1);
      g.fillRoundedRect(r.x - 70, r.y - 40, 140, 200, 10);
      g.fillStyle(0x0d0d10, 1);
      g.fillRect(r.x - 18, r.y - 24, 36, 48);
      g.fillStyle(off ? 0x4a4656 : 0xe03c31, 1);
      g.fillRect(r.x - 14, off ? r.y : r.y - 20, 28, 20);
      const s = at(L.socket);
      g.fillStyle(0x0d0d10, 1);
      g.fillRoundedRect(s.x - 30, s.y - 22, 60, 44, 6);
      const p = at(this.plugAt);
      g.lineStyle(12, 0x15121b, 1);
      g.lineBetween(p.x, p.y + 20, p.x, p.y + 140);
      g.fillStyle(0x3a3a42, 1);
      g.fillRoundedRect(p.x - 28, p.y - 20, 56, 44, 6);
      // The case's power button and the board's standby LED (dims as it drains).
      const b = at(L.power);
      g.fillStyle(0x6d727c, 1);
      g.fillCircle(b.x, b.y, 26);
      g.fillStyle(this.holding ? 0x4a4f58 : 0xc9ced6, 1);
      g.fillCircle(b.x, b.y, 18);
      const led = at(L.led);
      const lit = this.k < 2 ? 1 : this.k === 2 ? 1 - this.holdT / DRAIN_SECONDS : 0;
      g.fillStyle(0x4cc65a, 0.25 + 0.75 * lit);
      g.fillCircle(led.x, led.y, 9);
      g.fillStyle(0x4cc65a, 0.25 * lit);
      g.fillCircle(led.x, led.y, 18);
      const nx =
        this.step === 'psu'
          ? L.rocker
          : this.step === 'unplug'
            ? this.plugAt
            : this.step === 'drain'
              ? L.power
              : null;
      if (nx) hint(g, this.h, nx, 36);
    }
    // Bare metal (a shiny unpainted spot on the frame) and a painted side panel.
    const m = at(L.metal);
    g.fillStyle(0xc9ced6, 1);
    g.fillRoundedRect(m.x - 46, m.y - 30, 92, 60, 8);
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(m.x - 38, m.y - 24, 76, 8);
    const pt = at(L.paint);
    g.fillStyle(0x24324d, 1);
    g.fillRoundedRect(pt.x - 46, pt.y - 30, 92, 60, 8);
    // The wrist strap's coiled lead and crocodile clip.
    const c = at(this.clipAt);
    const home = at(L.clip);
    g.lineStyle(5, 0x2f6fd0, 1);
    g.lineBetween(home.x - 120, home.y + 30, c.x, c.y);
    g.fillStyle(0xd8352a, 1);
    g.fillRoundedRect(c.x - 22, c.y - 9, 44, 18, 6);
    g.fillStyle(0xc9ced6, 1);
    g.fillRect(c.x + 18, c.y - 6, 12, 12);
    if (this.step === 'strap' && this.drag === null) hint(g, this.h, this.clipAt, 30);
  }
}

// ---------------------------------------------------------------- POST beep codes

/** Power on, listen to the beeps, find the code in the board's manual. */
export class PostTask extends StepTask {
  private L: PostLayout;
  private code: BeepCode;
  private stage: 'power' | 'listen' | 'pick' = 'power';
  private t = 0;
  /** Beeps heard so far this round, and whether one is sounding now. */
  private heard = 0;
  private sounding = false;
  private rowText: Phaser.GameObjects.Text[] = [];

  constructor(h: TaskHost) {
    super(h);
    this.code = postCode(h.rig.tasks);
    this.L = postLayout(h.inst.s, this.code);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(label(this.h, { u: this.L.power.u, v: this.L.power.v - 0.07 }, 'POWER', 0xffffff, 0.55));
    this.put(
      label(
        this.h,
        { u: this.L.rowAt[0].u + 0.11, v: this.L.rowAt[0].v - 0.058 },
        t('dev.manual'),
        0x15121b,
        0.5,
      ),
    );
    this.rowText = this.L.rows.map((r, i) =>
      this.put(
        makeText(
          this.h.scene,
          at(this.L.rowAt[i]).x + 10,
          at(this.L.rowAt[i]).y,
          t(`dev.post.${r.id}`),
          FS.tiny,
          0x15121b,
          {
            bold: false,
            align: 'left',
          },
        )
          .setOrigin(0, 0.5)
          .setScale(0.55),
      ),
    );
    // Keep every row inside the card.
    for (const tx of this.rowText)
      if (tx.displayWidth > STAGE * 0.27) tx.setScale((0.55 * STAGE * 0.27) / tx.displayWidth);
    this.draw();
  }

  instruction(): string {
    return `mg.dev.post.${this.stage}`;
  }

  progress(): number {
    return { power: 0, listen: 0.3, pick: 0.7 }[this.stage];
  }

  bot(): BotAction {
    if (this.stage === 'power') return { a: 'tap', p: this.L.power };
    if (this.stage === 'pick') {
      const i = this.L.rows.findIndex((r) => r.id === this.code.id);
      return { a: 'tap', p: { u: this.L.rowAt[i].u + 0.06, v: this.L.rowAt[i].v } };
    }
    return { a: 'wait' };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'power' && near(this.L.power, u, v, 0.05)) {
      this.stage = 'listen';
      this.t = 0;
      this.h.sfx('click');
      return;
    }
    if (this.stage !== 'pick') return;
    if (near(this.L.speaker, u, v, 0.06)) {
      // Listen again.
      this.stage = 'listen';
      this.t = 0;
      this.heard = 0;
      return;
    }
    const i = this.L.rowAt.findIndex((p) => Math.abs(p.v - v) < 0.04 && u > p.u - 0.08 && u < p.u + 0.27);
    if (i < 0) return;
    if (this.L.rows[i].id !== this.code.id) return this.wrong();
    pinNote(this.h, t('dev.postCode'), t(`dev.post.${this.code.id}`));
    this.done(200);
  }

  /** When each beep starts and ends within one round of the pattern. */
  private schedule(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    let t0 = 0.3;
    for (const b of this.code.beeps) {
      const len = b === 'L' ? BEEP_LONG : BEEP_SHORT;
      out.push([t0, t0 + len]);
      t0 += len + BEEP_GAP;
    }
    return out;
  }

  override update(dt: number): void {
    if (this.stage === 'listen') {
      this.t += dt;
      const s = this.schedule();
      const now = s.findIndex(([a, b]) => this.t >= a && this.t < b);
      if (now >= 0 && !this.sounding) {
        this.h.sfx('tick', this.code.beeps[now] === 'L' ? 1 : 0.7);
        this.heard = now + 1;
      }
      this.sounding = now >= 0;
      if (this.t > s[s.length - 1][1] + 0.5) {
        this.stage = 'pick';
      }
    }
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // Front panel power button.
    const p = at(L.power);
    g.fillStyle(0x6d727c, 1);
    g.fillCircle(p.x, p.y, 26);
    g.fillStyle(this.stage === 'power' ? 0xc9ced6 : 0x4cc65a, 1);
    g.fillCircle(p.x, p.y, 18);
    if (this.stage === 'power') hint(g, this.h, L.power, 34);
    // The board's little speaker, with the beeps drawn as they sound (dot short, dash long).
    const s = at(L.speaker);
    g.fillStyle(0x15121b, 1);
    g.fillCircle(s.x, s.y, 30);
    g.fillStyle(this.sounding ? 0xffd34d : 0x3a3640, 1);
    g.fillCircle(s.x, s.y, 12);
    const shown = this.stage === 'pick' ? this.code.beeps.length : this.heard;
    for (let i = 0; i < shown; i++) {
      const x = s.x - 60 + i * 34;
      g.fillStyle(0xffd34d, 1);
      if (this.code.beeps[i] === 'L') g.fillRoundedRect(x - 12, s.y + 46, 26, 9, 4);
      else g.fillCircle(x, s.y + 50, 6);
    }
    // The manual: a paper card with the beep table.
    const top = at({ u: L.rowAt[0].u - 0.1, v: L.rowAt[0].v - 0.09 });
    g.fillStyle(0xf4f1e8, 1);
    g.fillRoundedRect(top.x, top.y, STAGE * 0.42, STAGE * 0.49, 10);
    L.rows.forEach((r, i) => {
      const q = at(L.rowAt[i]);
      for (let k = 0; k < r.beeps.length; k++) {
        const x = q.x - 42 + k * 14;
        g.fillStyle(0x15121b, 1);
        if (r.beeps[k] === 'L') g.fillRoundedRect(x - 5, q.y - 3, 12, 6, 3);
        else g.fillCircle(x, q.y, 3.5);
      }
      if (i > 0) {
        g.lineStyle(1, 0x15121b, 0.25);
        g.lineBetween(top.x + 10, q.y - STAGE * 0.04, top.x + STAGE * 0.42 - 10, q.y - STAGE * 0.04);
      }
    });
  }
}

// ---------------------------------------------------------------- CMOS coin cell

/** Press the clip, pop out the old coin cell, put the new one in + side up. */
export class CmosTask extends StepTask {
  private L: CmosLayout;
  private stage: 'clip' | 'out' | 'in' = 'clip';
  private oldAt: Pt;
  private newAt: Pt;
  private up: boolean;
  private down: { u: number; v: number; what: 'old' | 'new' } | null = null;

  constructor(h: TaskHost) {
    super(h);
    this.L = cmosLayout(h.inst.s);
    this.oldAt = this.L.holder;
    this.newAt = this.L.fresh;
    this.up = this.L.freshUp;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(label(this.h, { u: this.L.holder.u, v: this.L.holder.v + 0.1 }, 'CR2032', 0xffffff, 0.5));
    this.draw();
  }

  instruction(): string {
    return `mg.dev.cmos.${this.stage}`;
  }

  progress(): number {
    return { clip: 0, out: 0.3, in: 0.6 }[this.stage];
  }

  bot(): BotAction {
    if (this.stage === 'clip') return { a: 'tap', p: this.L.clip };
    if (this.stage === 'out') return { a: 'drag', from: this.oldAt, to: this.L.bin };
    if (this.finished) return { a: 'wait' };
    return this.up ? { a: 'drag', from: this.newAt, to: this.L.holder } : { a: 'tap', p: this.newAt };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'clip' && near(this.L.clip, u, v, 0.04)) {
      this.stage = 'out';
      this.h.sfx('pop');
      return;
    }
    if (this.stage === 'out' && near(this.oldAt, u, v, 0.06)) this.down = { u, v, what: 'old' };
    if (this.stage === 'in' && near(this.newAt, u, v, 0.06)) this.down = { u, v, what: 'new' };
  }

  override pointerMove(u: number, v: number): void {
    if (!this.down) return;
    if (this.down.what === 'old') this.oldAt = { u, v };
    else if (Math.hypot(u - this.down.u, v - this.down.v) > 0.02) this.newAt = { u, v };
  }

  override pointerUp(u: number, v: number): void {
    const d = this.down;
    if (!d) return;
    this.down = null;
    if (d.what === 'old') {
      if (near(this.L.bin, u, v, 0.08)) {
        this.oldAt = this.L.bin;
        this.stage = 'in';
        this.h.sfx('snap');
      } else this.oldAt = this.L.holder;
      return;
    }
    if (Math.hypot(u - d.u, v - d.v) <= 0.02) {
      this.up = !this.up;
      this.h.sfx('click');
      return;
    }
    if (near(this.L.holder, u, v, 0.06)) {
      if (this.up) {
        this.newAt = this.L.holder;
        this.h.sfx('snap');
        this.done();
        return;
      }
      // Upside down: + against the holder's − spring. The clock would never keep time.
      this.wrong();
    }
    this.newAt = this.L.fresh;
  }

  private coin(g: Phaser.GameObjects.Graphics, p: Pt, up: boolean): void {
    const q = at(p);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(q.x + 3, q.y + 4, 36);
    g.fillStyle(up ? 0xd9dde4 : 0xa9aeb6, 1);
    g.fillCircle(q.x, q.y, 36);
    g.lineStyle(3, 0x8a8f99, 1);
    g.strokeCircle(q.x, q.y, up ? 36 : 28);
    if (up) {
      g.lineStyle(4, 0x3a3640, 1);
      g.lineBetween(q.x - 9, q.y - 8, q.x + 9, q.y - 8);
      g.lineBetween(q.x, q.y - 17, q.x, q.y + 1);
    }
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    const h = at(L.holder);
    const c = at(L.panel.c);
    g.fillStyle(0x1f6b3a, 1);
    g.fillRect(c.x - 200, c.y - 130, 300, 230);
    g.fillStyle(0x15121b, 1);
    g.fillCircle(h.x, h.y, 44);
    const b = at(L.bin);
    g.lineStyle(3, 0x8a8f99, 1);
    g.strokeRect(b.x - 40, b.y - 30, 80, 60);
    if (this.stage !== 'in') this.coin(g, this.oldAt, true);
    // The spring clip that holds the cell down.
    const k = at(L.clip);
    g.fillStyle(0xc9ced6, 1);
    g.fillRect(k.x - 10, k.y - 4, 22, 34);
    if (this.stage === 'clip') hint(g, this.h, L.clip, 22);
    if (this.stage === 'in') this.coin(g, this.newAt, this.up);
    if (this.stage === 'in' && !this.down) hint(g, this.h, this.newAt, 44);
  }
}

// ---------------------------------------------------------------- CRT discharge

/** Ground clip first, then slide the tool under the anode cap and hold until it reads zero. */
export class CrtTask extends StepTask {
  private L: CrtLayout = crtLayout();
  private stage: 'ground' | 'probe' | 'drain' | 'cap' = 'ground';
  private clipAt: Pt;
  private toolAt: Pt;
  private drag: 'clip' | 'tool' | null = null;
  private charge = CRT_CHARGE;
  private draining = false;
  private capOff = false;

  constructor(h: TaskHost) {
    super(h);
    this.clipAt = this.L.clip;
    this.toolAt = this.L.tool;
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(label(this.h, { u: this.L.ground.u, v: this.L.ground.v + 0.07 }, 'GND', 0xffffff, 0.55));
    this.put(label(this.h, { u: this.L.meter.u, v: this.L.meter.v + 0.1 }, 'kV', 0xffffff, 0.55));
    this.draw();
  }

  instruction(): string {
    return `mg.dev.crt.${this.stage}`;
  }

  progress(): number {
    return { ground: 0, probe: 0.25, drain: 0.4 + 0.4 * (1 - this.charge), cap: 0.9 }[this.stage];
  }

  override level(): number | undefined {
    return this.stage === 'drain' ? this.charge : undefined;
  }

  bot(): BotAction {
    if (this.stage === 'ground') return { a: 'drag', from: this.clipAt, to: this.L.ground };
    if (this.stage === 'probe') return { a: 'drag', from: this.toolAt, to: this.L.anode };
    if (this.stage === 'drain') return { a: 'holdLevel', p: this.L.anode, until: CRT_SAFE / 2, below: true };
    return this.finished ? { a: 'wait' } : { a: 'tap', p: this.L.anode };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'ground' || this.stage === 'probe') {
      if (near(this.clipAt, u, v, 0.05) && this.stage === 'ground') this.drag = 'clip';
      else if (near(this.toolAt, u, v, 0.06)) this.drag = 'tool';
      return;
    }
    if (this.stage === 'drain' && near(this.L.anode, u, v, 0.07)) this.draining = true;
    if (this.stage === 'cap' && near(this.L.anode, u, v, 0.07)) {
      this.capOff = true;
      this.h.sfx('peel');
      this.done();
    }
  }

  override pointerMove(u: number, v: number): void {
    if (this.drag === 'clip') this.clipAt = { u, v };
    if (this.drag === 'tool') this.toolAt = { u, v };
  }

  override pointerUp(u: number, v: number): void {
    const d = this.drag;
    this.drag = null;
    this.draining = false;
    if (d === 'clip') {
      if (near(this.L.ground, u, v, 0.06)) {
        this.clipAt = this.L.ground;
        this.stage = 'probe';
        this.h.sfx('snap');
      } else this.clipAt = this.L.clip;
    } else if (d === 'tool') {
      if (near(this.L.anode, u, v, 0.06)) {
        if (this.stage === 'ground') {
          // Never touch the anode before the tool is grounded: 25,000 volts with nowhere to go but you.
          this.wrong();
          this.h.burst(this.L.anode.u, this.L.anode.v, 'p_spark', 8, [0xffffff, 0x9cd8ff], 120);
          this.toolAt = this.L.tool;
          return;
        }
        this.toolAt = { u: this.L.anode.u + 0.03, v: this.L.anode.v };
        this.stage = 'drain';
        this.h.sfx('buzz', 0.4);
      } else this.toolAt = this.L.tool;
    }
  }

  override update(dt: number): void {
    if (this.stage === 'drain' && this.draining) {
      this.charge = Math.max(0, this.charge - dt * CRT_DRAIN_RATE);
      if (Math.random() < 0.3) this.h.sfx('tick', 0.3);
      if (this.charge <= CRT_SAFE) {
        this.draining = false;
        this.stage = 'cap';
        this.h.sfx('ding');
      }
    }
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The picture tube's bell, seen from behind, with the red anode cap and its thick lead.
    const a = at(L.anode);
    g.fillStyle(0x2a2833, 1);
    g.fillEllipse(a.x, a.y + 20, 300, 190);
    g.fillStyle(0x3a3a42, 1);
    g.fillEllipse(a.x, a.y + 20, 240, 150);
    g.lineStyle(10, 0xd8352a, 1);
    g.lineBetween(a.x, a.y, a.x - 150, a.y - 90);
    g.fillStyle(this.capOff ? 0x6d727c : 0xd8352a, 1);
    g.fillEllipse(a.x, a.y, this.capOff ? 20 : 64, this.capOff ? 20 : 40);
    // The chassis ground lug.
    const gr = at(L.ground);
    g.fillStyle(0xc9ced6, 1);
    g.fillRect(gr.x - 20, gr.y - 10, 40, 20);
    g.fillStyle(0x6d727c, 1);
    g.fillCircle(gr.x, gr.y, 6);
    // The discharge tool: an insulated screwdriver with a lead to its crocodile clip.
    const tq = at(this.toolAt);
    const cq = at(this.clipAt);
    g.lineStyle(5, 0x3fae49, 1);
    g.lineBetween(tq.x + 60, tq.y + 40, cq.x, cq.y);
    g.lineStyle(7, 0xc9ced6, 1);
    g.lineBetween(tq.x, tq.y, tq.x + 40, tq.y + 26);
    g.lineStyle(16, 0xf2c12e, 1);
    g.lineBetween(tq.x + 40, tq.y + 26, tq.x + 90, tq.y + 58);
    g.fillStyle(0x15121b, 1);
    g.fillRoundedRect(cq.x - 18, cq.y - 8, 36, 16, 5);
    const nx = this.stage === 'ground' ? this.clipAt : this.stage === 'probe' ? this.toolAt : L.anode;
    if (!this.drag && !this.finished) hint(g, this.h, nx, 32);
    drawGauge(g, L.meter, this.charge, 0x9cd8ff, [0, CRT_SAFE]);
    if (this.draining) {
      const k = this.h.scene.time.now / 40;
      g.lineStyle(2, 0x9cd8ff, 0.9);
      g.lineBetween(a.x + 10, a.y, a.x + 10 + Math.sin(k) * 10, a.y - 20);
    }
  }
}

// ---------------------------------------------------------------- battery contacts

/** Leaked batteries leave a crust: white vinegar (not water) on a swab, then scrub each terminal. */
export class ContactsTask extends StepTask {
  private L: ContactLayout;
  private stage: 'pick' | 'scrub' = 'pick';
  private left: number[];
  private holding: number | null = null;

  constructor(h: TaskHost) {
    super(h);
    this.L = contactLayout(h.inst.s);
    this.left = this.L.terminals.map(() => SCRUB_SECONDS);
  }

  start(): void {
    this.g = this.put(this.h.scene.add.graphics());
    this.put(
      label(this.h, { u: this.L.vinegar.u, v: this.L.vinegar.v + 0.09 }, t('dev.vinegar'), 0xffffff, 0.5),
    );
    this.put(label(this.h, { u: this.L.water.u, v: this.L.water.v + 0.09 }, t('dev.water'), 0xffffff, 0.5));
    this.draw();
  }

  instruction(): string {
    return `mg.dev.contacts.${this.stage}`;
  }

  progress(): number {
    if (this.stage === 'pick') return 0;
    return 0.2 + 0.8 * (this.left.filter((x) => x <= 0).length / this.left.length);
  }

  bot(): BotAction {
    if (this.stage === 'pick') return { a: 'tap', p: this.L.vinegar };
    const i = this.left.findIndex((x) => x > 0);
    return i < 0 ? { a: 'wait' } : { a: 'hold', p: this.L.terminals[i] };
  }

  override pointerDown(u: number, v: number): void {
    if (this.stage === 'pick') {
      if (near(this.L.vinegar, u, v, 0.05)) {
        this.stage = 'scrub';
        this.h.sfx('glug');
      } else if (near(this.L.water, u, v, 0.05)) {
        // Water doesn't dissolve the alkaline crust, and leaves the springs wet.
        this.wrong();
      }
      return;
    }
    const i = this.L.terminals.findIndex((p, k) => this.left[k] > 0 && near(p, u, v, 0.06));
    if (i >= 0) this.holding = i;
  }

  override pointerMove(u: number, v: number): void {
    if (this.holding !== null && !near(this.L.terminals[this.holding], u, v, 0.08)) this.holding = null;
  }

  override pointerUp(): void {
    this.holding = null;
  }

  override update(dt: number): void {
    if (this.holding !== null) {
      const i = this.holding;
      this.left[i] -= dt;
      if (Math.random() < 0.25) this.h.sfx('scrub', 0.4);
      if (this.left[i] <= 0) {
        this.holding = null;
        this.h.sfx('sparkle');
        if (this.left.every((x) => x <= 0)) this.done();
      }
    }
    super.update(dt);
  }

  protected draw(): void {
    const g = this.g;
    g.clear();
    const L = this.L;
    inset(g, L.panel.c, L.panel.w, L.panel.h);
    // The battery bay (two AA slots) and its terminals: a spring and a flat plate each.
    const a = at(L.terminals[0]);
    const b = at(L.terminals[1]);
    g.fillStyle(0x2a2833, 1);
    g.fillRoundedRect(a.x - 40, a.y - 70, b.x - a.x + 80, 140, 10);
    L.terminals.forEach((p, i) => {
      const q = at(p);
      const k = Math.max(0, this.left[i] / SCRUB_SECONDS);
      g.lineStyle(5, 0xd9dde4, 1);
      for (let r = 0; r < 4; r++) g.strokeEllipse(q.x, q.y - 24 + r * 12, 34, 10);
      g.fillStyle(0xd9dde4, 1);
      g.fillRect(q.x - 20, q.y + 30, 40, 8);
      if (k > 0) {
        // White and green crust.
        g.fillStyle(0xeef0d8, 0.95 * k);
        g.fillCircle(q.x - 8, q.y - 6, 14);
        g.fillCircle(q.x + 9, q.y + 6, 12);
        g.fillStyle(0x7fbf7a, 0.9 * k);
        g.fillCircle(q.x + 2, q.y - 14, 8);
        if (this.stage === 'scrub' && this.holding === null) hint(g, this.h, p, 40);
      }
    });
    if (this.holding !== null) {
      const q = at(L.terminals[this.holding]);
      const w = Math.sin(this.h.scene.time.now / 45) * 8;
      g.lineStyle(6, 0xf4f1e8, 1);
      g.lineBetween(q.x + w, q.y, q.x + 70 + w, q.y - 70);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(q.x + w, q.y, 18, 24);
    }
    // The two bottles.
    for (const [p, col] of [
      [L.vinegar, 0xf4f1e8],
      [L.water, 0x9cd8ff],
    ] as const) {
      const q = at(p);
      g.fillStyle(col, 0.95);
      g.fillRoundedRect(q.x - 20, q.y - 34, 40, 64, 8);
      g.fillStyle(0x3a3640, 1);
      g.fillRect(q.x - 8, q.y - 46, 16, 12);
      if (this.stage === 'pick') hint(g, this.h, p, 42);
    }
  }
}
