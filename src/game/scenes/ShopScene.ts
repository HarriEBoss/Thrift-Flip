import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, Slider, drawCard, makeText } from '../ui/widgets';
import { iconAd, iconArrow } from '../ui/icons';
import { Coach } from '../ui/coach';
import { C, FS } from '../theme';
import { session } from '../session';
import { drawCustomer, type Mood } from '../art/characters';
import { drawDecor } from '../art/decor';
import { DECOR } from '../../core/decor';
import { instanceThumb } from '../art/textures';
import { BALANCE, ITEMS, persona as personaDef } from '../../core/data';
import {
  chooseItem,
  generateVisits,
  postRequest,
  requestTemplate,
  respondToPrice,
  visitWtp,
  walkAway,
  type Visit,
} from '../../core/customers';
import { instanceValue } from '../../core/items';
import { advancePhase, completeSale, grantBonus, shelfItems } from '../../core/day';
import { priceRange, snapPrice, suggestedPrice } from '../../core/economy';
import { charmBonus, shelfCapacity } from '../../core/perks';
import { saleTipAmount, saleTipAvailable } from '../../core/ads';
import type { ItemInstance } from '../../core/state';
import { REWARD_IDS } from '../../platform/Platform';
import { t } from '../../i18n';

/** Per-tier shop look (wall, awning stripes, background). */
const TIER_LOOKS = [
  { bg: 0xfbeee6, dots: 0xf4dccd, wall: 0xf6e3c8, a: C.teal, b: C.cream },
  { bg: 0xeef0f2, dots: 0xdde2e6, wall: 0xe4e7ea, a: C.mustard, b: 0x8f97a0 },
  { bg: 0xeaf5e6, dots: 0xd5ead0, wall: 0xf3f7e8, a: C.leaf, b: C.white },
  { bg: 0xf5ecfa, dots: 0xe7d8f2, wall: 0xf7eefb, a: C.purple, b: C.pink },
  { bg: 0xfff3d6, dots: 0xffe4a6, wall: 0xfff6e2, a: C.gold, b: C.terracotta },
];

export function requestText(id: string): string {
  const r = requestTemplate(id);
  const parts: string[] = [];
  if (r.minQ !== undefined) parts.push(t('req.shiny'));
  if (r.minRarity !== undefined) parts.push(t('req.rare'));
  if (r.color) parts.push(t(`color.${r.color}`));
  if (r.era) parts.push(t('req.era', { era: r.era }));
  parts.push(r.cat ? t(`catOne.${r.cat}`) : t('req.anything'));
  return parts.join(' ');
}

export class ShopScene extends GameScene {
  private visits: Visit[] = [];
  private shelf!: Phaser.GameObjects.Container;
  private customer!: Phaser.GameObjects.Container;
  private custG!: Phaser.GameObjects.Graphics;
  private bubble!: Phaser.GameObjects.Container;
  private counter!: Phaser.GameObjects.Graphics;
  private decor!: Phaser.GameObjects.Container;
  private counterItem: Phaser.GameObjects.Image | null = null;
  private pricePanel!: Phaser.GameObjects.Container;
  private priceText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private moodText!: Phaser.GameObjects.Text;
  private slider: Slider | null = null;
  private sellBtn!: Button;
  private passBtn!: Button;
  private closeBtn!: Button;
  private reqBtn!: Button;
  private queueText!: Phaser.GameObjects.Text;
  private current: { v: Visit; item: ItemInstance } | null = null;
  private price = 0;
  private range: [number, number] = [1, 10];
  private busy = false;
  private coach: Coach | null = null;
  private custBase = { x: 0, y: 0 };

  constructor() {
    super('Shop');
  }

  protected hudTitle(): string {
    return t('phase.shop');
  }

