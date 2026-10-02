import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, drawCard, makeText } from '../ui/widgets';
import { iconAd, iconArrow } from '../ui/icons';
import { Coach } from '../ui/coach';
import { drawRaccoon } from '../art/characters';
import { C, FS } from '../theme';
import { session } from '../session';
import { advancePhase, applyDoubleDay, dayProfit, doubleDayAmount } from '../../core/day';
import { canUpgradeTier, nextTier, skillPoints } from '../../core/progression';
import { canShowInterstitial, markInterstitialShown } from '../../core/ads';
import { shouldShowCompletion } from '../../core/complete';
import { canPurchase } from '../../core/products';
import { openSkills, openStore, openTierUpgrade, openUpgrades } from '../ui/menus';
import { REWARD_IDS } from '../../platform/Platform';
import { t } from '../../i18n';

export class SummaryScene extends GameScene {
  private card!: Phaser.GameObjects.Container;
  private rory!: Phaser.GameObjects.Graphics;
  private buttons: Button[] = [];
  private nextBtn!: Button;
  private doubleBtn!: Button;
  private tierBtn!: Button;
  private skillsBtn!: Button;
  private toolsBtn!: Button;
  private offerBtn: Button | null = null;
  private leaving = false;

  constructor() {
    super('Summary');
  }

  protected hudTitle(): string {
    return t('phase.summary');
  }

