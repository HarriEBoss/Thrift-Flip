import type { BaseScene } from '../scenes/BaseScene';
import { Button, drawCard, drawStar, makeText } from './widgets';
import { iconStar } from './icons';
import { compact } from './format';
import { C, FS } from '../theme';
import { session } from '../session';
import { canPrestige, nextPrestigeTokens, prestige } from '../../core/prestige';
import { SKILL_BRANCHES, SKILL_NODES, buyNode, nodeStatus, skillNode } from '../../core/skilltree';
import type { PrestigeFx, SkillNodeDef } from '../../core/types';
import { t } from '../../i18n';

function refresh(scene: BaseScene): void {
  (scene as unknown as { refreshHud?: () => void }).refreshHud?.();
}

function toast(scene: BaseScene, text: string, color: number = C.leafDark): void {
  (scene as unknown as { toast?: (s: string, c?: number) => void }).toast?.(text, color);
}

/** "+10% income", "Start each run with 2,000 coins"... one line per bonus of a node. */
export function nodeEffect(n: SkillNodeDef): string {
  return (Object.entries(n.fx) as Array<[keyof PrestigeFx, number | string[]]>)
    .map(([k, v]) =>
      k === 'startBiz'
        ? t('fx.startBiz', { list: (v as string[]).map((id) => t(`biz.${id}`)).join(', ') })
        : k === 'startCoins'
          ? t('fx.startCoins', { n: compact(v as number) })
          : t(`fx.${k}`, { n: Math.round((v as number) * 100) }),
    )
    .join(' · ');
}

/** The run is over: what the prestige gives and keeps, then a fresh start. */
export function openPrestige(scene: BaseScene): void {
  const s = session.state;
  const m = scene.openModal({ title: t('prestige.title'), w: 640, h: 900 });
  const top = -m.ph / 2 + 110;
  const n = nextPrestigeTokens(s);
  const star = scene.add.graphics();
  drawStar(star, 0, top + 55, 58, C.gold);
  m.content.add([
    star,
    makeText(scene, 0, top + 58, `+${n}`, FS.h2, C.ink, { stroke: C.white, strokeW: 6 }),
    makeText(scene, 0, top + 145, t('prestige.tokens', { n, company: s.company }), FS.small, C.ink, {
      wrap: 560,
    }),
  ]);
  const card = (y: number, title: string, body: string, color: number) => {
    const g = scene.add.graphics();
    drawCard(g, -280, y - 65, 560, 130, color, { radius: 18, stroke: C.ink, strokeW: 3, shadow: 2 });
    m.content.add([
      g,
      makeText(scene, 0, y - 40, title, FS.small, C.ink),
      makeText(scene, 0, y + 15, body, FS.tiny, C.inkSoft, { wrap: 520, bold: false }),
    ]);
  };
  card(top + 275, t('prestige.keepTitle'), t('prestige.keep'), 0xdff2d5);
  card(top + 420, t('prestige.resetTitle'), t('prestige.reset'), 0xfde7d9);
  const go = new Button(scene, 0, m.ph / 2 - 175, {
    w: 400,
    h: 90,
    label: t('prestige.go'),
    color: C.purple,
    fontSize: FS.h3,
    icon: (g, sz) => iconStar(g, sz),
    onClick: () => {
      const next = prestige(session.state);
      if (!next) return;
      session.state = next;
      session.applySettings();
      session.audio.play('levelup');
      session.haptic('success');
      void session.save(true);
      session.openTreeNext = true;
      m.close();
      scene.scene.start('Market');
    },
  });
  go.setEnabled(canPrestige(s));
  scene.mark('prestige_go', go);
  m.content.add(go);
}

