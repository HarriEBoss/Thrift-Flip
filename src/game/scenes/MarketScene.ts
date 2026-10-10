import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, Slider, drawCard, makeText } from '../ui/widgets';
import { drawStepIcon, iconAd, iconArrow, iconCoin, iconGift, iconTool, iconWorkshop } from '../ui/icons';
import { Coach } from '../ui/coach';
import { C, FS, RARITY_COLORS } from '../theme';
import { session } from '../session';
import { gridPositions } from '../ui/layout';
import { instanceThumb } from '../art/textures';
import { ITEMS, market as marketDef, paletteHex } from '../../core/data';
import {
  applyAppraiserTip,
  availableMarkets,
  buyOffer,
  canBuy,
  generateOffers,
  haggle,
  offerEstimate,
  priceFor,
  rerollMarket,
  slotsLeft,
  visibleRarity,
  type Offer,
} from '../../core/market';
import { recipeFor } from '../../core/items';
import { advancePhase, shelfItems, workshopQueue, grantBonus } from '../../core/day';
import { trendsFor } from '../../core/trends';
import { openMarketSwitch } from '../ui/menus';
import { openUpgradesHub, upgradesAvailable } from '../ui/upgradesHub';
import { freeGiftAmount, freeGiftAvailable } from '../../core/ads';
import type { ItemInstance } from '../../core/state';
import { REWARD_IDS } from '../../platform/Platform';
import { t } from '../../i18n';
import type { StepKind } from '../../core/types';
import { businessOffers, openJobs, signContract, type JobOffer } from '../../core/jobs';
import { BUSINESSES, canSwitchBusiness, isReselling, setCurrentBusiness } from '../../core/empire';
import { persona } from '../../core/data';

export const HINT_KEYS: Record<StepKind, string> = {
  sticker: 'hint.sticker',
  scrub: 'hint.scrub',
  rust: 'hint.rust',
  sand: 'hint.sand',
  glue: 'hint.glue',
  wire: 'hint.wire',
  design: 'hint.design',
  fix: 'hint.fix',
  paint: 'hint.paint',
  polish: 'hint.polish',
};

export function offerInstance(o: Offer): ItemInstance {
  return { uid: -1, a: o.a, r: o.r, rev: false, s: o.s, d: o.d, paid: 0, q: -1, sc: [], col: '', day: 0 };
}

/** A display-only instance of a job's item (for thumbnails). */
export function jobInstance(o: JobOffer): ItemInstance {
  return { uid: -1, a: o.a, r: 0, rev: true, s: o.s, d: o.d, paid: 0, q: -1, sc: [], col: '', day: 0 };
}

export function rarityLabel(r: number): string {
  return ['', t('rarity.uncommon'), t('rarity.rare'), t('rarity.gem')][r] ?? '';
}

