import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, ProgressBar, drawCard, makeText } from '../ui/widgets';
import { iconCoin, iconHeart, iconHome } from '../ui/icons';
import { C, FS } from '../theme';
import { session } from '../session';
import { xpToNext } from '../../core/progression';
import { t } from '../../i18n';
import type { RewardId } from '../../platform/Platform';

/**
 * Base for the in-day scenes: top HUD (coins, day, level/XP, reputation), home button and juice
 * helpers (coin fountains, floating text, sparkles, toasts, rewarded ads).
 */
export abstract class GameScene extends BaseScene {
  protected hud!: Phaser.GameObjects.Container;
  private coinText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private lvlText!: Phaser.GameObjects.Text;
  private repText!: Phaser.GameObjects.Text;
  private xpBar!: ProgressBar;
  private hudBg!: Phaser.GameObjects.Graphics;
  protected homeBtn!: Button;
  private shownCoins = 0;
  private coinTween: Phaser.Tweens.Tween | null = null;
  protected coinAnchor = { x: 0, y: 0 };

  /** Title shown in the HUD centre (phase name). */
  protected abstract hudTitle(): string;

  protected buildHud(): void {
    const s = session.state;
    this.coinTween = null;
    this.hud = this.add.container(0, 0);
    this.hudBg = this.add.graphics();
    this.hud.add(this.hudBg);
    const coinIcon = this.add.graphics();
    iconCoin(coinIcon, 44);
    coinIcon.setPosition(-0, 0);
    this.coinText = this.txt(0, 0, String(s.coins), FS.h3, C.ink, { align: 'left' });
    const heart = this.add.graphics();
    iconHeart(heart, 38);
    this.repText = this.txt(0, 0, String(s.rep), FS.body, C.ink, { align: 'left' });
    this.dayText = this.txt(0, 0, '', FS.body, C.white, { stroke: C.ink, strokeW: 5 });
    this.lvlText = this.txt(0, 0, '', FS.small, C.ink);
    this.xpBar = new ProgressBar(this, 0, 0, 120, 16, C.leaf);
    this.hud.add([coinIcon, this.coinText, heart, this.repText, this.dayText, this.lvlText, this.xpBar]);
    this.hud.setData('coinIcon', coinIcon);
    this.hud.setData('heart', heart);
    this.root.add(this.hud);
    this.shownCoins = s.coins;
    this.homeBtn = new Button(this, 0, 0, {
      w: 84,
      h: 76,
      label: '',
      color: C.white,
      icon: (g, sz) => iconHome(g, sz),
      onClick: () => this.goHome(),
    });
    this.root.add(this.homeBtn);
    this.refreshHud();
  }

  protected layoutHud(): void {
    const f = this.frame;
    const w = f.w - 24;
    const h = 78;
    this.hud.setPosition(12, 10);
    this.hudBg.clear();
    drawCard(this.hudBg, 0, 0, w, h, C.paper, { radius: 26, stroke: C.ink, strokeW: 4, shadow: 5 });
    const coinIcon = this.hud.getData('coinIcon') as Phaser.GameObjects.Graphics;
    const heart = this.hud.getData('heart') as Phaser.GameObjects.Graphics;
    coinIcon.setPosition(42, h / 2);
    this.coinText.setPosition(72, h / 2);
    this.coinAnchor = { x: 12 + 42, y: 10 + h / 2 };
    this.dayText.setPosition(w / 2, h / 2 - 12);
    this.lvlText.setPosition(w / 2, h / 2 + 20);
    this.xpBar.setVisible(false);
    heart.setPosition(w - 150, h / 2);
    this.repText.setPosition(w - 124, h / 2);
    this.lvlText.setX(w - 52);
    this.lvlText.setY(h / 2 - 12);
    this.xpBar.setPosition(w - 52, h / 2 + 18);
    this.xpBar.setVisible(true);
    this.xpBar.setScale(0.75);
    this.dayText.setY(h / 2);
    this.homeBtn.setPosition(58, f.h - 54);
  }

  refreshHud(): void {
    const s = session.state;
    this.dayText.setText(`${t('common.day', { n: s.day.n })} · ${this.hudTitle()}`);
    if (this.dayText.width > this.frame.w * 0.42)
      this.dayText.setScale((this.frame.w * 0.42) / this.dayText.width);
    else this.dayText.setScale(1);
    this.lvlText.setText(t('common.level', { n: s.level }));
    this.repText.setText(String(s.rep));
    this.xpBar.setValue(s.xp / xpToNext(s.level));
    this.animateCoins(s.coins);
  }

