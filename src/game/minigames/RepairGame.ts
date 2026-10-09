import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { connectWire, makeWirePuzzle, wireScore, wireSolved, type WirePuzzle } from '../../core/minigame';
import {
  SCREW_SECONDS,
  TWIST_NEEDED,
  angleDelta,
  panelGeom,
  rigFor,
  screwLayout,
  wireLayout,
  type PanelGeom,
  type Pt,
  type Rig,
  type WireLayout,
} from '../../core/repair';
import { hashSeed } from '../../core/prng';
import { ITEMS } from '../../core/data';
import { drawCompartment, drawCover, drawGlow, drawScrew, drawScrewdriver } from '../art/repairArt';
import { colorsFor, releaseCanvas } from '../art/itemArt';
import { makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';

type Phase = 'turn' | 'screws' | 'twist' | 'cover' | 'wires' | 'test' | 'close' | 'done';

/** Mains cable colours (brown, blue, green-yellow earth, black, grey) and low-voltage ones. */
const MAINS = [0x8b5a2b, 0x2f6fd0, 0x3fae49, 0x2a2a2e, 0x9a9aa2];
const LOW = [0xe03c31, 0x2a2a2e, 0xf2c12e, 0xf4f4f4, 0x2fa14d];
const SYMBOLS = ['●', '■', '▲', '◆', '★'];
const GLOW_TINT = { bulb: 0xffe08a, tubes: 0xff9a3c, screen: 0x9ff0ff, led: 0x7dff8a } as const;

interface Screw {
  p: Pt;
  img: Phaser.GameObjects.Image;
  t: number;
  out: boolean;
}

/**
 * The wiring repair, done "for real": the item turns over to its electrical compartment (the base
 * of a lamp, the back of a radio, the case back of a watch), the screws come out one by one with a
 * screwdriver (or the back is twisted off), the cover lifts away, each loose wire is connected to
 * the terminal with the same colour and shape, the repair is tested (it lights up) and everything
 * goes back together. Scoring is the same pure wire puzzle as before (mistakes cost a little).
 */
export class RepairGame extends MiniGame {
  private rig!: Rig;
  private geom!: PanelGeom;
  private lay!: WireLayout;
  private puzzle!: WirePuzzle;
  private n = 3;
  private colors: number[] = MAINS;
  private phase: Phase = 'turn';
  private hidden: Phaser.GameObjects.GameObject[] = [];
  private itemView!: Phaser.GameObjects.Container;
  private closeup!: Phaser.GameObjects.Container;
  private cover!: Phaser.GameObjects.Image;
  private screws: Screw[] = [];
  private driver!: Phaser.GameObjects.Image;
  private wires!: Phaser.GameObjects.Graphics;
  private termScrews: Phaser.GameObjects.Image[] = [];
  private glow!: Phaser.GameObjects.Image;
  /** Slots of the cover screws (drawn as lines so they turn without rotating images). */
  private slots!: Phaser.GameObjects.Graphics;
  private termSlots!: Phaser.GameObjects.Graphics;
  private termAngles: number[] = [];
  private screwAngles: number[] = [];
  /** Grip ridges + notch of a twist-off case back. */
  private lidMarks!: Phaser.GameObjects.Graphics;
  private lidAngle = 0;
  private holding: number | null = null;
  private tickT = 0;
  private twistTotal = 0;
  private twistLast: number | null = null;
  private coverDrag: { u: number; v: number; ox: number; oy: number } | null = null;
  private drag: { l: number; u: number; v: number } | null = null;
  private ownTextures: string[] = [];
  private restored = false;
  private speed = 1;

  start(): void {
    const sc = this.ctx.scene;
    const inst = this.ctx.inst;
    const arch = ITEMS[inst.a];
    this.rig = rigFor(arch.cat, arch.shape);
    this.geom = panelGeom(this.rig);
    this.n = 3 + Math.min(2, inst.d);
    this.colors = this.rig.mains ? MAINS : LOW;
    this.puzzle = makeWirePuzzle(hashSeed(inst.s, 'wire'), this.n);
    this.lay = wireLayout(this.rig, this.n, hashSeed(inst.s, 'wirelay'));
    this.speed = session.settings().reducedMotion ? 0.45 : 1;

    // Hide the normal item view; the repair has its own close-up.
    for (const o of [...this.ctx.stage.list]) {
      const v = o as unknown as Phaser.GameObjects.Components.Visible;
      if (v.visible) {
        v.setVisible(false);
        this.hidden.push(o);
      }
    }
    this.itemView = this.add(sc.add.container(STAGE / 2, STAGE / 2));
    for (const o of this.hidden) {
      if (!(o instanceof Phaser.GameObjects.Image)) continue;
      const copy = sc.add
        .image(o.x - STAGE / 2, o.y - STAGE / 2, o.texture.key)
        .setOrigin(0, 0)
        .setDisplaySize(o.displayWidth, o.displayHeight)
        .setAlpha(o.alpha);
      this.itemView.add(copy);
    }

    // Close-up textures (drawn once for this item).
    const size = 640;
    const body = colorsFor(arch, inst.col).body;
    const screwPts = screwLayout(this.rig);
    const coverKey = `${this.ctx.key}_rcover`;
    const insideKey = `${this.ctx.key}_rinside`;
    this.addTexture(coverKey, drawCover(this.rig, body, size, screwPts));
    this.addTexture(insideKey, drawCompartment(this.rig, size, this.lay, hashSeed(inst.s, 'board')));
    this.sharedTexture('repair_screw2', () => drawScrew(96));
    this.sharedTexture('repair_brass2', () => drawScrew(96, true));
    this.sharedTexture('repair_driver', () => drawScrewdriver(80, 260));
    this.sharedTexture('repair_glow', () => drawGlow(256));

    this.closeup = this.add(sc.add.container(STAGE / 2, STAGE / 2));
    const at = (p: Pt) => ({ x: p.u * STAGE - STAGE / 2, y: p.v * STAGE - STAGE / 2 });
    const inside = sc.add
      .image(-STAGE / 2, -STAGE / 2, insideKey)
      .setOrigin(0, 0)
      .setDisplaySize(STAGE, STAGE);
    const gp = at(this.lay.glow);
    this.glow = sc.add
      .image(gp.x, gp.y, 'repair_glow')
      .setDisplaySize(STAGE * 0.5, STAGE * 0.5)
      .setTint(GLOW_TINT[this.rig.glow])
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.wires = sc.add.graphics();
    this.closeup.add([inside, this.glow, this.wires]);
    this.lay.terminals.forEach((tp, r) => {
      const p = at(tp);
      const s = sc.add.image(p.x, p.y, 'repair_brass2').setDisplaySize(STAGE * 0.07, STAGE * 0.07);
      this.termScrews.push(s);
      this.termAngles.push(0.6);
      const want = this.puzzle.rightOrder[r];
      const tag = sc.add.graphics();
      tag.fillStyle(this.colors[want], 1);
      tag.lineStyle(3, C.ink, 1);
      tag.fillRoundedRect(p.x - 20, p.y + STAGE * 0.045, 40, 30, 6);
      tag.strokeRoundedRect(p.x - 20, p.y + STAGE * 0.045, 40, 30, 6);
      const sym = makeText(sc, p.x, p.y + STAGE * 0.045 + 15, SYMBOLS[want], FS.tiny, C.white, {
        stroke: C.ink,
        strokeW: 4,
      });
      this.closeup.add([s, tag, sym]);
    });
    // Loose wire tags (same symbols, so colour is never the only cue).
    this.lay.loose.forEach((lp, l) => {
      const p = at(lp);
      this.closeup.add(
        makeText(sc, p.x + 26, p.y + 4, SYMBOLS[l], FS.tiny, C.white, { stroke: C.ink, strokeW: 4 }).setName(
          `wtag${l}`,
        ),
      );
    });
    this.termSlots = sc.add.graphics();
    this.closeup.add(this.termSlots);
    this.cover = sc.add
      .image(-STAGE / 2, -STAGE / 2, coverKey)
      .setOrigin(0, 0)
      .setDisplaySize(STAGE, STAGE);
    this.lidMarks = sc.add.graphics();
    this.closeup.add([this.cover, this.lidMarks]);
    for (const sp of screwPts) {
      const p = at(sp);
      const img = sc.add.image(p.x, p.y, 'repair_screw2').setDisplaySize(STAGE * 0.075, STAGE * 0.075);
      this.closeup.add(img);
      this.screws.push({ p: sp, img, t: 0, out: false });
      this.screwAngles.push(Math.random() * Math.PI);
    }
    this.slots = sc.add.graphics();
    this.closeup.add(this.slots);
    this.driver = sc.add
      .image(0, 0, 'repair_driver')
      .setOrigin(0.5, 1)
      .setDisplaySize(STAGE * 0.1, STAGE * 0.32);
    this.driver.setVisible(false);
    this.closeup.add(this.driver);
    this.closeup.setAlpha(0);
    this.drawWires();
    this.drawDetails();
    this.playTurn(false, () => {
      this.phase = this.rig.lid === 'twist' ? 'twist' : this.screws.length ? 'screws' : 'cover';
    });
  }

  private addTexture(key: string, canvas: HTMLCanvasElement): void {
    const tm = this.ctx.scene.textures;
    if (tm.exists(key)) tm.remove(key);
    tm.addCanvas(key, canvas);
    this.ownTextures.push(key);
  }

  private sharedTexture(key: string, make: () => HTMLCanvasElement): void {
    if (!this.ctx.scene.textures.exists(key)) this.ctx.scene.textures.addCanvas(key, make());
  }

  /**
   * Turning the item to its compartment and back. Base: it tips over (squashes towards us) and the
   * base plate unfolds. Back: it spins round (the back is darker) and we zoom onto the back panel.
   */
  private playTurn(reverse: boolean, done: () => void): void {
    const tw = this.ctx.scene.tweens;
    const d = (ms: number) => Math.round(ms * this.speed);
    const iv = this.itemView;
    const cu = this.closeup;
    this.sfx('whoosh');
    if (this.rig.view === 'base') {
      if (!reverse) {
        tw.chain({
          tweens: [
            { targets: iv, scaleY: 0.12, y: STAGE * 0.78, duration: d(420), ease: 'Sine.in' },
            {
              targets: cu,
              props: {
                alpha: { from: 0, to: 1 },
                scaleY: { from: 0.12, to: 1 },
                scaleX: { from: 0.75, to: 1 },
              },
              duration: d(420),
              ease: 'Back.out',
              onStart: () => iv.setAlpha(0),
            },
          ],
          onComplete: done,
        });
      } else {
        tw.chain({
          tweens: [
            { targets: cu, alpha: 0, scaleY: 0.12, scaleX: 0.75, duration: d(380), ease: 'Sine.in' },
            {
              targets: iv,
              scaleY: 1,
              y: STAGE / 2,
              duration: d(420),
              ease: 'Back.out',
              onStart: () => iv.setAlpha(1),
            },
          ],
          onComplete: done,
        });
      }
      return;
    }
    const tintAll = (on: boolean) =>
      iv.list.forEach((o) => {
        const im = o as Phaser.GameObjects.Image;
        if (on) im.setTint(0x6d6a80);
        else im.clearTint();
      });
    if (!reverse) {
      tw.chain({
        tweens: [
          { targets: iv, scaleX: 0, duration: d(240), ease: 'Sine.in', onComplete: () => tintAll(true) },
          { targets: iv, scaleX: 1, duration: d(240), ease: 'Sine.out' },
          {
            targets: iv,
            scale: 1.5,
            alpha: 0,
            duration: d(380),
            ease: 'Sine.in',
            onStart: () => tw.add({ targets: cu, alpha: 1, scale: { from: 0.6, to: 1 }, duration: d(380) }),
          },
        ],
        onComplete: done,
      });
    } else {
      tw.chain({
        tweens: [
          {
            targets: cu,
            alpha: 0,
            scale: 0.6,
            duration: d(320),
            onStart: () => tw.add({ targets: iv, alpha: 1, scale: 1, duration: d(320) }),
          },
          { targets: iv, scaleX: 0, duration: d(240), ease: 'Sine.in', onComplete: () => tintAll(false) },
          { targets: iv, scaleX: 1, duration: d(240), ease: 'Sine.out' },
        ],
        onComplete: done,
      });
    }
  }

  instruction(): string {
    switch (this.phase) {
      case 'turn':
        return 'mg.rep.turn';
      case 'screws':
        return 'mg.rep.screws';
      case 'twist':
        return 'mg.rep.twist';
      case 'cover':
        return 'mg.rep.cover';
      case 'wires':
        return 'mg.wire';
      case 'test':
        return 'mg.rep.test';
      default:
        return 'mg.rep.close';
    }
  }

  progress(): number {
    switch (this.phase) {
      case 'turn':
        return 0;
      case 'screws':
        return (0.25 * this.screws.filter((s) => s.out).length) / Math.max(1, this.screws.length);
      case 'twist':
        return 0.25 * Math.min(1, this.twistTotal / TWIST_NEEDED);
      case 'cover':
        return 0.28;
      case 'wires':
        return 0.3 + (0.6 * this.puzzle.connected.filter(Boolean).length) / this.n;
      case 'test':
      case 'close':
        return 0.95;
      default:
        return 1;
    }
  }

  score(): number {
    return wireSolved(this.puzzle) ? wireScore(this.puzzle) : 0.5 * this.progress();
  }

  autoComplete(): boolean {
    return this.phase === 'done';
  }

  override minProgressForDone(): number {
    return 2;
  }

  /** E2E: what the bot needs for the current phase, in stage unit coords. */
  debug(): {
    phase: Phase;
    screws: Pt[];
    center: Pt;
    radius: number;
    left: Array<{ u: number; v: number }>;
    right: Array<{ u: number; v: number }>;
    order: number[];
  } {
    return {
      phase: this.phase,
      screws: this.screws.filter((s) => !s.out).map((s) => s.p),
      center: { u: this.geom.cx, v: this.geom.cy },
      radius: Math.min(this.geom.rx, this.geom.ry),
      left: this.lay.loose.map((p) => ({ ...p })),
      right: this.lay.terminals.map((p) => ({ ...p })),
      order: [...this.puzzle.rightOrder],
    };
  }

  // ---------------- input ----------------

  override pointerDown(u: number, v: number): void {
    switch (this.phase) {
      case 'screws': {
        const i = this.screws.findIndex((s) => !s.out && Math.hypot(s.p.u - u, s.p.v - v) < 0.08);
        if (i >= 0) {
          this.holding = i;
          const s = this.screws[i];
          this.driver.setPosition(s.img.x, s.img.y + STAGE * 0.01).setVisible(true);
          session.haptic('light');
        }
        break;
      }
      case 'twist':
        if (this.inPanel(u, v, 1.1)) this.twistLast = Math.atan2(v - this.geom.cy, u - this.geom.cx);
        break;
      case 'cover':
        if (this.inPanel(u, v, 1.05)) this.coverDrag = { u, v, ox: this.cover.x, oy: this.cover.y };
        break;
      case 'wires':
        for (let l = 0; l < this.n; l++) {
          if (this.puzzle.connected[l]) continue;
          const p = this.lay.loose[l];
          if (Math.hypot(p.u - u, p.v - v) < 0.08) {
            this.drag = { l, u, v };
            this.sfx('snap');
            session.haptic('light');
            this.drawWires();
            break;
          }
        }
        break;
    }
  }

  override pointerMove(u: number, v: number, down: boolean): void {
    if (!down) return;
    if (this.phase === 'screws' && this.holding !== null) {
      const s = this.screws[this.holding];
      if (Math.hypot(s.p.u - u, s.p.v - v) > 0.11) this.stopHolding();
    } else if (this.phase === 'twist' && this.twistLast !== null) {
      const a = Math.atan2(v - this.geom.cy, u - this.geom.cx);
      const d = angleDelta(this.twistLast, a);
      this.twistLast = a;
      this.twistTotal += Math.abs(d);
      this.lidAngle += d;
      this.tickT += Math.abs(d);
      if (this.tickT > 0.5) {
        this.tickT = 0;
        this.sfx('tick');
      }
      if (this.twistTotal >= TWIST_NEEDED) {
        this.twistLast = null;
        this.sfx('pop');
        session.haptic('success');
        this.phase = 'cover';
        this.ctx.scene.tweens.add({ targets: this.cover, scale: this.cover.scale * 1.04, duration: 160 });
      }
    } else if (this.phase === 'cover' && this.coverDrag) {
      this.cover.setPosition(
        this.coverDrag.ox + (u - this.coverDrag.u) * STAGE,
        this.coverDrag.oy + (v - this.coverDrag.v) * STAGE,
      );
    } else if (this.phase === 'wires' && this.drag) {
      this.drag.u = u;
      this.drag.v = v;
      this.drawWires();
    }
  }

  override pointerUp(u: number, v: number): void {
    if (this.phase === 'screws') this.stopHolding();
    else if (this.phase === 'twist') this.twistLast = null;
    else if (this.phase === 'cover' && this.coverDrag) {
      const dx = u - this.coverDrag.u;
      const dy = v - this.coverDrag.v;
      this.coverDrag = null;
      // A tap lifts it off upwards; a drag throws it the way you dragged.
      const len = Math.hypot(dx, dy);
      const dir = len < 0.06 ? { x: 0.3, y: -1 } : { x: dx / len, y: dy / len };
      this.removeCover(dir);
    } else if (this.phase === 'wires' && this.drag) this.dropWire(u, v);
  }

  private inPanel(u: number, v: number, k: number): boolean {
    const g = this.geom;
    return Math.abs(u - g.cx) <= g.rx * k && Math.abs(v - g.cy) <= g.ry * k;
  }

  private stopHolding(): void {
    this.holding = null;
    this.driver.setVisible(false);
  }

  override update(dt: number): void {
    this.drawDetails();
    if (this.phase !== 'screws' || this.holding === null) return;
    const s = this.screws[this.holding];
    s.t += dt;
    this.screwAngles[this.holding] -= dt * 14;
    this.driver.setX(s.img.x + Math.sin(s.t * 40) * 2);
    this.tickT += dt;
    if (this.tickT > 0.12) {
      this.tickT = 0;
      this.sfx('tick', 0.6);
    }
    if (s.t >= SCREW_SECONDS) {
      s.out = true;
      this.stopHolding();
      this.sfx('pop');
      session.haptic('medium');
      const i = this.screws.filter((x) => x.out).length - 1;
      const tw = this.ctx.scene.tweens;
      tw.chain({
        targets: s.img,
        tweens: [
          { y: s.img.y - STAGE * 0.05, scale: s.img.scale * 1.3, duration: 140, ease: 'Sine.out' },
          {
            x: STAGE * 0.42 - i * STAGE * 0.07,
            y: -STAGE * 0.44,
            scale: s.img.scale,
            duration: 320,
            ease: 'Sine.inOut',
          },
        ],
      });
      if (this.screws.every((x) => x.out)) this.phase = 'cover';
    }
  }

  private removeCover(dir: { x: number; y: number }): void {
    this.phase = 'turn';
    this.sfx('whoosh');
    this.ctx.scene.tweens.add({
      targets: this.cover,
      x: this.cover.x + dir.x * STAGE * 1.1,
      y: this.cover.y + dir.y * STAGE * 1.1,
      alpha: 0,
      duration: Math.round(380 * this.speed),
      ease: 'Sine.in',
      onComplete: () => {
        this.phase = 'wires';
        this.drawWires();
      },
    });
  }

  private dropWire(u: number, v: number): void {
    const l = this.drag!.l;
    this.drag = null;
    for (let r = 0; r < this.n; r++) {
      const t = this.lay.terminals[r];
      if (Math.hypot(u - t.u, v - t.v) >= 0.08) continue;
      if (connectWire(this.puzzle, l, r)) {
        this.sfx('snap');
        this.sfx('ding');
        session.haptic('success');
        this.burst(t.u, t.v, 'p_spark', 8, [0xffe08a, 0xffffff], 120);
        // The terminal screw tightens down on the wire.
        const ta = { a: this.termAngles[r] };
        this.ctx.scene.tweens.add({
          targets: ta,
          a: ta.a + Math.PI * 1.5,
          duration: 260,
          onUpdate: () => {
            this.termAngles[r] = ta.a;
          },
        });
        (this.closeup.getByName(`wtag${l}`) as Phaser.GameObjects.Text | null)?.setVisible(false);
      } else {
        this.sfx('buzz');
        session.haptic('medium');
        this.burst(t.u, t.v, 'p_spark', 10, [0xff9a3c, 0xffe08a], 180);
        this.ctx.scene.tweens.add({
          targets: this.ctx.stage,
          x: this.ctx.stage.x + 8,
          duration: 50,
          yoyo: true,
          repeat: 2,
        });
      }
      break;
    }
    this.drawWires();
    if (wireSolved(this.puzzle)) this.test();
  }

  /** It works: the light comes on, then everything goes back together. */
  private test(): void {
    this.phase = 'test';
    const tw = this.ctx.scene.tweens;
    this.sfx('sparkle');
    this.burst(this.lay.glow.u, this.lay.glow.v, 'p_spark', 16, [GLOW_TINT[this.rig.glow], 0xffffff], 160);
    tw.add({
      targets: this.glow,
      alpha: { from: 0, to: 1 },
      duration: 260,
      yoyo: true,
      repeat: 1,
      hold: 220,
      onComplete: () => this.close(),
    });
  }

  private close(): void {
    this.phase = 'close';
    const tw = this.ctx.scene.tweens;
    const d = (ms: number) => Math.round(ms * this.speed);
    this.cover.setPosition(-STAGE / 2, -STAGE * 1.3).setAlpha(1);
    this.lidAngle = 0;
    tw.add({
      targets: this.cover,
      y: -STAGE / 2,
      duration: d(320),
      ease: 'Back.out',
      onComplete: () => {
        this.sfx('stamp');
        // Screws fly back in and spin tight.
        this.screws.forEach((s, i) => {
          const x = s.p.u * STAGE - STAGE / 2;
          const y = s.p.v * STAGE - STAGE / 2;
          const sa = { a: this.screwAngles[i] };
          tw.add({ targets: s.img, x, y, duration: d(260), delay: d(i * 70) });
          tw.add({
            targets: sa,
            a: sa.a + Math.PI * 3,
            duration: d(260),
            delay: d(i * 70),
            onUpdate: () => {
              this.screwAngles[i] = sa.a;
            },
          });
        });
        this.ctx.scene.time.delayedCall(d(260 + this.screws.length * 70 + 120), () =>
          this.playTurn(true, () => {
            this.restore();
            this.phase = 'done';
          }),
        );
      },
    });
  }

  private restore(): void {
    if (this.restored) return;
    this.restored = true;
    for (const o of this.hidden) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
    this.itemView?.setVisible(false);
    this.closeup?.setVisible(false);
  }

  // ---------------- drawing ----------------

  /** Screw slots (turning lines), terminal screw slots and the case back's grip marks. */
  private drawDetails(): void {
    if (!this.slots) return;
    const slot = (
      g: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      r: number,
      a: number,
      alpha: number,
    ) => {
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;
      g.lineStyle(r * 0.32, 0x19141f, 0.85 * alpha);
      g.lineBetween(x - dx, y - dy, x + dx, y + dy);
      g.lineStyle(r * 0.1, 0xffffff, 0.35 * alpha);
      g.lineBetween(x - dx, y - dy + r * 0.24, x + dx, y + dy + r * 0.24);
    };
    const s = this.slots;
    s.clear();
    this.screws.forEach((sc, i) => {
      const r = (sc.img.displayWidth / 2) * 0.66;
      slot(s, sc.img.x, sc.img.y, r, this.screwAngles[i], sc.img.alpha);
    });
    const t = this.termSlots;
    t.clear();
    this.termScrews.forEach((im, i) =>
      slot(t, im.x, im.y, (im.displayWidth / 2) * 0.66, this.termAngles[i], 1),
    );
    const m = this.lidMarks;
    m.clear();
    if (this.rig.lid === 'twist' && this.cover.alpha > 0.01) {
      const cx = this.cover.x + this.geom.cx * STAGE;
      const cy = this.cover.y + this.geom.cy * STAGE;
      const rr = this.geom.rx * STAGE;
      m.lineStyle(2, 0xffffff, 0.5 * this.cover.alpha);
      for (let i = 0; i < 48; i++) {
        const a = this.lidAngle + (i / 48) * Math.PI * 2;
        m.lineBetween(
          cx + Math.cos(a) * rr * 0.9,
          cy + Math.sin(a) * rr * 0.9,
          cx + Math.cos(a) * rr * 0.99,
          cy + Math.sin(a) * rr * 0.99,
        );
      }
      const a = this.lidAngle;
      m.lineStyle(10, 0x3d4250, this.cover.alpha);
      m.lineBetween(
        cx + Math.cos(a) * rr * 0.86,
        cy + Math.sin(a) * rr * 0.86,
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr,
      );
    }
  }

  /** Insulated wires with stripped copper ends, from the cable entry to their ends. */
  private drawWires(): void {
    const g = this.wires;
    g.clear();
    const at = (p: Pt) => ({ x: p.u * STAGE - STAGE / 2, y: p.v * STAGE - STAGE / 2 });
    const e = at(this.lay.entry);
    for (let l = 0; l < this.n; l++) {
      let end: Pt = this.lay.loose[l];
      if (this.puzzle.connected[l]) end = this.lay.terminals[this.puzzle.rightOrder.indexOf(l)];
      else if (this.drag?.l === l) end = { u: this.drag.u, v: this.drag.v };
      const p = at(end);
      const sx = e.x + (l - (this.n - 1) / 2) * 7;
      const c1 = { x: sx, y: e.y - STAGE * 0.16 };
      const c2 = { x: p.x, y: p.y + STAGE * 0.14 };
      const pts: Phaser.Math.Vector2[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const c = 3 * (1 - t) * t * t;
        const d = t ** 3;
        pts.push(
          new Phaser.Math.Vector2(
            a * sx + b * c1.x + c * c2.x + d * p.x,
            a * e.y + b * c1.y + c * c2.y + d * p.y,
          ),
        );
      }
      const col = this.colors[l];
      g.lineStyle(16, 0x15121b, 0.9);
      g.strokePoints(pts, false);
      g.lineStyle(11, col, 1);
      g.strokePoints(pts, false);
      if (this.rig.mains && l === 2) {
        // Green-yellow earth: yellow stripes.
        g.lineStyle(11, 0xf2d43a, 1);
        for (let i = 0; i + 1 < pts.length; i += 2)
          g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
      g.lineStyle(3, 0xffffff, 0.35);
      g.strokePoints(
        pts.map((q) => new Phaser.Math.Vector2(q.x - 2, q.y - 2)),
        false,
      );
      // Stripped copper end pointing along the wire.
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 3];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      g.lineStyle(7, 0xd9a63a, 1);
      g.lineBetween(last.x, last.y, last.x + (dx / len) * 14, last.y + (dy / len) * 14);
      g.lineStyle(2, 0xfff1b8, 0.8);
      g.lineBetween(last.x, last.y - 1, last.x + (dx / len) * 12, last.y + (dy / len) * 12 - 1);
    }
  }

  override finishVisuals(): void {
    this.restore();
  }

  override destroy(): void {
    this.restore();
    super.destroy();
    const tm = this.ctx.scene.textures;
    for (const k of this.ownTextures) {
      if (!tm.exists(k)) continue;
      const src = tm.get(k).getSourceImage();
      tm.remove(k);
      if (src instanceof HTMLCanvasElement) releaseCanvas(src);
    }
    this.ownTextures = [];
  }
}
