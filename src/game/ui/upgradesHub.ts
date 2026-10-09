import Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import { Button, ProgressBar, drawCard, makeText } from './widgets';
import { iconCoin, iconHeart, iconWorkshop } from './icons';
import { drawDecor } from '../art/decor';
import { C, FS } from '../theme';
import { session } from '../session';
import { BALANCE } from '../../core/data';
import { DECOR, affordableDecor, buyDecor, decorStatus } from '../../core/decor';
import { canUpgradeTier, nextGoal, skillPoints, upgradeStatus } from '../../core/progression';
import { openSkills, openTierUpgrade, openUpgrades } from './menus';
import type { DecorFx } from '../../core/types';
import { CAMPAIGNS, brandFlow, campaignStatus, runCampaign } from '../../core/marketing';
import {
  branchCost,
  branchStatus,
  dailyIncome,
  delegationActions,
  delegationUnlocked,
  efficiency,
  hireOrTrain,
  managerCost,
  managerLevel,
  managerName,
  managerStatus,
  openBranch,
  passiveIncome,
  shops,
} from '../../core/managers';
import {
  BUSINESSES,
  businessStatus,
  nextBusinessGoal,
  openBusiness,
  openCost,
  openableBusinesses,
} from '../../core/empire';
import { t } from '../../i18n';

function refresh(scene: BaseScene): void {
  (scene as unknown as { refreshHud?: () => void }).refreshHud?.();
}

/** How many things the player could buy or learn right now (for "!" badges). */
export function upgradesAvailable(): number {
  const s = session.state;
  const tools = BALANCE.upgrades.filter((u) => upgradeStatus(s, u) === 'available').length;
  return (
    (canUpgradeTier(s) ? 1 : 0) +
    tools +
    affordableDecor(s) +
    skillPoints(s) +
    openableBusinesses(s) +
    delegationActions(s)
  );
}

