import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, makeText } from '../ui/widgets';
import { iconBook, iconCalendar, iconGift, iconShopBag, iconTool } from '../ui/icons';
import { openUpgradesHub, upgradesAvailable } from '../ui/upgradesHub';
import { drawRaccoon } from '../art/characters';
import { archetypeThumb } from '../art/textures';
import { C, FS } from '../theme';
import { session } from '../session';
import { t } from '../../i18n';
import { hideBootScreen } from '../../boot/bootScreen';
import { openSettings, openStore } from '../ui/menus';
import { freeGiftAmount, freeGiftAvailable } from '../../core/ads';
import { grantBonus } from '../../core/day';
import { catalogFoundCount } from '../../core/catalog';
import { ITEMS } from '../../core/data';
import { isContentComplete } from '../../core/complete';
import { REWARD_IDS } from '../../platform/Platform';
import { setColorBlindMode } from '../art/itemArt';
import { loadArtOverrides } from '../art/manifest';

const PHASE_SCENE = { market: 'Market', workshop: 'Workshop', shop: 'Shop', summary: 'Summary' } as const;

export class MainMenuScene extends GameScene {
  private logo!: Phaser.GameObjects.Container;
  private tagline!: Phaser.GameObjects.Text;
  private rory!: Phaser.GameObjects.Graphics;
  private showcase: Phaser.GameObjects.Image[] = [];
  private playBtn!: Button;
  private menuBtns: Button[] = [];
  private giftBtn!: Button;
  private version!: Phaser.GameObjects.Text;

  constructor() {
    super('MainMenu');
  }

  protected hudTitle(): string {
    return t('phase.menu');
  }

