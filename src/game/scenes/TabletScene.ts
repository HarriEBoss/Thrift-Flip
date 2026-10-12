import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, drawCard, makeText } from '../ui/widgets';
import { iconCoin, iconStar, iconWorkshop } from '../ui/icons';
import { compact } from '../ui/format';
import { C, FS } from '../theme';
import { session } from '../session';
import { BALANCE } from '../../core/data';
import { SKILL_NODES, buyNode, nodeStatus, skillNode, type NodeStatus } from '../../core/skilltree';
import { canPrestige, nextPrestigeTokens } from '../../core/prestige';
import {
  BODIES,
  body as spaceBody,
  colonyCost,
  colonyStatus,
  foundColony,
  hasTech,
  spaceUnlocked,
  sunHarvested,
  type ColonyStatus,
} from '../../core/space';
import { prestigeFx } from '../../core/skilltree';
import { REGIONS, regionsWon } from '../../core/regions';
import {
  bodyPos,
  clipSegment,
  earthOrbit,
  earthPos,
  orbitRadius,
  treeLayout,
  type XY,
} from '../../core/tablet';
import { nodeEffect, openPrestige } from '../ui/prestigeMenus';
import { MAT_COL, openDyson } from '../ui/spaceMenus';
import { t } from '../../i18n';
import { drawGoldBar } from '../ui/goldIcon';
import { goldStore } from '../store';
import { GOLD } from '../../core/gold';
import {
  boostBrand,
  canBoostBrand,
  canGoldReroll,
  canGoldenTools,
  goldReroll,
  goldenTools,
  researchRushCost,
  rushResearch,
  shipMaterial,
  shippableMaterials,
} from '../../core/goldShop';
import { DECOR, buyDecor, decorStatus } from '../../core/decor';
import {
  awayIncome,
  canSkip,
  earlyCost,
  earlyTools,
  skipDays,
  skipStatus,
  unlockEarly,
} from '../../core/timeskip';

type App = 'home' | 'tree' | 'space' | 'gold';
type GoldTab = 'time' | 'boost' | 'space' | 'shop' | 'get';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BEZEL = 24;
const STATUS_H = 46;
const HEADER_H = 74;
const INFO_H = 220;
const ZOOMS = [1, 1.5, 2, 3];

const BRANCH_COL: Record<string, number> = {
  money: C.mustard,
  growth: C.leaf,
  brand: C.pink,
  team: C.purple,
  space: C.sky,
};

const BODY_COL: Record<string, [number, number]> = {
  earth: [0x2f7fd8, 0x4cc65a],
  moon: [0xcfcfd6, 0x9a9aa4],
  mercury: [0xa59c92, 0x6d665f],
  mars: [0xd0542f, 0x8c2f18],
  asteroids: [0x9a7a56, 0x5b4630],
  europa: [0xeee2c8, 0xb07a52],
  titan: [0xe7a84a, 0xa86a1c],
};
const BODY_R: Record<string, number> = {
  earth: 13,
  moon: 6,
  mercury: 8,
  mars: 10,
  asteroids: 7,
  europa: 8,
  titan: 10,
};

