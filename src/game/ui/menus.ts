import type { BaseScene, Modal } from '../scenes/BaseScene';
import { Button, Slider, drawCard, makeText } from './widgets';
import { iconCoin, iconHeart, iconTool } from './icons';
import { C, FS } from '../theme';
import { session } from '../session';
import { BALANCE } from '../../core/data';
import {
  buyUpgrade,
  canUpgradeTier,
  learnSkill,
  nextTier,
  skillPoints,
  skillStatus,
  upgradeStatus,
  upgradeTier,
} from '../../core/progression';
import { PRODUCTS, canPurchase, grantProduct, restoreProducts } from '../../core/products';
import { setColorBlindMode } from '../art/itemArt';
import { availableMarkets, setMarket } from '../../core/market';
import { t } from '../../i18n';

function refresh(scene: BaseScene): void {
  (scene as unknown as { refreshHud?: () => void }).refreshHud?.();
}

/** A labelled on/off toggle (text says ON/OFF, never colour alone). */
function toggle(
  scene: BaseScene,
  m: Modal,
  y: number,
  label: string,
  get: () => boolean,
  set: (v: boolean) => void,
): Button {
  const b = new Button(scene, 0, y, {
    w: 460,
    h: 70,
    label: `${label}: ${get() ? t('settings.on') : t('settings.off')}`,
    color: get() ? C.teal : C.inkSoft,
    fontSize: FS.body,
    onClick: () => {
      set(!get());
      b.setLabel(`${label}: ${get() ? t('settings.on') : t('settings.off')}`);
      b.setColor(get() ? C.teal : C.inkSoft);
      session.applySettings();
      void session.save();
    },
  });
  m.content.add(b);
  return b;
}

export function openSettings(scene: BaseScene): void {
  const s = session.state;
  const caps = session.platform.capabilities;
  const rows: Array<(y: number, m: Modal) => void> = [];
  rows.push((y, m) => {
    m.content.add(
      new Slider(scene, 0, y + 20, {
        w: 400,
        value: s.settings.music,
        label: t('settings.music'),
        onChange: (v) => {
          s.settings.music = v;
          session.applySettings();
        },
        onCommit: () => void session.save(),
      }),
    );
  });
  rows.push((y, m) => {
    m.content.add(
      new Slider(scene, 0, y + 20, {
        w: 400,
        value: s.settings.sfx,
        label: t('settings.sfx'),
        onChange: (v) => {
          s.settings.sfx = v;
          session.applySettings();
          session.audio.play('tick');
        },
        onCommit: () => void session.save(),
      }),
    );
  });
  if (caps.masterMute)
    rows.push((y, m) =>
      toggle(
        scene,
        m,
        y,
        t('settings.mute'),
        () => s.settings.muted,
        (v) => (s.settings.muted = v),
      ),
    );
  if (caps.haptics)
    rows.push((y, m) =>
      toggle(
        scene,
        m,
        y,
        t('settings.haptics'),
        () => s.settings.haptics,
        (v) => (s.settings.haptics = v),
      ),
    );
  rows.push((y, m) =>
    toggle(
      scene,
      m,
      y,
      t('settings.motion'),
      () => s.settings.reducedMotion,
      (v) => (s.settings.reducedMotion = v),
    ),
  );
  rows.push((y, m) =>
    toggle(
      scene,
      m,
      y,
      t('settings.bigText'),
      () => s.settings.largeText,
      (v) => {
        s.settings.largeText = v;
        scene.time.delayedCall(50, () => scene.scene.restart());
      },
    ),
  );
  rows.push((y, m) =>
    toggle(
      scene,
      m,
      y,
      t('settings.cb'),
      () => s.settings.cbPalette,
      (v) => {
        s.settings.cbPalette = v;
        setColorBlindMode(v);
      },
    ),
  );
  if (caps.iap)
    rows.push((y, m) =>
      m.content.add(
        new Button(scene, 0, y, {
          w: 460,
          h: 70,
          label: t('settings.restore'),
          color: C.purple,
          fontSize: FS.body,
          onClick: () => void doRestore(scene),
        }),
      ),
    );
  if (caps.privacyOptions)
    rows.push((y, m) =>
      m.content.add(
        new Button(scene, 0, y, {
          w: 460,
          h: 70,
          label: t('settings.adPrivacy'),
          color: C.inkSoft,
          fontSize: FS.body,
          onClick: () => void session.platform.showPrivacyOptions(),
        }),
      ),
    );
  if (caps.externalLinks)
    rows.push((y, m) =>
      m.content.add(
        new Button(scene, 0, y, {
          w: 460,
          h: 70,
          label: t('settings.privacy'),
          color: C.inkSoft,
          fontSize: FS.body,
          onClick: () => session.platform.openExternal('https://example.com/thrift-flip/privacy'),
        }),
      ),
    );
  rows.push((y, m) =>
    m.content.add(
      new Button(scene, 0, y, {
        w: 460,
        h: 70,
        label: t('menu.credits'),
        color: C.mustardDark,
        fontSize: FS.body,
        onClick: () => openCredits(scene),
      }),
    ),
  );
  const rowH = 92;
  const h = 200 + rows.length * rowH;
  const m = scene.openModal({ title: t('menu.settings'), w: 600, h: Math.min(h, 1240) });
  rows.forEach((r, i) => r(-h / 2 + 100 + i * rowH, m));
}

