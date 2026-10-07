import Phaser from 'phaser';
import { C, FONT, FS, hex } from '../theme';
import { pixelDraw, type Pen } from '../art/pixel';

/** Anything the keyboard focus system can move between. */
export interface Focusable {
  focusable: boolean;
  setFocused(on: boolean): void;
  activate(): void;
  /** Optional: left/right keys (sliders). */
  nudge?(dir: -1 | 1): void;
  /** Whether it is currently shown & enabled. */
  isAvailable(): boolean;
  /** Screen-space centre, for spatial ordering. */
  getCenterY(): number;
  getCenterX(): number;
}

export interface UiHost {
  registerFocusable(f: Focusable): void;
  unregisterFocusable(f: Focusable): void;
  uiSfx(kind: 'click' | 'tick'): void;
  textScale(): number;
  textResolution(): number;
}

export function isUiHost(s: unknown): s is UiHost {
  return !!s && typeof (s as UiHost).registerFocusable === 'function';
}

/** Draws a chunky rounded "sticker" shape with a drop shadow. */
export function drawCard(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  opts: { radius?: number; shadow?: number; stroke?: number; strokeW?: number; shine?: boolean } = {},
): void {
  const r = Math.min(opts.radius ?? 22, h / 2, w / 2);
  const sh = opts.shadow ?? 6;
  if (sh > 0) {
    g.fillStyle(C.shadow, 0.22);
    g.fillRoundedRect(x, y + sh, w, h, r);
  }
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
  if (opts.shine) {
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(x + 6, y + 5, w - 12, Math.max(4, h * 0.36), Math.max(2, r - 6));
  }
  if (opts.stroke !== undefined) {
    g.lineStyle(opts.strokeW ?? 4, opts.stroke, 1);
    g.strokeRoundedRect(x, y, w, h, r);
  }
}

export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number = FS.body,
  color: number = C.ink,
  opts: {
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    wrap?: number;
    stroke?: number;
    strokeW?: number;
  } = {},
): Phaser.GameObjects.Text {
  const host = isUiHost(scene) ? scene : null;
  const scaled = Math.round(size * (host ? host.textScale() : 1));
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT,
    fontSize: `${scaled}px`,
    fontStyle: opts.bold === false ? 'normal' : 'bold',
    color: hex(color),
    align: opts.align ?? 'center',
  };
  if (opts.wrap) style.wordWrap = { width: opts.wrap, useAdvancedWrap: true };
  if (opts.stroke !== undefined) {
    style.stroke = hex(opts.stroke);
    style.strokeThickness = opts.strokeW ?? 6;
  }
  const t = scene.add.text(x, y, text, style);
  t.setOrigin(opts.align === 'left' ? 0 : opts.align === 'right' ? 1 : 0.5, 0.5);
  t.setResolution(host ? host.textResolution() : 1);
  t.setData('baseFontSize', size);
  return t;
}

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  color?: number;
  textColor?: number;
  fontSize?: number;
  icon?: (g: Phaser.GameObjects.Graphics, size: number) => void;
  sub?: string;
  onClick: () => void;
  focusable?: boolean;
  sfx?: boolean;
}

