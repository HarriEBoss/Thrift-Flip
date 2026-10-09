import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { makeWirePuzzle, type WirePuzzle } from '../../core/minigame';
import {
  SCREW_SECONDS,
  TWIST_NEEDED,
  HEAT_SECONDS,
  angleDelta,
  hoistLayout,
  panelGeom,
  repairRig,
  screwLayout,
  wireLayout,
  type PanelGeom,
  type Pt,
  type Rig,
  type WireLayout,
} from '../../core/repair';
import { hashSeed } from '../../core/prng';
import { ITEMS } from '../../core/data';
import {
  drawCompartment,
  drawCover,
  drawEngine,
  drawGlow,
  drawScrew,
  drawScrewdriver,
} from '../art/repairArt';
import { colorsFor, releaseCanvas } from '../art/itemArt';
import { session } from '../session';
import { at, drawGauge, drawSlot, type BotAction, type RepairTask, type TaskHost } from './repair/host';
import { makeTask } from './repair/tasks';

type Phase = 'turn' | 'screws' | 'twist' | 'heat' | 'cover' | 'task' | 'test' | 'close' | 'done';

const GLOW_TINT = {
  bulb: 0xffe08a,
  tubes: 0xff9a3c,
  screen: 0x9ff0ff,
  led: 0x7dff8a,
  engine: 0xffc070,
} as const;

interface Screw {
  p: Pt;
  img: Phaser.GameObjects.Image;
  t: number;
  out: boolean;
}

/**
 * A repair done "for real": the item turns to its compartment (the base of a lamp, the back of a
 * radio or PC, the hood of a car), the screws come out one by one (or the back twists off, or the
 * hood lifts), the cover comes away, then each hands-on task of the rig is done in order (see
 * ./repair/tasks: wires, part swaps, fluids, bolts, the engine hoist, cables, dust). Then it is
 * tested (it lights up or the engine starts) and goes back together.
 */
export class RepairGame extends MiniGame {
  constructor(
    ctx: ConstructorParameters<typeof MiniGame>[0],
    /** 'wire': reconnect the wiring. 'fix': the item's full repair (or a customer's big job). */
    private mode: 'wire' | 'fix' = 'wire',
  ) {
    super(ctx);
  }

  private rig!: Rig;
  private tasks: RepairTask[] = [];
  private cur = -1;
  private geom!: PanelGeom;
  private lay!: WireLayout;
  private puzzle!: WirePuzzle;
  private phase: Phase = 'turn';
  private hidden: Phaser.GameObjects.GameObject[] = [];
  private itemView!: Phaser.GameObjects.Container;
  private closeup!: Phaser.GameObjects.Container;
  private cover!: Phaser.GameObjects.Image;
  private screws: Screw[] = [];
  private driver!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  /** Slots of the cover screws (drawn as lines so they turn without rotating images). */
  private slots!: Phaser.GameObjects.Graphics;
  private screwAngles: number[] = [];
  /** Grip ridges + notch of a twist-off case back. */
  private lidMarks!: Phaser.GameObjects.Graphics;
  private lidAngle = 0;
  private holding: number | null = null;
  private tickT = 0;
  private twistTotal = 0;
  private twistLast: number | null = null;
  /** Glued backs: heat gun time so far, where it points, and its drawing. */
  private heatT = 0;
  private heatAt: { u: number; v: number } | null = null;
  private heatFx: Phaser.GameObjects.Graphics | null = null;
  private coverDrag: { u: number; v: number; ox: number; oy: number } | null = null;
  private ownTextures: string[] = [];
  private restored = false;
  private speed = 1;