export class MarketScene extends GameScene {
  private workBtn!: Button;
  private workIcon!: Button;
  /** Working at a repair business today: the cards are customer jobs instead of things to buy. */
  private board = false;
  private jobs: JobOffer[] = [];
  private offers: Offer[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private header!: Phaser.GameObjects.Container;
  private marketTitle!: Phaser.GameObjects.Text;
  private slotsText!: Phaser.GameObjects.Text;
  private goBtn!: Button;
  private switchBtn!: Button;
  private trendsBtn!: Button;
  private rerollBtn!: Button;
  private giftBtn!: Button;
  private upgradesBtn!: Button;
  private upgradesIcon!: Button;
  private coach: Coach | null = null;
  private tutorialStep = 0;

  constructor() {
    super('Market');
  }

  protected hudTitle(): string {
    return t('phase.market');
  }

  protected build(): void {
    // Phaser reuses scene instances: reset per-visit state.
    this.offers = [];
    this.cards = [];
    this.coach = null;
    this.tutorialStep = 0;
    this.jobs = [];
    const s = session.state;
    this.board = !isReselling(s);
    if (s.day.ph !== 'market') {
      this.scene.start('Workshop');
      return;
    }
    if (!this.board && marketDef(s.day.market).auction && s.day.bought.length === 0 && s.flags.tutorialDone) {
      // Auction Night has its own scene.
      this.scene.start('Auction');
      return;
    }
    this.bgColors = { base: 0xfdf0dc, dots: 0xf6dfbd };
    session.audio.music('menu');
    this.buildHud();
    this.offers = this.board ? [] : generateOffers(s);
    this.jobs = this.board ? businessOffers(s, s.biz.cur) : [];
    this.header = this.add.container(0, 0);
    this.marketTitle = this.txt(0, 0, '', FS.h3, C.white, { stroke: C.ink, strokeW: 6 });
    this.slotsText = this.txt(0, 0, '', FS.body, C.ink);
    this.header.add([this.marketTitle, this.slotsText]);
    this.root.add(this.header);
    this.goBtn = new Button(this, 0, 0, {
      w: 330,
      h: 92,
      label: t('market.toWorkshop'),
      color: C.terracotta,
      fontSize: FS.h3,
      icon: (g, sz) => iconArrow(g, sz),
      onClick: () => this.leave(),
    });
    this.switchBtn = new Button(this, 0, 0, {
      w: 200,
      h: 64,
      label: t('market.switch'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => this.openSwitch(),
    });
    this.trendsBtn = new Button(this, 0, 0, {
      w: 170,
      h: 64,
      label: t('market.trends'),
      color: C.mustardDark,
      fontSize: FS.small,
      onClick: () => this.openTrends(),
    });
    this.rerollBtn = new Button(this, 0, 0, {
      w: 200,
      h: 64,
      label: t('market.reroll'),
      color: C.leafDark,
      fontSize: FS.small,
      icon: (g, sz) => iconAd(g, sz),
      onClick: () => void this.doReroll(),
    });
    this.giftBtn = new Button(this, 0, 0, {
      w: 84,
      h: 76,
      label: '',
      color: C.white,
      icon: (g, sz) => iconGift(g, sz),
      onClick: () => void this.freeGift(),
    });
    this.upgradesBtn = new Button(this, 0, 0, {
      w: 190,
      h: 64,
      label: t('menu.upgrades'),
      color: C.leaf,
      fontSize: FS.small,
      icon: (g, sz) => iconTool(g, sz),
      onClick: () => openUpgradesHub(this, () => this.layout()),
    });
    // Narrow screens: a compact icon button so it does not cover the market name.
    this.upgradesIcon = new Button(this, 0, 0, {
      w: 84,
      h: 76,
      label: '',
      color: C.leaf,
      icon: (g, sz) => iconTool(g, sz),
      onClick: () => openUpgradesHub(this, () => this.layout()),
    });
    const cur = s.biz.cur;
    this.workBtn = new Button(this, 0, 0, {
      w: 210,
      h: 64,
      label: t('empire.workAt'),
      color: C.terracottaDark,
      fontSize: FS.small,
      icon: (g, sz) => iconWorkshop(g, cur, sz),
      onClick: () => this.openWorkAt(),
    });
    this.workIcon = new Button(this, 0, 0, {
      w: 84,
      h: 76,
      label: '',
      color: C.terracottaDark,
      icon: (g, sz) => iconWorkshop(g, cur, sz),
      onClick: () => this.openWorkAt(),
    });
    this.root.add([
      this.workBtn,
      this.workIcon,
      this.goBtn,
      this.switchBtn,
      this.trendsBtn,
      this.rerollBtn,
      this.giftBtn,
      this.upgradesBtn,
      this.upgradesIcon,
    ]);
    this.mark('go', this.goBtn);
    this.mark('switch', this.switchBtn);
    this.mark('trends', this.trendsBtn);
    this.mark('reroll', this.rerollBtn);
    this.mark('gift', this.giftBtn);
    if (!s.flags.tutorialDone) {
      this.coach = new Coach(this);
      this.tutorialStep = 0;
    }
  }

  protected layout(): void {
    if (!this.hud) return;
    const f = this.frame;
    this.layoutHud();
    const top = 104;
    this.header.setPosition(0, 0);
    this.marketTitle.setPosition(f.w / 2, top + 30);
    this.refreshHeader();
    const bottomH = f.portrait ? 200 : 120;
    const tut = !!this.coach;
    const box = f.portrait
      ? { x: 24, y: top + 112, w: f.w - 48, h: f.h - top - 112 - bottomH - (tut ? 120 : 0) }
      : {
          x: tut ? f.w * 0.5 : 24,
          y: top + 112,
          w: tut ? f.w * 0.5 - 24 : f.w - 48,
          h: f.h - top - 112 - bottomH,
        };
    this.slotsText.setPosition(f.w / 2, top + 76);
    const n = upgradesAvailable();
    const up = f.portrait ? this.upgradesIcon : this.upgradesBtn;
    this.upgradesBtn.setVisible(false);
    this.upgradesIcon.setVisible(false);
    up.setVisible(session.state.flags.tutorialDone);
    up.setPosition(f.w - 24 - (f.portrait ? 42 : 95), top + (f.portrait ? 30 : 44));
    up.setBadge(n > 0 ? String(n) : null);
    this.mark('upgrades', up);
    this.renderCards(box);
    const by = f.h - 60;
    if (f.portrait) {
      this.goBtn.setPosition(f.w / 2 + 50, by);
      this.switchBtn.setPosition(f.w * 0.22, by - 110);
      this.trendsBtn.setPosition(f.w * 0.5, by - 110);
      this.rerollBtn.setPosition(f.w * 0.78, by - 110);
      this.giftBtn.setPosition(f.w - 58, by);
    } else {
      this.goBtn.setPosition(f.w - 200, by);
      this.switchBtn.setPosition(250, by);
      this.trendsBtn.setPosition(450, by);
      this.rerollBtn.setPosition(650, by);
      this.giftBtn.setPosition(f.w - 420, by);
    }
    // Where you work today: top left, opposite the upgrades button (once you own a second business).
    const st = session.state;
    const many = st.flags.tutorialDone && st.biz.own.length > 1;
    const wb = f.portrait ? this.workIcon : this.workBtn;
    this.workBtn.setVisible(false);
    this.workIcon.setVisible(false);
    wb.setVisible(many);
    wb.setPosition(24 + (f.portrait ? 42 : 105), top + (f.portrait ? 30 : 44));
    const elsewhere = st.biz.own.filter((id) => id !== st.biz.cur).reduce((n, id) => n + openJobs(st, id), 0);
    wb.setBadge(many && canSwitchBusiness(st) && elsewhere > 0 ? String(elsewhere) : null);
    this.mark('workAt', wb);
    this.updateButtons();
    this.updateTutorial();
  }

  private refreshHeader(): void {
    const s = session.state;
    if (this.board) {
      this.marketTitle.setText(t(`biz.${s.biz.cur}`));
      this.slotsText.setText(t('jobs.board', { n: openJobs(s, s.biz.cur) }));
      return;
    }
    const m = marketDef(s.day.market);
    this.marketTitle.setText(t(`market.${m.id}`));
    this.slotsText.setText(t('market.slots', { n: slotsLeft(s) }));
  }

  private updateButtons(): void {
    const s = session.state;
    const tut = !s.flags.tutorialDone;
    const mk = !tut && !this.board;
    this.switchBtn.setVisible(mk && availableMarkets(s).length > 1 && s.day.bought.length === 0);
    this.trendsBtn.setVisible(mk);
    this.rerollBtn.setVisible(mk && session.platform.capabilities.rewardedAds && s.day.rerolls < 2);
    this.giftBtn.setVisible(!tut && session.platform.capabilities.rewardedAds && freeGiftAvailable(s));
    const hasWork = workshopQueue(s).length > 0;
    const hasShelf = !this.board && shelfItems(s).length > 0;
    this.goBtn.setLabel(
      hasWork || tut ? t('market.toWorkshop') : hasShelf ? t('market.toShop') : t('market.endDay'),
    );
    this.goBtn.setEnabled(!tut || hasWork);
  }

  private renderCards(box: { x: number; y: number; w: number; h: number }): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    if (this.board) {
      const g = gridPositions(this.jobs.length, box, 1.32, 14);
      const size = Math.min(g.cell, 230);
      this.jobs.forEach((o, i) => {
        const card = this.makeJobCard(o, size);
        card.setPosition(g.pos[i].x, g.pos[i].y);
        this.root.add(card);
        this.cards.push(card);
        this.mark(`job${i}`, card);
      });
      return;
    }
    const g = gridPositions(this.offers.length, box, 1.32, 14);
    const size = Math.min(g.cell, 230);
    this.offers.forEach((o, i) => {
      const p = g.pos[i];
      const card = this.makeCard(o, size);
      card.setPosition(p.x, p.y);
      this.root.add(card);
      this.cards.push(card);
      this.mark(`card${i}`, card);
    });
  }

  private makeCard(o: Offer, w: number): Phaser.GameObjects.Container {
    const s = session.state;
    const h = w * 1.32;
    const c = this.add.container(0, 0);
    const bought = s.day.bought.includes(o.idx);
    const bg = this.add.graphics();
    const vr = visibleRarity(s, o);
    drawCard(bg, -w / 2, -h / 2, w, h, bought ? 0xe8efe0 : C.paper, {
      radius: 20,
      stroke: vr > 0 ? RARITY_COLORS[vr] : C.ink,
      strokeW: vr > 0 ? 6 : 4,
    });
    c.add(bg);
    const img = this.add.image(0, -h * 0.12, instanceThumb(this, offerInstance(o)));
    img.setDisplaySize(w * 0.82, w * 0.82);
    c.add(img);
    // One line, shrunk to fit, so it never runs into the price tag.
    const name = makeText(this, 0, h * 0.3, ITEMS[o.a].name, Math.max(16, Math.round(w * 0.1)), C.ink);
    if (name.width > w - 14) name.setScale((w - 14) / name.width);
    c.add(name);
    // price tag
    const price = priceFor(s, o);
    const tag = this.add.graphics();
    const tw = Math.max(70, w * 0.46);
    drawCard(tag, -tw / 2, h / 2 - 34, tw, 40, bought ? C.leaf : C.mustard, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const coin = this.add.graphics();
    iconCoin(coin, 26);
    coin.setPosition(-tw / 2 + 20, h / 2 - 14);
    const pt = makeText(this, 8, h / 2 - 14, bought ? t('market.got') : String(price), FS.small, C.ink);
    c.add([tag, coin, pt]);
    if (vr > 0) {
      const badge = makeText(this, 0, -h / 2 + 18, `${'★'.repeat(vr)} ${rarityLabel(vr)}`, FS.tiny, C.white, {
        stroke: C.ink,
        strokeW: 4,
      });
      if (badge.width > w - 30) badge.setScale((w - 30) / badge.width);
      const bgb = this.add.graphics();
      const bw = badge.displayWidth + 20;
      drawCard(bgb, -bw / 2, -h / 2 + 2, bw, 32, RARITY_COLORS[vr], { radius: 16, shadow: 0 });
      c.add([bgb, badge]);
    }
    const hint = recipeFor(offerInstance(o))
      .slice(0, 2)
      .map((st) => t(HINT_KEYS[st.k]))
      .join(' · ');
    const ht = makeText(this, 0, -h / 2 + (vr > 0 ? 52 : 18), hint, FS.tiny, C.inkSoft, { bold: false });
    if (ht.width > w - 10) ht.setScale((w - 10) / ht.width);
    c.add(ht);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.openDetail(o));
    c.add(zone);
    if (bought) c.setAlpha(0.75);
    c.setData('offer', o);
    return c;
  }

  private openDetail(o: Offer): void {
    const s = session.state;
    if (this.hasModal()) return;
    session.audio.play('pop');
    const arch = ITEMS[o.a];
    const m = this.openModal({ title: arch.name, w: 600, h: 860 });
    const img = this.add.image(0, -230, instanceThumb(this, offerInstance(o)));
    img.setDisplaySize(300, 300);
    m.content.add(img);
    const vr = visibleRarity(s, o);
    const lines: Phaser.GameObjects.GameObject[] = [];
    if (vr > 0)
      lines.push(
        makeText(this, 0, -66, `${'★'.repeat(vr)} ${rarityLabel(vr)}`, FS.body, RARITY_COLORS[vr], {
          stroke: C.ink,
          strokeW: 4,
        }),
      );
    // flaws
    const recipe = recipeFor(offerInstance(o));
    const fx = -((recipe.length - 1) * 104) / 2;
    recipe.forEach((st, i) => {
      const ic = this.add.graphics();
      drawStepIcon(ic, st.k, 46);
      ic.setPosition(fx + i * 104, -18);
      const lb = makeText(
        this,
        fx + i * 104,
        22,
        t(HINT_KEYS[st.k]),
        FS.tiny,
        st.req ? C.terracottaDark : C.inkSoft,
      );
      if (lb.width > 100) lb.setScale(100 / lb.width);
      lines.push(ic, lb);
    });
    const [lo, hi] = offerEstimate(s, o);
    const est = makeText(this, 0, 70, t('market.worth', { lo, hi }), FS.body, C.leafDark);
    const askT = makeText(this, 0, 112, t('market.asking', { n: priceFor(s, o) }), FS.h3, C.ink);
    lines.push(est, askT);
    m.content.add(lines);
    const status = canBuy(s, o);
    const bought = status === 'already';
    const buy = new Button(this, 0, 196, {
      w: 360,
      h: 84,
      label: bought ? t('market.inBasket') : t('market.buyFor', { n: priceFor(s, o) }),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => {
        const inst = buyOffer(s, o);
        if (!inst) return;
        session.audio.play('register');
        session.haptic('light');
        this.flyCoins(this.frame.w / 2, this.frame.h / 2, 6);
        void session.save();
        m.close();
        this.refreshHud();
        this.refreshHeader();
        this.layout();
        if (this.coach) {
          this.tutorialStep = 2;
          this.updateTutorial();
        }
      },
    });
    buy.setEnabled(status === 'ok');
    this.mark('buy', buy);
    if (status === 'no_coins') buy.setLabel(t('market.tooPricey'));
    if (status === 'no_slots') buy.setLabel(t('market.noSlots'));
    if (status === 'full') buy.setLabel(t('market.full'));
    m.content.add(buy);
    const tutorial = !s.flags.tutorialDone;
    if (!bought && typeof s.day.haggled[o.idx] !== 'number' && !tutorial) {
      const hag = new Button(this, -150, 294, {
        w: 250,
        h: 64,
        label: t('market.haggle'),
        color: C.mustardDark,
        fontSize: FS.small,
        onClick: () => {
          m.close();
          this.openHaggle(o);
        },
      });
      m.content.add(this.mark('haggle', hag));
    }
    if (
      !bought &&
      session.platform.capabilities.rewardedAds &&
      !s.day.tips.includes(o.idx) &&
      !tutorial &&
      vr < 3
    ) {
      const tip = new Button(this, 150, 294, {
        w: 250,
        h: 64,
        label: t('market.tip'),
        color: C.purple,
        fontSize: FS.small,
        icon: (g, sz) => iconAd(g, sz),
        onClick: async () => {
          if (await this.rewarded(REWARD_IDS.appraiserTip)) {
            applyAppraiserTip(s, o);
            if (o.r === 3) session.audio.play('gem');
            else session.audio.play('sparkle');
            m.close();
            this.layout();
            this.openDetail(o);
          }
        },
      });
      m.content.add(tip);
    }
    if (this.coach && this.tutorialStep <= 1) {
      this.tutorialStep = 1;
      this.coach.say(t('tut.buy'), { target: { x: this.frame.w / 2, y: this.frame.h / 2 + 196 - 50 } });
      m.once(Phaser.GameObjects.Events.DESTROY, () => this.updateTutorial());
    }
  }

  private openHaggle(o: Offer): void {
    const s = session.state;
    const m = this.openModal({ title: t('market.haggleTitle'), w: 600, h: 620 });
    const ask = o.ask;
    const min = Math.max(1, Math.floor(ask * 0.5));
    let offer = Math.max(1, Math.round(ask * 0.85));
    const seller = makeText(this, 0, -170, t('market.sellerSays', { n: ask }), FS.body, C.ink, { wrap: 520 });
    const val = makeText(this, 0, -60, '', FS.h2, C.ink);
    const fmt = (v: number) => Math.round(min + (ask - min) * v);
    const slider = new Slider(this, 0, 20, {
      w: 420,
      value: (offer - min) / Math.max(1, ask - min),
      steps: ask - min,
      format: () => '',
      onChange: (v) => {
        offer = fmt(v);
        val.setText(t('market.yourOffer', { n: offer }));
      },
    });
    val.setText(t('market.yourOffer', { n: offer }));
    const hint = makeText(this, 0, 90, t('market.haggleHint'), FS.small, C.inkSoft, {
      wrap: 500,
      bold: false,
    });
    const go = new Button(this, 0, 180, {
      w: 300,
      h: 80,
      label: t('market.offer'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => {
        const res = haggle(s, o, offer);
        m.close();
        if (res === 'accepted') {
          session.audio.play('ding');
          this.toast(t('market.dealYes', { n: priceFor(s, o) }), C.leafDark);
        } else {
          session.audio.play('fail');
          this.toast(t('market.dealNo', { n: priceFor(s, o) }), C.terracottaDark);
        }
        void session.save();
        this.layout();
        this.openDetail(o);
      },
    });
    m.content.add([seller, val, slider, hint, this.mark('offer', go)]);
  }

  private openSwitch(): void {
    openMarketSwitch(this);
  }

  private openTrends(): void {
    const s = session.state;
    const tr = trendsFor(s.seed, s.day.n, s.tier);
    const m = this.openModal({ title: t('market.trendsTitle'), w: 600, h: 620 });
    const rows: Phaser.GameObjects.GameObject[] = [];
    let y = -190;
    rows.push(makeText(this, 0, y, t('market.trendsWeek', { n: tr.week + 1 }), FS.body, C.inkSoft));
    y += 60;
    for (const [cat, mod] of Object.entries(tr.mods)) {
      const hot = (mod ?? 1) > 1;
      rows.push(
        makeText(
          this,
          0,
          y,
          `${hot ? '▲' : '▼'} ${t(`cat.${cat}`)}  ${hot ? '+' : ''}${Math.round(((mod ?? 1) - 1) * 100)}%`,
          FS.h3,
          hot ? C.leafDark : C.terracottaDark,
        ),
      );
      y += 56;
    }
    y += 20;
    rows.push(makeText(this, 0, y, t('market.trendColor', { c: t(`color.${tr.color}`) }), FS.body, C.ink));
    const sw = this.add.graphics();
    drawCard(sw, -40, y + 30, 80, 50, parseInt(paletteHex(tr.color).slice(1), 16), {
      radius: 14,
      stroke: C.ink,
      strokeW: 3,
    });
    rows.push(sw);
    m.content.add(rows);
  }

  /** A customer job on the board: the broken item, what they want and what it pays. */
  private makeJobCard(o: JobOffer, w: number): Phaser.GameObjects.Container {
    const s = session.state;
    const h = w * 1.32;
    const taken = s.day.jobs.includes(o.id);
    const c = this.add.container(0, 0);
    const bg = this.add.graphics();
    const special = o.k !== 'service' || o.items.length > 1;
    drawCard(bg, -w / 2, -h / 2, w, h, taken ? 0xe8efe0 : o.k === 'design' ? 0xe3eefc : C.paper, {
      radius: 20,
      stroke: o.region ? C.mustardDark : special ? C.terracotta : C.ink,
      strokeW: o.region ? 8 : special ? 6 : 4,
    });
    const img = this.add.image(0, -h * 0.07, instanceThumb(this, jobInstance(o)));
    img.setDisplaySize(w * 0.7, w * 0.7);
    if (o.k === 'design') img.setTint(0x9fc8ff);
    const label = o.items.length > 1 ? `${o.items.length} × ${ITEMS[o.a].name}` : ITEMS[o.a].name;
    const name = makeText(this, 0, h * 0.3, label, Math.max(16, Math.round(w * 0.1)), C.ink);
    if (name.width > w - 14) name.setScale((w - 14) / name.width);
    const kindKey = o.region
      ? 'jobs.kindShort.flagship'
      : o.items.length > 1
        ? 'jobs.kindShort.fleet'
        : `jobs.kindShort.${o.k}`;
    const kind = makeText(this, 0, -h / 2 + 18, t(kindKey), FS.tiny, C.inkSoft, { bold: false });
    if (kind.width > w - 10) kind.setScale((w - 10) / kind.width);
    const stars = makeText(this, 0, -h / 2 + 44, '★'.repeat(o.stars), FS.tiny, C.mustardDark);
    const tag = this.add.graphics();
    const tw = Math.max(80, w * 0.55);
    drawCard(tag, -tw / 2, h / 2 - 34, tw, 40, taken ? C.leaf : C.mustard, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const coin = this.add.graphics();
    iconCoin(coin, 26);
    coin.setPosition(-tw / 2 + 20, h / 2 - 14);
    const total = o.fee * o.items.length;
    const pt = makeText(this, 10, h / 2 - 14, taken ? t('jobs.taken') : String(total), FS.small, C.ink);
    if (pt.width > tw - 44) pt.setScale((tw - 44) / pt.width);
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.openJobDetail(o));
    c.add([bg, img, name, kind, stars, tag, coin, pt, zone]);
    if (taken) c.setAlpha(0.75);
    return c;
  }

  /** The contract: between your company and the client, what to do, how well, what it pays. */
  private openJobDetail(o: JobOffer): void {
    const s = session.state;
    if (this.hasModal()) return;
    session.audio.play('pop');
    const taken = s.day.jobs.includes(o.id);
    const m = this.openModal({ title: t('contract.title'), w: 640, h: 860 });
    const paper = this.add.graphics();
    drawCard(paper, -280, -330, 560, 470, 0xfffdf4, { radius: 10, stroke: C.inkSoft, strokeW: 2, shadow: 4 });
    const client = o.client || persona(o.p).name;
    const parties = makeText(
      this,
      0,
      -296,
      t('contract.between', { company: s.company, client }),
      FS.small,
      C.ink,
      {
        wrap: 520,
      },
    );
    const img = this.add.image(-170, -180, instanceThumb(this, jobInstance(o)));
    img.setDisplaySize(150, 150);
    if (o.k === 'design') img.setTint(0x9fc8ff);
    const item = ITEMS[o.a].name;
    const what =
      o.k === 'design'
        ? t('contract.design', { item })
        : o.items.length > 1
          ? t('contract.fleet', { n: o.items.length, item })
          : t(`jobs.kind.${o.k}`, { item });
    const lines: Array<[string, string]> = [
      [t('contract.difficulty'), '★'.repeat(o.stars) + '☆'.repeat(5 - o.stars)],
      [t('contract.quality'), '★'.repeat(o.target)],
      [
        t('contract.pay'),
        o.items.length > 1
          ? t('contract.payEach', { n: o.fee, total: o.fee * o.items.length })
          : String(o.fee),
      ],
    ];
    const rows: Phaser.GameObjects.GameObject[] = [
      paper,
      parties,
      img,
      makeText(this, -80, -180, what, FS.body, C.ink, { align: 'left', wrap: 340 }),
    ];
    lines.forEach(([k, v], i) => {
      const y = -60 + i * 46;
      rows.push(
        makeText(this, -240, y, k, FS.small, C.inkSoft, { align: 'left', bold: false }),
        makeText(this, 240, y, v, FS.small, i === 2 ? C.leafDark : C.mustardDark, { align: 'right' }),
      );
    });
    // Signature line with the company name.
    const sig = this.add.graphics();
    sig.lineStyle(3, C.inkSoft, 1);
    sig.lineBetween(-200, 112, 200, 112);
    const signed = makeText(this, 0, 92, taken ? s.company : '…', FS.body, C.sky, { wrap: 420 });
    signed.setAngle(-3);
    rows.push(
      sig,
      signed,
      makeText(this, 0, 128, t('contract.signHere'), FS.tiny, C.inkSoft, { bold: false }),
    );
    rows.push(
      makeText(this, 0, 186, t('contract.note', { name: client }), FS.tiny, C.inkSoft, {
        wrap: 560,
        bold: false,
      }),
    );
    const b = new Button(this, 0, 270, {
      w: 360,
      h: 84,
      label: taken ? t('jobs.taken') : t('contract.sign'),
      color: taken ? C.inkSoft : C.terracotta,
      fontSize: FS.h3,
      onClick: () => {
        if (!signContract(s, o.id).length) return;
        session.audio.play('stamp');
        session.haptic('success');
        void session.save(true);
        m.close();
        this.layout();
        this.toast(t('contract.signed', { company: s.company }), C.leafDark);
      },
    });
    b.setEnabled(!taken);
    rows.push(this.mark('take', b));
    m.content.add(rows);
  }

  /** Choose which of your businesses to work at today. */
  private openWorkAt(): void {
    const s = session.state;
    if (this.hasModal()) return;
    const own = BUSINESSES.filter((b) => s.biz.own.includes(b.id));
    const rowH = 118;
    const m = this.openModal({ title: t('empire.workAtTitle'), w: 640, h: 250 + own.length * rowH });
    const can = canSwitchBusiness(s);
    m.content.add(
      makeText(
        this,
        0,
        -m.ph / 2 + 92,
        can ? t('empire.workAtIntro') : t('empire.workAtLater'),
        FS.tiny,
        C.inkSoft,
        {
          wrap: 560,
          bold: false,
        },
      ),
    );
    const top = -m.ph / 2 + 186;
    own.forEach((b, i) => {
      const row = this.add.container(0, top + i * rowH);
      const here = s.biz.cur === b.id;
      const g = this.add.graphics();
      drawCard(g, -290, -50, 580, 100, here ? 0xdff2d5 : C.white, {
        radius: 18,
        stroke: C.ink,
        strokeW: 3,
        shadow: 3,
      });
      const art = this.add.graphics();
      iconWorkshop(art, b.id, 58);
      art.setPosition(-240, 0);
      const sub = b.id === 'reselling' ? t('empire.resellSub') : t('jobs.board', { n: openJobs(s, b.id) });
      const btn = new Button(this, 200, 0, {
        w: 160,
        h: 64,
        label: here ? t('empire.here') : t('empire.workHere'),
        color: here ? C.inkSoft : C.leaf,
        fontSize: FS.small,
        onClick: () => {
          if (!setCurrentBusiness(s, b.id)) return;
          session.audio.play('whoosh');
          void session.save(true);
          m.close();
          this.scene.restart();
        },
      });
      btn.setEnabled(can && !here);
      this.mark(`work_${b.id}`, btn);
      row.add([
        g,
        art,
        makeText(this, -196, -18, t(`biz.${b.id}`), FS.small, C.ink, { align: 'left' }),
        makeText(this, -196, 18, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false }),
        btn,
      ]);
      m.content.add(row);
    });
  }

  private async doReroll(): Promise<void> {
    if (await this.rewarded(REWARD_IDS.marketReroll)) {
      rerollMarket(session.state);
      void session.save();
      session.audio.play('whoosh');
      this.scene.restart();
    }
  }

  private async freeGift(): Promise<void> {
    const s = session.state;
    if (!freeGiftAvailable(s)) return;
    if (await this.rewarded(REWARD_IDS.freeGift)) {
      s.day.gifts++;
      const amt = grantBonus(s, freeGiftAmount(s));
      session.audio.play('coin');
      this.flyCoins(this.giftBtn.x, this.giftBtn.y, 12);
      this.floatText(this.giftBtn.x, this.giftBtn.y - 60, `+${amt}`, C.gold);
      this.refreshHud();
      this.updateButtons();
      void session.save();
    }
  }

  private leave(): void {
    const s = session.state;
    advancePhase(s, 'workshop');
    void session.save(true);
    if (workshopQueue(s).length > 0) this.scene.start('Workshop');
    else if (!this.board && shelfItems(s).length > 0) {
      advancePhase(s, 'shop');
      this.scene.start('Shop');
    } else {
      advancePhase(s, 'shop');
      advancePhase(s, 'summary');
      this.scene.start('Summary');
    }
  }

  private updateTutorial(): void {
    if (!this.coach) return;
    const s = session.state;
    if (this.hasModal()) return;
    if (s.day.bought.length === 0) {
      const c = this.cards[0];
      this.coach.say(t('tut.market'), {
        target: c ? { x: c.x, y: c.y - 60 } : undefined,
        at: this.frame.portrait ? 'bottom' : 'bottom',
      });
    } else {
      this.coach.say(t('tut.toWorkshop'), { target: { x: this.goBtn.x, y: this.goBtn.y - 40 }, at: 'top' });
    }
  }
}