/** The legacy (prestige) skill tree: one tab per branch, buy nodes with tokens. */
export function openSkillTree(scene: BaseScene, onChange?: () => void, branch = SKILL_BRANCHES[0]): void {
  const s = session.state;
  const m = scene.openModal({ title: t('tree.title'), w: 660, h: 1000 });
  const top = -m.ph / 2 + 100;
  const head = scene.add.graphics();
  iconStar(head, 44);
  head.setPosition(-170, top);
  m.content.add([
    head,
    makeText(scene, -140, top, t('tree.tokens', { n: s.prestige.tokens }), FS.h3, C.ink, { align: 'left' }),
    makeText(scene, 280, top, t('tree.prestiges', { n: s.prestige.n }), FS.tiny, C.inkSoft, {
      align: 'right',
    }),
  ]);
  // Branch tabs.
  const tw = 600 / SKILL_BRANCHES.length;
  SKILL_BRANCHES.forEach((b, i) => {
    const tab = new Button(scene, -300 + tw / 2 + i * tw, top + 80, {
      w: tw - 8,
      h: 64,
      label: t(`branch.${b}`),
      color: b === branch ? C.teal : C.inkSoft,
      fontSize: FS.tiny,
      onClick: () => {
        if (b === branch) return;
        m.close();
        openSkillTree(scene, onChange, b);
      },
    });
    const ready = SKILL_NODES.filter((n) => n.branch === b && nodeStatus(s, n) === 'available').length;
    tab.setBadge(ready ? String(ready) : null);
    scene.mark(`tree_${b}`, tab);
    m.content.add(tab);
  });
  const nodes = SKILL_NODES.filter((n) => n.branch === branch);
  const rowH = Math.min(125, (m.ph - 480) / Math.max(1, nodes.length));
  nodes.forEach((n, i) => {
    const st = nodeStatus(s, n);
    const y = top + 170 + rowH / 2 + i * rowH;
    const row = scene.add.container(0, y);
    const g = scene.add.graphics();
    const bg = st === 'owned' ? 0xdff2d5 : st === 'locked' ? 0xece6dc : C.white;
    drawCard(g, -300, -rowH / 2 + 6, 600, rowH - 12, bg, {
      radius: 16,
      stroke: C.ink,
      strokeW: 3,
      shadow: 2,
    });
    const name = makeText(scene, -280, -rowH / 2 + 34, t(`node.${n.id}`), FS.small, C.ink, { align: 'left' });
    const fx = makeText(scene, -280, 4, nodeEffect(n), FS.tiny, C.leafDark, {
      align: 'left',
      wrap: 380,
      bold: false,
    });
    const missing = n.req.filter((r) => !s.prestige.nodes.includes(r));
    const req =
      st === 'locked'
        ? makeText(
            scene,
            -280,
            rowH / 2 - 30,
            t('tree.needs', { list: missing.map((r) => t(`node.${skillNode(r)?.id ?? r}`)).join(', ') }),
            FS.tiny,
            C.terracottaDark,
            { align: 'left', bold: false },
          )
        : null;
    if (req && req.width > 400) req.setScale(400 / req.width);
    row.add([g, name, fx, ...(req ? [req] : [])]);
    const b = new Button(scene, 215, 0, {
      w: 140,
      h: 64,
      label: st === 'owned' ? t('common.owned') : String(n.cost),
      color: st === 'available' ? C.purple : C.inkSoft,
      fontSize: FS.small,
      icon: st === 'owned' ? undefined : (gr, sz) => iconStar(gr, sz),
      onClick: () => {
        if (!buyNode(s, n.id)) return;
        session.audio.play('levelup');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        toast(scene, t('tree.bought', { node: t(`node.${n.id}`) }), C.purple);
        m.close();
        onChange?.();
        openSkillTree(scene, onChange, branch);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`node_${n.id}`, b);
    row.add(b);
    m.content.add(row);
  });
  if (canPrestige(s)) {
    const p = new Button(scene, 0, m.ph / 2 - 175, {
      w: 420,
      h: 76,
      label: t('prestige.open', { n: nextPrestigeTokens(s) }),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => {
        m.close();
        openPrestige(scene);
      },
    });
    scene.mark('tree_prestige', p);
    m.content.add(p);
  } else {
    m.content.add(
      makeText(scene, 0, m.ph / 2 - 175, t('tree.how'), FS.tiny, C.inkSoft, { wrap: 560, bold: false }),
    );
  }
}
