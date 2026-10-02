import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { gridFromLayer } from '../art/damage';
import { ctx2d, displayHex, makeCanvas, PAINT_COLORS } from '../art/itemArt';
import { CoverageGrid, DONE_AT, paintScore } from '../../core/minigame';
import { Button } from '../ui/widgets';
import { C, FS } from '../theme';
import { t } from '../../i18n';

/** Shape cue per paint colour so colour is never the only signal. */
const SYMBOLS = ['●', '■', '▲', '◆', '★', '♥', '✚', '⬟'];

/** Pick a colour, brush inside the item; overspray outside the item lowers the score. */
export class PaintGame extends MiniGame {
  private grid!: CoverageGrid;
  private inC!: HTMLCanvasElement;
  private outC!: HTMLCanvasElement;
  private inTex!: Phaser.Textures.CanvasTexture;
  private outTex!: Phaser.Textures.CanvasTexture;
  private color: string | null = null;
  private last: { u: number; v: number } | null = null;
  private dirty = false;
  private swatches: Button[] = [];

  start(): void {
    const size = this.ctx.tex;
    this.grid = gridFromLayer(this.ctx.set.sil, () => 1, 100);
    this.inC = makeCanvas(size);
    this.outC = makeCanvas(size);
    const sc = this.ctx.scene;
    for (const [key, canvas, alpha] of [
      [`${this.ctx.key}_paintIn`, this.inC, 0.94],
      [`${this.ctx.key}_paintOut`, this.outC, 0.45],
    ] as const) {
      if (sc.textures.exists(key)) sc.textures.remove(key);
      const tex = sc.textures.addCanvas(key, canvas)!;
      if (canvas === this.inC) this.inTex = tex;
      else this.outTex = tex;
      const img = this.add(sc.add.image(0, 0, key).setOrigin(0, 0).setAlpha(alpha));
      img.setDisplaySize(STAGE, STAGE);
    }
    this.makeCursor();
    // Palette
    const cols = 4;
    PAINT_COLORS.forEach((id, i) => {
      const hex = parseInt(displayHex(id).slice(1), 16);
      const b = new Button(sc, 0, 0, {
        w: 132,
        h: 64,
        label: `${SYMBOLS[i]} ${t(`color.${id}`)}`,
        color: hex,
        fontSize: FS.tiny,
        onClick: () => this.pick(id),
      });
      b.setData('col', i % cols);
      b.setData('row', Math.floor(i / cols));
      this.ctx.panel.add(b);
      this.swatches.push(b);
      (this.ctx.scene as unknown as { mark?: (id: string, o: Button) => void }).mark?.(`swatch${i}`, b);
      if (id === this.ctx.trendColor) b.setBadge(t('mg.trend'));
    });
    this.layoutPalette();
    this.ctx.relayout();
  }

  layoutPalette(): void {
    this.swatches.forEach((b) =>
      b.setPosition(-216 + (b.getData('col') as number) * 144, -40 + (b.getData('row') as number) * 78),
    );
  }

  private pick(id: string): void {
    this.color = id;
    this.swatches.forEach((b, i) => b.setFocused(PAINT_COLORS[i] === id));
    this.sfx('pop');
  }

  instruction(): string {
    return this.color ? 'mg.paint' : 'mg.paintPick';
  }
  chosenColor(): string | null {
    return this.color;
  }
  progress(): number {
    return Math.min(1, this.grid.clearedFraction() / DONE_AT);
  }
  score(): number {
    return paintScore(this.grid, this.ctx.tools.paintOverspray, this.color === this.ctx.trendColor);
  }
  autoComplete(): boolean {
    return this.progress() >= 1;
  }

  override pointerDown(u: number, v: number): void {
    this.moveCursor(u, v);
    if (!this.color) return;
    this.last = { u, v };
    this.stamp(u, v, u, v);
  }

  override pointerMove(u: number, v: number, down: boolean): void {
    this.moveCursor(u, v);
    if (!down || !this.last || !this.color) return;
    this.stamp(this.last.u, this.last.v, u, v);
    this.last = { u, v };
  }

  override pointerUp(): void {
    this.last = null;
    this.cursor?.setVisible(false);
  }

  private stamp(u0: number, v0: number, u1: number, v1: number): void {
    const r = 0.065 * this.ctx.tools.paintBrush;
    this.grid.stroke(u0, v0, u1, v1, r, 0.45);
    const size = this.ctx.tex;
    const hex = displayHex(this.color!);
    for (const c of [this.inC, this.outC]) {
      const x = ctx2d(c);
      x.strokeStyle = hex;
      x.lineCap = 'round';
      x.lineWidth = r * 2 * size;
      x.beginPath();
      x.moveTo(u0 * size, v0 * size);
      x.lineTo(u1 * size, v1 * size + 0.01);
      x.stroke();
    }
    this.dirty = true;
    this.sfx('spray', 0.8);
    if (Math.random() < 0.3) this.burst(u1, v1, 'p_dot', 2, [parseInt(hex.slice(1), 16)], 90);
  }

  override update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const sil = this.ctx.set.sil;
    const xi = ctx2d(this.inC);
    xi.save();
    xi.globalCompositeOperation = 'destination-in';
    xi.drawImage(sil, 0, 0, this.inC.width, this.inC.height);
    xi.restore();
    const xo = ctx2d(this.outC);
    xo.save();
    xo.globalCompositeOperation = 'destination-out';
    xo.drawImage(sil, 0, 0, this.outC.width, this.outC.height);
    xo.restore();
    this.inTex.refresh();
    this.outTex.refresh();
  }

  override destroy(): void {
    for (const b of this.swatches) b.destroy();
    this.swatches = [];
    super.destroy();
  }

  override finishVisuals(): void {
    const faded = this.ctx.layerImages.paint;
    if (faded) faded.setAlpha(0);
    this.burst(0.5, 0.5, 'p_spark', 20, [C.gold, 0xffffff], 240);
  }
}