/** One place for every way to grow: bigger shop, decorations, tools and skills. */
export function openUpgradesHub(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const m = scene.openModal({ title: t('hub.title'), w: 620, h: 1080 });
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
      id: 'hub_empire',
      label: t('hub.empire'),
      sub: t('hub.empireSub', { n: s.biz.own.length, total: BUSINESSES.length }),
      color: C.terracotta,
      badge: openableBusinesses(s) ? String(openableBusinesses(s)) : null,
      open: () => openEmpire(scene, after),
    },
    {
      id: 'hub_marketing',
      label: t('hub.marketing'),
      sub: t('hub.marketingSub', { n: Math.round((brandFlow(s.brand) - 1) * 100) }),
      color: C.mustardDark,
      badge: null,
      open: () => openMarketing(scene, after),
    },
    {
      id: 'hub_managers',
      label: t('hub.managers'),
      sub: delegationUnlocked(s)
        ? t('hub.managersSub', { n: passiveIncome(s) })
        : t('hub.managersLocked', { biz: t(`biz.${BALANCE.empire.managers.unlock}`) }),
      color: C.purple,
      badge: delegationActions(s) ? '!' : null,
      open: () => openManagers(scene, after),
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
    const b = new Button(scene, 0, -422 + i * 96, {
      w: 520,
      h: 84,
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
  if (goal || nextBusinessGoal(s)) m.content.add(goalBanner(scene, 520).setPosition(0, 330));
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
    // Top shop size reached: the next goal is the next business on the ladder.
    const bg = nextBusinessGoal(s);
    if (!bg) {
      c.add(makeText(scene, 0, 0, t('tier.max'), FS.small, C.teal, { wrap: w - 30 }));
      return c;
    }
    const ready = bg.status === 'available';
    const title = ready
      ? t('goal.bizReady', { biz: t(`biz.${bg.id}`) })
      : t('goal.bizNext', { biz: t(`biz.${bg.id}`) });
    c.add(makeText(scene, 0, -22, title, FS.small, ready ? C.leafDark : C.ink, { wrap: w - 30 }));
    const bar = new ProgressBar(scene, 0, 8, w - 60, 16, ready ? C.leaf : C.mustard);
    bar.setValue(bg.progress);
    const coin = scene.add.graphics();
    iconCoin(coin, 26);
    coin.setPosition(-w / 2 + 40, 34);
    c.add([
      bar,
      coin,
      makeText(
        scene,
        -w / 2 + 60,
        34,
        `${Math.min(bg.coins, bg.capital)} / ${bg.capital}`,
        FS.tiny,
        C.inkSoft,
        {
          align: 'left',
        },
      ),
    ]);
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
    const needs = t('upgrades.needTier', { tier: t(`tier.${BALANCE.tiers[d.tier].id}`) });
    const desc = makeText(scene, -210, 16, st === 'locked' ? needs : fxText(d.fx), FS.tiny, C.inkSoft, {
      align: 'left',
      bold: false,
      wrap: 300,
    });
    row.add([g, art, name, desc]);
    const label = st === 'owned' ? t('common.owned') : st === 'locked' ? t('decor.locked') : String(d.cost);
    const b = new Button(scene, 205, 0, {
      w: 160,
      h: 64,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.small,
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

/** The business ladder: open bigger businesses as your savings grow. */
export function openEmpire(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 128;
  const m = scene.openModal({
    title: t('empire.title', { company: s.company }),
    w: 680,
    h: Math.min(1240, 250 + BUSINESSES.length * rowH),
  });
  m.content.add(
    makeText(scene, 0, -m.ph / 2 + 92, t('empire.intro'), FS.tiny, C.inkSoft, { wrap: 600, bold: false }),
  );
  const top = -m.ph / 2 + 190;
  const goal = nextBusinessGoal(s);
  BUSINESSES.forEach((b, i) => {
    const y = top + i * rowH;
    const st = businessStatus(s, b);
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    drawCard(g, -310, -56, 620, 112, st === 'owned' ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const art = scene.add.graphics();
    iconWorkshop(art, b.id, 64);
    art.setPosition(-262, -2);
    if (st === 'locked') art.setAlpha(0.35);
    const name = makeText(scene, -218, -30, t(`biz.${b.id}`), FS.small, C.ink, { align: 'left' });
    let sub = t(`bizDesc.${b.id}`);
    if (st === 'locked') {
      const n = b.needs;
      sub =
        n.business && !s.biz.own.includes(n.business)
          ? t('empire.needsBiz', { biz: t(`biz.${n.business}`) })
          : t('upgrades.needTier', { tier: t(`tier.${BALANCE.tiers[n.shopTier ?? 0].id}`) });
    } else if (st === 'saving' || st === 'available')
      sub = t('empire.capital', { n: b.capital, cost: openCost(b) });
    const desc = makeText(scene, -218, 8, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false, wrap: 330 });
    row.add([g, art, name, desc]);
    if (st === 'saving' && goal?.id === b.id) {
      const bar = new ProgressBar(scene, -50, 40, 330, 12, C.mustard);
      bar.setValue(goal.progress);
      row.add(bar);
    }
    const label =
      st === 'owned' ? t('common.owned') : st === 'available' ? t('empire.open') : t('decor.locked');
    const btn = new Button(scene, 220, 0, {
      w: 150,
      h: 64,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.small,
      onClick: () => {
        if (openBusiness(s, b.id)) {
          session.audio.play('levelup');
          session.haptic('success');
          void session.save(true);
          refresh(scene);
          m.close();
          onChange?.();
          openEmpire(scene, onChange);
        }
      },
    });
    btn.setEnabled(st === 'available');
    scene.mark(`biz_${b.id}`, btn);
    row.add(btn);
    m.content.add(row);
  });
}

/** Marketing: run campaigns to grow the brand, which brings more customers and contracts. */
export function openMarketing(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 100;
  const m = scene.openModal({
    title: t('mkt.title'),
    w: 660,
    h: Math.min(1240, 330 + CAMPAIGNS.length * rowH),
  });
  const pct = Math.round((brandFlow(s.brand) - 1) * 100);
  m.content.add(
    makeText(scene, 0, -m.ph / 2 + 92, t('mkt.intro', { company: s.company }), FS.tiny, C.inkSoft, {
      wrap: 590,
      bold: false,
    }),
  );
  // Brand meter: how much extra flow the brand brings now (it fades a little each day).
  const meterY = -m.ph / 2 + 158;
  const bar = new ProgressBar(scene, 0, meterY, 520, 20, C.mustard);
  bar.setValue(pct / Math.round(BALANCE.empire.marketing.flowMax * 100));
  m.content.add([
    bar,
    makeText(scene, 0, meterY + 32, t('mkt.brand', { brand: Math.round(s.brand), n: pct }), FS.small, C.ink),
  ]);
  const top = -m.ph / 2 + 260;
  CAMPAIGNS.forEach((c, i) => {
    const st = campaignStatus(s, c);
    const row = scene.add.container(0, top + i * rowH);
    const g = scene.add.graphics();
    drawCard(g, -300, -44, 600, 88, st === 'ran' ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const art = scene.add.graphics();
    iconWorkshop(art, 'marketing', 52);
    art.setPosition(-256, 0);
    if (st === 'locked') art.setAlpha(0.35);
    const sub =
      st === 'locked' ? t('empire.needsBiz', { biz: t(`biz.${c.needs}`) }) : t('mkt.adds', { n: c.brand });
    row.add([
      g,
      art,
      makeText(scene, -214, -16, t(`mkt.${c.id}`), FS.small, C.ink, { align: 'left' }),
      makeText(scene, -214, 18, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false }),
    ]);
    const label = st === 'ran' ? t('mkt.ran') : st === 'locked' ? t('decor.locked') : String(c.cost);
    const b = new Button(scene, 210, 0, {
      w: 160,
      h: 64,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.small,
      icon: st === 'available' || st === 'poor' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (!runCampaign(s, c.id)) return;
        session.audio.play('register');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        (scene as unknown as { toast?: (s: string, c?: number) => void }).toast?.(
          t(`mkt.toast.${c.id}`, { company: s.company }),
          C.mustardDark,
        );
        m.close();
        onChange?.();
        openMarketing(scene, onChange);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`mkt_${c.id}`, b);
    row.add(b);
    m.content.add(row);
  });
}

/** Managers run your other businesses for you; branches multiply what a business makes. */
export function openManagers(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const own = BUSINESSES.filter((b) => s.biz.own.includes(b.id));
  const rowH = 136;
  const unlocked = delegationUnlocked(s);
  const m = scene.openModal({
    title: t('mgr.title'),
    w: 680,
    h: Math.min(1240, 300 + (unlocked ? own.length : 0) * rowH + (unlocked ? 0 : 120)),
  });
  const intro = unlocked
    ? t('mgr.intro', { n: passiveIncome(s) })
    : t('mgr.locked', { biz: t(`biz.${BALANCE.empire.managers.unlock}`) });
  m.content.add(makeText(scene, 0, -m.ph / 2 + 100, intro, FS.small, C.inkSoft, { wrap: 600, bold: false }));
  if (!unlocked) return;
  const top = -m.ph / 2 + 250;
  const after = () => {
    session.audio.play('register');
    session.haptic('success');
    void session.save(true);
    refresh(scene);
    m.close();
    onChange?.();
    openManagers(scene, onChange);
  };
  own.forEach((b, i) => {
    const row = scene.add.container(0, top + i * rowH);
    const lvl = managerLevel(s, b.id);
    const g = scene.add.graphics();
    drawCard(g, -320, -60, 640, 120, lvl > 0 ? 0xdff2d5 : C.white, {
      radius: 18,
      stroke: C.ink,
      strokeW: 3,
      shadow: 3,
    });
    const art = scene.add.graphics();
    iconWorkshop(art, b.id, 54);
    art.setPosition(-280, -14);
    const n = shops(s, b.id);
    const who =
      lvl > 0
        ? t('mgr.who', { name: managerName(s, b.id), lvl, pct: Math.round(efficiency(lvl) * 100) })
        : t('mgr.none');
    const earn =
      lvl > 0 ? t('mgr.earns', { n: dailyIncome(s, b).net }) : t('mgr.couldEarn', { n: b.income * n });
    row.add([
      g,
      art,
      makeText(
        scene,
        -240,
        -36,
        `${t(`biz.${b.id}`)} · ${t(n === 1 ? 'mgr.shop' : 'mgr.shops', { n })}`,
        FS.small,
        C.ink,
        {
          align: 'left',
        },
      ),
      makeText(scene, -240, -2, who, FS.tiny, C.inkSoft, { align: 'left', bold: false }),
      makeText(scene, -240, 30, earn, FS.tiny, lvl > 0 ? C.leafDark : C.inkSoft, { align: 'left' }),
    ]);
    const ms = managerStatus(s, b);
    const mc = managerCost(b, lvl);
    const hire = new Button(scene, 230, -27, {
      w: 160,
      h: 50,
      label: ms === 'max' ? t('mgr.max') : `${lvl > 0 ? t('mgr.train') : t('mgr.hire')} ${mc}`,
      color: ms === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.tiny,
      onClick: () => {
        if (hireOrTrain(s, b.id)) after();
      },
    });
    hire.setEnabled(ms === 'available');
    const bs = branchStatus(s, b);
    const branch = new Button(scene, 230, 31, {
      w: 160,
      h: 50,
      label: t('mgr.branch', { n: branchCost(b, n - 1) }),
      color: bs === 'available' ? C.sky : C.inkSoft,
      fontSize: FS.tiny,
      onClick: () => {
        if (openBranch(s, b.id)) after();
      },
    });
    branch.setEnabled(bs === 'available');
    scene.mark(`hire_${b.id}`, hire);
    scene.mark(`branch_${b.id}`, branch);
    row.add([hire, branch]);
    m.content.add(row);
  });
}
