import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/core/data';
import {
  addXp,
  buyUpgrade,
  canUpgradeTier,
  isMaxTier,
  learnSkill,
  nextTier,
  skillPoints,
  skillStatus,
  upgradeStatus,
  upgradeTier,
  xpToNext,
} from '../../src/core/progression';
import {
  BASE_TOOLS,
  adsRemoved,
  appraisalLevel,
  charmBonus,
  customersPerDay,
  marketSlots,
  revealsGems,
  shelfCapacity,
  skillRank,
  toolParams,
} from '../../src/core/perks';
import { game } from './helpers';

describe('xp and levels', () => {
  it('curve grows', () => {
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
  });
  it('levels up and grants skill points', () => {
    const g = game();
    expect(addXp(g, xpToNext(1) + xpToNext(2))).toBe(2);
    expect(g.level).toBe(3);
    expect(skillPoints(g)).toBe(2);
    expect(addXp(g, -5)).toBe(0);
  });
});

describe('skills', () => {
  it('respects level, prerequisites and points', () => {
    const g = game();
    const a1 = BALANCE.skills.find((s) => s.id === 'appraisal1')!;
    const a2 = BALANCE.skills.find((s) => s.id === 'appraisal2')!;
    expect(skillStatus(g, a1)).toBe('locked');
    g.level = 10;
    expect(skillStatus(g, a2)).toBe('locked');
    expect(learnSkill(g, 'appraisal1')).toBe(true);
    expect(skillStatus(g, a1)).toBe('owned');
    expect(learnSkill(g, 'appraisal1')).toBe(false);
    expect(learnSkill(g, 'nope')).toBe(false);
    expect(learnSkill(g, 'appraisal2')).toBe(true);
    expect(appraisalLevel(g)).toBe(2);
    expect(skillRank(g, 'appraisal')).toBe(2);
  });
  it('skills change gameplay numbers', () => {
    const g = game();
    const slots = marketSlots(g);
    const charm = charmBonus(g);
    const brush = toolParams(g).scrubBrush;
    g.skills = ['logistics1', 'charm1', 'craft1', 'appraisal1', 'appraisal2', 'appraisal3'];
    expect(marketSlots(g)).toBe(slots + 1);
    expect(charmBonus(g)).toBeGreaterThan(charm);
    expect(toolParams(g).scrubBrush).toBeGreaterThan(brush);
    expect(revealsGems(g)).toBe(true);
  });
});

describe('upgrades and tiers', () => {
  it('every workshop upgrade measurably changes tool params', () => {
    for (const u of BALANCE.upgrades) {
      const g = game();
      g.tier = 4;
      g.coins = 1e6;
      const before = toolParams(g);
      expect(upgradeStatus(g, u)).toBe('available');
      expect(buyUpgrade(g, u.id)).toBe(true);
      expect(upgradeStatus(g, u)).toBe('owned');
      expect(toolParams(g)).not.toEqual(before);
      expect(buyUpgrade(g, u.id)).toBe(false);
    }
  });
  it('locks upgrades by tier and coins', () => {
    const g = game();
    const mag = BALANCE.upgrades.find((u) => u.id === 'magnifier')!;
    expect(upgradeStatus(g, mag)).toBe('locked');
    g.tier = 4;
    g.coins = 0;
    expect(upgradeStatus(g, mag)).toBe('poor');
  });
  it('tier upgrades need coins and reputation', () => {
    const g = game();
    expect(nextTier(g)?.id).toBe('garage');
    g.coins = 1e6;
    g.rep = 0;
    expect(canUpgradeTier(g)).toBe(false);
    g.rep = 1000;
    const shelves = shelfCapacity(g);
    const cust = customersPerDay(g);
    for (let i = 0; i < 4; i++) expect(upgradeTier(g)).toBe(true);
    expect(isMaxTier(g)).toBe(true);
    expect(upgradeTier(g)).toBe(false);
    expect(nextTier(g)).toBeNull();
    expect(shelfCapacity(g)).toBeGreaterThan(shelves);
    expect(customersPerDay(g)).toBeGreaterThan(cust);
  });
  it('perks', () => {
    const g = game();
    expect(adsRemoved(g)).toBe(false);
    g.perks = ['no_ads', 'golden_sponge', 'golden_toolkit', 'shop_expansion', 'appraiser_pass'];
    expect(adsRemoved(g)).toBe(true);
    expect(toolParams(g).scrubBrush).toBeGreaterThan(BASE_TOOLS.scrubBrush);
    expect(toolParams(g).wireHints).toBe(1);
    expect(appraisalLevel(g)).toBe(3);
    expect(shelfCapacity(g)).toBe(BALANCE.tiers[0].shelves + 4);
    // premium tool (rewarded) for one restoration
    const plain = game();
    expect(toolParams(plain, true).glueTolerance).toBeGreaterThan(toolParams(plain).glueTolerance);
    plain.upgrades = ['magnifier'];
    expect(appraisalLevel(plain)).toBe(1);
  });
});
