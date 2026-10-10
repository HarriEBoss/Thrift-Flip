import Phaser from 'phaser';
import type { BaseScene } from '../scenes/BaseScene';
import { Button, ProgressBar, drawCard, makeText } from './widgets';
import { iconCoin, iconWorkshop } from './icons';
import { compact } from './format';
import { C, FS } from '../theme';
import { session } from '../session';
import { BALANCE } from '../../core/data';
import {
  BODIES,
  TECHS,
  buildDysonStage,
  colonyCost,
  colonyStatus,
  dysonDone,
  dysonNeeds,
  dysonStatus,
  foundColony,
  spaceIncome,
  spaceUnlocked,
  startResearch,
  sunHarvested,
  techCost,
  techDays,
  techStatus,
} from '../../core/space';
import { t } from '../../i18n';
import { openPrestige } from './prestigeMenus';
import { nextPrestigeTokens } from '../../core/prestige';

function refresh(scene: BaseScene): void {
  (scene as unknown as { refreshHud?: () => void }).refreshHud?.();
}

function toast(scene: BaseScene, text: string, color: number = C.leafDark): void {
  (scene as unknown as { toast?: (s: string, c?: number) => void }).toast?.(text, color);
}

const MAT_COL: Record<string, number> = {
  helium3: 0x9fd8ff,
  regolith: 0xd9561a,
  nickeliron: 0x8d939d,
  ice: 0xc8f4ff,
  methane: 0xffc23d,
  silicon: 0x6d5ff0,
};

/** A small coloured chip with a material's name and amount. */
function matChip(
  scene: BaseScene,
  x: number,
  y: number,
  id: string,
  text: string,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 1);
  g.fillCircle(-80, 0, 13);
  g.fillStyle(MAT_COL[id] ?? C.white, 1);
  g.fillCircle(-80, 0, 10);
  c.add([g, makeText(scene, -60, 0, text, FS.tiny, C.ink, { align: 'left' })]);
  return c;
}

/** Space program hub: materials in stock, then research, colonies and the Dyson project. */
export function openSpace(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const m = scene.openModal({ title: t('space.title'), w: 660, h: 900 });
  const top = -m.ph / 2 + 100;
  if (!spaceUnlocked(s)) {
    m.content.add(makeText(scene, 0, top + 60, t('space.locked'), FS.body, C.inkSoft, { wrap: 580 }));
    return;
  }
  const inc = spaceIncome(s);
  m.content.add(
    makeText(
      scene,
      0,
      top,
      t('space.intro', { company: s.company, n: compact(inc.coins) }),
      FS.tiny,
      C.inkSoft,
      {
        wrap: 590,
        bold: false,
      },
    ),
  );
  // Materials in stock.
  const mats = BODIES.map((b) => b.material);
  mats.forEach((id, i) => {
    const x = -190 + (i % 3) * 200;
    const y = top + 90 + Math.floor(i / 3) * 44;
    m.content.add(matChip(scene, x, y, id, `${t(`mat.${id}`)} ${s.space.mat[id] ?? 0}`));
  });
  const r = s.space.research;
  const rows: Array<{
    id: string;
    icon: string;
    label: string;
    sub: string;
    color: number;
    open: () => void;
  }> = [
    {
      id: 'space_research',
      icon: 'research',
      label: t('space.research'),
      sub: r
        ? t('space.researching', { tech: t(`tech.${r.id}`), n: r.left })
        : t('space.techsDone', { n: s.space.techs.length, total: TECHS.length }),
      color: C.teal,
      open: () => openResearch(scene, onChange),
    },
    {
      id: 'space_colonies',
      icon: 'space',
      label: t('space.colonies'),
      sub: t('space.coloniesSub', { n: s.space.colonies.length, total: BODIES.length }),
      color: C.purple,
      open: () => openColonies(scene, onChange),
    },
    {
      id: 'space_dyson',
      icon: 'sun',
      label: t('space.dyson'),
      sub: t('space.dysonSub', { n: Math.round(sunHarvested(s) * 100) }),
      color: C.mustardDark,
      open: () => openDyson(scene, onChange),
    },
  ];
  rows.forEach((row, i) => {
    const b = new Button(scene, 0, top + 230 + i * 120, {
      w: 540,
      h: 100,
      label: row.label,
      sub: row.sub,
      color: row.color,
      fontSize: FS.h3,
      icon: (g, sz) => iconWorkshop(g, row.icon, sz),
      onClick: () => {
        m.close();
        row.open();
      },
    });
    scene.mark(row.id, b);
    m.content.add(b);
  });
}

