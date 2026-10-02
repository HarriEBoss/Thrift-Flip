import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import { t } from '../../i18n';
import { hideBootScreen } from '../../boot/bootScreen';

export class MainMenuScene extends BaseScene {
  private logo!: Phaser.GameObjects.Container;
  private tagline!: Phaser.GameObjects.Text;
  private buttons: Button[] = [];

  constructor() {
    super('MainMenu');
  }

  protected build(): void {
    this.logo = this.add.container(0, 0);
    const a = this.txt(-120, 0, t('title.thrift'), FS.hero, C.terracotta, { stroke: C.ink, strokeW: 10 });
    const b = this.txt(150, 10, t('title.flip'), FS.hero, C.teal, { stroke: C.ink, strokeW: 10 });
    this.logo.add([a, b]);
    this.root.add(this.logo);
    this.tweens.add({
      targets: this.logo,
      angle: { from: -3, to: 3 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.tagline = this.txt(0, 0, t('menu.tagline'), FS.h3, C.inkSoft);
    this.root.add(this.tagline);
    const play = new Button(this, 0, 0, {
      w: 380,
      h: 100,
      label: t('menu.play'),
      color: C.terracotta,
      fontSize: FS.h2,
      onClick: () => undefined,
    });
    this.buttons = [play];
    this.root.add(play);
    this.markReady();
  }

  protected layout(): void {
    const f = this.frame;
    this.logo.setPosition(f.w / 2, f.h * 0.28);
    this.tagline.setPosition(f.w / 2, f.h * 0.28 + 110);
    this.buttons.forEach((b, i) => b.setPosition(f.w / 2, f.h * 0.6 + i * 120));
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
    });
  }
}
