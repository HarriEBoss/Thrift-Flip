import Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import { Button, ProgressBar, drawCard, makeText } from './widgets';
import { iconCoin, iconHeart } from './icons';
import { drawDecor } from '../art/decor';
import { C, FS } from '../theme';
import { session } from '../session';
import { BALANCE } from '../../core/data';
import { DECOR, affordableDecor, buyDecor, decorStatus } from '../../core/decor';
import { canUpgradeTier, nextGoal, skillPoints, upgradeStatus } from '../../core/progression';
import { openSkills, openTierUpgrade, openUpgrades } from './menus';
import type { DecorFx } from '../../core/types';
import { t } from '../../i18n';

function refresh(scene: BaseScene): void {
  (scene as unknown as { refreshHud?: () => void }).refreshHud?.();
}

/** How many things the player could buy or learn right now (for "!" badges). */
export function upgradesAvailable(): number {
  const s = session.state;
  const tools = BALANCE.upgrades.filter((u) => upgradeStatus(s, u) === 'available').length;
  return (canUpgradeTier(s) ? 1 : 0) + tools + affordableDecor(s) + skillPoints(s);
}

/** One place for every way to grow: bigger shop, decorations, tools and skills. */
export function openUpgradesHub(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const m = scene.openModal({ title: t('hub.title'), w: 620, h: 820 });
  const goal = nextGoal(s);
  const rows: Array<{
    id: string;
    label: string;
    sub: string;
    color: number;
    badge: string | null;
    open: () => void;
  }> = [
    {
      id: 'hub_shop',
      label: t('hub.shop'),
      sub: goal ? t('hub.shopSub', { tier: t(`tier.${goal.tierId}`) }) : t('tier.max'),
      color: C.leaf,
      badge: goal?.ready ? '!' : null,
      open: () => openTierUpgrade(scene, after),
    },
    {
      id: 'hub_decor',
      label: t('hub.decor'),
      sub: t('hub.decorSub', { n: s.decor.length, total: DECOR.length }),
      color: C.pink,
      badge: affordableDecor(s) ? String(affordableDecor(s)) : null,
      open: () => openDecor(scene, after),
    },
    {
      id: 'hub_tools',
      label: t('hub.tools'),
      sub: t('hub.toolsSub'),
      color: C.purple,
      badge: BALANCE.upgrades.some((u) => upgradeStatus(s, u) === 'available') ? '!' : null,
      open: () => openUpgrades(scene, after),
    },
    {
      id: 'hub_skills',
      label: t('hub.skills'),
      sub: t('hub.skillsSub', { n: skillPoints(s) }),
      color: C.teal,
      badge: skillPoints(s) > 0 ? String(skillPoints(s)) : null,
      open: () => openSkills(scene, after),
    },
  ];
  function after(): void {
    refresh(scene);
    onChange?.();
  }
  rows.forEach((r, i) => {
    const b = new Button(scene, 0, -270 + i * 114, {
      w: 520,
      h: 100,
      label: r.label,
      sub: r.sub,
      color: r.color,
      fontSize: FS.h3,
      onClick: () => {
        m.close();
        r.open();
      },
    });
    b.setBadge(r.badge);
    scene.mark(r.id, b);
    m.content.add(b);
  });
  if (goal) m.content.add(goalBanner(scene, 520).setPosition(0, 206));
}

/** "Next shop: Garage Shop" tracker with coins / reputation progress. */
export function goalBanner(scene: BaseScene, w: number): Phaser.GameObjects.Container {
  const s = session.state;
  const c = scene.add.container(0, 0);
  const goal = nextGoal(s);
  const g = scene.add.graphics();
  drawCard(g, -w / 2, -48, w, 96, C.paper, { radius: 22, stroke: C.ink, strokeW: 3, shadow: 4 });
  c.add(g);
  if (!goal) {
    c.add(makeText(scene, 0, 0, t('tier.max'), FS.small, C.teal, { wrap: w - 30 }));
    return c;
  }
  const title = goal.ready
    ? t('goal.ready', { tier: t(`tier.${goal.tierId}`) })
    : t('goal.next', { tier: t(`tier.${goal.tierId}`) });
  c.add(makeText(scene, 0, -22, title, FS.small, goal.ready ? C.leafDark : C.ink, { wrap: w - 30 }));
  const bar = new ProgressBar(scene, 0, 8, w - 60, 16, goal.ready ? C.leaf : C.mustard);
  bar.setValue(goal.progress);
  c.add(bar);
  const coin = scene.add.graphics();
  iconCoin(coin, 26);
  coin.setPosition(-w / 2 + 40, 34);
  const heart = scene.add.graphics();
  iconHeart(heart, 24);
  heart.setPosition(w / 2 - 130, 34);
  c.add([
    coin,
    makeText(
      scene,
      -w / 2 + 60,
      34,
      `${Math.min(goal.coins, goal.cost)} / ${goal.cost}`,
      FS.tiny,
      C.inkSoft,
      { align: 'left' },
    ),
    heart,
    makeText(
      scene,
      w / 2 - 110,
      34,
      `${Math.min(goal.rep, goal.repNeed)} / ${goal.repNeed}`,
      FS.tiny,
      C.inkSoft,
      { align: 'left' },
    ),
  ]);
  return c;
}

function fxText(fx: DecorFx): string {
  const parts: string[] = [];
  if (fx.price) parts.push(t('decor.fx.price', { n: Math.round(fx.price * 100) }));
  if (fx.customers) parts.push(t('decor.fx.customers', { n: fx.customers }));
  if (fx.repPerDay) parts.push(t('decor.fx.rep', { n: fx.repPerDay }));
  if (fx.rare) parts.push(t('decor.fx.rare'));
  if (fx.gem) parts.push(t('decor.fx.gem'));
  if (fx.rareSale) parts.push(t('decor.fx.rareSale', { n: Math.round(fx.rareSale * 100) }));
  return parts.join(' · ');
}

/** The decoration shop: things you can see in your shop, each with a small bonus. */
export function openDecor(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 98;
  const m = scene.openModal({
    title: t('decor.title'),
    w: 660,
    h: Math.min(1240, 230 + DECOR.length * rowH),
  });
  const top = -m.ph / 2 + 100;
  DECOR.forEach((d, i) => {
    const y = top + i * rowH;
    const st = decorStatus(s, d);
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    drawCard(g, -300, -42, 600, 84, st === 'owned' ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const art = scene.add.graphics();
    drawDecor(art, d.id, 62);
    art.setPosition(-255, -2);
    if (st === 'locked') art.setAlpha(0.35);
    const name = makeText(scene, -210, -14, t(`decor.${d.id}`), FS.small, C.ink, { align: 'left' });
    const desc = makeText(scene, -210, 16, fxText(d.fx), FS.tiny, C.inkSoft, {
      align: 'left',
      bold: false,
      wrap: 300,
    });
    row.add([g, art, name, desc]);
    const label =
      st === 'owned'
        ? t('common.owned')
        : st === 'locked'
          ? t('upgrades.needTier', { tier: t(`tier.${BALANCE.tiers[d.tier].id}`) })
          : String(d.cost);
    const b = new Button(scene, 205, 0, {
      w: 160,
      h: 64,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: st === 'locked' ? FS.tiny : FS.small,
      icon: st === 'available' || st === 'poor' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (buyDecor(s, d.id)) {
          session.audio.play('register');
          session.haptic('success');
          void session.save(true);
          refresh(scene);
          m.close();
          onChange?.();
          openDecor(scene, onChange);
        }
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`decor_${d.id}`, b);
    row.add(b);
    m.content.add(row);
  });
}
