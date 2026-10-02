import { GameScene } from './GameScene';
import { Button, drawCard, makeText } from '../ui/widgets';
import { drawRaccoon } from '../art/characters';
import { C, FS } from '../theme';
import { session } from '../session';
import { markCompletionSeen } from '../../core/complete';
import { t } from '../../i18n';
import type Phaser from 'phaser';

/**
 * "You've flipped it all!" — shown once when the top shop tier is reached and the catalog is
 * complete. States clearly that there is no more new content, then allows endless free play.
 */
export class CompleteScene extends GameScene {
  private card!: Phaser.GameObjects.Container;
  private rory!: Phaser.GameObjects.Graphics;
  private go!: Button;

  constructor() {
    super('Complete');
  }

  protected hudTitle(): string {
    return t('complete.hud');
  }

  protected build(): void {
    this.bgColors = { base: 0xfff1d6, dots: 0xffe1a8 };
    this.buildHud();
    this.homeBtn.setVisible(false);
    session.audio.play('levelup');
    this.card = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawCard(bg, -310, -300, 620, 600, C.paper, {
      radius: 34,
      stroke: C.mustardDark,
      strokeW: 7,
      shadow: 10,
    });
    this.card.add(bg);
    this.card.add(
      makeText(this, 0, -230, t('complete.title'), FS.h2, C.terracotta, {
        stroke: C.ink,
        strokeW: 7,
        wrap: 580,
      }),
    );
    this.card.add(makeText(this, 0, -60, t('complete.body'), FS.body, C.ink, { wrap: 560 }));
    this.card.add(
      makeText(
        this,
        0,
        120,
        t('complete.stats', { profit: session.state.stats.profit, items: session.state.stats.sold }),
        FS.small,
        C.teal,
        { wrap: 560 },
      ),
    );
    this.go = new Button(this, 0, 220, {
      w: 380,
      h: 90,
      label: t('complete.keep'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => {
        markCompletionSeen(session.state);
        void session.save(true);
        this.scene.start('Market');
      },
    });
    this.card.add(this.go);
    this.rory = this.add.graphics();
    drawRaccoon(this.rory, 220, 'wow');
    this.root.add([this.card, this.rory]);
    this.mark('keep', this.go);
    for (let i = 0; i < 6; i++)
      this.time.delayedCall(i * 400, () =>
        this.sparkle(this.frame.w * (0.2 + 0.12 * i), this.frame.h * 0.3, 30),
      );
  }

  protected layout(): void {
    if (!this.card) return;
    const f = this.frame;
    this.layoutHud();
    const sc = Math.min(1, (f.h - 300) / 620, (f.w - 40) / 640);
    this.card.setScale(sc);
    this.card.setPosition(f.w / 2, 120 + (620 * sc) / 2);
    this.rory.setPosition(f.w / 2, Math.min(f.h - 110, 140 + 620 * sc + 80));
    this.rory.setScale(0.7);
  }
}
