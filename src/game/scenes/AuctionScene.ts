import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, ProgressBar, drawCard, makeText } from '../ui/widgets';
import { iconArrow } from '../ui/icons';
import { C, FS, RARITY_COLORS } from '../theme';
import { session } from '../session';
import { instanceThumb } from '../art/textures';
import { offerInstance, rarityLabel } from './MarketScene';
import { ITEMS } from '../../core/data';
import {
  buyOffer,
  generateOffers,
  offerEstimate,
  slotsLeft,
  visibleRarity,
  type Offer,
} from '../../core/market';
import {
  BID_WINDOW,
  nextBid,
  playerBid,
  playerWon,
  startAuction,
  tickAuction,
  type AuctionState,
} from '../../core/auction';
import { advancePhase, shelfItems, workshopQueue } from '../../core/day';
import { hashSeed } from '../../core/prng';
import { t } from '../../i18n';
import { openMarketSwitch } from '../ui/menus';

/** Auction Night: one lot at a time, timed bidding against 2-3 NPC collectors. */
export class AuctionScene extends GameScene {
  private lots: Offer[] = [];
  private lotIdx = 0;
  private auction: AuctionState | null = null;
  private card!: Phaser.GameObjects.Container;
  private img: Phaser.GameObjects.Image | null = null;
  private nameT!: Phaser.GameObjects.Text;
  private estT!: Phaser.GameObjects.Text;
  private priceT!: Phaser.GameObjects.Text;
  private leaderT!: Phaser.GameObjects.Text;
  private lotT!: Phaser.GameObjects.Text;
  private timer!: ProgressBar;
  private bidBtn!: Button;
  private skipBtn!: Button;
  private goBtn!: Button;
  private switchBtn!: Button;
  private lastBids = 0;
  private resultShown = false;

  constructor() {
    super('Auction');
  }

  protected hudTitle(): string {
    return t('market.auction');
  }