async function doRestore(scene: BaseScene): Promise<void> {
  try {
    const ids = await session.platform.restorePurchases();
    const restored = restoreProducts(session.state, ids);
    void session.save(true);
    (scene as unknown as { toast?: (s: string) => void }).toast?.(
      restored.length ? t('store.restored', { n: restored.length }) : t('store.nothingToRestore'),
    );
  } catch (e) {
    session.platform.logError(e);
  }
}

export function openCredits(scene: BaseScene): void {
  const m = scene.openModal({ title: t('menu.credits'), w: 600, h: 640 });
  const lines = t('credits.body').split('\n');
  lines.forEach((l, i) =>
    m.content.add(
      makeText(scene, 0, -220 + i * 46, l, i === 0 ? FS.h3 : FS.small, i === 0 ? C.teal : C.ink, {
        wrap: 540,
        bold: i === 0,
      }),
    ),
  );
}

export function openUpgrades(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const ups = BALANCE.upgrades;
  const m = scene.openModal({
    title: t('upgrades.title'),
    w: 640,
    h: Math.min(1240, 230 + ups.length * 100),
  });
  const top = -m.ph / 2 + 100;
  ups.forEach((u, i) => {
    const y = top + i * 100;
    const st = upgradeStatus(s, u);
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    drawCard(g, -290, -42, 580, 84, st === 'owned' ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const ic = scene.add.graphics();
    iconTool(ic, 44);
    ic.setPosition(-250, 0);
    const name = makeText(scene, -215, -14, t(`up.${u.id}`), FS.small, C.ink, { align: 'left' });
    const desc = makeText(scene, -215, 16, t(`up.${u.id}.d`), FS.tiny, C.inkSoft, {
      align: 'left',
      bold: false,
    });
    row.add([g, ic, name, desc]);
    const label =
      st === 'owned'
        ? t('common.owned')
        : st === 'locked'
          ? t('upgrades.needTier', { tier: BALANCE.tiers[u.tier].name })
          : `${u.cost}`;
    const b = new Button(scene, 200, 0, {
      w: 160,
      h: 64,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: st === 'locked' ? FS.tiny : FS.small,
      icon: st === 'available' || st === 'poor' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (buyUpgrade(s, u.id)) {
          session.audio.play('register');
          void session.save(true);
          refresh(scene);
          m.close();
          onChange?.();
          openUpgrades(scene, onChange);
        }
      },
    });
    b.setEnabled(st === 'available');
    row.add(b);
    m.content.add(row);
  });
}