  protected build(): void {
    // Phaser reuses scene instances: reset per-visit state.
    this.showcase = [];
    this.menuBtns = [];
    const s = session.state;
    setColorBlindMode(s.settings.cbPalette);
    this.bgColors = { base: C.cream, dots: C.cream2 };
    this.buildHud();
    this.homeBtn.setVisible(false);
    this.logo = this.add.container(0, 0);
    const a = this.txt(-115, 0, t('title.thrift'), FS.hero, C.terracotta, { stroke: C.ink, strokeW: 10 });
    const b = this.txt(150, 12, t('title.flip'), FS.hero, C.teal, { stroke: C.ink, strokeW: 10 });
    this.logo.add([a, b]);
    this.tweens.add({
      targets: this.logo,
      angle: { from: -3, to: 3 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.tagline = this.txt(0, 0, t('menu.tagline'), FS.h3, C.inkSoft);
    this.rory = this.add.graphics();
    drawRaccoon(this.rory, 220, 'happy');
    this.tweens.add({
      targets: this.rory,
      y: '-=10',
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    // A little rotating showcase of items found so far (or teasers).
    const found = ITEMS.map((_, i) => i).filter((i) => s.catalog[i] !== '0');
    const pool = found.length >= 3 ? found : [0, 15, 30];
    for (let i = 0; i < 3; i++) {
      const img = this.add.image(0, 0, archetypeThumb(this, pool[(i * 7) % pool.length], 192));
      img.setDisplaySize(150, 150);
      this.showcase.push(img);
      this.tweens.add({
        targets: img,
        angle: { from: -6, to: 6 },
        duration: 1300 + i * 200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
    const started = s.flags.tutorialDone || s.day.n > 1 || s.inv.length > 0;
    this.playBtn = new Button(this, 0, 0, {
      w: 420,
      h: 104,
      label: started ? t('menu.continue', { day: s.day.n }) : t('menu.play'),
      color: C.terracotta,
      fontSize: FS.h2,
      onClick: () => this.play(),
    });
    const mk = (
      label: string,
      color: number,
      icon: ((g: Phaser.GameObjects.Graphics, sz: number) => void) | undefined,
      onClick: () => void,
    ) => new Button(this, 0, 0, { w: 300, h: 80, label, color, fontSize: FS.body, icon, onClick });
    this.menuBtns = [
      mk(
        t('menu.daily'),
        C.teal,
        (g, sz) => iconCalendar(g, sz),
        () => this.scene.start('Daily'),
      ),
      mk(
        t('menu.catalog'),
        C.purple,
        (g, sz) => iconBook(g, sz),
        () => this.scene.start('Catalog'),
      ),
      mk(
        t('menu.upgrades'),
        C.leaf,
        (g, sz) => iconTool(g, sz),
        () => openUpgradesHub(this, () => this.refreshUpgradesBadge()),
      ),
    ];
    if (session.platform.capabilities.iap)
      this.menuBtns.push(
        mk(
          t('menu.store'),
          C.mustardDark,
          (g, sz) => iconShopBag(g, sz),
          () => void openStore(this, () => this.refreshHud()),
        ),
      );
    this.menuBtns.push(mk(t('menu.settings'), C.inkSoft, undefined, () => openSettings(this)));
    this.menuBtns[0].setEnabled(s.flags.tutorialDone);
    this.menuBtns[2].setEnabled(s.flags.tutorialDone);
    this.refreshUpgradesBadge();
    const cat = catalogFoundCount(s);
    this.menuBtns[1].setBadge(cat > 0 ? `${cat}/${ITEMS.length}` : null);
    this.giftBtn = new Button(this, 0, 0, {
      w: 250,
      h: 76,
      label: t('menu.gift'),
      color: C.pink,
      fontSize: FS.small,
      icon: (g, sz) => iconGift(g, sz),
      onClick: () => void this.gift(),
    });
    this.giftBtn.setVisible(session.platform.capabilities.rewardedAds && freeGiftAvailable(s));
    this.mark('play', this.playBtn);
    this.mark('daily', this.menuBtns[0]);
    this.mark('catalog', this.menuBtns[1]);
    this.mark('gift', this.giftBtn);
    this.mark('settings', this.menuBtns[this.menuBtns.length - 1]);
    this.mark('upgrades', this.menuBtns[2]);
    if (session.platform.capabilities.iap) this.mark('store', this.menuBtns[3]);
    this.version = this.txt(0, 0, `v${__APP_VERSION__}`, FS.tiny, C.inkSoft, { bold: false });
    this.root.add([
      this.logo,
      this.tagline,
      this.rory,
      ...this.showcase,
      this.playBtn,
      ...this.menuBtns,
      this.giftBtn,
      this.version,
    ]);
    if (isContentComplete(s)) this.tagline.setText(t('menu.allDone'));
    this.markReady();
    session.audio.music('menu');
    if (session.loadOutcome.kind === 'corrupt') this.time.delayedCall(50, () => this.corruptSave());
  }

  protected layout(): void {
    if (!this.playBtn) return;
    const f = this.frame;
    this.layoutHud();
    const giftIcon = this.giftBtn;
    if (f.portrait) {
      const top = f.h < 1100 ? 190 : 230;
      this.logo.setPosition(f.w / 2, top);
      this.tagline.setPosition(f.w / 2, top + 96);
      const sy = top + 250;
      this.showcase.forEach((img, i) => img.setPosition(f.w / 2 + (i - 1) * 170, sy));
      this.rory.setPosition(f.w - 110, f.h - 130);
      this.rory.setScale(0.75);
      const py = Math.max(sy + 170, f.h * 0.55);
      this.playBtn.setPosition(f.w / 2, py);
      const cols = 2;
      this.menuBtns.forEach((b, i) =>
        b.setPosition(f.w / 2 + ((i % cols) - 0.5) * 320, py + 120 + Math.floor(i / cols) * 100),
      );
      giftIcon.setPosition(160, f.h - 70);
      this.version.setPosition(f.w / 2, f.h - 22);
    } else {
      this.logo.setPosition(f.w * 0.3, 210);
      this.tagline.setPosition(f.w * 0.3, 300);
      this.showcase.forEach((img, i) => img.setPosition(f.w * 0.3 + (i - 1) * 170, 440));
      this.rory.setPosition(f.w * 0.3 - 0, 600);
      this.rory.setScale(0.6);
      this.rory.setVisible(f.w > 1100);
      const rx = f.w * 0.74;
      this.playBtn.setPosition(rx, 200);
      this.menuBtns.forEach((b, i) => b.setPosition(rx, 310 + i * 92));
      giftIcon.setPosition(160, f.h - 60);
      this.version.setPosition(f.w - 60, f.h - 20);
    }
  }

  private refreshUpgradesBadge(): void {
    const n = session.state.flags.tutorialDone ? upgradesAvailable() : 0;
    this.menuBtns[2]?.setBadge(n > 0 ? String(n) : null);
    this.refreshHud();
  }

  private play(): void {
    const s = session.state;
    session.audio.play('whoosh');
    this.scene.start(PHASE_SCENE[s.day.ph]);
  }

  private async gift(): Promise<void> {
    const s = session.state;
    if (!freeGiftAvailable(s)) return;
    if (await this.rewarded(REWARD_IDS.freeGift)) {
      s.day.gifts++;
      const amt = grantBonus(s, freeGiftAmount(s));
      session.audio.play('coin');
      this.flyCoins(this.giftBtn.x, this.giftBtn.y, 12);
      this.floatText(this.giftBtn.x, this.giftBtn.y - 70, `+${amt}`, C.gold);
      this.giftBtn.setVisible(freeGiftAvailable(s));
      this.refreshHud();
      void session.save();
    }
  }

  private corruptSave(): void {
    const m = this.openModal({ title: t('save.corruptTitle'), w: 600, h: 520, closable: false });
    m.content.add(makeText(this, 0, -80, t('save.corruptBody'), FS.body, C.ink, { wrap: 520 }));
    m.content.add(
      new Button(this, 0, 140, {
        w: 360,
        h: 84,
        label: t('save.startFresh'),
        color: C.leaf,
        fontSize: FS.h3,
        onClick: () => {
          session.startFresh();
          m.close();
          this.scene.restart();
        },
      }),
    );
  }

  /** gameReady only once the menu has actually rendered and is interactive. */
  private markReady(): void {
    if (session.gameReadySent) return;
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      if (session.gameReadySent) return;
      session.gameReadySent = true;
      hideBootScreen();
      session.platform.notifyGameReady();
      session.audio.allowMusic();
      session.audio.music('menu');
      // Lazy content after gameReady: optional hand-made art.
      void loadArtOverrides();
    });
  }
}