/** Earth research: one technology at a time, each taking a few days. */
export function openResearch(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 96;
  const m = scene.openModal({ title: t('space.research'), w: 660, h: 220 + TECHS.length * rowH });
  const top = -m.ph / 2 + 110;
  TECHS.forEach((tc, i) => {
    const st = techStatus(s, tc);
    const row = scene.add.container(0, top + i * rowH);
    const g = scene.add.graphics();
    const bg = st === 'done' ? 0xdff2d5 : st === 'researching' ? 0xfff3c4 : C.white;
    drawCard(g, -300, -42, 600, 84, bg, { radius: 16, stroke: C.ink, strokeW: 3, shadow: 2 });
    const sub =
      st === 'researching'
        ? t('space.daysLeft', { n: s.space.research!.left })
        : st === 'needs'
          ? t('space.needs', {
              list: tc.needs
                .filter((n) => !s.space.techs.includes(n))
                .map((n) => t(`tech.${n}`))
                .join(', '),
            })
          : t('space.takes', { n: techDays(s, tc) });
    const sub2 = makeText(scene, -280, 16, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false });
    if (sub2.width > 390) sub2.setScale(390 / sub2.width);
    row.add([g, makeText(scene, -280, -16, t(`tech.${tc.id}`), FS.small, C.ink, { align: 'left' }), sub2]);
    const label =
      st === 'done'
        ? t('space.done')
        : st === 'researching'
          ? t('space.busy')
          : st === 'available' || st === 'poor' || st === 'busy'
            ? compact(techCost(s, tc))
            : t('decor.locked');
    const b = new Button(scene, 210, 0, {
      w: 160,
      h: 60,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.small,
      icon: st === 'available' || st === 'poor' || st === 'busy' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (!startResearch(s, tc.id)) return;
        session.audio.play('levelup');
        void session.save(true);
        refresh(scene);
        toast(scene, t('space.started', { tech: t(`tech.${tc.id}`), n: techDays(s, tc) }));
        m.close();
        onChange?.();
        openResearch(scene, onChange);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`tech_${tc.id}`, b);
    row.add(b);
    m.content.add(row);
  });
}

