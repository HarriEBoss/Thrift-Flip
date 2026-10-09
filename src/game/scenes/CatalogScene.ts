import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, ProgressBar, drawCard, drawStar, makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import { archetypeThumb } from '../art/textures';
import { gridPositions } from '../ui/layout';
import { BALANCE, CATEGORIES, ITEMS } from '../../core/data';
import { catalogFoundCount, catalogState, categoryComplete, categoryProgress } from '../../core/catalog';
import type { CategoryId } from '../../core/types';
import { t } from '../../i18n';

/** The Sticker Book: 120 catalog entries (unseen / found / perfectly restored), by category. */
export class CatalogScene extends GameScene {
  private tab: CategoryId = 'kitchen';
  private tabs: Button[] = [];
  private grid!: Phaser.GameObjects.Container;
  private header!: Phaser.GameObjects.Text;
  private total!: Phaser.GameObjects.Text;
  private bar!: ProgressBar;
  private back!: Button;

  constructor() {
    super('Catalog');
  }

  protected hudTitle(): string {
    return t('menu.catalog');
  }

  protected build(): void {
    this.tabs = [];
    this.bgColors = { base: 0xf1ecfa, dots: 0xe2d9f4 };
    this.buildHud();
    this.homeBtn.setVisible(false);
    this.total = this.txt(0, 0, '', FS.body, C.ink);
    this.bar = new ProgressBar(this, 0, 0, 440, 22, C.purple);
    this.header = this.txt(0, 0, '', FS.h3, C.white, { stroke: C.ink, strokeW: 6 });
    this.grid = this.add.container(0, 0);
    this.root.add([this.total, this.bar, this.header, this.grid]);
    for (const c of CATEGORIES) {
      const b = new Button(this, 0, 0, {
        w: 132,
        h: 60,
        label: t(`cat.${c.id}`),
        color: c.unlockTier <= session.state.tier ? C.teal : C.inkSoft,
        fontSize: FS.tiny,
        onClick: () => {
          this.tab = c.id;
          this.renderGrid();
        },
      });
      b.setData('cat', c.id);
      this.tabs.push(b);
      this.root.add(b);
      this.mark(`tab_${c.id}`, b);
    }
    this.back = new Button(this, 0, 0, {
      w: 220,
      h: 76,
      label: t('common.back'),
      color: C.inkSoft,
      onClick: () => this.scene.start('MainMenu'),
    });
    this.root.add(this.back);
    this.mark('back', this.back);
    const found = catalogFoundCount(session.state);
    this.total.setText(t('catalog.total', { n: found, total: ITEMS.length }));
    this.bar.setValue(found / ITEMS.length);
  }

  protected override onEscape(): boolean {
    if (super.onEscape()) return true;
    this.scene.start('MainMenu');
    return true;
  }

  protected layout(): void {
    if (!this.grid) return;
    const f = this.frame;
    this.layoutHud();
    this.total.setPosition(f.w / 2, 125);
    this.bar.setPosition(f.w / 2, 160);
    const cols = 5;
    const tw = f.portrait ? 138 : 150;
    this.tabs.forEach((b, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      b.setPosition(f.w / 2 + (c - (cols - 1) / 2) * tw, 214 + r * 70);
      b.setScale(f.portrait ? 1 : 0.95);
    });
    const tabRows = Math.ceil(this.tabs.length / cols);
    this.header.setPosition(f.w / 2, 214 + tabRows * 70 + 6);
    this.back.setPosition(f.w / 2, f.h - 56);
    this.grid.setData('box', {
      x: 20,
      y: 214 + tabRows * 70 + 40,
      w: f.w - 40,
      h: f.h - (214 + tabRows * 70 + 40) - 110,
    });
    this.renderGrid();
  }

  private renderGrid(): void {
    const s = session.state;
    this.grid.removeAll(true);
    this.tabs.forEach((b) => b.setFocused(b.getData('cat') === this.tab));
    const cat = CATEGORIES.find((c) => c.id === this.tab)!;
    const p = categoryProgress(s, this.tab);
    const done = categoryComplete(s, this.tab);
    this.header.setText(
      `${t(`cat.${this.tab}`)} · ${p.found}/${p.total}${done ? ' · ' + t('catalog.bonus') : ''}`,
    );
    const box = this.grid.getData('box') as { x: number; y: number; w: number; h: number } | undefined;
    if (!box) return;
    const entries = ITEMS.map((it, i) => ({ it, i })).filter((e) => e.it.cat === this.tab);
    const g = gridPositions(entries.length, box, 1.2, 10);
    const locked = cat.unlockTier > s.tier;
    entries.forEach(({ it, i }, k) => {
      const pos = g.pos[k];
      const w = g.cell;
      const h = w * 1.2;
      const st = catalogState(s, i);
      const c = this.add.container(pos.x, pos.y);
      const bg = this.add.graphics();
      drawCard(bg, -w / 2, -h / 2, w, h, st === 2 ? 0xfff4c9 : st === 1 ? C.white : 0xe7e1d8, {
        radius: 14,
        stroke: st === 2 ? C.mustardDark : C.ink,
        strokeW: st === 2 ? 5 : 3,
        shadow: 3,
      });
      c.add(bg);
      const img = this.add.image(0, -h * 0.08, archetypeThumb(this, i, 192, st > 0 ? 'color' : 'mystery'));
      img.setDisplaySize(w * 0.8, w * 0.8);
      c.add(img);
      const label =
        st > 0 ? it.name : locked ? t('catalog.locked', { tier: BALANCE.tiers[cat.unlockTier].name }) : '???';
      const tx = makeText(
        this,
        0,
        h / 2 - 18,
        label,
        Math.max(12, Math.round(w * 0.1)),
        st > 0 ? C.ink : C.inkSoft,
        { wrap: w - 8 },
      );
      if (tx.height > h * 0.26) tx.setScale((h * 0.26) / tx.height);
      c.add(tx);
      if (st === 2) {
        const star = this.add.graphics();
        drawStar(star, w / 2 - 16, -h / 2 + 16, 14, C.gold);
        c.add(star);
      }
      this.grid.add(c);
    });
  }
}
