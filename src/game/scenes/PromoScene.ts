import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { drawRaccoon } from '../art/characters';
import { buildDamage, compositeDamaged } from '../art/damage';
import { boxFor, ctx2d, drawItem, makeCanvas } from '../art/itemArt';
import { C } from '../theme';
import { ITEMS, itemIndex } from '../../core/data';
import type { ItemInstance } from '../../core/state';

/**
 * Text-free key art for store thumbnails (no logos, no UI, no branding): a before/after split of a
 * restored item with the mascot. Only registered in E2E/dev builds (used by scripts/screenshots.ts).
 */
export class PromoScene extends BaseScene {
  private art!: Phaser.GameObjects.Container;

  constructor() {
    super('Promo');
  }

  protected build(data?: unknown): void {
    this.bgColors = { base: 0xffe9c2, dots: 0xffd88f };
    const id = (data as { item?: string } | undefined)?.item ?? 'rad_cherry_radio';
    const a = itemIndex(id);
    const inst: ItemInstance = {
      uid: -9,
      a,
      r: 0,
      rev: true,
      s: 4242,
      d: 2,
      paid: 0,
      q: -1,
      sc: [],
      col: '',
      day: 0,
    };
    const size = 1024;
    const before = compositeDamaged(buildDamage(inst, size));
    const after = makeCanvas(size);
    drawItem(ctx2d(after), ITEMS[a], boxFor(size));
    for (const [k, c] of [
      ['promo_before', before],
      ['promo_after', after],
    ] as const) {
      if (this.textures.exists(k)) this.textures.remove(k);
      this.textures.addCanvas(k, c);
    }
    this.art = this.add.container(0, 0);
    const card = this.add.graphics();
    card.fillStyle(C.shadow, 0.2);
    card.fillRoundedRect(-310, -290, 620, 620, 48);
    card.fillStyle(C.white, 1);
    card.fillRoundedRect(-310, -310, 620, 620, 48);
    card.lineStyle(8, C.ink, 1);
    card.strokeRoundedRect(-310, -310, 620, 620, 48);
    const aImg = this.add.image(0, 0, 'promo_after').setDisplaySize(580, 580);
    const bImg = this.add.image(0, 0, 'promo_before').setDisplaySize(580, 580);
    bImg.setCrop(0, 0, size * 0.5, size);
    const div = this.add.graphics();
    div.fillStyle(C.white, 1);
    div.fillRect(-5, -290, 10, 580);
    div.lineStyle(4, C.ink, 1);
    div.strokeRect(-5, -290, 10, 580);
    div.fillStyle(C.mustard, 1);
    div.fillCircle(0, 0, 34);
    div.strokeCircle(0, 0, 34);
    const rory = this.add.graphics();
    drawRaccoon(rory, 300, 'wow');
    rory.setPosition(330, 220);
    this.art.add([card, aImg, bImg, div, rory]);
    for (let i = 0; i < 14; i++) {
      const sp = this.add
        .image(150 + Math.cos(i) * 260, -150 + Math.sin(i * 1.7) * 230, 'p_spark')
        .setTint(i % 2 ? C.gold : C.white);
      sp.setScale(0.6 + (i % 3) * 0.3);
      this.art.add(sp);
    }
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(-330 + i * 40, 250 - (i % 2) * 30, 'p_coin').setScale(1.4);
      this.art.add(coin);
    }
    this.root.add(this.art);
  }

  protected layout(): void {
    const f = this.frame;
    const s = Math.min(f.w / 900, f.h / 760);
    this.art.setScale(s);
    this.art.setPosition(f.w / 2 - 40 * s, f.h / 2);
  }
}
