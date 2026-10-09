import { describe, expect, it } from 'vitest';
import {
  branchCost,
  branchStatus,
  dailyIncome,
  delegationUnlocked,
  efficiency,
  hireOrTrain,
  managerCost,
  managerLevel,
  managerName,
  managerStatus,
  maxManagerLevel,
  openBranch,
  passiveIncome,
  shops,
} from '../../src/core/managers';
import { BUSINESSES } from '../../src/core/empire';
import { BALANCE } from '../../src/core/data';
import { advancePhase, dayProfit } from '../../src/core/day';
import { deserialize, serialize } from '../../src/core/save/schema';
import { game } from './helpers';

const ALL = BUSINESSES.map((b) => b.id);
const b = (id: string) => BUSINESSES.find((x) => x.id === id)!;
const tycoon = (coins = 10_000_000) => game(3, { tier: 4, coins, biz: { own: [...ALL], cur: 'rocket' } });

describe('managers and branches', () => {
  it('unlock only once you own the top of the ladder', () => {
    const g = game(3, { tier: 4, coins: 1e9, biz: { own: ALL.slice(0, -1), cur: 'reselling' } });
    expect(delegationUnlocked(g)).toBe(false);
    expect(managerStatus(g, b('phone'))).toBe('locked');
    expect(hireOrTrain(g, 'phone')).toBe(false);
    expect(openBranch(g, 'phone')).toBe(false);
    g.biz.own.push(BALANCE.empire.managers.unlock);
    expect(delegationUnlocked(g)).toBe(true);
    expect(managerStatus(g, b('phone'))).toBe('available');
  });

  it('hiring then training raises efficiency; each level costs more; the top level is the max', () => {
    const g = tycoon();
    const p = b('phone');
    let last = 0;
    for (let lvl = 0; lvl < maxManagerLevel(); lvl++) {
      const cost = managerCost(p, lvl)!;
      expect(cost).toBeGreaterThan(last);
      last = cost;
      const coins = g.coins;
      expect(hireOrTrain(g, 'phone')).toBe(true);
      expect(g.coins).toBe(coins - cost);
      expect(managerLevel(g, 'phone')).toBe(lvl + 1);
      expect(efficiency(lvl + 1)).toBeGreaterThan(efficiency(lvl));
    }
    expect(managerCost(p, maxManagerLevel())).toBeNull();
    expect(managerStatus(g, p)).toBe('max');
    expect(hireOrTrain(g, 'phone')).toBe(false);
    expect(managerName(g, 'phone')).toBe(managerName(tycoon(), 'phone'));
  });

  it('branches cost more each time and multiply what a managed business makes', () => {
    const g = tycoon();
    const m = b('mechanic');
    expect(dailyIncome(g, m).net).toBe(0);
    hireOrTrain(g, 'mechanic');
    const one = dailyIncome(g, m);
    expect(one.gross).toBe(Math.round(m.income * efficiency(1)));
    expect(one.wage).toBe(Math.round(one.gross * BALANCE.empire.managers.wagePct));
    expect(one.net).toBe(one.gross - one.wage);
    const c0 = branchCost(m, 0);
    expect(openBranch(g, 'mechanic')).toBe(true);
    expect(openBranch(g, 'mechanic')).toBe(true);
    expect(branchCost(m, 2)).toBeGreaterThan(branchCost(m, 1));
    expect(branchCost(m, 1)).toBeGreaterThan(c0);
    expect(shops(g, 'mechanic')).toBe(3);
    expect(dailyIncome(g, m).gross).toBe(Math.round(m.income * 3 * efficiency(1)));
    // The rat race: income grows linearly, branch costs grow exponentially.
    const payback = (n: number) => branchCost(m, n) / (m.income * efficiency(1));
    expect(payback(5)).toBeGreaterThan(payback(1) * 4);
    g.coins = 0;
    expect(branchStatus(g, m)).toBe('poor');
  });

  it('managers pay at the end of every day, except at the business you work at yourself', () => {
    const g = tycoon(0);
    g.managers = { phone: 2, rocket: 1 };
    const expected = dailyIncome(g, b('phone')).net;
    expect(passiveIncome(g)).toBe(expected);
    advancePhase(g, 'workshop');
    advancePhase(g, 'shop');
    advancePhase(g, 'summary');
    expect(g.coins).toBe(expected);
    expect(g.day.stats.passive).toBe(expected);
    expect(dayProfit(g)).toBe(expected);
    // A strong brand makes managed businesses earn more too.
    const h = tycoon(0);
    h.managers = { phone: 2 };
    h.brand = 300;
    expect(passiveIncome(h)).toBeGreaterThan(expected);
  });

  it('managers and branches survive a save; bad values are dropped', () => {
    const g = tycoon();
    hireOrTrain(g, 'phone');
    hireOrTrain(g, 'phone');
    openBranch(g, 'robotics');
    g.day.stats.passive = 1234;
    const back = deserialize(serialize(g));
    expect(back.managers).toEqual({ phone: 2 });
    expect(back.branches).toEqual({ robotics: 1 });
    expect(back.day.stats.passive).toBe(1234);
    const raw = JSON.parse(serialize(g));
    raw.mg = { phone: 99, nope: 2, mechanic: -1 };
    raw.bn = [1, 2];
    const h = deserialize(JSON.stringify(raw));
    expect(h.managers).toEqual({ phone: maxManagerLevel() });
    expect(h.branches).toEqual({});
  });
});