export class Button extends Phaser.GameObjects.Container implements Focusable {
  focusable: boolean;
  private bg: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private iconG: Phaser.GameObjects.Graphics | null = null;
  readonly label: Phaser.GameObjects.Text;
  private subLabel: Phaser.GameObjects.Text | null = null;
  private zone: Phaser.GameObjects.Zone;
  private pressed = false;
  private enabled = true;
  private opts: ButtonOpts;
  private badge: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.opts = opts;
    this.focusable = opts.focusable !== false;
    this.bg = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.add(this.ring);
    this.add(this.bg);
    const hasIcon = !!opts.icon;
    const fs = opts.fontSize ?? FS.button;
    const iconSize = Math.min(opts.h * 0.62, 56);
    const labelX = hasIcon && opts.label ? iconSize * 0.45 : 0;
    this.label = makeText(
      scene,
      labelX,
      opts.sub ? -fs * 0.32 : 0,
      opts.label,
      fs,
      opts.textColor ?? C.white,
      {
        stroke: opts.textColor === undefined ? C.ink : undefined,
        strokeW: 5,
      },
    );
    if (opts.label && this.label.width > opts.w - (hasIcon ? iconSize + 24 : 24)) {
      const maxW = opts.w - (hasIcon ? iconSize + 24 : 24);
      this.label.setScale(maxW / this.label.width);
    }
    this.add(this.label);
    if (opts.sub) {
      this.subLabel = makeText(
        scene,
        labelX,
        fs * 0.55,
        opts.sub,
        Math.round(fs * 0.62),
        opts.textColor ?? C.white,
        {
          stroke: opts.textColor === undefined ? C.ink : undefined,
          strokeW: 4,
        },
      );
      this.add(this.subLabel);
    }
    if (opts.icon) {
      this.iconG = scene.add.graphics();
      const ix = opts.label ? labelX - this.label.displayWidth / 2 - iconSize * 0.6 : 0;
      this.iconG.setPosition(ix, 0);
      opts.icon(this.iconG, iconSize);
      this.add(this.iconG);
    }
    this.zone = scene.add.zone(0, 0, opts.w, opts.h);
    this.zone.setInteractive({ useHandCursor: true });
    this.add(this.zone);
    this.setSize(opts.w, opts.h);
    this.draw();