export function openSkills(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const skills = BALANCE.skills;
  const m = scene.openModal({
    title: t('skills.title', { n: skillPoints(s) }),
    w: 660,
    h: Math.min(1240, 240 + skills.length * 82),
  });
  const top = -m.ph / 2 + 96;
  skills.forEach((sk, i) => {
    const y = top + i * 82;
    const st = skillStatus(s, sk);
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    drawCard(g, -300, -36, 600, 72, st === 'owned' ? 0xdff2d5 : C.white, {
      radius: 16,
      stroke: C.ink,
      strokeW: 3,
      shadow: 2,
    });
    const name = makeText(
      scene,
      -280,
      -12,
      `${t(`skill.${sk.branch}`)} ${'I'.repeat(sk.rank)}`,
      FS.small,
      C.ink,
      { align: 'left' },
    );
    const desc = makeText(scene, -280, 16, t(`skill.${sk.branch}.d`), FS.tiny, C.inkSoft, {
      align: 'left',
      bold: false,
    });
    const label =
      st === 'owned' ? '✓' : st === 'available' ? t('skills.learn') : t('skills.lvl', { n: sk.level });
    const b = new Button(scene, 215, 0, {
      w: 150,
      h: 58,
      label,
      color: st === 'available' ? C.teal : C.inkSoft,
      fontSize: FS.small,
      onClick: () => {
        if (learnSkill(s, sk.id)) {
          session.audio.play('levelup');
          void session.save(true);
          m.close();
          onChange?.();
          openSkills(scene, onChange);
        }
      },
    });
    b.setEnabled(st === 'available');
    row.add([g, name, desc, b]);
    m.content.add(row);
  });
}

export function openTierUpgrade(scene: BaseScene, onDone?: () => void): void {
  const s = session.state;
  const n = nextTier(s);
  const m = scene.openModal({ title: t('tier.title'), w: 600, h: 640 });
  if (!n) {
    m.content.add(makeText(scene, 0, -60, t('tier.max'), FS.h3, C.teal, { wrap: 520 }));
    return;
  }
  const lines = [
    makeText(scene, 0, -210, t(`tier.${n.id}`), FS.h2, C.terracotta, { stroke: C.ink, strokeW: 6 }),
    makeText(
      scene,
      0,
      -130,
      t('tier.perks', { shelves: n.shelves, customers: n.customers }),
      FS.body,
      C.ink,
      { wrap: 520 },
    ),
    makeText(scene, 0, -60, t(`tier.unlock.${n.id}`), FS.small, C.leafDark, { wrap: 520 }),
  ];
  const cost = scene.add.container(0, 30);
  const ci = scene.add.graphics();
  iconCoin(ci, 40);
  ci.setPosition(-120, 0);
  const ct = makeText(
    scene,
    -90,
    0,
    `${s.coins} / ${n.cost}`,
    FS.body,
    s.coins >= n.cost ? C.leafDark : C.terracottaDark,
    { align: 'left' },
  );
  const hi = scene.add.graphics();
  iconHeart(hi, 36);
  hi.setPosition(80, 0);
  const rt = makeText(
    scene,
    110,
    0,
    `${s.rep} / ${n.rep}`,
    FS.body,
    s.rep >= n.rep ? C.leafDark : C.terracottaDark,
    { align: 'left' },
  );
  cost.add([ci, ct, hi, rt]);
  const b = new Button(scene, 0, 140, {
    w: 360,
    h: 84,
    label: t('tier.buy'),
    color: C.leaf,
    fontSize: FS.h3,
    onClick: () => {
      if (upgradeTier(s)) {
        session.audio.play('levelup');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        m.close();
        onDone?.();
      }
    },
  });
  b.setEnabled(canUpgradeTier(s));
  m.content.add([...lines, cost, b]);
}

