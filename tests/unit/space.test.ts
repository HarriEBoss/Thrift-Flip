import { describe, expect, it } from 'vitest';
import {
  BODIES,
  TECHS,
  buildDysonStage,
  colonyReward,
  colonyStatus,
  dysonDone,
  dysonNeeds,
  dysonStatus,
  foundColony,
  spaceDay,
  spaceIncome,
  spaceUnlocked,
  startResearch,
  sunHarvested,
  techStatus,
} from '../../src/core/space';
import { REGIONS, WON } from '../../src/core/regions';
import { BUSINESSES } from '../../src/core/empire';
import { BALANCE } from '../../src/core/data';
import { advancePhase } from '../../src/core/day';
import { businessOffers, completeJob, signContract } from '../../src/core/jobs';
import { finishRestoration, recordStep } from '../../src/core/day';
import { recipeFor } from '../../src/core/items';
import { deserialize, serialize } from '../../src/core/save/schema';
import type { GameState } from '../../src/core/state';
import { game } from './helpers';

const ALL = BUSINESSES.map((b) => b.id);
function spaceAge(coins = 1e9): GameState {
  const g = game(9, { tier: 4, coins, biz: { own: [...ALL], cur: 'reselling' } });
  for (const r of REGIONS) g.regions[r.id] = WON;
  return g;
}
const endDay = (g: GameState) => {
  advancePhase(g, 'workshop');
  advancePhase(g, 'shop');
  advancePhase(g, 'summary');
  advancePhase(g, 'market');
};
const t = (id: string) => TECHS.find((x) => x.id === id)!;
const b = (id: string) => BODIES.find((x) => x.id === id)!;

describe('space program', () => {
  it('opens only once every Earth region is conquered', () => {
    const g = spaceAge();
    g.regions[REGIONS[0].id] = 1;
    expect(spaceUnlocked(g)).toBe(false);
    expect(techStatus(g, t('rockets'))).toBe('locked');
    expect(startResearch(g, 'rockets')).toBe(false);
    g.regions[REGIONS[0].id] = WON;
    expect(techStatus(g, t('rockets'))).toBe('available');
  });

  it('research costs coins, takes its days, one at a time, and follows the tree', () => {
    const g = spaceAge();
    expect(techStatus(g, t('lifesupport'))).toBe('needs');
    expect(startResearch(g, 'rockets')).toBe(true);
    expect(g.coins).toBe(1e9 - t('rockets').cost);
    expect(techStatus(g, t('mining'))).toBe('needs');
    for (let d = 1; d < t('rockets').days; d++) {
      endDay(g);
      expect(techStatus(g, t('rockets'))).toBe('researching');
    }
    endDay(g);
    expect(techStatus(g, t('rockets'))).toBe('done');
    expect(startResearch(g, 'lifesupport')).toBe(true);
    expect(techStatus(g, t('mining'))).toBe('busy');
  });

  it('colonies need their technology and the colony before them; the Moon is optional', () => {
    const g = spaceAge();
    expect(colonyStatus(g, b('mars'))).toBe('needs');
    g.space.techs = TECHS.map((x) => x.id);
    expect(colonyStatus(g, b('mars'))).toBe('available');
    expect(colonyStatus(g, b('asteroids'))).toBe('needs');
    expect(foundColony(g, 'mars')).toBe(true);
    expect(colonyStatus(g, b('asteroids'))).toBe('available');
    expect(b('moon').optional).toBe(true);
    expect(BODIES.some((x) => x.body === 'moon')).toBe(false);
  });

  it('every day colonies harvest their material and pay; the Dyson project sells energy', () => {
    const g = spaceAge(0);
    g.space.techs = TECHS.map((x) => x.id);
    g.space.colonies = ['mars', 'asteroids'];
    const inc = spaceIncome(g);
    expect(inc.mat).toEqual({ regolith: b('mars').rate, nickeliron: b('asteroids').rate });
    expect(inc.coins).toBe(b('mars').income + b('asteroids').income);
    spaceDay(g);
    expect(g.space.mat.regolith).toBe(b('mars').rate);
    expect(g.coins).toBe(inc.coins);
    expect(g.day.stats.passive).toBe(inc.coins);
    g.space.dyson = 2;
    expect(spaceIncome(g).coins).toBe(inc.coins + 2 * BALANCE.empire.space.dyson.energy);
  });

  it('colonies send repair contracts to Rocket Repair that ship extra material home', () => {
    const g = spaceAge();
    g.space.colonies = ['mars'];
    const o = businessOffers(g, 'rocket').find((x) => x.colony === 'mars')!;
    expect(o.client).toBe(b('mars').client);
    expect(o.id).toBeGreaterThanOrEqual(100);
    expect(businessOffers(g, 'robotics').some((x) => x.colony)).toBe(false);
    const [inst] = signContract(g, o.id);
    expect(businessOffers(g, 'rocket').some((x) => x.colony === 'mars')).toBe(false);
    recipeFor(inst).forEach((_, i) => recordStep(inst, i, 1));
    finishRestoration(g, inst);
    const r = completeJob(g, inst);
    expect(r.material).toEqual({ id: 'regolith', n: colonyReward(b('mars')) });
    expect(g.space.mat.regolith).toBe(colonyReward(b('mars')));
  });

  it('the Dyson project: stages need the dyson tech, coins and materials; ten stages harvest the Sun', () => {
    const g = spaceAge();
    expect(dysonStatus(g)).toBe('needs');
    g.space.techs = ['dyson'];
    expect(dysonStatus(g)).toBe('short');
    const need = dysonNeeds(g)!;
    for (const [m, k] of Object.entries(need.mat)) g.space.mat[m] = k;
    expect(dysonStatus(g)).toBe('available');
    const coins = g.coins;
    expect(buildDysonStage(g)).toBe(true);
    expect(g.coins).toBe(coins - need.coins);
    expect(Object.values(g.space.mat).every((v) => v === 0)).toBe(true);
    expect(sunHarvested(g)).toBeCloseTo(1 / BALANCE.empire.space.dyson.stages);
    // Each stage needs more than the one before.
    const next = dysonNeeds(g)!;
    expect(next.coins).toBeGreaterThan(need.coins);
    for (let s = 1; s < BALANCE.empire.space.dyson.stages; s++) {
      for (const [m, k] of Object.entries(dysonNeeds(g)!.mat)) g.space.mat[m] = k;
      expect(buildDysonStage(g)).toBe(true);
    }
    expect(dysonDone(g)).toBe(true);
    expect(sunHarvested(g)).toBe(1);
    expect(dysonNeeds(g)).toBeNull();
    expect(dysonStatus(g)).toBe('done');
    expect(buildDysonStage(g)).toBe(false);
  });

  it('the space program survives a save; bad values are dropped', () => {
    const g = spaceAge();
    startResearch(g, 'rockets');
    g.space.techs = ['mining'];
    g.space.colonies = ['mars'];
    g.space.mat = { regolith: 12 };
    g.space.dyson = 3;
    const back = deserialize(serialize(g));
    expect(back.space).toEqual(g.space);
    const raw = JSON.parse(serialize(g));
    raw.sp = [['nope', 'rockets'], ['x', 2], ['pluto', 'mars'], { ice: -3, methane: 'a', regolith: 4.7 }, 99];
    const h = deserialize(JSON.stringify(raw));
    expect(h.space).toEqual({
      techs: ['rockets'],
      research: null,
      colonies: ['mars'],
      mat: { regolith: 4 },
      dyson: BALANCE.empire.space.dyson.stages,
    });
  });
});