  protected build(): void {
    // Phaser reuses scene instances: reset per-visit state.
    this.visits = [];
    this.current = null;
    this.busy = false;
    this.coach = null;
    this.counterItem = null;
    this.slider = null;
    const s = session.state;
    if (s.day.ph === 'workshop') advancePhase(s, 'shop');
    if (s.day.ph !== 'shop') {
      this.scene.start(s.day.ph === 'summary' ? 'Summary' : 'Market');
      return;
    }
    const look = TIER_LOOKS[s.tier] ?? TIER_LOOKS[0];
    this.bgColors = { base: look.bg, dots: look.dots };
    session.audio.music('shop');
    this.buildHud();
    this.visits = generateVisits(s);
    this.shelf = this.add.container(0, 0);
    this.counter = this.add.graphics();
    this.decor = this.add.container(0, 0);
    this.customer = this.add.container(0, 0);
    this.custG = this.add.graphics();
    this.customer.add(this.custG);
    this.bubble = this.add.container(0, 0);
    this.pricePanel = this.add.container(0, 0);
    this.priceText = this.txt(0, -96, '', FS.h1, C.ink);
    this.valueText = this.txt(0, -160, '', FS.small, C.inkSoft);
    this.moodText = this.txt(0, 50, '', FS.small, C.inkSoft);
    this.sellBtn = new Button(this, 130, 130, {
      w: 250,
      h: 84,
      label: t('shop.sell'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => this.offer(),
    });
    this.passBtn = new Button(this, -150, 130, {
      w: 220,
      h: 72,
      label: t('shop.pass'),
      color: C.inkSoft,
      fontSize: FS.small,
      onClick: () => this.pass(),
    });
    this.pricePanel.add([this.valueText, this.priceText, this.moodText, this.sellBtn, this.passBtn]);
    this.mark('sell', this.sellBtn);
    this.mark('pass', this.passBtn);
    this.closeBtn = new Button(this, 0, 0, {
      w: 340,
      h: 88,
      label: t('shop.close'),
      color: C.terracotta,
      fontSize: FS.h3,
      icon: (g, sz) => iconArrow(g, sz),
      onClick: () => this.closeShop(),
    });
    this.reqBtn = new Button(this, 0, 0, {
      w: 200,
      h: 64,
      label: '',
      color: C.purple,
      fontSize: FS.small,
      onClick: () => this.openRequests(),
    });
    this.queueText = this.txt(0, 0, '', FS.small, C.inkSoft);
    this.mark('closeShop', this.closeBtn);
    this.mark('requests', this.reqBtn);
    this.root.add([
      this.shelf,
      this.counter,
      this.decor,
      this.customer,
      this.bubble,
      this.pricePanel,
      this.closeBtn,
      this.reqBtn,
      this.queueText,
    ]);
    if (!s.flags.tutorialDone) this.coach = new Coach(this);
    this.renderShelf();
    this.time.delayedCall(350, () => this.nextCustomer());
  }

  /** Computed layout for the current frame (tall portrait, short portrait or landscape). */
  private L = {
    shelf: { x: 0, y: 0, w: 600, h: 280 },
    cust: { x: 0, y: 0, scale: 1 },
    bubble: { x: 0, y: 0, w: 520 },
    counter: { x: 0, y: 0, w: 600 },
    item: { x: 0, y: 0 },
    panel: { x: 0, y: 0, scale: 1 },
  };

  protected layout(): void {
    if (!this.shelf) return;
    const f = this.frame;
    this.layoutHud();
    const W = f.w;
    if (f.portrait && f.h >= 1100) {
      this.L = {
        shelf: { x: W / 2, y: 110, w: W - 40, h: 280 },
        bubble: { x: W / 2, y: 500, w: W - 80 },
        cust: { x: W / 2, y: 700, scale: 1 },
        counter: { x: W / 2, y: 790, w: W - 40 },
        item: { x: W / 2 - 180, y: 770 },
        panel: { x: W / 2, y: f.h - 235, scale: 1 },
      };
      this.queueText.setPosition(130, 418);
      this.reqBtn.setPosition(W - 120, 418);
      this.closeBtn.setPosition(W / 2 + 60, f.h - 60);
    } else if (f.portrait) {
      const lx = W * 0.27;
      const rx = W * 0.73;
      this.L = {
        shelf: { x: W / 2, y: 105, w: W - 40, h: 200 },
        bubble: { x: W / 2, y: 400, w: W - 80 },
        cust: { x: lx, y: 600, scale: 0.75 },
        counter: { x: lx, y: 680, w: W * 0.5 },
        item: { x: lx - 110, y: 664 },
        panel: { x: rx, y: 640, scale: 0.66 },
      };
      this.queueText.setPosition(130, 330);
      this.reqBtn.setPosition(W - 120, 330);
      this.closeBtn.setPosition(W / 2 + 60, f.h - 60);
    } else {
      const lx = W * 0.26;
      const rx = W * 0.73;
      this.L = {
        shelf: { x: lx, y: 105, w: W * 0.48, h: 300 },
        bubble: { x: rx, y: 150, w: W * 0.48 },
        cust: { x: rx, y: 340, scale: 0.9 },
        counter: { x: rx, y: 430, w: W * 0.48 },
        item: { x: rx - 170, y: 410 },
        panel: { x: lx, y: 560, scale: 0.75 },
      };
      this.queueText.setPosition(rx, 535);
      this.reqBtn.setPosition(rx, 600);
      this.closeBtn.setPosition(rx, f.h - 60);
    }
    const L = this.L;
    this.shelf.setPosition(L.shelf.x, L.shelf.y);
    this.custBase = { x: L.cust.x, y: L.cust.y };
    this.customer.setPosition(L.cust.x, L.cust.y);
    this.customer.setScale(L.cust.scale);
    this.pricePanel.setPosition(L.panel.x, L.panel.y);
    this.pricePanel.setScale(L.panel.scale);
    this.counter.clear();
    drawCard(this.counter, L.counter.x - L.counter.w / 2, L.counter.y, L.counter.w, 70, 0xb5773f, {
      radius: 14,
      stroke: C.ink,
      strokeW: 4,
      shadow: 6,
    });
    this.counter.fillStyle(0xd59a5e, 1);
    this.counter.fillRoundedRect(L.counter.x - L.counter.w / 2 + 8, L.counter.y + 6, L.counter.w - 16, 18, 8);
    this.drawDecorations();
    if (this.counterItem) this.counterItem.setPosition(L.item.x, L.item.y);
    this.bubble.setPosition(L.bubble.x, L.bubble.y);
    this.renderShelf();
    this.updateMeta();
  }

  /** Owned decorations stand on the right end of the counter (fanciest first). */
  private drawDecorations(): void {
    const L = this.L;
    this.decor.removeAll(true);
    const owned = DECOR.filter(
      (d) => session.state.decor.includes(d.id) && d.id !== 'rug' && d.id !== 'chandelier',
    ).sort((a, b) => b.cost - a.cost);
    const size = 70;
    const room = Math.max(1, Math.min(4, Math.floor((L.counter.w / 2 - 130) / 78)));
    owned.slice(0, room).forEach((d, i) => {
      const x = L.counter.x + L.counter.w / 2 - 50 - i * 78;
      const g = this.add.graphics();
      drawDecor(g, d.id, size);
      g.setPosition(x, L.counter.y - size / 2 + 6);
      this.decor.add(g);
    });
  }

  private shelfHeight(): number {
    return this.L.shelf.h;
  }

  private renderShelf(): void {
    this.shelf.removeAll(true);
    const s = session.state;
    const items = shelfItems(s);
    const cap = shelfCapacity(s);
    const w = this.L.shelf.w;
    const h = this.shelfHeight();
    const bg = this.add.graphics();
    const look = TIER_LOOKS[s.tier] ?? TIER_LOOKS[0];
    drawCard(bg, -w / 2, 0, w, h, look.wall, { radius: 24, stroke: C.ink, strokeW: 4, shadow: 5 });
    this.shelf.add(bg);
    // Striped awning with the shop's name: each tier has its own look.
    const aw = this.add.graphics();
    const stripes = 10;
    const sw = (w - 40) / stripes;
    for (let i = 0; i < stripes; i++) {
      aw.fillStyle(i % 2 ? look.a : look.b, 1);
      aw.fillRect(-w / 2 + 20 + i * sw, -14, sw, 26);
      aw.fillCircle(-w / 2 + 20 + i * sw + sw / 2, 12, sw / 2);
    }
    aw.lineStyle(3, C.ink, 1);
    aw.strokeRect(-w / 2 + 20, -14, w - 40, 26);
    const sign = makeText(this, 0, -2, t(`tier.${BALANCE.tiers[s.tier].id}`), FS.small, C.white, {
      stroke: C.ink,
      strokeW: 5,
    });
    this.shelf.add([aw, sign]);
    const rows = 2;
    const cols = Math.ceil(cap / rows);
    const cellW = (w - 30) / cols;
    const cellH = (h - 20) / rows;
    for (let r = 0; r < rows; r++) {
      const y = 10 + cellH * (r + 1) - 12;
      bg.fillStyle(0xb5773f, 1);
      bg.fillRoundedRect(-w / 2 + 12, y, w - 24, 12, 6);
      bg.lineStyle(3, C.ink, 1);
      bg.strokeRoundedRect(-w / 2 + 12, y, w - 24, 12, 6);
    }
    for (let i = 0; i < cap; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = -w / 2 + 15 + cellW * (c + 0.5);
      const y = 10 + cellH * r + cellH / 2 - 8;
      const it = items[i];
      if (!it) continue;
      const img = this.add.image(x, y, instanceThumb(this, it));
      const sz = Math.min(cellW, cellH) * 0.92;
      img.setDisplaySize(sz, sz);
      img.setData('uid', it.uid);
      this.shelf.add(img);
    }
    if (items.length > cap) {
      this.shelf.add(
        makeText(this, 0, h + 20, t('shop.storage', { n: items.length - cap }), FS.tiny, C.inkSoft),
      );
    }
  }

  private updateMeta(): void {
    const s = session.state;
    const left = Math.max(0, this.visits.length - s.day.served);
    this.queueText.setText(t('shop.queue', { n: left }));
    this.reqBtn.setLabel(t('shop.requests', { n: s.requests.length }));
    this.reqBtn.setVisible(s.flags.tutorialDone);
  }

  // ---------------- customers ----------------

  private nextCustomer(): void {
    const s = session.state;
    this.current = null;
    this.bubble.removeAll(true);
    this.pricePanel.setVisible(false);
    this.counterItem?.destroy();
    this.counterItem = null;
    this.updateMeta();
    if (s.day.served >= this.visits.length || shelfItems(s).length === 0) {
      this.customer.setVisible(false);
      this.showClosing();
      return;
    }
    const v = this.visits[s.day.served];
    const item = chooseItem(s, v);
    if (!item) {
      this.showClosing();
      return;
    }
    this.closeBtn.setVisible(false);
    this.current = { v, item };
    const p = personaDef(v.persona);
    this.custG.clear();
    drawCustomer(this.custG, p, 260, 'happy');
    this.customer.setVisible(true);
    this.customer.setPosition(this.frame.w + 200, this.custBase.y);
    session.audio.play('whoosh');
    this.tweens.add({
      targets: this.customer,
      x: this.custBase.x,
      duration: session.settings().reducedMotion ? 10 : 500,
      ease: 'Back.out',
      onComplete: () => this.greet(),
    });
    this.tweens.add({
      targets: this.customer,
      y: this.custBase.y - 12,
      duration: 120,
      yoyo: true,
      repeat: 3,
    });
  }

  private greet(): void {
    if (!this.current) return;
    const s = session.state;
    const { v, item } = this.current;
    const p = personaDef(v.persona);
    const name = ITEMS[item.a].name;
    const line =
      v.returning !== null
        ? t('shop.returning', { item: name })
        : t('shop.wants', { name: p.name, item: name });
    this.say(line);
    // Item onto the counter
    const img = this.add.image(0, 0, instanceThumb(this, item));
    this.root.add(img);
    this.counterItem = img;
    img.setPosition(this.L.item.x, this.L.item.y);
    const sz = 170 * Math.max(0.75, this.L.cust.scale);
    img.setScale(0);
    this.tweens.add({
      targets: img,
      scaleX: sz / img.width,
      scaleY: sz / img.height,
      duration: 300,
      ease: 'Back.out',
    });
    // Price setup
    const value = instanceValue(s, item);
    this.range = priceRange(value);
    this.price = s.flags.tutorialDone ? suggestedPrice(value) : snapPrice(value * 0.9);
    this.price = Math.max(this.range[0], Math.min(this.range[1], this.price));
    this.slider?.destroy();
    this.slider = new Slider(this, 0, -18, {
      w: 440,
      value: (this.price - this.range[0]) / (this.range[1] - this.range[0]),
      steps: 20,
      format: () => '',
      onChange: (val) => {
        this.price = snapPrice(this.range[0] + (this.range[1] - this.range[0]) * val);
        this.updatePrice();
      },
    });
    this.pricePanel.add(this.slider);
    this.valueText.setText(t('shop.worth', { n: value }));
    this.pricePanel.setVisible(true);
    this.pricePanel.setAlpha(0);
    this.tweens.add({ targets: this.pricePanel, alpha: 1, duration: 200 });
    this.updatePrice();
    this.layout();
    if (this.coach)
      this.coach.say(t('tut.sell'), {
        target: { x: this.pricePanel.x + 130, y: this.pricePanel.y + 90 },
        at: 'top',
      });
  }

  /** Mood preview from what the customer roughly expects (no hidden roll), keeps a little mystery. */
  private moodFor(price: number): Mood {
    if (!this.current) return 'happy';
    const s = session.state;
    const value = instanceValue(s, this.current.item);
    const expect = value * visitWtp(s, this.current.v) * charmBonus(s);
    if (price <= expect * 0.92) return 'happy';
    if (price <= expect * 1.12) return 'think';
    return 'sad';
  }

  private updatePrice(): void {
    this.priceText.setText(t('common.coins', { n: this.price }));
    const mood = this.moodFor(this.price);
    if (this.current) {
      this.custG.clear();
      drawCustomer(this.custG, personaDef(this.current.v.persona), 260, mood);
    }
    this.moodText.setText(t(`shop.mood.${mood}`));
  }

  private say(text: string, color: number = C.white): void {
    this.bubble.removeAll(true);
    const w = Math.min(560, this.L.bubble.w);
    const tx = makeText(this, 0, 0, text, FS.body, C.ink, { wrap: w - 40 });
    const h = tx.height + 40;
    const g = this.add.graphics();
    drawCard(g, -w / 2, -h / 2, w, h, color, { radius: 26, stroke: C.ink, strokeW: 4 });
    g.fillStyle(color, 1);
    g.fillTriangle(-20, h / 2 - 2, 20, h / 2 - 2, 0, h / 2 + 26);
    g.lineStyle(4, C.ink, 1);
    g.lineBetween(-20, h / 2, 0, h / 2 + 26);
    g.lineBetween(20, h / 2, 0, h / 2 + 26);
    this.bubble.add([g, tx]);
    this.bubble.setScale(0.6);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 200, ease: 'Back.out' });
  }

  private offer(): void {
    if (!this.current || this.busy) return;
    const s = session.state;
    const { v, item } = this.current;
    const r = respondToPrice(s, v, item, this.price);
    this.coach?.hide();
    if (r.response === 'sale') this.sell(this.price);
    else if (r.response === 'counter') this.counterOffer(r.counter);
    else {
      this.busy = true;
      const dip = walkAway(s, r.extreme);
      session.audio.play('fail');
      this.custG.clear();
      drawCustomer(this.custG, personaDef(v.persona), 260, 'sad');
      this.say(dip < 0 ? t('shop.walkRude') : t('shop.walk'));
      if (dip < 0) this.floatText(this.customer.x, this.customer.y - 160, t('shop.repDown'), C.terracotta);
      this.leaveCustomer();
    }
  }

  private counterOffer(amount: number): void {
    const v = this.current!.v;
    this.custG.clear();
    drawCustomer(this.custG, personaDef(v.persona), 260, 'think');
    this.say(t('shop.counter', { n: amount }));
    session.audio.play('pop');
    this.pricePanel.setVisible(false);
    const yes = new Button(this, 0, 0, {
      w: 220,
      h: 80,
      label: t('shop.deal'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => {
        yes.destroy();
        no.destroy();
        this.sell(amount);
      },
    });
    const no = new Button(this, 0, 0, {
      w: 220,
      h: 80,
      label: t('shop.noDeal'),
      color: C.inkSoft,
      onClick: () => {
        yes.destroy();
        no.destroy();
        this.busy = true;
        this.say(t('shop.bye'));
        this.leaveCustomer();
      },
    });
    const ps = this.L.panel.scale;
    yes.setScale(ps);
    no.setScale(ps);
    yes.setPosition(this.pricePanel.x + 130 * ps, this.pricePanel.y + 60 * ps);
    no.setPosition(this.pricePanel.x - 130 * ps, this.pricePanel.y + 60 * ps);
    this.root.add([this.mark('deal', yes), this.mark('nodeal', no)]);
  }

  private sell(price: number): void {
    if (!this.current) return;
    this.busy = true;
    const s = session.state;
    const { v, item } = this.current;
    const res = completeSale(s, item, price, v.returning);
    session.audio.play('register');
    session.haptic('success');
    this.custG.clear();
    drawCustomer(this.custG, personaDef(v.persona), 260, 'wow');
    this.say(res.request ? t('shop.thanksRequest') : t('shop.thanks'));
    this.flyCoins(
      this.counterItem?.x ?? this.frame.w / 2,
      this.counterItem?.y ?? this.frame.h / 2,
      Math.min(20, 4 + Math.floor(price / 5)),
    );
    this.floatText(this.customer.x, this.customer.y - 170, `+${res.price}`, C.gold, FS.h1);
    if (res.request) this.floatText(this.customer.x, this.customer.y - 240, t('shop.requestDone'), C.purple);
    if (this.counterItem)
      this.tweens.add({
        targets: this.counterItem,
        x: this.customer.x,
        y: this.customer.y,
        scale: 0,
        duration: 400,
      });
    this.pricePanel.setVisible(false);
    void session.submitScoreIfBest();
    void session.save();
    this.refreshHud();
    this.renderShelf();
    if (res.levelUps > 0) this.time.delayedCall(700, () => this.celebrateLevel(res.levelUps));
    // Optional small reward: ask for a tip (rewarded ad).
    if (session.platform.capabilities.rewardedAds && saleTipAvailable(s) && !this.coach) {
      const amt = saleTipAmount(res.price);
      const tip = new Button(this, this.pricePanel.x, this.pricePanel.y, {
        w: 260,
        h: 70,
        label: t('shop.tip', { n: amt }),
        color: C.mustardDark,
        fontSize: FS.small,
        icon: (g, sz) => iconAd(g, sz),
        onClick: async () => {
          tip.destroy();
          if (await this.rewarded(REWARD_IDS.saleTip)) {
            s.day.tipsAds++;
            grantBonus(s, amt);
            session.audio.play('coin');
            this.flyCoins(this.customer.x, this.customer.y, 8);
            this.refreshHud();
            void session.save();
          }
          this.leaveCustomer(200);
        },
      });
      this.root.add(this.mark('tip', tip));
      this.time.delayedCall(2600, () => {
        if (tip.active) {
          tip.destroy();
          this.leaveCustomer(0);
        }
      });
      return;
    }
    this.leaveCustomer(900);
  }

  private pass(): void {
    if (!this.current || this.busy) return;
    this.busy = true;
    this.say(t('shop.okBye'));
    this.leaveCustomer();
  }

  private leaveCustomer(delay = 900): void {
    if (!this.current) return;
    const s = session.state;
    const v = this.current.v;
    this.current = null;
    this.pricePanel.setVisible(false);
    this.time.delayedCall(delay, () => {
      const req = postRequest(s, v);
      const proceed = () => {
        s.day.served++;
        void session.save();
        this.tweens.add({
          targets: this.customer,
          x: -200,
          duration: session.settings().reducedMotion ? 10 : 450,
          ease: 'Back.in',
          onComplete: () => {
            this.busy = false;
            this.nextCustomer();
          },
        });
      };
      if (req) {
        this.say(t('shop.request', { what: requestText(req.t) }), 0xf1e9ff);
        session.audio.play('stamp');
        this.time.delayedCall(1800, proceed);
      } else proceed();
    });
  }

  private showClosing(): void {
    const s = session.state;
    this.pricePanel.setVisible(false);
    this.closeBtn.setVisible(true);
    this.say(shelfItems(s).length ? t('shop.allServed') : t('shop.soldOut'));
    this.bubble.setPosition(this.L.cust.x, this.L.cust.y);
    if (this.coach)
      this.coach.say(t('tut.close'), { target: { x: this.closeBtn.x, y: this.closeBtn.y - 40 }, at: 'top' });
  }

  private openRequests(): void {
    const s = session.state;
    const m = this.openModal({ title: t('shop.requestsTitle'), w: 600, h: 520 });
    if (!s.requests.length)
      m.content.add(makeText(this, 0, -60, t('shop.noRequests'), FS.body, C.inkSoft, { wrap: 520 }));
    s.requests.forEach((r, i) => {
      const p = personaDef(r.p);
      m.content.add(
        makeText(this, 0, -150 + i * 90, `${p.name}: ${requestText(r.t)}`, FS.body, C.ink, { wrap: 520 }),
      );
    });
    m.content.add(
      makeText(this, 0, 110, t('shop.requestsHint'), FS.small, C.inkSoft, { wrap: 520, bold: false }),
    );
  }

  private closeShop(): void {
    const s = session.state;
    advancePhase(s, 'summary');
    void session.submitScoreIfBest();
    void session.save(true);
    this.scene.start('Summary');
  }
}