    this.zone.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.draw();
    });
    this.zone.on('pointerout', () => {
      if (this.pressed) {
        this.pressed = false;
        this.draw();
      }
    });
    this.zone.on('pointerup', () => {
      if (!this.enabled || !this.pressed) return;
      this.pressed = false;
      this.draw();
      this.activate();
    });
    scene.add.existing(this);
    if (isUiHost(scene) && this.focusable) scene.registerFocusable(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (isUiHost(scene)) scene.unregisterFocusable(this);
    });
  }

  private draw(): void {
    const { w, h } = this.opts;
    const color = this.enabled ? (this.opts.color ?? C.teal) : 0xb9ada4;
    const g = this.bg;
    g.clear();
    const down = this.pressed ? 4 : 0;
    g.fillStyle(C.shadow, 0.28);
    g.fillRoundedRect(-w / 2, -h / 2 + 7, w, h, Math.min(24, h / 2));
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + down, w, h, Math.min(24, h / 2));
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(-w / 2 + 8, -h / 2 + 6 + down, w - 16, h * 0.32, Math.min(16, h / 4));
    g.lineStyle(4, C.ink, 1);
    g.strokeRoundedRect(-w / 2, -h / 2 + down, w, h, Math.min(24, h / 2));
    this.label.y = (this.subLabel ? -(this.opts.fontSize ?? FS.button) * 0.32 : 0) + down;
    if (this.subLabel) this.subLabel.y = (this.opts.fontSize ?? FS.button) * 0.55 + down;
    if (this.iconG) this.iconG.y = down;
    this.setAlpha(this.enabled ? 1 : 0.75);
  }

  setFocused(on: boolean): void {
    const { w, h } = this.opts;
    this.ring.clear();
    if (on) {
      this.ring.lineStyle(6, C.gold, 1);
      this.ring.strokeRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 20, Math.min(30, h / 2 + 8));
    }
  }

  activate(): void {
    if (!this.enabled) return;
    if (this.opts.sfx !== false && isUiHost(this.scene)) this.scene.uiSfx('click');
    this.scene.tweens.add({ targets: this, scaleX: 1.06, scaleY: 0.94, duration: 70, yoyo: true });
    this.opts.onClick();
  }

  setEnabled(on: boolean): this {
    if (this.enabled === on) return this;
    this.enabled = on;
    this.draw();
    return this;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setLabel(text: string): this {
    this.label.setText(text);
    this.label.setScale(1);
    const maxW = this.opts.w - 24;
    if (this.label.width > maxW) this.label.setScale(maxW / this.label.width);
    return this;
  }

  setSub(text: string): this {
    this.subLabel?.setText(text);
    return this;
  }

  setColor(color: number): this {
    this.opts.color = color;
    this.draw();
    return this;
  }

  /** Small corner badge (e.g. "!" or "NEW"). Text based so it never relies on color alone. */
  setBadge(text: string | null): this {
    this.badge?.destroy();
    this.badge = null;
    if (!text) return this;
    const c = this.scene.add.container(this.opts.w / 2 - 10, -this.opts.h / 2 + 4);
    const g = this.scene.add.graphics();
    const t = makeText(this.scene, 0, 0, text, FS.tiny, C.white, { stroke: C.ink, strokeW: 4 });
    const bw = Math.max(36, t.width + 18);
    g.fillStyle(C.terracotta, 1);
    g.fillRoundedRect(-bw / 2, -18, bw, 36, 18);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(-bw / 2, -18, bw, 36, 18);
    c.add([g, t]);
    this.add(c);
    this.badge = c;
    this.scene.tweens.add({
      targets: c,
      scale: 1.12,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    return this;
  }

  isAvailable(): boolean {
    return this.enabled && this.visible && this.active && isChainVisible(this);
  }
  getCenterX(): number {
    return this.getWorldTransformMatrix().tx;
  }
  getCenterY(): number {
    return this.getWorldTransformMatrix().ty;
  }
}

export function isChainVisible(o: Phaser.GameObjects.GameObject): boolean {
  let cur: Phaser.GameObjects.GameObject | null = o;
  while (cur) {
    const v = cur as unknown as { visible?: boolean; parentContainer?: Phaser.GameObjects.Container | null };
    if (v.visible === false) return false;
    cur = v.parentContainer ?? null;
  }
  return true;
}

export interface SliderOpts {
  w: number;
  value: number; // 0..1
  label?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Called when the drag ends. */
  onCommit?: (v: number) => void;
  steps?: number; // keyboard steps
  color?: number;
}

export class Slider extends Phaser.GameObjects.Container implements Focusable {
  focusable = true;
  value: number;
  private track: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private valueText: Phaser.GameObjects.Text;
  private dragging = false;
  private opts: SliderOpts;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: SliderOpts) {
    super(scene, x, y);
    this.opts = opts;
    this.value = Phaser.Math.Clamp(opts.value, 0, 1);
    this.ring = scene.add.graphics();
    this.track = scene.add.graphics();
    this.knob = scene.add.graphics();
    this.valueText = makeText(scene, 0, -46, '', FS.body, C.ink);
    this.add([this.ring, this.track, this.knob, this.valueText]);
    const zone = scene.add.zone(0, 0, opts.w + 60, 80).setInteractive({ useHandCursor: true });
    this.add(zone);
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setFromPointer(p);
    });
    const move = (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.setFromPointer(p);
    };
    const up = () => {
      if (this.dragging) {
        this.dragging = false;
        this.opts.onCommit?.(this.value);
      }
    };
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
      scene.input.off('pointerupoutside', up);
      if (isUiHost(scene)) scene.unregisterFocusable(this);
    });
    scene.add.existing(this);
    if (isUiHost(scene)) scene.registerFocusable(this);
    this.redraw();
  }

  private setFromPointer(p: Phaser.Input.Pointer): void {
    const m = this.getWorldTransformMatrix();
    const local = m.applyInverse(p.x, p.y);
    const v = Phaser.Math.Clamp((local.x + this.opts.w / 2) / this.opts.w, 0, 1);
    this.setValue(v, true);
  }

  setValue(v: number, emit = false): void {
    const nv = Phaser.Math.Clamp(v, 0, 1);
    const changed = nv !== this.value;
    this.value = nv;
    this.redraw();
    if (emit && changed) {
      if (isUiHost(this.scene)) this.scene.uiSfx('tick');
      this.opts.onChange(this.value);
    }
  }

  redraw(): void {
    const w = this.opts.w;
    const g = this.track;
    g.clear();
    g.fillStyle(C.shadow, 0.2);
    g.fillRoundedRect(-w / 2, -10, w, 26, 13);
    g.fillStyle(C.white, 1);
    g.fillRoundedRect(-w / 2, -13, w, 26, 13);
    g.fillStyle(this.opts.color ?? C.teal, 1);
    g.fillRoundedRect(-w / 2, -13, Math.max(26, w * this.value), 26, 13);
    g.lineStyle(4, C.ink, 1);
    g.strokeRoundedRect(-w / 2, -13, w, 26, 13);
    const k = this.knob;
    k.clear();
    const kx = -w / 2 + w * this.value;
    k.fillStyle(C.shadow, 0.25);
    k.fillCircle(kx, 5, 24);
    k.fillStyle(C.mustard, 1);
    k.fillCircle(kx, 0, 24);
    k.lineStyle(4, C.ink, 1);
    k.strokeCircle(kx, 0, 24);
    const txt = this.opts.format ? this.opts.format(this.value) : `${Math.round(this.value * 100)}%`;
    this.valueText.setText(this.opts.label ? `${this.opts.label}: ${txt}` : txt);
  }

  setFocused(on: boolean): void {
    this.ring.clear();
    if (on) {
      this.ring.lineStyle(6, C.gold, 1);
      this.ring.strokeRoundedRect(-this.opts.w / 2 - 40, -30, this.opts.w + 80, 60, 30);
    }
  }
  activate(): void {}
  nudge(dir: -1 | 1): void {
    const step = 1 / (this.opts.steps ?? 10);
    this.setValue(this.value + dir * step, true);
    this.opts.onCommit?.(this.value);
  }
  isAvailable(): boolean {
    return this.visible && this.active && isChainVisible(this);
  }
  getCenterX(): number {
    return this.getWorldTransformMatrix().tx;
  }
  getCenterY(): number {
    return this.getWorldTransformMatrix().ty;
  }
}