  private animateCoins(target: number): void {
    if (this.coinTween) this.coinTween.stop();
    const from = this.shownCoins;
    if (from === target) {
      this.coinText.setText(String(target));
      return;
    }
    const obj = { v: from };
    this.coinTween = this.tweens.add({
      targets: obj,
      v: target,
      duration: Math.min(900, 200 + Math.abs(target - from) * 6),
      ease: 'Cubic.out',
      onUpdate: () => {
        this.shownCoins = Math.round(obj.v);
        this.coinText.setText(String(this.shownCoins));
      },
      onComplete: () => {
        this.shownCoins = target;
        this.coinText.setText(String(target));
      },
    });
    this.tweens.add({ targets: this.coinText, scale: 1.25, duration: 120, yoyo: true });
  }

  protected goHome(): void {
    void session.save(true);
    this.scene.start('MainMenu');
  }

  // ---------------- juice ----------------

  /** Coins burst from a point and fly into the HUD counter. */
  flyCoins(x: number, y: number, count = 10): void {
    const n = session.settings().reducedMotion ? Math.min(3, count) : Math.min(24, count);
    for (let i = 0; i < n; i++) {
      const c = this.add.image(x, y, 'p_coin').setScale(0.9);
      this.root.add(c);
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      this.tweens.chain({
        targets: c,
        tweens: [
          { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist - 30, duration: 260, ease: 'Quad.out' },
          {
            x: this.coinAnchor.x,
            y: this.coinAnchor.y,
            scale: 0.6,
            duration: 420 + i * 25,
            ease: 'Cubic.in',
            onComplete: () => {
              c.destroy();
              if (i % 3 === 0) session.audio.play('coin', 0.6, 40);
            },
          },
        ],
      });
    }
  }

  floatText(x: number, y: number, text: string, color: number = C.leaf, size: number = FS.h3): void {
    const tx = makeText(this, x, y, text, size, color, { stroke: C.ink, strokeW: 6 });
    this.root.add(tx);
    tx.setScale(0.5);
    this.tweens.add({ targets: tx, scale: 1, duration: 220, ease: 'Back.out' });
    this.tweens.add({
      targets: tx,
      y: y - 90,
      alpha: 0,
      delay: 700,
      duration: 600,
      onComplete: () => tx.destroy(),
    });
  }

  sparkle(x: number, y: number, count = 18, tint: number = C.gold): void {
    const n = session.settings().reducedMotion ? Math.ceil(count / 4) : count;
    const p = this.add.particles(x, y, 'p_spark', {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      lifespan: { min: 400, max: 800 },
      tint: [tint, C.white, C.pink, C.sky],
      rotate: { min: 0, max: 360 },
      emitting: false,
    });
    this.root.add(p);
    p.explode(n);
    this.time.delayedCall(1000, () => p.destroy());
  }

  toast(text: string, color: number = C.ink): void {
    const f = this.frame;
    const c = this.add.container(f.w / 2, f.h - 150);
    const tx = makeText(this, 0, 0, text, FS.body, C.white, { wrap: f.w - 120 });
    const g = this.add.graphics();
    const w = Math.min(f.w - 60, tx.width + 60);
    const h = tx.height + 34;
    drawCard(g, -w / 2, -h / 2, w, h, color, { radius: h / 2, shadow: 4 });
    c.add([g, tx]);
    this.root.add(c);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, y: f.h - 170, duration: 200 });
    this.tweens.add({ targets: c, alpha: 0, delay: 2200, duration: 300, onComplete: () => c.destroy() });
  }

  /** Shows a rewarded ad; resolves true only if the platform granted the reward. */
  async rewarded(id: RewardId): Promise<boolean> {
    if (!session.platform.capabilities.rewardedAds) return false;
    session.audio.pause();
    let ok = false;
    try {
      ok = await session.platform.showRewardedAd(id);
    } catch (e) {
      session.platform.logWarning(`rewarded ad failed: ${String(e)}`);
    } finally {
      if (!session.paused) session.audio.resume();
    }
    if (!ok) this.toast(t('common.noAd'), C.inkSoft);
    return ok;
  }

  /** Level-up celebration modal (skill point reminder). */
  celebrateLevel(levels: number): void {
    if (levels <= 0) return;
    session.audio.play('levelup');
    session.haptic('success');
    const m = this.openModal({ title: t('levelup.title'), w: 520, h: 420, closeLabel: t('common.ok') });
    const lv = makeText(this, 0, -60, t('common.level', { n: session.state.level }), FS.h1, C.teal, {
      stroke: C.ink,
      strokeW: 8,
    });
    const sub = makeText(this, 0, 30, t('levelup.points'), FS.body, C.inkSoft, { wrap: 440 });
    m.content.add([lv, sub]);
    this.tweens.add({ targets: lv, scale: { from: 0.4, to: 1 }, duration: 400, ease: 'Back.out' });
    this.sparkle(this.frame.w / 2, this.frame.h / 2 - 60, 30);
  }
}