/** The perk store (IAP). Only reachable when platform.capabilities.iap is true (never on YouTube). */
export async function openStore(scene: BaseScene, onChange?: () => void): Promise<void> {
  if (!session.platform.capabilities.iap) return;
  const s = session.state;
  const live = await session.platform.getProducts().catch(() => []);
  const priceOf = (id: string) =>
    live.find((p) => p.id === id)?.price ?? PRODUCTS.find((p) => p.id === id)?.price ?? '';
  const list = PRODUCTS.filter((p) => canPurchase(s, p.id) || s.owned.includes(p.id));
  const rowH = 104;
  const m = scene.openModal({ title: t('menu.store'), w: 660, h: Math.min(1240, 250 + list.length * rowH) });
  const top = -m.ph / 2 + 104;
  list.forEach((p, i) => {
    const y = top + i * rowH;
    const owned = !canPurchase(s, p.id);
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    drawCard(g, -300, -46, 600, 92, owned ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: p.badge ? C.mustardDark : C.ink,
      strokeW: p.badge ? 5 : 3,
      shadow: 3,
    });
    const name = makeText(scene, -280, -16, t(`store.${p.id}`), FS.small, C.ink, { align: 'left' });
    const desc = makeText(scene, -280, 16, t(`store.${p.id}.d`), FS.tiny, C.inkSoft, {
      align: 'left',
      bold: false,
      wrap: 330,
    });
    row.add([g, name, desc]);
    if (p.badge) {
      const bt = makeText(scene, 200, -50, t(`store.badge.${p.badge}`), FS.tiny, C.white, {
        stroke: C.ink,
        strokeW: 4,
      });
      row.add(bt);
    }
    const b = new Button(scene, 205, 4, {
      w: 160,
      h: 64,
      label: owned ? t('common.owned') : priceOf(p.id),
      color: owned ? C.inkSoft : C.leaf,
      fontSize: FS.small,
      onClick: async () => {
        b.setEnabled(false);
        const r = await session.platform.purchase(p.id);
        if (r === 'success') {
          grantProduct(s, p.id);
          session.audio.play('register');
          void session.save(true);
          refresh(scene);
          m.close();
          onChange?.();
          void openStore(scene, onChange);
        } else {
          b.setEnabled(true);
          if (r === 'failed')
            (scene as unknown as { toast?: (s: string) => void }).toast?.(t('store.failed'));
        }
      },
    });
    b.setEnabled(!owned);
    row.add(b);
    m.content.add(row);
  });
  m.content.add(
    new Button(scene, 0, m.ph / 2 - 140, {
      w: 360,
      h: 64,
      label: t('settings.restore'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => void doRestore(scene),
    }),
  );
  m.content.add(
    makeText(scene, 0, m.ph / 2 - 196, t('store.noRandom'), FS.tiny, C.inkSoft, { wrap: 560, bold: false }),
  );
}

/** Market picker (only before anything was bought today). */
export function openMarketSwitch(scene: BaseScene): void {
  const s = session.state;
  const ms = availableMarkets(s);
  const m = scene.openModal({ title: t('market.switchTitle'), w: 600, h: 260 + ms.length * 110 });
  ms.forEach((md, i) => {
    const b = new Button(scene, 0, -m.ph / 2 + 110 + i * 110, {
      w: 500,
      h: 90,
      label: t(`market.${md.id}`),
      sub: t(`market.${md.id}.desc`),
      color: parseInt(md.color.slice(1), 16),
      fontSize: FS.body,
      onClick: () => {
        if (setMarket(s, md.id)) {
          m.close();
          void session.save();
          scene.scene.start(md.auction ? 'Auction' : 'Market');
        }
      },
    });
    if (md.id === s.day.market) b.setBadge('✓');
    scene.mark(`market_${md.id}`, b);
    m.content.add(b);
  });
}
