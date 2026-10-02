import Phaser from 'phaser';
import { MiniGame, STAGE } from './MiniGame';
import { connectWire, makeWirePuzzle, wireScore, wireSolved, type WirePuzzle } from '../../core/minigame';
import { hashSeed } from '../../core/prng';
import { drawCard, makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';

const WIRE_COLORS = [0xe5533d, 0x4a8fd9, 0xf4c542, 0x6dbb5a, 0x9b6fd6];
const WIRE_SYMBOLS = ['●', '■', '▲', '◆', '★'];

/** Connect each coloured wire end to its matching socket (colour + symbol). */
export class WireGame extends MiniGame {
  private puzzle!: WirePuzzle;
  private n = 3;
  private lines!: Phaser.GameObjects.Graphics;
  private drag: { l: number; u: number; v: number } | null = null;
  private hint!: Phaser.GameObjects.Graphics;

  start(): void {
    this.n = 3 + Math.min(2, this.ctx.inst.d);
    this.puzzle = makeWirePuzzle(hashSeed(this.ctx.inst.s, 'wire'), this.n);
    const sc = this.ctx.scene;
    const panel = this.add(sc.add.graphics());
    drawCard(panel, 30, 40, STAGE - 60, STAGE - 80, 0x2b2b33, { radius: 30, stroke: C.ink, strokeW: 5 });
    panel.fillStyle(0x3a3a44, 1);
    for (let i = 0; i < 6; i++) panel.fillCircle(60 + i * 88, 64, 6);
    this.lines = this.add(sc.add.graphics());
    this.hint = this.add(sc.add.graphics());
    for (let i = 0; i < this.n; i++) {
      const y = this.slotY(i);
      // left wire ends
      const lg = this.add(sc.add.graphics());
      lg.fillStyle(WIRE_COLORS[i], 1);
      lg.lineStyle(4, C.ink, 1);
      lg.fillRoundedRect(STAGE * 0.1, y - 16, 70, 32, 12);
      lg.strokeRoundedRect(STAGE * 0.1, y - 16, 70, 32, 12);
      this.add(
        makeText(sc, STAGE * 0.1 + 35, y, WIRE_SYMBOLS[i], FS.small, C.white, { stroke: C.ink, strokeW: 4 }),
      );
      // right sockets
      const c = this.puzzle.rightOrder[i];
      const rg = this.add(sc.add.graphics());
      rg.fillStyle(0x15151a, 1);
      rg.lineStyle(5, WIRE_COLORS[c], 1);
      rg.fillCircle(STAGE * 0.84, y, 24);
      rg.strokeCircle(STAGE * 0.84, y, 24);
      this.add(
        makeText(sc, STAGE * 0.84, y, WIRE_SYMBOLS[c], FS.small, C.white, { stroke: C.ink, strokeW: 4 }),
      );
    }
    this.redraw();
  }

  /** E2E: unit coords of wire ends and sockets + the right-side order. */
  debug(): {
    left: Array<{ u: number; v: number }>;
    right: Array<{ u: number; v: number }>;
    order: number[];
  } {
    const left = [];
    const right = [];
    for (let i = 0; i < this.n; i++) {
      left.push({ u: (STAGE * 0.1 + 35) / STAGE, v: this.slotY(i) / STAGE });
      right.push({ u: 0.84, v: this.slotY(i) / STAGE });
    }
    return { left, right, order: [...this.puzzle.rightOrder] };
  }

  private slotY(i: number): number {
    return 110 + ((STAGE - 220) * (i + 0.5)) / this.n;
  }

  instruction(): string {
    return 'mg.wire';
  }
  progress(): number {
    return this.puzzle.connected.filter(Boolean).length / this.n;
  }
  score(): number {
    return wireSolved(this.puzzle) ? wireScore(this.puzzle) : 0.5 * this.progress();
  }
  autoComplete(): boolean {
    return wireSolved(this.puzzle);
  }
  override minProgressForDone(): number {
    return 2;
  }

  override pointerDown(u: number, v: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.puzzle.connected[i]) continue;
      const x = (STAGE * 0.1 + 35) / STAGE;
      const y = this.slotY(i) / STAGE;
      if (Math.abs(u - x) < 0.12 && Math.abs(v - y) < 0.07) {
        this.drag = { l: i, u, v };
        this.sfx('snap');
        session.haptic('light');
        break;
      }
    }
    this.redraw();
  }

  override pointerMove(u: number, v: number, down: boolean): void {
    if (!down || !this.drag) return;
    this.drag.u = u;
    this.drag.v = v;
    this.redraw();
  }

  override pointerUp(u: number, v: number): void {
    if (!this.drag) return;
    const l = this.drag.l;
    this.drag = null;
    for (let r = 0; r < this.n; r++) {
      const x = 0.84;
      const y = this.slotY(r) / STAGE;
      if (Math.hypot(u - x, v - y) < 0.09) {
        if (connectWire(this.puzzle, l, r)) {
          this.sfx('ding');
          session.haptic('success');
          this.burst(x, y, 'p_spark', 10, [WIRE_COLORS[l], 0xffffff], 160);
        } else {
          this.sfx('buzz');
          session.haptic('medium');
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
    }
    this.redraw();
  }

  private redraw(): void {
    const g = this.lines;
    g.clear();
    const x0 = STAGE * 0.1 + 70;
    for (let l = 0; l < this.n; l++) {
      if (!this.puzzle.connected[l]) continue;
      const r = this.puzzle.rightOrder.indexOf(l);
      this.curve(g, x0, this.slotY(l), STAGE * 0.84 - 24, this.slotY(r), WIRE_COLORS[l]);
    }
    this.hint.clear();
    if (this.drag) {
      this.curve(
        g,
        x0,
        this.slotY(this.drag.l),
        this.drag.u * STAGE,
        this.drag.v * STAGE,
        WIRE_COLORS[this.drag.l],
      );
      if (this.ctx.tools.wireHints > 0) {
        const r = this.puzzle.rightOrder.indexOf(this.drag.l);
        this.hint.lineStyle(6, C.gold, 1);
        this.hint.strokeCircle(STAGE * 0.84, this.slotY(r), 34);
      }
    }
  }

  private curve(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
  ): void {
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(x1, y1),
      new Phaser.Math.Vector2(x1 + 120, y1),
      new Phaser.Math.Vector2(x2 - 120, y2),
      new Phaser.Math.Vector2(x2, y2),
    );
    g.lineStyle(16, C.ink, 1);
    curve.draw(g, 32);
    g.lineStyle(10, color, 1);
    curve.draw(g, 32);
  }
}