export class ProgressBar extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private value = 0;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private bw: number,
    private bh: number,
    private color: number = C.leaf,
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.add(this.g);
    scene.add.existing(this);
    this.redraw();
  }
  setValue(v: number): this {
    const nv = Phaser.Math.Clamp(v, 0, 1);
    if (Math.abs(nv - this.value) < 0.002) return this;
    this.value = nv;
    this.redraw();
    return this;
  }
  setBarColor(c: number): this {
    this.color = c;
    this.redraw();
    return this;
  }
  private redraw(): void {
    const w = this.bw;
    const h = this.bh;
    const g = this.g;
    g.clear();
    g.fillStyle(C.white, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (this.value > 0) {
      g.fillStyle(this.color, 1);
      g.fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * this.value), h, h / 2);
      g.fillStyle(0xffffff, 0.3);
      g.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, Math.max(h - 8, w * this.value - 8), h * 0.3, h * 0.15);
    }
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }
}

/** A coin glyph (circle with an embossed star-ish mark), vector so it stays crisp. */
export function vCoin(g: Pen, x: number, y: number, r: number): void {
  g.fillStyle(C.mustardDark, 1);
  g.fillCircle(x, y + r * 0.12, r);
  g.fillStyle(C.gold, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(Math.max(2, r * 0.14), C.ink, 1);
  g.strokeCircle(x, y, r);
  g.fillStyle(C.mustardDark, 1);
  g.fillRect(x - r * 0.12, y - r * 0.5, r * 0.24, r);
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(x - r * 0.4, y - r * 0.4, r * 0.18);
}

export function vStar(g: Pen, x: number, y: number, r: number, fill: number, stroke = C.ink): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
  }
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  g.lineStyle(Math.max(2, r * 0.14), stroke, 1);
  g.strokePoints(pts, true, true);
}

/** Pixel-art coin centred at (x, y) with radius r. */
export function drawCoin(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const grid = Math.max(10, Math.min(16, Math.round(r / 1.6)));
  pixelDraw(g, 'coin', { grid, extent: 48, size: r * 2.4, ox: x, oy: y }, (p) => vCoin(p, 0, 0, 20));
}

/** Pixel-art star centred at (x, y) with radius r. */
export function drawStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  fill: number,
  stroke = C.ink,
): void {
  const grid = Math.max(11, Math.min(19, Math.round(r / 1.7)));
  pixelDraw(g, `star|${fill}|${stroke}`, { grid, extent: 46, size: r * 2.3, ox: x, oy: y }, (p) =>
    vStar(p, 0, 0, 20, fill, stroke),
  );
}
