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
  REGIONS,
  allRegionsWon,
  expansionUnlocked,
  openRegion,
  openableRegions,
  regionCost,
  regionStatus,
  regionsWon,
} from '../../core/regions';
import { MARKETS } from '../../core/data';
import { spaceActions, spaceUnlocked, sunHarvested } from '../../core/space';
import { openSpace } from './spaceMenus';
import { drawGoldBar } from './goldIcon';
import { openSkillTree } from './prestigeMenus';
import { canPrestige, nextPrestigeTokens } from '../../core/prestige';
import { buyableNodes } from '../../core/skilltree';
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
  capitalFor,
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
    delegationActions(s) +
    buyableNodes(s) +
    (canPrestige(s) ? 1 : 0)
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
      id: 'hub_world',
      label: t('hub.world'),
      sub: expansionUnlocked(s)
        ? t('hub.worldSub', { n: regionsWon(s), total: REGIONS.length })
        : t('hub.managersLocked', { biz: t(`biz.${BALANCE.empire.regions.unlock}`) }),
      color: C.sky,
      badge: openableRegions(s) ? String(openableRegions(s)) : null,
      open: () => openWorld(scene, after),
    },
    {
      id: 'hub_space',
      label: t('hub.space'),
      sub: spaceUnlocked(s)
        ? t('hub.spaceSub', { n: s.space.colonies.length, pct: Math.round(sunHarvested(s) * 100) })
        : t('hub.spaceLocked'),
      color: C.inkSoft,
      badge: spaceActions(s) ? '!' : null,
      open: () => openSpace(scene, after),
    },
    {
      id: 'hub_legacy',
      label: t('hub.legacy'),
      sub: canPrestige(s)
        ? t('hub.legacyReady', { n: nextPrestigeTokens(s) })
        : t('hub.legacySub', { n: s.prestige.tokens, p: s.prestige.n }),
      color: C.purple,
      badge: canPrestige(s) ? '!' : buyableNodes(s) ? String(buyableNodes(s)) : null,
      open: () => openSkillTree(scene, after),
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
  // The late-game rows (managers, world, space) appear once you own the top business.
  const late = ['hub_managers', 'hub_world', 'hub_space'];
  const legacy = s.prestige.n > 0 || canPrestige(s);
  const shown = rows.filter(
    (r) => (!late.includes(r.id) || delegationUnlocked(s)) && (r.id !== 'hub_legacy' || legacy),
  );
  const step = shown.length > 9 ? 76 : shown.length > 6 ? 82 : 104;
  const bh = shown.length > 9 ? 68 : shown.length > 6 ? 74 : 92;
  function after(): void {
    refresh(scene);
    onChange?.();
  }
  shown.forEach((r, i) => {
    const b = new Button(scene, 0, -440 + bh / 2 - 40 + i * step, {
      w: 520,
      h: bh,
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
  // Twelve decorations (two golden ones): the rows get a little tighter.
  const rowH = DECOR.length > 10 ? 86 : 98;
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
    drawCard(
      g,
      -300,
      -(rowH - 14) / 2,
      600,
      rowH - 14,
      st === 'owned' ? 0xdff2d5 : d.gold ? 0xfff3c4 : C.white,
      {
        radius: 18,
        stroke: C.ink,
        strokeW: 3,
        shadow: 3,
      },
    );
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
    const label =
      st === 'owned' ? t('common.owned') : st === 'locked' ? t('decor.locked') : String(d.gold ?? d.cost);
    const b = new Button(scene, 205, 0, {
      w: 160,
      h: 64,
      label,
      color: st === 'available' ? (d.gold ? C.mustardDark : C.leaf) : C.inkSoft,
      fontSize: FS.small,
      icon:
        st === 'available' || st === 'poor'
          ? (gr, sz) => (d.gold ? drawGoldBar(gr, 0, 0, sz * 0.9) : iconCoin(gr, sz))
          : undefined,
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
      sub = t('empire.capital', { n: capitalFor(s, b), cost: openCost(b, s) });
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
    const mc = managerCost(b, lvl, s);
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
      label: t('mgr.branch', { n: branchCost(b, n - 1, s) }),
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

/** A soft continent shape (polygon with gently varying radius). */
function blob(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2.3);
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k));
  }
  g.fillPoints(pts, true);
}

/** Continents on the world map: [u, v, radius x, radius y] in map units (0..1). */
const LANDS: Array<[number, number, number, number]> = [
  [0.2, 0.3, 0.13, 0.15],
  [0.3, 0.66, 0.07, 0.15],
  [0.5, 0.25, 0.06, 0.08],
  [0.53, 0.57, 0.08, 0.15],
  [0.72, 0.3, 0.16, 0.14],
  [0.84, 0.71, 0.07, 0.07],
  [0.5, 0.95, 0.36, 0.05],
];

/** The world: open regional offices, win flagship contracts, conquer every region before space. */
export function openWorld(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 92;
  const m = scene.openModal({ title: t('world.title'), w: 680, h: 1200 });
  const unlocked = expansionUnlocked(s);
  const top = -m.ph / 2 + 80;
  // Map.
  const mw = 600;
  const mh = 260;
  const map = scene.add.graphics();
  drawCard(map, -mw / 2, top, mw, mh, 0x4fb6ff, { radius: 20, stroke: C.ink, strokeW: 4, shadow: 4 });
  map.fillStyle(0x8fd17a, 1);
  LANDS.forEach(([u, v, rx, ry], i) => {
    if (i === LANDS.length - 1) map.fillStyle(0xf4f7fb, 1);
    blob(map, -mw / 2 + u * mw, top + v * mh, rx * mw, ry * mh, i * 1.7);
  });
  m.content.add(map);
  REGIONS.forEach((r) => {
    const st = regionStatus(s, r);
    const x = -mw / 2 + r.u * mw;
    const y = top + r.v * mh;
    const pin = scene.add.graphics();
    const col = st === 'won' ? C.leaf : st === 'open' ? C.mustard : st === 'locked' ? 0x9a9aa2 : C.white;
    pin.fillStyle(C.ink, 1);
    pin.fillCircle(x, y, 17);
    pin.fillStyle(col, 1);
    pin.fillCircle(x, y, 13);
    if (st === 'won') {
      // A little flag: this region is yours.
      pin.lineStyle(3, C.ink, 1);
      pin.lineBetween(x, y - 12, x, y - 40);
      pin.fillStyle(C.terracotta, 1);
      pin.fillTriangle(x, y - 40, x + 22, y - 33, x, y - 26);
    }
    m.content.add(pin);
  });
  const status = !unlocked
    ? t('world.locked', { biz: t(`biz.${BALANCE.empire.regions.unlock}`) })
    : allRegionsWon(s)
      ? t('world.allWon', { company: s.company })
      : t('world.progress', { n: regionsWon(s), total: REGIONS.length });
  m.content.add(
    makeText(scene, 0, top + mh + 34, status, FS.tiny, allRegionsWon(s) ? C.leafDark : C.inkSoft, {
      wrap: 600,
      bold: false,
    }),
  );
  const listTop = top + mh + 100;
  REGIONS.forEach((r, i) => {
    const st = regionStatus(s, r);
    const row = scene.add.container(0, listTop + i * rowH);
    const g = scene.add.graphics();
    drawCard(g, -310, -42, 620, 84, st === 'won' ? 0xdff2d5 : st === 'open' ? 0xfff3c4 : C.white, {
      radius: 16,
      stroke: C.ink,
      strokeW: 3,
      shadow: 2,
    });
    const fx = r.fx;
    const bonus = [
      fx.price ? t('world.fx.price', { n: Math.round(fx.price * 100) }) : '',
      fx.contracts ? t('world.fx.contracts', { n: Math.round(fx.contracts * 100) }) : '',
      fx.income ? t('world.fx.income', { n: Math.round(fx.income * 100) }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const mk = MARKETS.find((x) => x.region === r.id);
    const sub =
      st === 'open'
        ? t('world.flagship', { biz: t(`biz.${r.biz}`), client: r.client })
        : `${bonus}${mk ? ` · ${t(`market.${mk.id}`)}` : ''}`;
    // One line each: the sub line shrinks to fit next to the button.
    const subT = makeText(scene, -290, 18, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false });
    if (subT.width > 400) subT.setScale(400 / subT.width);
    row.add([g, makeText(scene, -290, -16, t(`region.${r.id}`), FS.small, C.ink, { align: 'left' }), subT]);
    const label =
      st === 'won'
        ? t('world.won')
        : st === 'open'
          ? t('world.open')
          : st === 'locked'
            ? t('decor.locked')
            : String(regionCost(s, r));
    const b = new Button(scene, 220, 0, {
      w: 150,
      h: 60,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.tiny,
      icon: st === 'available' || st === 'poor' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (!openRegion(s, r.id)) return;
        session.audio.play('levelup');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        (scene as unknown as { toast?: (s: string, c?: number) => void }).toast?.(
          t('world.opened', { region: t(`region.${r.id}`), biz: t(`biz.${r.biz}`) }),
          C.leafDark,
        );
        m.close();
        onChange?.();
        openWorld(scene, onChange);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`region_${r.id}`, b);
    row.add(b);
    m.content.add(row);
  });
}
