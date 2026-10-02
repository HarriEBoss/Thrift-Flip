import Phaser from 'phaser';
import { computeFrame, type Frame } from '../ui/layout';
import { Button, drawCard, isChainVisible, makeText, type Focusable, type UiHost } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import { t } from '../../i18n';

export interface ModalOpts {
  title?: string;
  w?: number;
  h?: number;
  closable?: boolean;
  closeLabel?: string;
  color?: number;
  onClose?: () => void;
}

/** A centred dialog. Esc (or its labelled Close button) closes it. Content uses panel-centred coords. */
export class Modal extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;
  readonly pw: number;
  readonly ph: number;
  private closed = false;
  readonly closable: boolean;

  constructor(
    readonly host: BaseScene,
    private opts: ModalOpts,
  ) {
    super(host, 0, 0);
    this.closable = opts.closable !== false;
    const frame = host.frame;
    this.pw = opts.w ?? Math.min(640, frame.w - 40);
    this.ph = opts.h ?? Math.min(820, frame.h - 40);
    const dim = host.add.graphics();
    dim.fillStyle(C.ink, 0.55);
    dim.fillRect(-4000, -4000, 8000, 8000);
    const blocker = host.add.zone(0, 0, 8000, 8000).setInteractive();
    blocker.on('pointerup', (_p: Phaser.Input.Pointer, lx: number, ly: number) => {
      // Tap outside the panel closes (when closable).
      const px = lx - 4000;
      const py = ly - 4000;
      if (this.closable && (Math.abs(px) > this.pw / 2 || Math.abs(py) > this.ph / 2)) this.close();
    });
    const panel = host.add.graphics();
    drawCard(panel, -this.pw / 2, -this.ph / 2, this.pw, this.ph, opts.color ?? C.paper, {
      radius: 32,
      shadow: 10,
      stroke: C.ink,
      strokeW: 5,
    });
    const panelZone = host.add.zone(0, 0, this.pw, this.ph).setInteractive();
    panelZone.on(
      'pointerup',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) =>
        e.stopPropagation(),
    );
    this.add([dim, blocker, panel, panelZone]);
    if (opts.title) {
      const ribbon = host.add.graphics();
      drawCard(ribbon, -this.pw / 2 + 40, -this.ph / 2 - 34, this.pw - 80, 72, C.terracotta, {
        radius: 24,
        stroke: C.ink,
        strokeW: 4,
        shine: true,
      });
      const title = makeText(host, 0, -this.ph / 2 + 2, opts.title, FS.h3, C.white, {
        stroke: C.ink,
        strokeW: 6,
      });
      if (title.width > this.pw - 120) title.setScale((this.pw - 120) / title.width);
      this.add([ribbon, title]);
    }
    this.content = host.add.container(0, 0);
    this.add(this.content);
    if (this.closable) {
      const btn = host.mark(
        'close',
        new Button(host, 0, this.ph / 2 - 56, {
          w: 220,
          h: 76,
          label: opts.closeLabel ?? t('common.close'),
          color: C.inkSoft,
          onClick: () => this.close(),
        }),
      );
      this.add(btn);
    }
    host.root.add(this);
    this.relayout(frame);
    this.setScale(this.scaleX * 0.85);
    const target = this.scaleX / 0.85;
    host.tweens.add({ targets: this, scale: target, duration: 180, ease: 'Back.out' });
  }

  relayout(frame: Frame): void {
    this.setPosition(frame.w / 2, frame.h / 2);
    const s = Math.min(1, (frame.w - 24) / this.pw, (frame.h - 60) / (this.ph + 40));
    this.setScale(s);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.host.removeModal(this);
    this.opts.onClose?.();
    this.destroy();
  }

  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Base for every scene: owns the responsive root container, the full-bleed background,
 * modal stack, Esc handling and keyboard focus navigation for menus.
 */
export abstract class BaseScene extends Phaser.Scene implements UiHost {
  root!: Phaser.GameObjects.Container;
  frame!: Frame;
  protected bg!: Phaser.GameObjects.Graphics;
  private focusables: Focusable[] = [];
  private focused: Focusable | null = null;
  private modals: Modal[] = [];
  protected bgColors: { base: number; dots: number } = { base: C.cream, dots: C.cream2 };
  private marks = new Map<string, Phaser.GameObjects.GameObject>();

  /** Registers a test id for e2e tests (no-op in release builds). */
  mark<T extends Phaser.GameObjects.GameObject>(id: string, o: T): T {
    if (__E2E__) this.marks.set(id, o);
    return o;
  }