/** Blends two colours (k = 0..1). */
function mix(a: number, b: number, k: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * The in-game tablet: a generic device (no real brand) opened over any game screen. A home screen
 * with two apps: the legacy (prestige) tree as a map of linked skills, and an interactive solar
 * system map with every body's colony status. The scene below is paused while it is open.
 */
export class TabletScene extends BaseScene {
  private from = '';
  private app: App = 'home';
  private screenR: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private area: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private info: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private device!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Container;
  private top!: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics | null = null;
  private zoomI = 0;
  private pan = { x: 0, y: 0 };
  private sel: string | null = null;
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  private nodeObjs = new Map<
    string,
    { icon: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text }
  >();
  private bodyObjs = new Map<string, { label: Phaser.GameObjects.Text; hit: Phaser.GameObjects.Zone }>();
  private time0 = 0;
  private note = '';
  private goldTab: GoldTab = 'time';
  private prices: Record<string, string> = {};
  private pricesLoaded = false;
  private tick = 0;

  constructor() {
    super('Tablet');
  }

  protected build(data?: unknown): void {
    const d = (data ?? {}) as { from?: string; app?: App };
    this.from = d.from ?? '';
    this.app = d.app ?? 'home';
    this.zoomI = 0;
    this.pan = { x: 0, y: 0 };
    this.sel = null;
    this.drag = null;
    this.time0 = 0;
    this.note = '';
    this.goldTab = 'time';
    this.pricesLoaded = false;
    this.device = this.add.graphics();
    this.layer = this.add.container(0, 0);
    this.top = this.add.container(0, 0);
    this.root.add([this.device, this.layer, this.top]);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('wheel', this.onWheel, this);
    });
    session.audio.play('whoosh');
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  /** The game behind shows through, dimmed. */
  protected override drawBackground(): void {
    const f = this.frame;
    this.bg.clear();
    this.bg.fillStyle(0x0b0a10, 0.62);
    this.bg.fillRect(0, 0, f.screenW, f.screenH);
  }

  protected layout(): void {
    if (!this.device) return;
    const f = this.frame;
    const dw = f.portrait ? f.w - 32 : Math.min(f.w - 60, (f.h - 32) * 1.55);
    const dh = f.h - 32;
    const dx = (f.w - dw) / 2;
    const dy = 16;
    const d = this.device;
    d.clear();
    // A plain dark tablet: rounded bezel, a little camera, the screen.
    d.fillStyle(0x000000, 0.35);
    d.fillRoundedRect(dx + 6, dy + 10, dw, dh, 52);
    d.fillStyle(0x1c1b22, 1);
    d.fillRoundedRect(dx, dy, dw, dh, 52);
    d.lineStyle(4, 0x3a3842, 1);
    d.strokeRoundedRect(dx + 3, dy + 3, dw - 6, dh - 6, 50);
    const camX = f.portrait ? dx + dw / 2 : dx + BEZEL / 2;
    const camY = f.portrait ? dy + BEZEL / 2 : dy + dh / 2;
    d.fillStyle(0x0d0d12, 1);
    d.fillCircle(camX, camY, 6);
    d.fillStyle(0x2a3b55, 1);
    d.fillCircle(camX, camY, 3);
    this.screenR = { x: dx + BEZEL, y: dy + BEZEL, w: dw - BEZEL * 2, h: dh - BEZEL * 2 };
    this.render();
  }

  /** Called by menus after something changed (also the scene's HUD refresh). */
  refreshHud(): void {
    this.render();
  }

  private render(): void {
    this.layer.removeAll(true);
    this.top.removeAll(true);
    this.nodeObjs.clear();
    this.bodyObjs.clear();
    this.g = null;
    const s = this.screenR;
    const back = this.add.graphics();
    if (this.app === 'home') this.drawWallpaper(back);
    else {
      back.fillStyle(this.app === 'space' ? 0x0a0e1f : 0x1b1530, 1);
      back.fillRoundedRect(s.x, s.y, s.w, s.h, 30);
    }
    this.layer.add(back);
    this.drawStatusBar();
    if (this.app === 'home') this.renderHome();
    else this.renderApp();
  }

  private drawWallpaper(g: Phaser.GameObjects.Graphics): void {
    const s = this.screenR;
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      g.fillStyle(mix(0x3b2a7a, 0x1aa89c, k), 1);
      const y0 = s.y + (s.h * i) / bands;
      if (i === 0) g.fillRoundedRect(s.x, y0, s.w, s.h / bands + 30, { tl: 30, tr: 30, bl: 0, br: 0 });
      else if (i === bands - 1)
        g.fillRoundedRect(s.x, y0 - 1, s.w, s.h / bands + 1, { tl: 0, tr: 0, bl: 30, br: 30 });
      else g.fillRect(s.x, y0 - 1, s.w, s.h / bands + 2);
    }
    // A few stars in the sky.
    g.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 60; i++)
      g.fillCircle(
        s.x + 20 + ((i * 97) % (s.w - 40)),
        s.y + 50 + ((i * 131) % (s.h * 0.5)),
        i % 5 === 0 ? 2 : 1,
      );
  }

  private drawStatusBar(): void {
    const s = this.screenR;
    const st = session.state;
    const y = s.y + STATUS_H / 2;
    const light = C.white;
    this.top.add(
      makeText(this, s.x + 34, y, t('common.day', { n: st.day.n }), FS.tiny, light, { align: 'left' }),
    );
    const name = makeText(this, s.x + s.w / 2, y, st.company, FS.tiny, light);
    if (name.width > s.w * 0.3) name.setScale((s.w * 0.3) / name.width);
    this.top.add(name);
    // Gold Bars.
    const gb = this.add.graphics();
    drawGoldBar(gb, s.x + 150, y, 26);
    this.top.add([gb, makeText(this, s.x + 170, y, String(st.gold.bars), FS.tiny, light, { align: 'left' })]);
    // Battery (always full: it is a game).
    const b = this.add.graphics();
    const bx = s.x + s.w - 150;
    b.lineStyle(2, light, 0.9);
    b.strokeRoundedRect(bx, y - 9, 34, 18, 4);
    b.fillStyle(light, 0.9);
    b.fillRect(bx + 3, y - 6, 28, 12);
    b.fillRect(bx + 35, y - 4, 3, 8);
    this.top.add(b);
    const close = new Button(this, s.x + s.w - 60, y, {
      w: 84,
      h: 40,
      label: '✕',
      color: 0x4a4656,
      fontSize: FS.small,
      onClick: () => this.closeTablet(),
    });
    this.mark('tab_close', close);
    this.top.add(close);
  }

  // ---------------------------------------------------------------- home screen

  private renderHome(): void {
    const s = this.screenR;
    const st = session.state;
    const cx = s.x + s.w / 2;
    const top = s.y + STATUS_H;
    this.top.add([
      makeText(this, cx, top + 90, t('common.day', { n: st.day.n }), FS.h1, C.white, {
        stroke: 0x1b1530,
        strokeW: 6,
      }),
      makeText(
        this,
        cx,
        top + 160,
        st.prestige.n > 0 ? t('tablet.homeSubP', { n: st.prestige.n }) : t('tablet.homeSub'),
        FS.small,
        C.white,
        { wrap: s.w - 80, bold: false },
      ),
    ]);
    const apps: Array<{
      id: App;
      label: string;
      color: number;
      badge: string | null;
      draw: (g: Phaser.GameObjects.Graphics) => void;
    }> = [
      {
        id: 'tree',
        label: t('tablet.appTree'),
        color: 0x6d4fd0,
        badge: canPrestige(st) ? '!' : st.prestige.tokens > 0 ? String(st.prestige.tokens) : null,
        draw: (g) => {
          // Three linked nodes.
          g.lineStyle(6, 0xffffff, 0.9);
          g.lineBetween(0, -24, -26, 22);
          g.lineBetween(0, -24, 26, 22);
          for (const [x, y] of [
            [0, -24],
            [-26, 22],
            [26, 22],
          ]) {
            g.fillStyle(0xffd34d, 1);
            g.fillCircle(x, y, 13);
            g.lineStyle(4, 0x1b1530, 1);
            g.strokeCircle(x, y, 13);
          }
        },
      },
      {
        id: 'space',
        label: t('tablet.appSpace'),
        color: 0x10183a,
        badge: null,
        draw: (g) => {
          g.fillStyle(0xffd34d, 1);
          g.fillCircle(-18, -10, 14);
          g.lineStyle(3, 0xffffff, 0.6);
          g.strokeEllipse(-18, -10, 80, 54);
          g.fillStyle(0xd0542f, 1);
          g.fillCircle(20, 8, 8);
          g.fillStyle(0x2f7fd8, 1);
          g.fillCircle(-40, 4, 7);
        },
      },
      {
        id: 'gold',
        label: t('tablet.appGold'),
        color: 0x8a5a10,
        badge: st.gold.bars > 0 ? String(st.gold.bars) : null,
        draw: (g) => {
          drawGoldBar(g, -8, 14, 62);
          drawGoldBar(g, 12, -14, 62);
        },
      },
    ];
    const size = Math.min(160, (s.w - 140) / apps.length);
    apps.forEach((a, i) => {
      const x = cx + (i - (apps.length - 1) / 2) * (size + 40);
      const y = s.y + s.h * 0.55;
      const btn = new Button(this, x, y, {
        w: size,
        h: size,
        label: '',
        color: a.color,
        icon: (g) => {
          g.setScale(size / 130);
          a.draw(g);
        },
        onClick: () => this.openApp(a.id),
      });
      btn.setBadge(a.badge);
      this.mark(`app_${a.id}`, btn);
      this.top.add([
        btn,
        makeText(this, x, y + size / 2 + 30, a.label, FS.small, C.white, { stroke: 0x1b1530, strokeW: 5 }),
      ]);
    });
    // Home indicator.
    const bar = this.add.graphics();
    bar.fillStyle(0xffffff, 0.7);
    bar.fillRoundedRect(cx - 70, s.y + s.h - 18, 140, 6, 3);
    this.top.add(bar);
  }

  private openApp(app: App): void {
    this.app = app;
    this.zoomI = 0;
    this.pan = { x: 0, y: 0 };
    this.sel = null;
    session.audio.play('pop');
    this.render();
  }

  // ---------------------------------------------------------------- apps

  private renderApp(): void {
    const s = this.screenR;
    const st = session.state;
    const hy = s.y + STATUS_H + HEADER_H / 2;
    const head = this.add.graphics();
    head.fillStyle(0xffffff, 0.08);
    head.fillRect(s.x, s.y + STATUS_H, s.w, HEADER_H);
    this.top.add(head);
    const backBtn = new Button(this, s.x + 70, hy, {
      w: 116,
      h: 54,
      label: `‹ ${t('tablet.home')}`,
      color: 0x4a4656,
      fontSize: FS.tiny,
      onClick: () => this.openApp('home'),
    });
    this.mark('tab_back', backBtn);
    const title =
      this.app === 'tree'
        ? t('tablet.appTree')
        : this.app === 'gold'
          ? t('tablet.appGold')
          : t('tablet.appSpace');
    this.top.add([backBtn, makeText(this, s.x + s.w / 2, hy, title, FS.h3, C.white)]);
    if (this.app === 'tree') {
      const icon = this.add.graphics();
      iconStar(icon, 34);
      icon.setPosition(s.x + s.w - 120, hy);
      this.top.add([
        icon,
        makeText(this, s.x + s.w - 98, hy, String(st.prestige.tokens), FS.h3, C.white, { align: 'left' }),
      ]);
    } else if (this.app === 'gold') {
      const icon = this.add.graphics();
      drawGoldBar(icon, s.x + s.w - 128, hy, 38);
      this.top.add([
        icon,
        makeText(this, s.x + s.w - 100, hy, String(st.gold.bars), FS.h3, C.white, { align: 'left' }),
      ]);
      this.renderGold(s.y + STATUS_H + HEADER_H + 10);
      return;
    } else {
      this.top.add(
        makeText(this, s.x + s.w - 30, hy, `☀ ${Math.round(sunHarvested(st) * 100)}%`, FS.small, C.mustard, {
          align: 'right',
        }),
      );
    }
    const ay = s.y + STATUS_H + HEADER_H + 6;
    const bottom = s.y + s.h - 12;
    if (s.w > s.h) {
      // Wide screen: the info panel sits beside the map.
      const iw = Math.min(360, s.w * 0.36);
      this.info = { x: s.x + s.w - iw - 12, y: ay + 4, w: iw, h: bottom - ay - 4 };
      this.area = { x: s.x + 10, y: ay, w: s.w - iw - 34, h: bottom - ay };
    } else {
      this.info = { x: s.x + 12, y: bottom - INFO_H, w: s.w - 24, h: INFO_H };
      this.area = { x: s.x + 10, y: ay, w: s.w - 20, h: bottom - INFO_H - ay - 8 };
    }
    this.g = this.add.graphics();
    this.layer.add(this.g);
    if (this.app === 'tree') this.buildTreeObjects();
    else this.buildSpaceObjects();
    // Zoom buttons over the map.
    const zx = this.area.x + this.area.w - 40;
    for (const [i, lab] of [
      [0, '+'],
      [1, '−'],
    ] as const) {
      const zb = new Button(this, zx, this.area.y + 36 + i * 64, {
        w: 56,
        h: 56,
        label: lab,
        color: 0x4a4656,
        fontSize: FS.h3,
        onClick: () => this.zoomBy(i === 0 ? 1 : -1),
      });
      this.mark(i === 0 ? 'tzoom_in' : 'tzoom_out', zb);
      this.top.add(zb);
    }
    this.drawMap();
    this.renderInfo();
  }

  private zoom(): number {
    return ZOOMS[this.zoomI];
  }

  private zoomBy(d: number): void {
    const next = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomI + d));
    if (next === this.zoomI) return;
    const k = ZOOMS[next] / ZOOMS[this.zoomI];
    this.zoomI = next;
    this.pan = { x: this.pan.x * k, y: this.pan.y * k };
    this.clampPan();
    session.audio.play('tick');
    this.drawMap();
  }

  private clampPan(): void {
    const z = this.zoom();
    const mx = (this.area.w * (z - 1)) / 2 + (z > 1 ? 40 : 0);
    const my = (this.area.h * (z - 1)) / 2 + (z > 1 ? 40 : 0);
    this.pan.x = Math.max(-mx, Math.min(mx, this.pan.x));
    this.pan.y = Math.max(-my, Math.min(my, this.pan.y));
  }

  /** Map coordinates (laid out at zoom 1 in the area) to logical screen coordinates. */
  private toScreen(p: XY): XY {
    const a = this.area;
    const z = this.zoom();
    return {
      x: a.x + a.w / 2 + (p.x - a.w / 2) * z + this.pan.x,
      y: a.y + a.h / 2 + (p.y - a.h / 2) * z + this.pan.y,
    };
  }

  private inArea(p: XY, r = 0): boolean {
    const a = this.area;
    return p.x - r >= a.x && p.x + r <= a.x + a.w && p.y - r >= a.y && p.y + r <= a.y + a.h;
  }

  private drawMap(): void {
    if (this.app === 'tree') this.drawTree();
    else if (this.app === 'space') this.drawSpace();
  }

  private line(a: XY, b: XY, w: number, col: number, alpha: number): void {
    const c = clipSegment(a, b, this.area);
    if (!c || !this.g) return;
    this.g.lineStyle(w, col, alpha);
    this.g.lineBetween(c[0].x, c[0].y, c[1].x, c[1].y);
  }

  // ---------------------------------------------------------------- legacy tree app

  private buildTreeObjects(): void {
    for (const n of SKILL_NODES) {
      const icon = this.add.graphics();
      const cost = makeText(this, 0, 0, String(n.cost), FS.tiny, C.ink, { stroke: C.white, strokeW: 4 });
      const name = makeText(this, 0, 0, t(`node.${n.id}`), FS.tiny, C.white, {
        stroke: 0x1b1530,
        strokeW: 4,
      });
      this.layer.add([icon, name, cost]);
      this.mark(`tnode_${n.id}`, icon);
      this.nodeObjs.set(n.id, { icon, cost, name });
    }
  }

  private drawTree(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const st = session.state;
    const L = treeLayout(SKILL_NODES, this.area.w, this.area.h);
    const z = this.zoom();
    const r = Math.min(64, L.r * z);
    const P = (id: string) => this.toScreen(L.pos[id]);
    for (const [a, b] of L.edges) {
      const owned = st.prestige.nodes.includes(a);
      const both = owned && st.prestige.nodes.includes(b);
      this.line(P(a), P(b), both ? 8 : 5, both ? 0xffd34d : owned ? 0xffffff : 0x6a6480, both ? 1 : 0.7);
    }
    for (const n of SKILL_NODES) {
      const p = P(n.id);
      const o = this.nodeObjs.get(n.id)!;
      const vis = this.inArea(p, r);
      const stt = nodeStatus(st, n);
      o.icon.setVisible(vis);
      o.cost.setVisible(vis && stt !== 'owned');
      o.name.setVisible(vis && r >= 30);
      if (!vis) continue;
      const col = BRANCH_COL[n.branch] ?? C.teal;
      if (n.id === this.sel) {
        g.fillStyle(0xffffff, 0.35);
        g.fillCircle(p.x, p.y, r + 12);
      }
      if (stt === 'available') {
        g.lineStyle(4, 0xffd34d, 1);
        g.strokeCircle(p.x, p.y, r + 7);
      }
      g.fillStyle(0x000000, 0.4);
      g.fillCircle(p.x + 3, p.y + 4, r);
      g.fillStyle(stt === 'owned' ? col : stt === 'locked' ? 0x3a3648 : 0xf4f1e8, 1);
      g.fillCircle(p.x, p.y, r);
      g.lineStyle(4, stt === 'owned' ? 0xffffff : 0x0f0d16, 1);
      g.strokeCircle(p.x, p.y, r);
      o.icon.clear();
      this.nodeIcon(o.icon, n.branch, Math.round(r * 1.1), stt);
      o.icon.setPosition(p.x, p.y);
      o.cost.setPosition(p.x + r * 0.8, p.y - r * 0.8);
      o.name.setPosition(p.x, p.y + r + 16);
      if (o.name.width > r * 3.4) o.name.setScale((r * 3.4) / o.name.width);
    }
  }

  private nodeIcon(g: Phaser.GameObjects.Graphics, branch: string, size: number, st: NodeStatus): void {
    if (branch === 'money') iconCoin(g, size);
    else
      iconWorkshop(
        g,
        { growth: 'reselling', brand: 'marketing', team: 'manager', space: 'space' }[branch] ?? 'research',
        size,
      );
    g.setAlpha(st === 'locked' ? 0.45 : 1);
  }

  private pickTree(p: XY): string | null {
    const L = treeLayout(SKILL_NODES, this.area.w, this.area.h);
    const r = Math.min(64, L.r * this.zoom());
    let best: string | null = null;
    let bd = Math.max(30, r * 1.3);
    for (const n of SKILL_NODES) {
      const q = this.toScreen(L.pos[n.id]);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- solar system app

  private rmax(): number {
    return Math.min(this.area.w, this.area.h) / 2 - 34;
  }

  private buildSpaceObjects(): void {
    const ids = ['sun', 'earth', ...BODIES.map((b) => b.id)];
    for (const id of ids) {
      const label = makeText(
        this,
        0,
        0,
        id === 'sun' ? t('tablet.sun') : id === 'earth' ? t('tablet.earth') : t(`body.${id}`),
        FS.tiny,
        C.white,
        {
          stroke: 0x0a0e1f,
          strokeW: 4,
        },
      );
      const hit = this.add.zone(0, 0, 10, 10);
      this.layer.add([label, hit]);
      this.mark(`tbody_${id}`, hit);
      this.bodyObjs.set(id, { label, hit });
    }
    if (!spaceUnlocked(session.state)) {
      const a = this.area;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.55);
      g.fillRoundedRect(a.x + 20, a.y + 16, a.w - 120, 70, 16);
      this.top.add([
        g,
        makeText(this, a.x + 20 + (a.w - 120) / 2, a.y + 51, t('tablet.spaceLocked'), FS.tiny, C.white, {
          wrap: a.w - 150,
          bold: false,
        }),
      ]);
    }
  }

  private mapCenter(): XY {
    return this.toScreen({ x: this.area.w / 2, y: this.area.h / 2 });
  }

  private posOf(id: string): XY {
    const rm = this.rmax();
    const tt = session.settings().reducedMotion ? 0 : this.time0;
    const seed = session.state.seed;
    const p = id === 'earth' ? earthPos(rm, seed, tt) : bodyPos(spaceBody(id)!, rm, seed, tt);
    const z = this.zoom();
    const c = this.mapCenter();
    return { x: c.x + p.x * z, y: c.y + p.y * z };
  }

  private bodyStatus(id: string): ColonyStatus | 'home' {
    if (id === 'earth') return 'home';
    return colonyStatus(session.state, spaceBody(id)!);
  }

  private drawSpace(): void {
    const g = this.g;
    if (!g) return;
    g.clear();
    const st = session.state;
    const z = this.zoom();
    const rm = this.rmax();
    const c = this.mapCenter();
    // Orbits.
    const orbit = (rr: number, col: number, alpha: number, w = 2) => {
      const n = 120;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        if (i % 2 && alpha < 0.3) continue;
        this.line(
          { x: c.x + Math.cos(a0) * rr, y: c.y + Math.sin(a0) * rr },
          { x: c.x + Math.cos(a1) * rr, y: c.y + Math.sin(a1) * rr },
          w,
          col,
          alpha,
        );
      }
    };
    orbit(orbitRadius(earthOrbit(), rm) * z, 0x4fb6ff, 0.45);
    for (const b of BODIES) {
      if (b.around) continue;
      const stt = colonyStatus(st, b);
      const rr = orbitRadius(b.orbit, rm) * z;
      if (b.id === 'asteroids') {
        // The belt: a ring of rocks.
        for (let i = 0; i < 140; i++) {
          const a = (i / 140) * Math.PI * 2 + (i % 3) * 0.01;
          const jr = rr + (((i * 37) % 11) - 5) * 1.6 * z;
          const p = { x: c.x + Math.cos(a) * jr, y: c.y + Math.sin(a) * jr };
          if (!this.inArea(p, 2)) continue;
          g.fillStyle(0x8a7a66, 0.8);
          g.fillCircle(p.x, p.y, 1.6 * Math.min(2, z));
        }
      }
      orbit(rr, stt === 'founded' ? 0x4cc65a : 0xffffff, stt === 'founded' ? 0.6 : 0.18);
    }
    // The Sun and its Dyson swarm.
    const sr = Math.max(16, rm * 0.09) * z;
    if (this.inArea(c, sr)) {
      g.fillStyle(0xffd34d, 0.18);
      g.fillCircle(c.x, c.y, sr * 2);
      g.fillStyle(0xffc23d, 1);
      g.fillCircle(c.x, c.y, sr);
      g.fillStyle(0xfff1b8, 1);
      g.fillCircle(c.x - sr * 0.25, c.y - sr * 0.25, sr * 0.45);
      const stages = BALANCE.empire.space.dyson.stages;
      for (let i = 0; i < stages; i++) {
        const a0 = -Math.PI / 2 + (i / stages) * Math.PI * 2 + 0.06;
        const a1 = -Math.PI / 2 + ((i + 1) / stages) * Math.PI * 2 - 0.06;
        g.lineStyle(Math.max(4, sr * 0.28), i < st.space.dyson ? C.teal : 0x3a4054, 1);
        g.beginPath();
        g.arc(c.x, c.y, sr * 1.45, a0, a1, false);
        g.strokePath();
      }
      if (this.sel === 'sun') {
        g.lineStyle(3, 0xffffff, 0.9);
        g.strokeCircle(c.x, c.y, sr * 1.9);
      }
    }
    this.placeBody('sun', c, sr * 1.9, true);
    // Earth (home) and the bodies.
    for (const id of ['earth', ...BODIES.map((b) => b.id)]) {
      const p = this.posOf(id);
      const r = (BODY_R[id] ?? 8) * Math.max(1, rm / 300) * Math.min(2.2, z);
      const vis = this.inArea(p, r + 6);
      this.placeBody(id, p, r + 14, vis);
      if (!vis) continue;
      const stt = this.bodyStatus(id);
      const [c0, c1] = BODY_COL[id] ?? [0xffffff, 0x999999];
      const locked = stt === 'locked' || stt === 'needs';
      if (id === 'moon') {
        const e = this.posOf('earth');
        g.lineStyle(1, 0xffffff, 0.25);
        g.strokeCircle(e.x, e.y, Math.hypot(p.x - e.x, p.y - e.y));
      }
      if (stt === 'available') {
        g.lineStyle(4, 0xffd34d, 0.6 + 0.4 * Math.sin(this.time0 * 4));
        g.strokeCircle(p.x, p.y, r + 9);
      }
      if (stt === 'founded' || stt === 'home') {
        g.fillStyle(0x4cc65a, 0.25);
        g.fillCircle(p.x, p.y, r + 9);
      }
      if (id === this.sel) {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeCircle(p.x, p.y, r + 14);
      }
      g.fillStyle(c1, locked ? 0.55 : 1);
      g.fillCircle(p.x, p.y, r);
      g.fillStyle(c0, locked ? 0.55 : 1);
      g.fillCircle(p.x - r * 0.18, p.y - r * 0.18, r * 0.78);
      if (id === 'earth') {
        g.fillStyle(0x4cc65a, 1);
        g.fillCircle(p.x + r * 0.2, p.y - r * 0.1, r * 0.35);
        g.fillCircle(p.x - r * 0.3, p.y + r * 0.3, r * 0.25);
      }
      if (stt === 'founded' || stt === 'home') {
        // A little flag: the company is here.
        g.lineStyle(2, 0xffffff, 1);
        g.lineBetween(p.x + r * 0.6, p.y - r * 0.6, p.x + r * 0.6, p.y - r * 0.6 - 16);
        g.fillStyle(C.terracotta, 1);
        g.fillTriangle(
          p.x + r * 0.6,
          p.y - r * 0.6 - 16,
          p.x + r * 0.6 + 12,
          p.y - r * 0.6 - 12,
          p.x + r * 0.6,
          p.y - r * 0.6 - 8,
        );
      }
      if (locked) {
        // Padlock.
        g.fillStyle(0x0a0e1f, 0.9);
        g.fillRoundedRect(p.x - 6, p.y - 2, 12, 9, 2);
        g.lineStyle(2, 0x0a0e1f, 0.9);
        g.strokeCircle(p.x, p.y - 3, 4);
      }
      const lab = this.bodyObjs.get(id)!.label;
      lab.setPosition(p.x, p.y + r + 14);
      lab.setAlpha(locked ? 0.6 : 1);
    }
  }

  private placeBody(id: string, p: XY, r: number, vis: boolean): void {
    const o = this.bodyObjs.get(id);
    if (!o) return;
    o.hit
      .setPosition(p.x, p.y)
      .setSize(r * 2, r * 2)
      .setVisible(vis);
    // The Sun needs no label; the Moon's shows once zoomed in (it sits right by Earth).
    const quiet = (id === 'sun' || id === 'moon') && this.zoomI === 0 && this.sel !== id;
    if (id === 'sun') o.label.setPosition(p.x, p.y + r + 4);
    o.label.setVisible(vis && !quiet);
  }

  private pickSpace(p: XY): string | null {
    let best: string | null = null;
    let bd = Infinity;
    for (const [id, o] of this.bodyObjs) {
      if (!o.hit.visible) continue;
      const d = Math.hypot(o.hit.x - p.x, o.hit.y - p.y);
      const reach = Math.max(30, o.hit.width / 2);
      if (d < reach && d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- info panel

  private renderInfo(): void {
    const P = this.info;
    const st = session.state;
    const side = P.h > P.w * 0.8;
    const panel = this.add.container(0, 0);
    const g = this.add.graphics();
    drawCard(g, P.x, P.y, P.w, P.h, C.paper, { radius: 22, stroke: C.ink, strokeW: 3, shadow: 0 });
    panel.add(g);
    const lx = P.x + 24;
    const wrap = side ? P.w - 48 : P.w - 290;
    let cy = P.y + 22;
    /** Adds a line of text under the previous one. */
    const text = (str: string, size: number, color: number, bold = true, dx = 0) => {
      const tx = makeText(this, lx + dx, cy, str, size, color, { align: 'left', wrap: wrap - dx, bold });
      tx.setOrigin(0, 0);
      panel.add(tx);
      cy += tx.height * tx.scaleY + 10;
      return tx;
    };
    const button = (
      label: string,
      color: number,
      ok: boolean,
      id: string,
      onClick: () => void,
      icon?: (g: Phaser.GameObjects.Graphics, sz: number) => void,
    ) => {
      const bx = side ? P.x + P.w / 2 : P.x + P.w - 130;
      const by = side ? P.y + P.h - 56 : P.y + P.h / 2;
      const b = new Button(this, bx, by, {
        w: side ? Math.min(240, P.w - 40) : 210,
        h: 76,
        label,
        color: ok ? color : C.inkSoft,
        fontSize: FS.small,
        icon,
        onClick,
      });
      b.setEnabled(ok);
      this.mark(id, b);
      panel.add(b);
    };
    if (this.app === 'tree') {
      const n = this.sel ? skillNode(this.sel) : null;
      if (!n) {
        text(t('tablet.treeHint'), FS.small, C.ink);
        text(t('tablet.treeTokens', { n: st.prestige.tokens, p: st.prestige.n }), FS.tiny, C.inkSoft, false);
        if (canPrestige(st))
          button(t('prestige.open', { n: nextPrestigeTokens(st) }), C.purple, true, 'tab_prestige', () =>
            openPrestige(this),
          );
      } else {
        const stt = nodeStatus(st, n);
        text(t(`node.${n.id}`), FS.h3, C.ink);
        text(nodeEffect(n), FS.tiny, C.leafDark, false);
        const missing = n.req.filter((r) => !st.prestige.nodes.includes(r));
        const note =
          stt === 'owned'
            ? t('tablet.owned')
            : stt === 'locked'
              ? t('tree.needs', { list: missing.map((r) => t(`node.${r}`)).join(', ') })
              : stt === 'short'
                ? t('tablet.short', { n: n.cost - st.prestige.tokens })
                : t('tablet.canBuy');
        text(note, FS.tiny, stt === 'locked' || stt === 'short' ? C.terracottaDark : C.inkSoft, false);
        button(
          stt === 'owned' ? t('common.owned') : String(n.cost),
          C.purple,
          stt === 'available',
          'tbuy',
          () => {
            if (!buyNode(st, n.id)) return;
            session.audio.play('levelup');
            session.haptic('success');
            void session.save(true);
            this.render();
          },
          stt === 'owned' ? undefined : (gr, sz) => iconStar(gr, sz),
        );
      }
    } else {
      const id = this.sel;
      if (!id) {
        text(t('tablet.spaceHint'), FS.small, C.ink);
        text(
          t('tablet.spaceCount', { n: st.space.colonies.length, total: BODIES.length }),
          FS.tiny,
          C.inkSoft,
          false,
        );
      } else if (id === 'sun') {
        text(t('tablet.sun'), FS.h3, C.ink);
        text(
          t('tablet.sunInfo', {
            n: st.space.dyson,
            total: BALANCE.empire.space.dyson.stages,
            pct: Math.round(sunHarvested(st) * 100),
          }),
          FS.tiny,
          C.inkSoft,
          false,
        );
        button(t('tablet.openDyson'), C.mustardDark, spaceUnlocked(st), 'tdyson', () =>
          openDyson(this, () => this.render()),
        );
      } else if (id === 'earth') {
        text(t('tablet.earth'), FS.h3, C.ink);
        text(
          t('tablet.earthInfo', { company: st.company, n: regionsWon(st), total: REGIONS.length }),
          FS.tiny,
          C.inkSoft,
          false,
        );
      } else {
        const b = spaceBody(id)!;
        const stt = colonyStatus(st, b);
        const rate = Math.round(b.rate * (1 + prestigeFx(st).harvest));
        text(t(`body.${id}`), FS.h3, C.ink);
        const dot = this.add.graphics();
        dot.fillStyle(C.ink, 1);
        dot.fillCircle(lx + 10, cy + 14, 11);
        dot.fillStyle(MAT_COL[b.material] ?? C.white, 1);
        dot.fillCircle(lx + 10, cy + 14, 8);
        panel.add(dot);
        text(
          t('tablet.harvest', { mat: t(`mat.${b.material}`), n: rate, coins: compact(b.income) }),
          FS.tiny,
          C.ink,
          false,
          30,
        );
        const needs = [
          ...b.techs.filter((x) => !hasTech(st, x)).map((x) => t(`tech.${x}`)),
          ...(b.body && !st.space.colonies.includes(b.body) ? [t(`body.${b.body}`)] : []),
        ];
        const note =
          stt === 'founded'
            ? t('tablet.founded', { company: st.company, n: st.space.mat[b.material] ?? 0 })
            : stt === 'locked'
              ? t('tablet.spaceLocked')
              : stt === 'needs'
                ? t('space.needs', { list: needs.join(', ') })
                : t('tablet.colonyCost', { n: compact(colonyCost(st, b)) });
        text(note, FS.tiny, stt === 'needs' || stt === 'locked' ? C.terracottaDark : C.inkSoft, false);
        if (stt !== 'founded')
          button(
            compact(colonyCost(st, b)),
            C.leaf,
            stt === 'available',
            'tfound',
            () => {
              if (!foundColony(st, id)) return;
              session.audio.play('levelup');
              session.haptic('success');
              void session.save(true);
              this.render();
            },
            (gr, sz) => iconCoin(gr, sz),
          );
      }
    }
    this.top.add(panel);
  }

  // ---------------------------------------------------------------- Gold Bars app

  /**
   * Everything Gold Bars buy, in tabs: Time (skips, finish research), Boosts (golden tools, new
   * stock, brand), Space (cargo runs of colony materials), Shop (tools early, golden decorations)
   * and Get (packs where there is a store, else how to earn them).
   */
  private renderGold(y0: number): void {
    const s = this.screenR;
    const st = session.state;
    const store = goldStore();
    const wide = s.w > s.h;
    const bottom = s.y + s.h - 14;
    const pad = 12;
    // Tabs.
    const tabs: Array<{ id: GoldTab; label: string }> = [
      { id: 'time', label: t('gold.tabTime') },
      { id: 'boost', label: t('gold.tabBoost') },
      { id: 'space', label: t('gold.tabSpace') },
      { id: 'shop', label: t('gold.tabShop') },
      { id: 'get', label: t('gold.tabGet') },
    ];
    const tw = (s.w - pad * 2) / tabs.length;
    tabs.forEach((tb, i) => {
      const b = new Button(this, s.x + pad + tw / 2 + i * tw, y0 + 30, {
        w: tw - 8,
        h: 56,
        label: tb.label,
        color: tb.id === this.goldTab ? C.mustardDark : 0x4a4656,
        fontSize: FS.tiny,
        onClick: () => {
          this.goldTab = tb.id;
          session.audio.play('tick');
          this.render();
        },
      });
      this.mark(`gtab_${tb.id}`, b);
      this.top.add(b);
    });
    const top = y0 + 70;
    /** One card filling the area, or two (side by side when wide, stacked when tall). */
    const areas = (n: 1 | 2, split = 0.5): Rect[] => {
      if (n === 1) return [{ x: s.x + pad, y: top, w: s.w - pad * 2, h: bottom - top }];
      if (wide) {
        const w = (s.w - pad * 3) / 2;
        return [
          { x: s.x + pad, y: top, w, h: bottom - top },
          { x: s.x + pad * 2 + w, y: top, w, h: bottom - top },
        ];
      }
      const h = bottom - top - pad;
      return [
        { x: s.x + pad, y: top, w: s.w - pad * 2, h: h * split },
        { x: s.x + pad, y: top + h * split + pad, w: s.w - pad * 2, h: h * (1 - split) },
      ];
    };
    const card = (r: Rect, title: string) => {
      const g = this.add.graphics();
      drawCard(g, r.x, r.y, r.w, r.h, C.paper, { radius: 20, stroke: C.ink, strokeW: 3, shadow: 0 });
      this.top.add([g, makeText(this, r.x + 22, r.y + 32, title, FS.h3, C.ink, { align: 'left' })]);
      return r.y + 60;
    };
    const para = (r: Rect, y: number, str: string, color: number = C.inkSoft) => {
      const tx = makeText(this, r.x + 22, y, str, FS.tiny, color, {
        align: 'left',
        wrap: r.w - 44,
        bold: false,
      });
      tx.setOrigin(0, 0);
      this.top.add(tx);
      return y + tx.height + 10;
    };
    type Item = { id: string; label: string; sub: string; ok: boolean; color: number; on: () => void };
    /** Buttons in a grid of `cols` columns. */
    const grid = (r: Rect, y: number, list: Item[], cols: number, bh = 80) => {
      const bw = (r.w - 44 - (cols - 1) * 12) / cols;
      list.forEach((it, i) => {
        const c = i % cols;
        const row = Math.floor(i / cols);
        const b = new Button(this, r.x + 22 + bw / 2 + c * (bw + 12), y + bh / 2 + row * (bh + 10), {
          w: bw,
          h: bh,
          label: it.label,
          sub: it.sub,
          color: it.ok ? it.color : C.inkSoft,
          fontSize: FS.small,
          onClick: it.on,
        });
        b.setEnabled(it.ok);
        this.mark(it.id, b);
        this.top.add(b);
      });
    };
    const done = (note: string) => {
      session.audio.play('levelup');
      session.haptic('success');
      void session.save(true);
      this.note = note;
      this.render();
    };
    const bars = (n: number) => t('gold.bars', { n });
    if (this.goldTab === 'time') {
      const [a, b] = areas(2, 0.55);
      let y = card(a, t('gold.skipTitle'));
      y = para(
        a,
        y,
        !canSkip(st)
          ? t('gold.skipBusy')
          : awayIncome(st) > 0
            ? t('gold.skipText', { n: compact(awayIncome(st)) })
            : t('gold.skipNothing'),
        canSkip(st) ? C.inkSoft : C.terracottaDark,
      );
      grid(
        a,
        y,
        GOLD.skips.map((k) => ({
          id: `skip_${k.id}`,
          label: k.days === 1 ? t('gold.day1') : t('gold.days', { n: k.days }),
          sub: bars(k.cost),
          ok: skipStatus(st, k.id) === 'available',
          color: C.teal,
          on: () => this.doSkip(k.id),
        })),
        wide ? 1 : 3,
        wide ? 64 : 84,
      );
      y = card(b, t('gold.rushTitle'));
      const r = st.space.research;
      const cost = researchRushCost(st);
      y = para(b, y, r ? t('gold.rushText', { tech: t(`tech.${r.id}`), n: r.left }) : t('gold.rushNone'));
      if (r && cost !== null)
        grid(
          b,
          y,
          [
            {
              id: 'gold_rush',
              label: t('gold.rushGo'),
              sub: bars(cost),
              ok: st.gold.bars >= cost,
              color: C.teal,
              on: () => {
                const id = rushResearch(st);
                if (id) done(t('space.researched', { tech: t(`tech.${id}`) }));
              },
            },
          ],
          1,
        );
    } else if (this.goldTab === 'boost') {
      const [a] = areas(1);
      const y = para(a, card(a, t('gold.boostTitle')), t('gold.boostText'));
      const S = GOLD.shop;
      grid(
        a,
        y,
        [
          {
            id: 'gold_golden',
            label: t('gold.golden'),
            sub: st.day.premiumOnce ? t('gold.goldenOn') : `${t('gold.goldenSub')} · ${bars(S.golden)}`,
            ok: canGoldenTools(st),
            color: C.mustardDark,
            on: () => goldenTools(st) && done(t('mg.goldenOn')),
          },
          {
            id: 'gold_reroll',
            label: t('gold.reroll'),
            sub: `${t('gold.rerollSub')} · ${bars(S.reroll)}`,
            ok: canGoldReroll(st),
            color: C.teal,
            on: () => {
              if (!goldReroll(st)) return;
              // The market behind shows the old stock: open the day afresh at the market.
              session.skipNote = t('gold.rerolled');
              this.restartAtMarket();
            },
          },
          {
            id: 'gold_brand',
            label: t('gold.brand', { n: S.brand.n }),
            sub: `${t('gold.brandSub')} · ${bars(S.brand.cost)}`,
            ok: canBoostBrand(st),
            color: C.pink,
            on: () => boostBrand(st) && done(t('gold.brandDone', { n: S.brand.n })),
          },
        ],
        wide ? 3 : 1,
        wide ? 110 : 92,
      );
    } else if (this.goldTab === 'space') {
      const [a] = areas(1);
      const mats = shippableMaterials(st);
      const S = GOLD.shop.material;
      const y = para(
        a,
        card(a, t('gold.shipTitle')),
        mats.length ? t('gold.shipText', { n: S.n }) : t('gold.shipNone'),
      );
      grid(
        a,
        y,
        mats.map((m) => ({
          id: `ship_${m}`,
          label: `+${S.n} ${t(`mat.${m}`)}`,
          sub: `${t('gold.inStock', { n: st.space.mat[m] ?? 0 })} · ${bars(S.cost)}`,
          ok: st.gold.bars >= S.cost,
          color: C.purple,
          on: () => shipMaterial(st, m) && done(t('gold.shipped', { n: S.n, mat: t(`mat.${m}`) })),
        })),
        wide ? 3 : 2,
        84,
      );
    } else if (this.goldTab === 'shop') {
      const [a, b] = areas(2, 0.58);
      const tools = earlyTools(st)
        .sort((x, z) => earlyCost(st, x) - earlyCost(st, z))
        .slice(0, 3);
      let y = para(
        a,
        card(a, t('gold.earlyTitle')),
        tools.length ? t('gold.earlyText') : t('gold.earlyNone'),
      );
      grid(
        a,
        y,
        tools.map((u) => ({
          id: `early_${u.id}`,
          label: t(`up.${u.id}`),
          sub: t('gold.earlySub', { n: earlyCost(st, u), tier: t(`tier.${BALANCE.tiers[u.tier].id}`) }),
          ok: st.gold.bars >= earlyCost(st, u),
          color: C.purple,
          on: () => unlockEarly(st, u.id) && done(t('gold.gotTool', { tool: t(`up.${u.id}`) })),
        })),
        1,
        wide ? 66 : 70,
      );
      y = para(b, card(b, t('gold.decorTitle')), t('gold.decorText'));
      grid(
        b,
        y,
        DECOR.filter((d) => d.gold).map((d) => {
          const ds = decorStatus(st, d);
          return {
            id: `gdecor_${d.id}`,
            label: t(`decor.${d.id}`),
            sub: ds === 'owned' ? t('common.owned') : bars(d.gold ?? 0),
            ok: ds === 'available',
            color: C.mustardDark,
            on: () => buyDecor(st, d.id) && done(t('gold.decorDone', { item: t(`decor.${d.id}`) })),
          };
        }),
        wide ? 1 : 2,
        wide ? 66 : 80,
      );
    } else {
      const [a] = areas(1);
      const y = card(a, t('gold.getTitle'));
      if (!store.available) para(a, y, t('gold.earn'));
      else {
        const y2 = para(a, y, store.pretend ? t('gold.pretend') : t('gold.buyText'));
        grid(
          a,
          y2,
          store.goldPacks().map((p) => ({
            id: `pack_${p.id}`,
            label: `+${p.gold}`,
            sub: this.prices[p.id] ?? p.price,
            ok: true,
            color: C.mustardDark,
            on: () => void this.buyPack(p.id),
          })),
          3,
          96,
        );
        if (!this.pricesLoaded) {
          this.pricesLoaded = true;
          void store.prices().then((pr) => {
            this.prices = pr;
            if (this.app === 'gold' && this.sys.isActive()) this.render();
          });
        }
      }
    }
    if (this.note) {
      const n = makeText(this, s.x + s.w / 2, top - 6, this.note, FS.tiny, C.white, {
        stroke: 0x1b1530,
        strokeW: 5,
      });
      this.top.add(n);
      this.note = '';
    }
  }

  /** The screen behind is out of date (days passed, new stock): start the day afresh at the market. */
  private restartAtMarket(): void {
    for (const sc of this.game.scene.getScenes(false))
      if (sc !== this && sc.scene.key !== 'Market' && (sc.sys.isActive() || sc.sys.isPaused()))
        sc.scene.stop();
    this.scene.start('Market');
  }

  private async buyPack(id: string): Promise<void> {
    const store = goldStore();
    const p = store.goldPacks().find((x) => x.id === id);
    if (!p) return;
    if (store.pretend) {
      // Playtest: say clearly that nothing is paid, and ask first.
      const m = this.openModal({ title: t('gold.pretendTitle'), w: 600, h: 520 });
      m.content.add(
        makeText(this, 0, -60, t('gold.pretendAsk', { n: p.gold ?? 0 }), FS.small, C.ink, { wrap: 520 }),
      );
      const ok = new Button(this, 0, 90, {
        w: 320,
        h: 80,
        label: t('gold.pretendOk'),
        color: C.leaf,
        fontSize: FS.small,
        onClick: () => {
          m.close();
          void this.finishBuy(id);
        },
      });
      this.mark('pay_ok', ok);
      m.content.add(ok);
      return;
    }
    await this.finishBuy(id);
  }

  private async finishBuy(id: string): Promise<void> {
    const st = session.state;
    const r = await goldStore().buy(st, id);
    if (r === 'success') {
      session.audio.play('register');
      void session.save(true);
      this.note = t('gold.got', {
        n:
          goldStore()
            .goldPacks()
            .find((p) => p.id === id)?.gold ?? 0,
      });
    } else if (r === 'failed') this.note = t('store.failed');
    if (this.sys.isActive()) this.render();
  }

  /** Lets the days pass, then the new day starts at the market (the screen behind is out of date). */
  private doSkip(id: string): void {
    const r = skipDays(session.state, id);
    if (!r) return;
    session.audio.play('levelup');
    session.haptic('success');
    void session.save(true);
    const parts = [t('gold.skipped', { n: r.days, coins: compact(r.coins) })];
    if (r.researched.length)
      parts.push(t('gold.skipResearch', { list: r.researched.map((x) => t(`tech.${x}`)).join(', ') }));
    session.skipNote = parts.join(' ');
    this.restartAtMarket();
  }

  // ---------------------------------------------------------------- input

  private local(p: Phaser.Input.Pointer): XY {
    const f = this.frame;
    return { x: (p.x - f.x) / f.scale, y: (p.y - f.y) / f.scale };
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.app === 'home' || this.app === 'gold' || this.hasModal()) return;
    const q = this.local(p);
    // The zoom buttons sit over the map's top-right corner.
    if (q.x > this.area.x + this.area.w - 76 && q.y < this.area.y + 140) return;
    if (!this.inArea(q)) return;
    this.drag = { x: q.x, y: q.y, px: this.pan.x, py: this.pan.y, moved: false };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drag || !p.isDown) return;
    const q = this.local(p);
    const dx = q.x - this.drag.x;
    const dy = q.y - this.drag.y;
    if (Math.hypot(dx, dy) > 12) this.drag.moved = true;
    if (!this.drag.moved || this.zoomI === 0) return;
    this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
    this.clampPan();
    this.drawMap();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved) return;
    const q = this.local(p);
    const id = this.app === 'tree' ? this.pickTree(q) : this.pickSpace(q);
    if (id === this.sel) return;
    this.sel = id;
    if (id) session.audio.play('tick');
    this.render();
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void {
    if (this.app === 'home' || this.app === 'gold' || this.hasModal()) return;
    this.zoomBy(dy < 0 ? 1 : -1);
  }

  override update(_t: number, dtMs: number): void {
    if (this.app !== 'space' || session.settings().reducedMotion) return;
    this.time0 += dtMs / 1000;
    // Planets drift slowly; redraw a few times a second.
    if (++this.tick % 4 === 0) this.drawSpace();
  }

  // ---------------------------------------------------------------- open / close

  /** Esc: closes a menu, then goes back to the home screen, then puts the tablet away. */
  protected override onEscape(): boolean {
    if (super.onEscape()) return true;
    if (this.app !== 'home') {
      this.openApp('home');
      return true;
    }
    this.closeTablet();
    return true;
  }

  closeTablet(): void {
    const from = this.from;
    session.audio.play('whoosh');
    if (from && this.scene.isPaused(from)) {
      this.scene.resume(from);
      session.currentScene = from;
      (this.scene.get(from) as unknown as { refreshHud?: () => void }).refreshHud?.();
    }
    this.scene.stop();
  }
}

/** Opens the tablet over a scene (which pauses until it is put away). */
export function openTablet(scene: Phaser.Scene, app: App = 'home'): void {
  scene.scene.launch('Tablet', { from: scene.scene.key, app });
  scene.scene.bringToTop('Tablet');
  scene.scene.pause();
}