  protected build(): void {
    // Phaser reuses scene instances: reset per-visit state.
    this.leaving = false;
    this.offerBtn = null;
    this.buttons = [];
    const s = session.state;
    if (s.day.ph !== 'summary') {
      this.scene.start(s.day.ph === 'shop' ? 'Shop' : s.day.ph === 'workshop' ? 'Workshop' : 'Market');
      return;
    }
    this.bgColors = { base: 0xeef3e3, dots: 0xdde9c9 };
    session.audio.music('menu');
    this.buildHud();
    this.rory = this.add.graphics();
    drawRaccoon(this.rory, 200, dayProfit(s) > 0 ? 'wow' : 'happy');
    this.card = this.add.container(0, 0);
    this.root.add([this.rory, this.card]);
    this.renderCard();
    this.nextBtn = new Button(this, 0, 0, {
      w: 340,
      h: 92,
      label: t('summary.next'),
      color: C.terracotta,
      fontSize: FS.h3,
      icon: (g, sz) => iconArrow(g, sz),
      onClick: () => void this.nextDay(),
    });
    this.doubleBtn = new Button(this, 0, 0, {
      w: 340,
      h: 76,
      label: t('summary.double', { n: doubleDayAmount(s) }),
      color: C.mustardDark,
      fontSize: FS.small,
      icon: (g, sz) => iconAd(g, sz),
      onClick: () => void this.doubleDay(),
    });
    this.tierBtn = new Button(this, 0, 0, {
      w: 220,
      h: 70,
      label: t('summary.tier'),
      color: C.leaf,
      fontSize: FS.small,
      onClick: () => openTierUpgrade(this, () => this.refresh()),
    });
    this.skillsBtn = new Button(this, 0, 0, {
      w: 200,
      h: 70,
      label: t('summary.skills'),
      color: C.teal,
      fontSize: FS.small,
      onClick: () => openSkills(this, () => this.refresh()),
    });
    this.toolsBtn = new Button(this, 0, 0, {
      w: 200,
      h: 70,
      label: t('summary.tools'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => openUpgrades(this, () => this.refresh()),
    });
    this.buttons = [this.nextBtn, this.doubleBtn, this.tierBtn, this.skillsBtn, this.toolsBtn];
    this.root.add(this.buttons);
    this.mark('next', this.nextBtn);
    this.mark('double', this.doubleBtn);
    this.mark('tier', this.tierBtn);
    this.mark('skills', this.skillsBtn);
    this.mark('tools', this.toolsBtn);
    const showOffer =
      session.platform.capabilities.iap &&
      s.day.n >= 3 &&
      canPurchase(s, 'starter_pack') &&
      s.flags.tutorialDone;
    if (showOffer) {
      this.offerBtn = new Button(this, 0, 0, {
        w: 300,
        h: 70,
        label: t('summary.treat'),
        color: C.pink,
        fontSize: FS.small,
        onClick: () => void openStore(this, () => this.refresh()),
      });
      this.root.add(this.offerBtn);
    }
    this.refresh();
    session.audio.play(dayProfit(s) > 0 ? 'register' : 'pop');
    if (dayProfit(s) > 0)
      this.time.delayedCall(300, () => this.flyCoins(this.frame.w / 2, this.frame.h / 2, 14));
    if (!s.flags.tutorialDone) {
      const coach = new Coach(this);
      this.time.delayedCall(600, () => coach.say(t('tut.summary'), { at: 'top', mood: 'wow' }));
    }
    void session.submitScoreIfBest();
  }

  private refresh(): void {
    const s = session.state;
    this.renderCard();
    this.doubleBtn.setVisible(
      s.flags.tutorialDone &&
        session.platform.capabilities.rewardedAds &&
        !s.day.doubled &&
        doubleDayAmount(s) > 0,
    );
    this.tierBtn.setVisible(!!nextTier(s) && s.flags.tutorialDone);
    this.tierBtn.setBadge(canUpgradeTier(s) ? '!' : null);
    const pts = skillPoints(s);
    this.skillsBtn.setVisible(s.flags.tutorialDone);
    this.skillsBtn.setBadge(pts > 0 ? String(pts) : null);
    this.toolsBtn.setVisible(s.flags.tutorialDone);
    this.refreshHud();
    this.layout();
  }

  private renderCard(): void {
    const s = session.state;
    const st = s.day.stats;
    this.card.removeAll(true);
    const w = 600;
    const h = 520;
    const g = this.add.graphics();
    drawCard(g, -w / 2, -h / 2, w, h, C.paper, { radius: 30, stroke: C.ink, strokeW: 5, shadow: 8 });
    this.card.add(g);
    this.card.add(
      makeText(this, 0, -h / 2 + 46, t('summary.title', { n: s.day.n }), FS.h2, C.terracotta, {
        stroke: C.ink,
        strokeW: 6,
      }),
    );
    const rows: Array<[string, string, number?]> = [
      [t('summary.sold'), String(st.sold)],
      [t('summary.revenue'), `+${st.revenue}`],
      [t('summary.spent'), `-${st.spent}`],
    ];
    if (st.bonus > 0) rows.push([t('summary.bonus'), `+${st.bonus}`]);
    rows.push([
      t('summary.profit'),
      `${dayProfit(s) >= 0 ? '+' : ''}${dayProfit(s)}`,
      dayProfit(s) >= 0 ? C.leafDark : C.terracottaDark,
    ]);
    rows.push([t('summary.xp'), `+${st.xp}`]);
    rows.push([t('summary.rep'), `${st.rep >= 0 ? '+' : ''}${st.rep}`]);
    if (st.gems) rows.push([t('summary.gems'), String(st.gems), C.purple]);
    rows.forEach(([a, b, col], i) => {
      const y = -h / 2 + 110 + i * 42;
      this.card.add(makeText(this, -w / 2 + 50, y, a, FS.body, C.inkSoft, { align: 'left' }));
      this.card.add(makeText(this, w / 2 - 50, y, b, FS.body, col ?? C.ink, { align: 'right' }));
    });
    if (st.bestName) {
      this.card.add(
        makeText(
          this,
          0,
          h / 2 - 50,
          t('summary.best', { name: st.bestName, buy: st.bestBuy, sell: st.bestSell }),
          FS.small,
          C.teal,
          { wrap: w - 60 },
        ),
      );
    }
  }

  protected layout(): void {
    if (!this.card || !this.nextBtn) return;
    const f = this.frame;
    this.layoutHud();
    if (f.portrait) {
      const cs = Math.min(1, (f.w - 40) / 600, (f.h - 640) / 520);
      this.card.setScale(cs);
      this.card.setPosition(f.w / 2, 120 + (520 * cs) / 2 + 20);
      this.rory.setPosition(f.w - 90, 130 + 520 * cs);
      this.rory.setScale(0.8);
      const by = 120 + 520 * cs + 120;
      this.doubleBtn.setPosition(f.w / 2, by);
      this.tierBtn.setPosition(f.w / 2 - 230, by + 96);
      this.skillsBtn.setPosition(f.w / 2, by + 96);
      this.toolsBtn.setPosition(f.w / 2 + 220, by + 96);
      this.offerBtn?.setPosition(f.w / 2, by + 186);
      this.nextBtn.setPosition(f.w / 2 + 50, f.h - 60);
    } else {
      const cs = Math.min(1, (f.h - 130) / 520);
      this.card.setScale(cs);
      this.card.setPosition(40 + 300 * cs, 110 + 260 * cs);
      this.rory.setPosition(f.w - 120, 210);
      this.rory.setScale(0.9);
      const rx = (80 + 600 * cs + f.w) / 2;
      this.doubleBtn.setPosition(rx, 330);
      this.tierBtn.setPosition(rx - 220, 430);
      this.skillsBtn.setPosition(rx, 430);
      this.toolsBtn.setPosition(rx + 210, 430);
      this.offerBtn?.setPosition(rx, 520);
      this.nextBtn.setPosition(rx, f.h - 70);
    }
  }

  private async doubleDay(): Promise<void> {
    if (await this.rewarded(REWARD_IDS.doubleDay)) {
      const amt = applyDoubleDay(session.state);
      session.audio.play('register');
      this.flyCoins(this.doubleBtn.x, this.doubleBtn.y, 16);
      this.floatText(this.doubleBtn.x, this.doubleBtn.y - 60, `+${amt}`, C.gold, FS.h1);
      void session.save(true);
      void session.submitScoreIfBest();
      this.refresh();
    }
  }

  private async nextDay(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    const s = session.state;
    // Natural break: the only place an interstitial may appear.
    if (session.platform.capabilities.interstitialAds && canShowInterstitial(s)) {
      markInterstitialShown(s);
      session.audio.pause();
      try {
        await session.platform.showInterstitialAd();
      } finally {
        if (!session.paused) session.audio.resume();
      }
    }
    advancePhase(s, 'market');
    await session.save(true);
    if (shouldShowCompletion(s)) this.scene.start('Complete');
    else this.scene.start('Market');
  }
}
