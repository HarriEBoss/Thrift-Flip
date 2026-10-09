import { describe, expect, it } from 'vitest';
import {
  BUSINESSES,
  businessStatus,
  canSwitchBusiness,
  currentBusiness,
  isReselling,
  nextBusinessGoal,
  openBusiness,
  openCost,
  openableBusinesses,
  setCurrentBusiness,
} from '../../src/core/empire';
import { BALANCE } from '../../src/core/data';
import { game } from './helpers';

const b = (id: string) => BUSINESSES.find((x) => x.id === id)!;

describe('business ladder', () => {
  it('is data-driven, in order: reselling, phone, computer, mechanic, robotics, rocket', () => {
    expect(BUSINESSES).toBe(BALANCE.empire.businesses);
    expect(BUSINESSES.map((x) => x.id)).toEqual([
      'reselling',
      'phone',
      'computer',
      'mechanic',
      'robotics',
      'rocket',
    ]);
    for (let i = 1; i < BUSINESSES.length; i++) {
      expect(BUSINESSES[i].capital).toBeGreaterThan(BUSINESSES[i - 1].capital);
      // Each rung needs the one before it.
      expect(BUSINESSES[i].needs.business).toBe(BUSINESSES[i - 1].id);
    }
  });

  it('a new game owns only the Reselling Shop and works there', () => {
    const g = game();
    expect(g.biz).toEqual({ own: ['reselling'], cur: 'reselling' });
    expect(isReselling(g)).toBe(true);
    expect(currentBusiness(g).id).toBe('reselling');
    expect(businessStatus(g, b('reselling'))).toBe('owned');
  });

  it('gating: locked until the needs are met, then saving until the capital is there', () => {
    const g = game(1, { coins: 999_999 });
    // Phone Repair needs a bigger shop first.
    expect(businessStatus(g, b('phone'))).toBe('locked');
    expect(openBusiness(g, 'phone')).toBe(false);
    g.tier = b('phone').needs.shopTier!;
    expect(businessStatus(g, b('phone'))).toBe('available');
    // Computer Repair needs Phone Repair, whatever the savings.
    g.tier = 4;
    expect(businessStatus(g, b('computer'))).toBe('locked');
    g.coins = b('phone').capital - 1;
    expect(businessStatus(g, b('phone'))).toBe('saving');
    expect(openBusiness(g, 'phone')).toBe(false);
    g.coins = b('phone').capital;
    expect(openableBusinesses(g)).toBe(1);
    expect(openBusiness(g, 'phone')).toBe(true);
    // Opening spends part of the capital; the rest stays as working money.
    expect(g.coins).toBe(b('phone').capital - openCost(b('phone')));
    expect(openCost(b('phone'))).toBeLessThan(b('phone').capital);
    expect(businessStatus(g, b('phone'))).toBe('owned');
    expect(openBusiness(g, 'phone')).toBe(false);
    expect(businessStatus(g, b('computer'))).toBe('saving');
  });

  it('the next goal shows progress towards the next business', () => {
    const g = game(1, { tier: 4, coins: 500 });
    const goal = nextBusinessGoal(g)!;
    expect(goal.id).toBe('phone');
    expect(goal.progress).toBeCloseTo(500 / b('phone').capital);
    g.biz.own = BUSINESSES.map((x) => x.id);
    expect(nextBusinessGoal(g)).toBeNull();
  });

  it('you pick where to work at the start of the day only', () => {
    const g = game(1, { tier: 4 });
    expect(setCurrentBusiness(g, 'phone')).toBe(false);
    g.biz.own.push('phone');
    expect(setCurrentBusiness(g, 'phone')).toBe(true);
    expect(isReselling(g)).toBe(false);
    g.day.jobs.push(10);
    expect(canSwitchBusiness(g)).toBe(false);
    expect(setCurrentBusiness(g, 'reselling')).toBe(false);
  });
});