  protected build(): void {
    this.lots = [];
    this.lotIdx = 0;
    this.auction = null;
    this.img = null;
    this.lastBids = 0;
    this.resultShown = false;
    const s = session.state;
    if (s.day.ph !== 'market') {
      this.scene.start('Workshop');
      return;
    }
    this.bgColors = { base: 0x2e2a3a, dots: 0x3a3550 };
    session.audio.music('shop');
    this.buildHud();
    this.lots = generateOffers(s).filter((o) => !s.day.bought.includes(o.idx));
    this.card = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawCard(bg, -300, -330, 600, 660, C.paper, { radius: 30, stroke: C.ink, strokeW: 5, shadow: 10 });
    this.lotT = makeText(this, 0, -296, '', FS.small, C.inkSoft);
    this.nameT = makeText(this, 0, -40, '', FS.h3, C.ink, { wrap: 560 });
    this.estT = makeText(this, 0, 4, '', FS.small, C.leafDark);
    this.priceT = makeText(this, 0, 70, '', FS.h1, C.terracotta, { stroke: C.ink, strokeW: 6 });
    this.leaderT = makeText(this, 0, 132, '', FS.body, C.ink);
    this.timer = new ProgressBar(this, 0, 186, 460, 24, C.mustard);
    this.bidBtn = new Button(this, 90, 268, {
      w: 320,
      h: 88,
      label: '',
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => this.bid(),
    });
    this.skipBtn = new Button(this, -200, 268, {
      w: 170,
      h: 70,
      label: t('auction.skip'),
      color: C.inkSoft,
      fontSize: FS.small,
      onClick: () => this.skipLot(),
    });
    this.card.add([
      bg,
      this.lotT,
      this.nameT,
      this.estT,
      this.priceT,
      this.leaderT,
      this.timer,
      this.bidBtn,
      this.skipBtn,
    ]);
    this.goBtn = new Button(this, 0, 0, {
      w: 330,
      h: 88,
      label: t('market.toWorkshop'),
      color: C.terracotta,
      fontSize: FS.h3,
      icon: (g, sz) => iconArrow(g, sz),
      onClick: () => this.leave(),
    });
    this.switchBtn = new Button(this, 0, 0, {
      w: 220,
      h: 64,
      label: t('market.switch'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => openMarketSwitch(this),
    });
    this.switchBtn.setVisible(s.day.bought.length === 0);
    this.root.add([this.card, this.goBtn, this.switchBtn]);
    this.mark('switch', this.switchBtn);
    this.mark('bid', this.bidBtn);
    this.mark('skipLot', this.skipBtn);
    this.mark('go', this.goBtn);
    this.nextLot();
  }

  protected layout(): void {
    if (!this.card) return;
    const f = this.frame;
    this.layoutHud();
    const sc = Math.min(1, (f.h - 230) / 680, (f.w - 40) / 620);
    this.card.setScale(sc);
    const availTop = 110;
    const availBottom = f.h - 120;
    this.card.setPosition(
      f.portrait ? f.w / 2 : f.w * 0.4,
      Math.max(availTop + (680 * sc) / 2, (availTop + availBottom) / 2),
    );
    this.goBtn.setPosition(f.portrait ? f.w / 2 + 50 : f.w * 0.82, f.h - 60);
    this.switchBtn.setPosition(f.portrait ? f.w - 130 : f.w * 0.82, f.portrait ? 120 + 0 : 200);
  }

  private nextLot(): void {
    const s = session.state;
    this.img?.destroy();
    this.img = null;
    this.resultShown = false;
    if (this.lotIdx >= this.lots.length || slotsLeft(s) <= 0) {
      this.auction = null;
      this.card.setVisible(false);
      this.goBtn.setVisible(true);
      this.toast(t('auction.over'));
      return;
    }
    this.goBtn.setVisible(this.lotIdx > 0 || s.day.bought.length > 0);
    const lot = this.lots[this.lotIdx];
    this.auction = startAuction(lot, hashSeed(s.day.mseed, 'auction', lot.idx));
    this.lastBids = 0;
    this.card.setVisible(true);
    this.lotT.setText(t('auction.lot', { n: this.lotIdx + 1, total: this.lots.length }));
    this.img = this.add.image(0, -170, instanceThumb(this, offerInstance(lot)));
    this.img.setDisplaySize(220, 220);
    this.card.addAt(this.img, 1);
    const vr = visibleRarity(s, lot);
    this.nameT.setText(ITEMS[lot.a].name + (vr > 0 ? `  ${'★'.repeat(vr)}` : ''));
    this.nameT.setColor(vr > 0 ? '#' + RARITY_COLORS[vr].toString(16).padStart(6, '0') : '#2a1f3d');
    const [lo, hi] = offerEstimate(s, lot);
    this.estT.setText(t('market.worth', { lo, hi }) + (vr > 0 ? ` · ${rarityLabel(vr)}` : ''));
    session.audio.play('stamp');
    this.refreshLot();
  }

  private refreshLot(): void {
    const a = this.auction;
    if (!a) return;
    this.priceT.setText(t('common.coins', { n: a.price }));
    const leader =
      a.leader === -1
        ? t('auction.noBids')
        : a.leader === 0
          ? t('auction.you')
          : a.bidders[a.leader - 1].name;
    this.leaderT.setText(t('auction.leader', { who: leader }));
    const nb = nextBid(a);
    this.bidBtn.setLabel(t('auction.bid', { n: nb }));
    this.bidBtn.setEnabled(!a.done && a.leader !== 0 && nb <= session.state.coins);
    this.timer.setValue(Math.max(0, a.timeLeft / (BID_WINDOW + 1.5)));
  }

  override update(_t: number, delta: number): void {
    const a = this.auction;
    if (!a || a.done) return;
    const changed = tickAuction(a, delta / 1000);
    if (a.bids !== this.lastBids) {
      this.lastBids = a.bids;
      if (a.leader > 0) {
        session.audio.play('bid');
        this.floatText(
          this.card.x + 150 * this.card.scaleX,
          this.card.y - 250 * this.card.scaleY,
          `${a.bidders[a.leader - 1].name}: ${a.price}!`,
          C.purple,
          FS.body,
        );
      }
    }
    this.refreshLot();
    if (changed && a.done) this.finishLot();
  }

  private bid(): void {
    const a = this.auction;
    if (!a) return;
    if (playerBid(a, session.state.coins)) {
      session.audio.play('bid');
      session.haptic('light');
      this.lastBids = a.bids;
      this.refreshLot();
    }
  }

  private finishLot(): void {
    if (this.resultShown || !this.auction) return;
    this.resultShown = true;
    const s = session.state;
    const a = this.auction;
    const lot = a.lot;
    if (playerWon(a)) {
      s.day.haggled[lot.idx] = a.price;
      const inst = buyOffer(s, lot);
      if (inst) {
        session.audio.play('register');
        this.sparkle(this.card.x, this.card.y - 150, 24);
        this.floatText(this.card.x, this.card.y - 60, t('auction.won'), C.leaf, FS.h2);
        this.flyCoins(this.card.x, this.card.y, 6);
        void session.save();
        this.switchBtn.setVisible(false);
      }
    } else if (a.leader > 0) {
      session.audio.play('fail');
      this.floatText(
        this.card.x,
        this.card.y - 60,
        t('auction.lost', { who: a.bidders[a.leader - 1].name }),
        C.terracotta,
        FS.body,
      );
    }
    this.refreshHud();
    this.time.delayedCall(1300, () => {
      this.lotIdx++;
      this.nextLot();
    });
  }

  private skipLot(): void {
    if (!this.auction || this.resultShown) return;
    this.auction.done = true;
    this.resultShown = true;
    this.lotIdx++;
    this.nextLot();
  }

  private leave(): void {
    const s = session.state;
    advancePhase(s, 'workshop');
    void session.save(true);
    if (workshopQueue(s).length > 0) this.scene.start('Workshop');
    else if (shelfItems(s).length > 0) {
      advancePhase(s, 'shop');
      this.scene.start('Shop');
    } else {
      advancePhase(s, 'shop');
      advancePhase(s, 'summary');
      this.scene.start('Summary');
    }
  }
}
