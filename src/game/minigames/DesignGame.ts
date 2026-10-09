import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import {
  DESIGNS,
  designScore,
  designTotals,
  makeSpec,
  meetsSpec,
  solveDesign,
  type DesignDef,
  type DesignSpec,
} from '../../core/design';
import { BUSINESSES } from '../../core/empire';
import { ITEMS } from '../../core/data';
import type { Pt } from '../../core/repair';
import { makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import { t } from '../../i18n';
import type { BotAction } from './repair/host';

const SLOT_W = 0.25;
const SLOT_H = 0.13;
const OPT_W = 0.3;
const OPT_H = 0.22;
const OPT_V = 0.86;
const OPT_U = [0.17, 0.5, 0.83];
const GAUGE_V = [0.05, 0.11, 0.17];

/** The blueprint for an item: the business whose customers bring that kind of item. */
export function designDefFor(cat: string): DesignDef | null {
  const b = BUSINESSES.find((x) => DESIGNS[x.id] && x.jobs.some((j) => j.cats.includes(cat as never)));
  return b ? DESIGNS[b.id] : null;
}

/**
 * Custom engineering: a client wants a new design to a spec (enough power, light enough, within budget).
 * Tap a slot of the blueprint, pick one of three parts from the tray; the gauges show the totals
 * against the spec. When every slot is filled and the spec is met, the design is approved.
 */
export class DesignGame extends MiniGame {
  private def!: DesignDef;
  private spec!: DesignSpec;
  private picks: number[] = [];
  private sel = 0;
  private hidden: Phaser.GameObjects.GameObject[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private slotTexts: Array<{ type: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text }> = [];
  private optTexts: Phaser.GameObjects.Text[][] = [];
  private gaugeTexts: Phaser.GameObjects.Text[] = [];
  private stamp!: Phaser.GameObjects.Text;
  private approvedAt = -1;
  private time = 0;
  private restored = false;

  start(): void {
    const sc = this.ctx.scene;
    const arch = ITEMS[this.ctx.inst.a];
    this.def = designDefFor(arch.cat) ?? DESIGNS.computer;
    this.spec = makeSpec(this.def, this.ctx.inst.s);
    this.picks = this.def.slots.map(() => -1);
    this.sel = 0;
    // The item's own art is hidden: we start from an empty blueprint.
    for (const o of [...this.ctx.stage.list]) {
      const v = o as unknown as Phaser.GameObjects.Components.Visible;
      if (v.visible) {
        v.setVisible(false);
        this.hidden.push(o);
      }
    }
    const sketch = this.hidden.find((o) => o instanceof Phaser.GameObjects.Image) as
      Phaser.GameObjects.Image | undefined;
    this.gfx = this.add(sc.add.graphics());
    if (sketch)
      this.add(
        sc.add
          .image(STAGE / 2, STAGE * 0.47, sketch.texture.key)
          .setDisplaySize(STAGE * 0.42, STAGE * 0.42)
          .setTint(0xbfe0ff)
          .setAlpha(0.14),
      );
    const label = (k: string) => t(`design.stat.${k}`);
    [label(this.def.power), label('weight'), label('cost')].forEach((s, i) => {
      this.add(makeText(sc, STAGE * 0.05, GAUGE_V[i] * STAGE, s, FS.tiny, C.white, { align: 'left' }));
      this.gaugeTexts.push(
        this.add(makeText(sc, STAGE * 0.95, GAUGE_V[i] * STAGE, '', FS.tiny, C.white, { align: 'right' })),
      );
    });
    this.def.slots.forEach((s) => {
      const x = s.u * STAGE;
      const y = s.v * STAGE;
      this.slotTexts.push({
        type: this.add(
          makeText(sc, x, y - SLOT_H * STAGE * 0.24, t(`design.slot.${s.type}`), FS.tiny, C.tealLight),
        ),
        name: this.add(makeText(sc, x, y + SLOT_H * STAGE * 0.16, '?', FS.tiny, C.white)),
      });
    });
    OPT_U.forEach((u) => {
      const x = u * STAGE;
      const y = OPT_V * STAGE;
      const h = OPT_H * STAGE;
      this.optTexts.push([
        this.add(makeText(sc, x, y - h * 0.32, '', FS.tiny, C.ink)),
        this.add(makeText(sc, x, y - h * 0.04, '', FS.tiny, C.inkSoft, { bold: false })),
        this.add(makeText(sc, x, y + h * 0.16, '', FS.tiny, C.inkSoft, { bold: false })),
        this.add(makeText(sc, x, y + h * 0.36, '', FS.tiny, C.inkSoft, { bold: false })),
      ]);
    });
    this.stamp = this.add(
      makeText(sc, STAGE / 2, OPT_V * STAGE, t('design.approved'), FS.h2, C.leaf, {
        stroke: C.white,
        strokeW: 8,
      }),
    );
    this.stamp.setAngle(-12).setAlpha(0);
    this.redraw();
  }

  private totals() {
    return designTotals(this.def, this.picks);
  }

  private filled(): boolean {
    return this.picks.every((p) => p >= 0);
  }

  private approved(): boolean {
    return this.filled() && meetsSpec(this.totals(), this.spec);
  }

  instruction(): string {
    if (!this.filled()) return 'mg.design';
    return this.approved() ? 'mg.designOk' : 'mg.designOff';
  }

  progress(): number {
    const f = this.picks.filter((p) => p >= 0).length / this.picks.length;
    return f * 0.9 + (this.approved() ? 0.1 : 0);
  }

  score(): number {
    return this.filled() ? designScore(this.totals(), this.spec) : 0.5 * this.progress();
  }

  autoComplete(): boolean {
    return this.approvedAt >= 0 && this.time - this.approvedAt > 0.9;
  }

  override minProgressForDone(): number {
    return 0.9;
  }

  /** E2E: the next tap that moves towards a design meeting the spec. */
  debug(): { phase: string; task: string; level: null; action: BotAction } {
    const sol = solveDesign(this.def, this.spec);
    let action: BotAction = { a: 'wait' };
    if (sol && this.approvedAt < 0) {
      const i = sol.findIndex((p, k) => this.picks[k] !== p);
      if (i >= 0) {
        const s = this.def.slots[i];
        action =
          this.sel !== i
            ? { a: 'tap', p: { u: s.u, v: s.v } }
            : { a: 'tap', p: { u: OPT_U[sol[i]], v: OPT_V } };
      }
    }
    return { phase: 'design', task: 'design', level: null, action };
  }

  override pointerDown(u: number, v: number): void {
    if (this.approvedAt >= 0) return;
    const hit = (p: Pt, w: number, h: number) => Math.abs(u - p.u) <= w / 2 && Math.abs(v - p.v) <= h / 2;
    const si = this.def.slots.findIndex((s) => hit(s, SLOT_W, SLOT_H));
    if (si >= 0) {
      this.sel = si;
      this.sfx('tick');
      this.redraw();
      return;
    }
    const oi = OPT_U.findIndex((ou) => hit({ u: ou, v: OPT_V }, OPT_W, OPT_H));
    if (oi < 0 || oi >= this.options().length) return;
    this.picks[this.sel] = oi;
    this.sfx('snap');
    session.haptic('light');
    const s = this.def.slots[this.sel];
    this.burst(s.u, s.v, 'p_spark', 8, [0xffffff, 0x8ef0e0], 110);
    // On to the next empty slot.
    const next = this.picks.findIndex((p) => p < 0);
    if (next >= 0) this.sel = next;
    if (this.approved()) {
      this.approvedAt = this.time;
      this.sfx('stamp');
      this.sfx('sparkle');
      session.haptic('success');
      this.ctx.scene.tweens.add({
        targets: this.stamp,
        alpha: 1,
        scale: { from: 1.6, to: 1 },
        duration: 260,
      });
    }
    this.redraw();
  }

  override update(dt: number): void {
    this.time += dt;
  }

  private options() {
    return this.def.parts[this.def.slots[this.sel].type];
  }

  private redraw(): void {
    const g = this.gfx;
    const S = STAGE;
    g.clear();
    // Blueprint paper with a grid.
    g.fillStyle(0x1d4f8c, 1);
    g.fillRect(0, 0, S, S);
    g.lineStyle(1, 0x8ec5ff, 0.18);
    for (let i = 1; i < 20; i++) {
      g.lineBetween((i * S) / 20, 0, (i * S) / 20, S);
      g.lineBetween(0, (i * S) / 20, S, (i * S) / 20);
    }
    // Gauges: the bar is the design so far; the white tick is the client's spec.
    const tot = this.totals();
    const rows: Array<[number, number, boolean]> = [
      [tot.power, this.spec.power, tot.power >= this.spec.power],
      [tot.weight, this.spec.weight, tot.weight <= this.spec.weight],
      [tot.cost, this.spec.cost, tot.cost <= this.spec.cost],
    ];
    rows.forEach(([val, spec, ok], i) => {
      const x0 = S * 0.27;
      const w = S * 0.46;
      const y = GAUGE_V[i] * S;
      const max = spec * 1.6;
      g.fillStyle(0x0f2a4d, 1);
      g.fillRoundedRect(x0, y - 9, w, 18, 6);
      g.fillStyle(ok ? 0x4cc65a : i === 0 ? 0xffc23d : 0xf2603a, 1);
      g.fillRoundedRect(x0, y - 9, Math.max(0, Math.min(1, val / max)) * w, 18, 6);
      g.lineStyle(4, 0xffffff, 1);
      const sx = x0 + (spec / max) * w;
      g.lineBetween(sx, y - 14, sx, y + 14);
      const sign = i === 0 ? '≥' : '≤';
      this.gaugeTexts[i].setText(`${val} / ${sign}${spec}`).setColor(ok ? '#9dffb0' : '#ffffff');
    });
    // Slots.
    this.def.slots.forEach((s, i) => {
      const x = (s.u - SLOT_W / 2) * S;
      const y = (s.v - SLOT_H / 2) * S;
      const sel = i === this.sel && this.approvedAt < 0;
      g.fillStyle(this.picks[i] >= 0 ? 0x2d6fb8 : 0x163f70, 1);
      g.fillRoundedRect(x, y, SLOT_W * S, SLOT_H * S, 10);
      g.lineStyle(sel ? 5 : 2, sel ? 0xffd93d : 0x8ec5ff, 1);
      g.strokeRoundedRect(x, y, SLOT_W * S, SLOT_H * S, 10);
      const p = this.def.parts[s.type][this.picks[i]];
      const nm = this.slotTexts[i].name;
      nm.setText(p ? p.name : '?').setScale(1);
      if (nm.width > SLOT_W * S - 10) nm.setScale((SLOT_W * S - 10) / nm.width);
    });
    // Parts tray for the selected slot (the approval stamp takes its place at the end).
    g.fillStyle(0x0f2a4d, 0.9);
    g.fillRect(0, (OPT_V - OPT_H / 2 - 0.03) * S, S, (OPT_H + 0.06) * S);
    const opts = this.approvedAt >= 0 ? [] : this.options();
    const lab = (k: string) => t(`design.stat.${k}`);
    OPT_U.forEach((u, i) => {
      const p = opts[i];
      const x = (u - OPT_W / 2) * S;
      const y = (OPT_V - OPT_H / 2) * S;
      const chosen = this.picks[this.sel] === i;
      g.fillStyle(chosen ? 0xdff2d5 : 0xfffbea, p ? 1 : 0);
      g.fillRoundedRect(x, y, OPT_W * S, OPT_H * S, 12);
      g.lineStyle(chosen ? 5 : 3, chosen ? 0x228a3c : 0x2a1f3d, p ? 1 : 0);
      g.strokeRoundedRect(x, y, OPT_W * S, OPT_H * S, 12);
      const tx = this.optTexts[i];
      tx[0].setText(p?.name ?? '').setScale(1);
      if (tx[0].width > OPT_W * S - 12) tx[0].setScale((OPT_W * S - 12) / tx[0].width);
      tx[1].setText(p ? `${lab(this.def.power)} ${p.power}` : '');
      tx[2].setText(p ? `${lab('weight')} ${p.weight}` : '');
      tx[3].setText(p ? `${lab('cost')} ${p.cost}` : '');
    });
  }

  private restore(): void {
    if (this.restored) return;
    this.restored = true;
    for (const o of this.hidden) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
  }

  override finishVisuals(): void {
    this.restore();
  }

  override destroy(): void {
    this.restore();
    super.destroy();
  }
}