/** Colonies: found a base on each body to harvest its material. */
export function openColonies(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const rowH = 104;
  const m = scene.openModal({ title: t('space.colonies'), w: 660, h: 220 + BODIES.length * rowH });
  const top = -m.ph / 2 + 110;
  BODIES.forEach((bd, i) => {
    const st = colonyStatus(s, bd);
    const row = scene.add.container(0, top + i * rowH);
    const g = scene.add.graphics();
    drawCard(g, -300, -46, 600, 92, st === 'founded' ? 0xdff2d5 : C.white, {
      radius: 16,
      stroke: C.ink,
      strokeW: 3,
      shadow: 2,
    });
    const planet = scene.add.graphics();
    planet.fillStyle(C.ink, 1);
    planet.fillCircle(-256, 0, 26);
    planet.fillStyle(MAT_COL[bd.material] ?? C.white, 1);
    planet.fillCircle(-256, 0, 22);
    if (st === 'locked' || st === 'needs') planet.setAlpha(0.4);
    const needs: string[] = [];
    for (const n of bd.techs) if (!s.space.techs.includes(n)) needs.push(t(`tech.${n}`));
    if (bd.body && !s.space.colonies.includes(bd.body)) needs.push(t(`body.${bd.body}`));
    const sub =
      st === 'needs'
        ? t('space.needs', { list: needs.join(', ') })
        : t('space.harvest', { n: bd.rate, mat: t(`mat.${bd.material}`), coins: compact(bd.income) });
    const sub2 = makeText(scene, -218, 18, sub, FS.tiny, C.inkSoft, { align: 'left', bold: false });
    if (sub2.width > 330) sub2.setScale(330 / sub2.width);
    const name = `${t(`body.${bd.id}`)}${bd.optional ? ` ${t('space.optional')}` : ''}`;
    row.add([g, planet, makeText(scene, -218, -16, name, FS.small, C.ink, { align: 'left' }), sub2]);
    const label =
      st === 'founded'
        ? t('space.founded')
        : st === 'available' || st === 'poor'
          ? compact(colonyCost(s, bd))
          : t('decor.locked');
    const b = new Button(scene, 210, 0, {
      w: 160,
      h: 60,
      label,
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.small,
      icon: st === 'available' || st === 'poor' ? (gr, sz) => iconCoin(gr, sz) : undefined,
      onClick: () => {
        if (!foundColony(s, bd.id)) return;
        session.audio.play('levelup');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        toast(scene, t('space.colonyFounded', { company: s.company, body: t(`body.${bd.id}`) }));
        m.close();
        onChange?.();
        openColonies(scene, onChange);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark(`colony_${bd.id}`, b);
    row.add(b);
    m.content.add(row);
  });
}

/** The Dyson project: build stages around the Sun with the colonies' materials. */
export function openDyson(scene: BaseScene, onChange?: () => void): void {
  const s = session.state;
  const D = BALANCE.empire.space.dyson;
  const m = scene.openModal({ title: t('space.dyson'), w: 660, h: 980 });
  const top = -m.ph / 2 + 100;
  // The Sun and its swarm: one ring segment per stage built.
  const sun = scene.add.graphics();
  const cy = top + 170;
  const glow = dysonDone(s) ? 0xfff1b8 : 0xffd34d;
  sun.fillStyle(glow, 0.35);
  sun.fillCircle(0, cy, 130);
  sun.fillStyle(C.mustard, 1);
  sun.fillCircle(0, cy, 70);
  sun.lineStyle(4, C.ink, 1);
  sun.strokeCircle(0, cy, 70);
  for (let i = 0; i < D.stages; i++) {
    const a0 = -Math.PI / 2 + (i / D.stages) * Math.PI * 2 + 0.04;
    const a1 = -Math.PI / 2 + ((i + 1) / D.stages) * Math.PI * 2 - 0.04;
    sun.lineStyle(18, i < s.space.dyson ? C.teal : 0xd9d0c4, 1);
    sun.beginPath();
    sun.arc(0, cy, 112, a0, a1, false);
    sun.strokePath();
  }
  m.content.add(sun);
  m.content.add(
    makeText(scene, 0, cy, `${Math.round(sunHarvested(s) * 100)}%`, FS.h2, C.ink, {
      stroke: C.white,
      strokeW: 6,
    }),
  );
  const st = dysonStatus(s);
  const msg =
    st === 'done'
      ? t('space.dysonDone', { company: s.company })
      : st === 'needs'
        ? t('space.needs', { list: t('tech.dyson') })
        : st === 'locked'
          ? t('space.locked')
          : t('space.dysonNext', { n: s.space.dyson + 1, total: D.stages });
  m.content.add(
    makeText(scene, 0, cy + 170, msg, FS.small, st === 'done' ? C.leafDark : C.inkSoft, { wrap: 580 }),
  );
  if (st === 'done') {
    // The end of the race: prestige for tokens and start again stronger.
    const p = new Button(scene, 0, m.ph / 2 - 150, {
      w: 420,
      h: 86,
      label: t('prestige.open', { n: nextPrestigeTokens(s) }),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => {
        m.close();
        openPrestige(scene);
      },
    });
    scene.mark('space_prestige', p);
    m.content.add(p);
  }
  const need = dysonNeeds(s);
  if (need && (st === 'short' || st === 'available')) {
    const lines: Array<[string, number, number, number]> = [
      [t('space.coins'), s.coins, need.coins, C.mustard],
      ...Object.entries(need.mat).map(
        ([id, k]) =>
          [t(`mat.${id}`), s.space.mat[id] ?? 0, k, MAT_COL[id] ?? C.white] as [
            string,
            number,
            number,
            number,
          ],
      ),
    ];
    lines.forEach(([label, have, want, col], i) => {
      const y = cy + 230 + i * 44;
      const ok = have >= want;
      const bar = new ProgressBar(scene, 10, y, 180, 14, ok ? C.leaf : col);
      bar.setValue(Math.min(1, have / want));
      m.content.add([
        makeText(scene, -280, y, label, FS.tiny, C.ink, { align: 'left' }),
        bar,
        makeText(scene, 280, y, `${compact(have)} / ${compact(want)}`, FS.tiny, ok ? C.leafDark : C.inkSoft, {
          align: 'right',
        }),
      ]);
    });
    const b = new Button(scene, 0, m.ph / 2 - 150, {
      w: 360,
      h: 80,
      label: t('space.build'),
      color: st === 'available' ? C.leaf : C.inkSoft,
      fontSize: FS.h3,
      onClick: () => {
        if (!buildDysonStage(s)) return;
        session.audio.play('levelup');
        session.haptic('success');
        void session.save(true);
        refresh(scene);
        toast(
          scene,
          dysonDone(s)
            ? t('space.dysonDone', { company: s.company })
            : t('space.built', { n: Math.round(sunHarvested(s) * 100) }),
          C.mustardDark,
        );
        m.close();
        onChange?.();
        openDyson(scene, onChange);
      },
    });
    b.setEnabled(st === 'available');
    scene.mark('dyson_build', b);
    m.content.add(b);
  }
}