  /** Device-pixel position of a marked object, if it exists and is visible. */
  markPos(id: string): { x: number; y: number } | null {
    const o = this.marks.get(id) as
      | (Phaser.GameObjects.GameObject & {
          getWorldTransformMatrix?: () => Phaser.GameObjects.Components.TransformMatrix;
        })
      | undefined;
    if (!o || !o.active || !o.getWorldTransformMatrix || !isChainVisible(o)) return null;
    const m = o.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  /** Build the scene's objects (called once per scene start). */
  protected abstract build(data?: unknown): void;
  /** Position everything for the current frame (called on start and on every resize). */
  protected abstract layout(): void;

  create(data?: unknown): void {
    this.marks = new Map();
    this.focusables = [];
    this.modals = [];
    this.focused = null;
    this.bg = this.add.graphics();
    this.root = this.add.container(0, 0);
    this.frame = computeFrame(this.scale.width, this.scale.height);
    this.applyFrame();
    this.build(data);
    this.layout();
    this.scale.on('resize', this.handleResize, this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this);
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
    session.currentScene = this.scene.key;
  }

  private handleResize(): void {
    if (!this.sys.isActive()) return;
    this.frame = computeFrame(this.scale.width, this.scale.height);
    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.applyFrame();
    this.refreshTextResolution(this.children.list);
    this.layout();
    for (const m of this.modals) m.relayout(this.frame);
  }

  private applyFrame(): void {
    const f = this.frame;
    this.root.setPosition(f.x, f.y);
    this.root.setScale(f.scale);
    this.drawBackground();
  }

  protected drawBackground(): void {
    const f = this.frame;
    const g = this.bg;
    g.clear();
    g.fillStyle(this.bgColors.base, 1);
    g.fillRect(0, 0, f.screenW, f.screenH);
    // Soft polka dots in logical units so the pattern scales with the frame.
    const step = 90 * f.scale;
    const r = 9 * f.scale;
    g.fillStyle(this.bgColors.dots, 1);
    let row = 0;
    for (let y = (f.y % step) - step; y < f.screenH + step; y += step, row++) {
      const off = row % 2 ? step / 2 : 0;
      for (let x = (f.x % step) - step + off; x < f.screenW + step; x += step) g.fillCircle(x, y, r);
    }
  }

  private refreshTextResolution(list: Phaser.GameObjects.GameObject[]): void {
    const res = this.textResolution();
    for (const o of list) {
      if (o instanceof Phaser.GameObjects.Text) {
        if (o.style.resolution !== res) o.setResolution(res);
      } else if (o instanceof Phaser.GameObjects.Container) {
        this.refreshTextResolution(o.list);
      }
    }
  }

  // ---- UiHost ----
  textResolution(): number {
    return Math.min(3, Math.max(1, Math.ceil((this.frame?.scale ?? 1) * 4) / 4));
  }
  textScale(): number {
    return session.settings().largeText ? 1.15 : 1;
  }
  uiSfx(kind: 'click' | 'tick'): void {
    session.audio.play(kind);
  }
  registerFocusable(f: Focusable): void {
    this.focusables.push(f);
  }
  unregisterFocusable(f: Focusable): void {
    this.focusables = this.focusables.filter((x) => x !== f);
    if (this.focused === f) this.focused = null;
  }

  // ---- text helper ----
  txt(
    x: number,
    y: number,
    s: string,
    size: number = FS.body,
    color: number = C.ink,
    opts?: Parameters<typeof makeText>[6],
  ): Phaser.GameObjects.Text {
    return makeText(this, x, y, s, size, color, opts);
  }

  // ---- modals ----
  openModal(opts: ModalOpts): Modal {
    const m = new Modal(this, opts);
    this.modals.push(m);
    this.setFocus(null);
    return m;
  }
  removeModal(m: Modal): void {
    this.modals = this.modals.filter((x) => x !== m);
    this.setFocus(null);
  }
  topModal(): Modal | null {
    return this.modals.length ? this.modals[this.modals.length - 1] : null;
  }
  hasModal(): boolean {
    return this.modals.length > 0;
  }
  closeAllModals(): void {
    for (const m of [...this.modals]) m.close();
  }

  /** Esc closes the top modal. We never call preventDefault on Esc. */
  protected onEscape(): boolean {
    const m = this.topModal();
    if (m && m.closable) {
      m.close();
      return true;
    }
    return false;
  }

  // ---- keyboard focus ----
  private availableFocusables(): Focusable[] {
    const top = this.topModal();
    return this.focusables.filter((f) => {
      if (!f.focusable || !f.isAvailable()) return false;
      if (!top) return true;
      let cur = (f as unknown as Phaser.GameObjects.GameObject).parentContainer;
      while (cur) {
        if (cur === top) return true;
        cur = cur.parentContainer;
      }
      return false;
    });
  }

  private setFocus(f: Focusable | null): void {
    this.focused?.setFocused(false);
    this.focused = f;
    f?.setFocused(true);
  }

  private onKey(e: KeyboardEvent): void {
    if (session.paused) return;
    const key = e.key;
    if (key === 'Escape') {
      this.onEscape();
      return;
    }
    const list = this.availableFocusables().sort(
      (a, b) => a.getCenterY() - b.getCenterY() || a.getCenterX() - b.getCenterX(),
    );
    if (!list.length) return;
    const idx = this.focused ? list.indexOf(this.focused) : -1;
    if (key === 'Tab' || key === 'ArrowDown' || key === 'ArrowUp') {
      const dir = key === 'ArrowUp' || (key === 'Tab' && e.shiftKey) ? -1 : 1;
      const next = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
      this.setFocus(list[next]);
      if (key === 'Tab') e.preventDefault();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const f = this.focused;
      if (f && f.nudge) f.nudge(key === 'ArrowLeft' ? -1 : 1);
      else {
        const dir = key === 'ArrowLeft' ? -1 : 1;
        const next = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
        this.setFocus(list[next]);
      }
    } else if (key === 'Enter' || key === ' ') {
      if (this.focused && list.includes(this.focused)) this.focused.activate();
    }
  }

  /** Helper for scenes: is a game object (and its parents) visible. */
  protected shown(o: Phaser.GameObjects.GameObject): boolean {
    return isChainVisible(o);
  }
}