  start(): void {
    const sc = this.ctx.scene;
    const inst = this.ctx.inst;
    const arch = ITEMS[inst.a];
    this.rig = repairRig(this.mode, arch.cat, arch.shape, inst.job?.k);
    this.geom = panelGeom(this.rig);
    const n = 3 + Math.min(2, inst.d);
    this.puzzle = makeWirePuzzle(hashSeed(inst.s, 'wire'), n);
    this.lay = wireLayout(this.rig, n, hashSeed(inst.s, 'wirelay'));
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
    const wiresFirst = this.rig.tasks[0]?.k === 'wires';
    this.addTexture(coverKey, drawCover(this.rig, body, size, screwPts));
    this.addTexture(
      insideKey,
      drawCompartment(
        this.rig,
        size,
        this.lay,
        hashSeed(inst.s, 'board'),
        this.rig.tasks.some((t) => t.k === 'wires'),
      ),
    );
    this.sharedTexture('repair_screw2', () => drawScrew(96));
    this.sharedTexture('repair_driver', () => drawScrewdriver(80, 260));
    this.sharedTexture('repair_glow', () => drawGlow(256));

    this.closeup = this.add(sc.add.container(STAGE / 2, STAGE / 2));
    const inside = sc.add
      .image(-STAGE / 2, -STAGE / 2, insideKey)
      .setOrigin(0, 0)
      .setDisplaySize(STAGE, STAGE);
    const layer = sc.add.container(0, 0);
    const engine = sc.add.container(0, 0);
    layer.add(engine);
    if (this.rig.inside === 'bay') {
      // Engine swap: the old engine sits in the bay until it is hoisted out.
      const hl = hoistLayout(this.rig);
      const w = Math.round(hl.w * STAGE * 1.3);
      const h = Math.round(hl.h * STAGE * 1.3);
      this.sharedTexture('repair_engine_old', () => drawEngine(w, h, true));
      const p = at(hl.seat);
      engine.add(
        sc.add
          .image(p.x, p.y, 'repair_engine_old')
          .setDisplaySize(hl.w * STAGE, hl.h * STAGE)
          .setName('engine'),
      );
    }
    const gp = at(this.lay.glow);
    this.glow = sc.add
      .image(gp.x, gp.y, 'repair_glow')
      .setDisplaySize(STAGE * 0.5, STAGE * 0.5)
      .setTint(GLOW_TINT[this.rig.glow])
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.closeup.add([inside, layer, this.glow]);

    const host: TaskHost = {
      scene: sc,
      layer,
      rig: this.rig,
      inst,
      speed: this.speed,
      engine,
      sfx: (k, i) => this.sfx(k, i),
      burst: (u, v, tex, cnt, tints, sp) => this.burst(u, v, tex, cnt, tints, sp),
      shared: (key, make) => {
        this.sharedTexture(key, make);
        return key;
      },
      own: (key, canvas) => {
        this.addTexture(key, canvas);
        return key;
      },
      shake: () => {
        this.ctx.scene.tweens.add({
          targets: this.closeup,
          x: this.closeup.x + 8,
          duration: 50,
          yoyo: true,
          repeat: 2,
        });
      },
    };
    this.tasks = this.rig.tasks.map((spec, i) =>
      makeTask(host, spec, { lay: this.lay, puzzle: this.puzzle }, i === 0 && wiresFirst),
    );
    for (const t of this.tasks) t.init();

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
    if (this.rig.lid === 'glued') {
      this.heatFx = sc.add.graphics();
      this.closeup.add(this.heatFx);
    }
    this.driver = sc.add
      .image(0, 0, 'repair_driver')
      .setOrigin(0.5, 1)
      .setDisplaySize(STAGE * 0.1, STAGE * 0.32);
    this.driver.setVisible(false);
    this.closeup.add(this.driver);
    this.closeup.setAlpha(0);
    this.drawDetails();
    this.playTurn(false, () => {
      this.phase =
        this.rig.lid === 'twist'
          ? 'twist'
          : this.rig.lid === 'glued'
            ? 'heat'
            : this.screws.length
              ? 'screws'
              : 'cover';
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
    if (this.rig.view === 'hood') {
      // Lean in over the front of the car: zoom in on the item, then the hood fills the view.
      if (!reverse) {
        tw.add({ targets: iv, scale: 1.9, y: STAGE * 0.62, alpha: 0, duration: d(520), ease: 'Sine.in' });
        tw.add({
          targets: cu,
          alpha: 1,
          scale: { from: 0.7, to: 1 },
          duration: d(420),
          delay: d(260),
          onComplete: done,
        });
      } else {
        tw.add({ targets: cu, alpha: 0, scale: 0.7, duration: d(360) });
        tw.add({
          targets: iv,
          scale: 1,
          y: STAGE / 2,
          alpha: 1,
          duration: d(480),
          delay: d(160),
          ease: 'Sine.out',
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
        // Between two jobs, keep showing the one just finished.
        return this.tasks[this.cur]?.instruction() ?? 'mg.rep.turn';
      case 'screws':
        return 'mg.rep.screws';
      case 'twist':
        return 'mg.rep.twist';
      case 'heat':
        return 'mg.rep.heat';
      case 'cover':
        return this.rig.lid === 'hood'
          ? 'mg.rep.hood'
          : this.rig.lid === 'glued'
            ? 'mg.rep.lift'
            : 'mg.rep.cover';
      case 'task':
        return this.tasks[this.cur]?.instruction() ?? 'mg.rep.turn';
      case 'test':
        return 'mg.rep.test';
      default:
        return 'mg.rep.close';
    }
  }

  progress(): number {
    switch (this.phase) {
      case 'turn':
        return this.cur < 0 ? 0 : 0.3 + (0.62 * this.cur) / Math.max(1, this.tasks.length);
      case 'screws':
        return (0.25 * this.screws.filter((s) => s.out).length) / Math.max(1, this.screws.length);
      case 'twist':
        return 0.25 * Math.min(1, this.twistTotal / TWIST_NEEDED);
      case 'heat':
        return 0.25 * Math.min(1, this.heatT / HEAT_SECONDS);
      case 'cover':
        return 0.28;
      case 'task': {
        const t = this.tasks[this.cur];
        return 0.3 + (0.62 * (this.cur + (t?.progress() ?? 0))) / Math.max(1, this.tasks.length);
      }
      case 'test':
      case 'close':
        return 0.95;
      default:
        return 1;
    }
  }

  score(): number {
    if (this.phase !== 'test' && this.phase !== 'close' && this.phase !== 'done')
      return 0.5 * this.progress();
    return Math.max(
      0.4,
      this.tasks.reduce((p, t) => p * t.score(), 1),
    );
  }

  autoComplete(): boolean {
    return this.phase === 'done';
  }

  override minProgressForDone(): number {
    return 2;
  }

  /** E2E: what the bot should do next, in stage unit coords. */
  debug(): { phase: Phase; task: string | null; level: number | null; action: BotAction } {
    const t = this.phase === 'task' ? this.tasks[this.cur] : undefined;
    return {
      phase: this.phase,
      task: t ? this.rig.tasks[this.cur].k : null,
      level: t?.level() ?? null,
      action: this.botAction(),
    };
  }

  private botAction(): BotAction {
    switch (this.phase) {
      case 'screws': {
        const s = this.screws.find((x) => !x.out);
        return s ? { a: 'hold', p: s.p } : { a: 'wait' };
      }
      case 'twist':
        return {
          a: 'circle',
          c: { u: this.geom.cx, v: this.geom.cy },
          r: Math.min(this.geom.rx, this.geom.ry) * 0.6,
        };
      case 'heat':
        return { a: 'hold', p: { u: this.geom.cx, v: this.geom.cy } };
      case 'cover':
        return { a: 'tap', p: { u: this.geom.cx, v: this.geom.cy } };
      case 'task':
        return this.tasks[this.cur]?.bot() ?? { a: 'wait' };
      default:
        return { a: 'wait' };
    }
  }

  /** The next job inside the compartment, or the test when all are done. */
  private startTask(i: number): void {
    if (this.restored) return;
    this.cur = i;
    const t = this.tasks[i];
    if (!t) {
      this.test();
      return;
    }
    this.phase = 'task';
    t.onDone = () => {
      this.phase = 'turn';
      this.ctx.scene.time.delayedCall(Math.round(250 * this.speed), () => this.startTask(i + 1));
    };
    t.start();
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
      case 'heat':
        if (this.inPanel(u, v, 1.1)) this.heatAt = { u, v };
        break;
      case 'cover':
        if (this.inPanel(u, v, 1.05)) this.coverDrag = { u, v, ox: this.cover.x, oy: this.cover.y };
        break;
      case 'task':
        this.tasks[this.cur]?.pointerDown(u, v);
        break;
    }
  }

  override pointerMove(u: number, v: number, down: boolean): void {
    if (!down) return;
    if (this.phase === 'heat' && this.heatAt) this.heatAt = { u, v };
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
    } else if (this.phase === 'task') this.tasks[this.cur]?.pointerMove(u, v);
  }

  override pointerUp(u: number, v: number): void {
    this.heatAt = null;
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
    } else if (this.phase === 'task') this.tasks[this.cur]?.pointerUp(u, v);
  }

  /** Glued back: hold the heat gun on it until the glue is soft, then it can be lifted off. */
  private updateHeat(dt: number): void {
    const g = this.heatFx;
    if (!g) return;
    g.clear();
    if (this.phase !== 'heat') return;
    const k = Math.min(1, this.heatT / HEAT_SECONDS);
    // The cover warms up (orange glow round the glued edge) and the gauge fills.
    const cx = this.cover.x + this.geom.cx * STAGE;
    const cy = this.cover.y + this.geom.cy * STAGE;
    g.lineStyle(STAGE * 0.03, 0xff7a2a, 0.15 + k * 0.55);
    g.strokeRoundedRect(
      cx - this.geom.rx * STAGE * 0.97,
      cy - this.geom.ry * STAGE * 0.97,
      this.geom.rx * STAGE * 1.94,
      this.geom.ry * STAGE * 1.94,
      STAGE * 0.04,
    );
    const gauge = { u: this.geom.cx + this.geom.rx + 0.04, v: this.geom.cy };
    drawGauge(g, gauge, k, 0xff7a2a, null);
    const hp = this.heatAt;
    if (!hp) return;
    // Heat gun: a body and nozzle pointing at the finger, from below right.
    const q = at(hp);
    g.lineStyle(26, 0x15121b, 0.9);
    g.lineBetween(q.x + 40, q.y + 40, q.x + 110, q.y + 110);
    g.lineStyle(20, 0xf2603a, 1);
    g.lineBetween(q.x + 40, q.y + 40, q.x + 110, q.y + 110);
    g.lineStyle(12, 0x5b616b, 1);
    g.lineBetween(q.x + 14, q.y + 14, q.x + 44, q.y + 44);
    this.heatT += dt;
    this.tickT += dt;
    if (this.tickT > 0.15) {
      this.tickT = 0;
      this.sfx('spray', 0.4);
      this.burst(hp.u, hp.v, 'p_dot', 2, [0xffb36b, 0xff7a2a], 60);
    }
    if (this.heatT >= HEAT_SECONDS) {
      this.heatAt = null;
      this.sfx('pop');
      session.haptic('success');
      this.phase = 'cover';
      g.clear();
    }
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
    // Every task draws its turning bits; only the current one reacts to input.
    for (const t of this.tasks) t.update(dt);
    this.updateHeat(dt);
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
      onComplete: () => this.startTask(0),
    });
  }

  /** It works: the light comes on, then everything goes back together. */
  private test(): void {
    this.phase = 'test';
    const tw = this.ctx.scene.tweens;
    if (this.rig.glow === 'engine') {
      // Vroom: the engine starts, the bay shakes and the exhaust puffs.
      this.sfx('engine');
      tw.add({ targets: this.closeup, x: this.closeup.x + 4, duration: 40, yoyo: true, repeat: 9 });
      for (let i = 0; i < 4; i++)
        this.ctx.scene.time.delayedCall(i * 160, () =>
          this.burst(0.1, 0.9, 'p_dot', 4, [0xb9b4c4, 0xe8e4f0], 70),
        );
    }
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

  /** Screw slots (turning lines) and the case back's grip marks. */
  private drawDetails(): void {
    if (!this.slots) return;
    const s = this.slots;
    s.clear();
    this.screws.forEach((sc, i) => {
      const r = (sc.img.displayWidth / 2) * 0.66;
      drawSlot(s, sc.img.x, sc.img.y, r, this.screwAngles[i], sc.img.alpha);
    });
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
