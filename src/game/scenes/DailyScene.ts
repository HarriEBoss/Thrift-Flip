import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, drawCard, drawStar, makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import { instanceThumb } from '../art/textures';
import { ITEMS, BALANCE } from '../../core/data';
import { dailyBest, dailyItem, dateKey, previousDateKey } from '../../core/daily';
import { recipeFor } from '../../core/items';
import { t } from '../../i18n';

/** The Daily Fix: one seeded restoration per calendar day, rated 1-3 stars. */
export class DailyScene extends GameScene {
  private card!: Phaser.GameObjects.Container;
  private back!: Button;

  constructor() {
    super('Daily');
  }

  protected hudTitle(): string {
    return t('menu.daily');
  }

  protected build(data?: unknown): void {
    const s = session.state;
    this.bgColors = { base: 0xe6f2f7, dots: 0xd2e7f0 };
    this.buildHud();
    this.homeBtn.setVisible(false);
    const key = dateKey(new Date());
    const inst = dailyItem(key);
    const best = dailyBest(s, key);
    this.card = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawCard(bg, -300, -380, 600, 760, C.paper, { radius: 30, stroke: C.ink, strokeW: 5, shadow: 8 });
    this.card.add(bg);
    this.card.add(makeText(this, 0, -330, t('daily.title'), FS.h2, C.teal, { stroke: C.ink, strokeW: 6 }));
    this.card.add(makeText(this, 0, -280, key, FS.small, C.inkSoft));
    const img = this.add.image(0, -130, instanceThumb(this, inst));
    img.setDisplaySize(260, 260);
    this.card.add(img);
    this.card.add(makeText(this, 0, 20, ITEMS[inst.a].name, FS.h3, C.ink));
    this.card.add(
      makeText(
        this,
        0,
        62,
        recipeFor(inst)
          .map((r) => t(`step.${r.k}`))
          .join(' · '),
        FS.small,
        C.inkSoft,
      ),
    );
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics();
      drawStar(g, (i - 1) * 80, 130, 32, i < best ? C.gold : 0xd9d0c4);
      this.card.add(g);
    }
    this.card.add(makeText(this, 0, 186, t('daily.best', { n: best }), FS.body, C.ink));
    this.card.add(
      makeText(
        this,
        0,
        226,
        t('daily.reward', {
          n: BALANCE.daily.rewardPerStar * (1 + s.tier),
          streak: s.daily.date === key || s.daily.date === previousDateKey(key) ? s.daily.streak : 0,
        }),
        FS.small,
        C.leafDark,
        { wrap: 540 },
      ),
    );
    const res = (data as { result?: { stars: number; reward: number } } | undefined)?.result;
    if (res) {
      this.time.delayedCall(300, () => {
        if (res.reward > 0) {
          this.flyCoins(this.frame.w / 2, this.frame.h / 2, 12);
          this.floatText(this.frame.w / 2, this.frame.h / 2 - 100, `+${res.reward}`, C.gold, FS.h1);
        } else this.toast(t('daily.noImprove'));
        this.refreshHud();
      });
    }
    const start = new Button(this, 0, 310, {
      w: 340,
      h: 90,
      label: best >= 3 ? t('daily.again') : t('daily.start'),
      color: C.terracotta,
      fontSize: FS.h3,
      onClick: () => this.scene.start('Workshop', { daily: key }),
    });
    this.card.add(start);
    this.back = new Button(this, 0, 0, {
      w: 220,
      h: 76,
      label: t('common.back'),
      color: C.inkSoft,
      onClick: () => this.scene.start('MainMenu'),
    });
    this.root.add([this.card, this.back]);
    this.mark('dailyStart', start);
    this.mark('back', this.back);
  }

  protected override onEscape(): boolean {
    if (super.onEscape()) return true;
    this.scene.start('MainMenu');
    return true;
  }

  protected layout(): void {
    if (!this.card) return;
    const f = this.frame;
    this.layoutHud();
    const sc = Math.min(1, (f.h - 230) / 780, (f.w - 40) / 620);
    this.card.setScale(sc);
    this.card.setPosition(f.w / 2, 110 + (780 * sc) / 2);
    this.back.setPosition(f.portrait ? f.w / 2 : 140, f.h - 56);
  }
}
