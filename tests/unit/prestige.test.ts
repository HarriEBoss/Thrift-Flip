import { describe, expect, it } from 'vitest';
import { BALANCE, ITEMS } from '../../src/core/data';
import { newGame, type GameState } from '../../src/core/state';
import { canPrestige, nextPrestigeTokens, prestige } from '../../src/core/prestige';
import {
  SKILL_NODES,
  buyNode,
  nodeStatus,
  prestigeFx,
  skillNode,
  tokensFor,
  totalTokens,
  treeCost,
} from '../../src/core/skilltree';
import { business, businessStatus, openCost } from '../../src/core/empire';
import { REGIONS, regionCost } from '../../src/core/regions';
import { TECHS, dysonNeeds, techCost, techDays } from '../../src/core/space';
import { runCampaign } from '../../src/core/marketing';
import { dailyIncome } from '../../src/core/managers';
import { instanceValue, makeInstance } from '../../src/core/items';
import { deserialize, serialize } from '../../src/core/save/schema';

const STAGES = BALANCE.empire.space.dyson.stages;

/** A run that has harvested the whole Sun. */
function finished(g: GameState = newGame(7)): GameState {
  g.space.dyson = STAGES;
  return g;
}

describe('prestige tokens', () => {
  it('the n-th prestige gives n tokens; n prestiges give n(n+1)/2 in total', () => {
    expect([1, 2, 3, 4, 5].map(tokensFor)).toEqual([1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 10].map(totalTokens)).toEqual([0, 1, 3, 6, 10, 55]);
    for (let n = 1; n <= 30; n++) {
      let sum = 0;
      for (let k = 1; k <= n; k++) sum += tokensFor(k);
      expect(sum).toBe(totalTokens(n));
    }
    expect(tokensFor(0)).toBe(0);
    expect(totalTokens(-3)).toBe(0);
  });

  it('prestiging run after run hands out 1, 2, 3... tokens', () => {
    let g = finished();
    const got: number[] = [];
    for (let i = 0; i < 5; i++) {
      expect(nextPrestigeTokens(g)).toBe(i + 1);
      const before = g.prestige.tokens;
      g = finished(prestige(g)!);
      got.push(g.prestige.tokens - before);
    }
    expect(got).toEqual([1, 2, 3, 4, 5]);
    expect(g.prestige.n).toBe(5);
    expect(g.prestige.tokens).toBe(totalTokens(5));
  });

  it('only a finished run (the whole Sun harvested) can prestige', () => {
    const g = newGame(1);
    g.space.dyson = STAGES - 1;
    expect(canPrestige(g)).toBe(false);
    expect(prestige(g)).toBeNull();
    g.space.dyson = STAGES;
    expect(canPrestige(g)).toBe(true);
  });
});

describe('what a prestige resets and keeps', () => {
  it('resets the run, keeps the name, purchases, catalog, settings, stats and the tree', () => {
    const g = finished(newGame(99));
    g.company = 'Sparkle Fix Co.';
    g.flags.named = true;
    g.coins = 9_000_000;
    g.tier = 4;
    g.level = 30;
    g.biz = { own: ['reselling', 'phone', 'computer', 'mechanic', 'robotics', 'rocket'], cur: 'rocket' };
    g.regions = { namerica: 2, asia: 2 };
    g.managers = { phone: 3 };
    g.branches = { phone: 2 };
    g.brand = 80;
    g.space.techs = ['rockets', 'dyson'];
    g.space.colonies = ['mars'];
    g.space.mat = { regolith: 50 };
    g.owned = ['starter_pack'];
    g.perks = ['autoSell'];
    g.decor = ['plant'];
    g.catalog = '12' + g.catalog.slice(2);
    g.settings.music = 0.1;
    g.stats.profit = 123456;
    g.day.n = 640;
    g.prestige = { n: 1, tokens: 2, nodes: ['cash1'], best: 700 };
    const p = prestige(g)!;
    // Reset.
    expect(p.coins).toBe(BALANCE.startCoins);
    expect(p.tier).toBe(0);
    expect(p.level).toBe(1);
    expect(p.day.n).toBe(1);
    expect(p.biz).toEqual({ own: ['reselling'], cur: 'reselling' });
    expect(p.regions).toEqual({});
    expect(p.managers).toEqual({});
    expect(p.branches).toEqual({});
    expect(p.brand).toBe(0);
    expect(p.space).toEqual({ techs: [], research: null, colonies: [], mat: {}, dyson: 0 });
    expect(p.inv).toEqual([]);
    expect(p.seed).not.toBe(g.seed);
    // Kept.
    expect(p.company).toBe('Sparkle Fix Co.');
    expect(p.flags.named).toBe(true);
    expect(p.flags.tutorialDone).toBe(true);
    expect(p.owned).toEqual(['starter_pack']);
    expect(p.perks).toEqual(['autoSell']);
    expect(p.decor).toEqual(['plant']);
    expect(p.catalog).toBe(g.catalog);
    expect(p.settings.music).toBe(0.1);
    expect(p.stats.profit).toBe(123456);
    expect(p.prestige).toEqual({ n: 2, tokens: 4, nodes: ['cash1'], best: 640 });
  });

  it('head-start nodes give the next run coins and businesses', () => {
    const g = finished();
    g.prestige = { n: 3, tokens: 0, nodes: ['seed1', 'seed2'], best: 0 };
    const p = prestige(g)!;
    expect(p.coins).toBe(BALANCE.startCoins + 2000 + 25000);
    expect(p.biz.own).toEqual(['reselling', 'phone']);
  });
});

describe('skill tree', () => {
  it('is data-driven: unique ids, known prerequisites, no loops, every node reachable', () => {
    const ids = SKILL_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of SKILL_NODES) {
      expect(n.cost).toBeGreaterThan(0);
      for (const r of n.req) expect(ids.indexOf(r), `${n.id} needs ${r}`).toBeGreaterThanOrEqual(0);
    }
    // Buying in order with enough tokens gets the whole tree.
    const g = newGame(3);
    g.prestige.tokens = treeCost();
    for (let pass = 0; pass < SKILL_NODES.length; pass++)
      for (const n of SKILL_NODES) if (nodeStatus(g, n) === 'available') buyNode(g, n.id);
    expect(g.prestige.nodes.length).toBe(SKILL_NODES.length);
    expect(g.prestige.tokens).toBe(0);
  });

  it('nodes need their prerequisites and enough tokens', () => {
    const g = newGame(3);
    const cash2 = skillNode('cash2')!;
    g.prestige.tokens = 10;
    expect(nodeStatus(g, cash2)).toBe('locked');
    expect(buyNode(g, 'cash2')).toBe(false);
    expect(buyNode(g, 'cash1')).toBe(true);
    expect(nodeStatus(g, skillNode('cash1')!)).toBe('owned');
    expect(buyNode(g, 'cash1')).toBe(false);
    g.prestige.tokens = 1;
    expect(nodeStatus(g, cash2)).toBe('short');
    g.prestige.tokens = 2;
    expect(buyNode(g, 'cash2')).toBe(true);
    expect(g.prestige.tokens).toBe(0);
    expect(buyNode(g, 'nope')).toBe(false);
  });

  it('bonuses add up, with the discount capped', () => {
    const g = newGame(3);
    expect(prestigeFx(g).income).toBe(0);
    g.prestige.nodes = ['cash1', 'cash2', 'deals1', 'deals2', 'deals3'];
    const fx = prestigeFx(g);
    expect(fx.income).toBeCloseTo(0.25);
    expect(fx.discount).toBeCloseTo(0.45);
    g.prestige.nodes = SKILL_NODES.map((n) => n.id);
    expect(prestigeFx(g).discount).toBeLessThanOrEqual(BALANCE.empire.prestige.maxDiscount);
  });

  it('the bonuses reach the game: costs, income, marketing, research, Dyson', () => {
    const a = newGame(5);
    const b = newGame(5);
    b.prestige.nodes = ['deals1', 'cash1', 'brand1', 'lab1', 'mine1', 'mine2', 'lab2', 'swarm', 'boss1'];
    const phone = business('phone')!;
    expect(openCost(phone, b)).toBeLessThan(openCost(phone, a));
    expect(regionCost(b, REGIONS[0])).toBeLessThan(regionCost(a, REGIONS[0]));
    const t = TECHS[TECHS.length - 1];
    expect(techCost(b, t)).toBeLessThan(techCost(a, t));
    expect(techDays(b, t)).toBeLessThan(techDays(a, t));
    expect(techDays(b, TECHS[0])).toBeGreaterThanOrEqual(1);
    expect(dysonNeeds(b)!.coins).toBeLessThan(dysonNeeds(a)!.coins);
    // Sales.
    const ia = makeInstance(a, 0, 0, 1234, 0, 5, true);
    ia.q = 0.9;
    expect(instanceValue(b, ia)).toBeGreaterThan(instanceValue(a, ia));
    // Marketing.
    a.biz.own.push('phone');
    b.biz.own.push('phone');
    a.coins = b.coins = 1e6;
    expect(runCampaign(b, 'flyers')).toBeGreaterThan(runCampaign(a, 'flyers'));
    // Managers.
    for (const g of [a, b]) {
      g.biz.own.push('rocket');
      g.managers.phone = 2;
    }
    expect(dailyIncome(b, phone).net).toBeGreaterThan(dailyIncome(a, phone).net);
    // The capital you must save for a business is lower too.
    const c = newGame(5);
    c.prestige.nodes = ['deals1'];
    c.tier = 4;
    c.coins = Math.ceil(phone.capital * 0.95);
    expect(businessStatus(c, phone)).toBe('available');
    c.prestige.nodes = [];
    expect(businessStatus(c, phone)).toBe('saving');
    expect(ITEMS.length).toBeGreaterThan(0);
  });
});

describe('prestige in saves', () => {
  it('count, tokens, nodes and best run survive a save; unknown nodes are dropped', () => {
    const g = newGame(11);
    g.prestige = { n: 4, tokens: 3, nodes: ['cash1', 'seed1'], best: 512 };
    expect(deserialize(serialize(g)).prestige).toEqual(g.prestige);
    const raw = JSON.parse(serialize(g));
    raw.pr = [2, -5, ['cash1', 'bogus', 'cash1'], 'x'];
    expect(deserialize(JSON.stringify(raw)).prestige).toEqual({ n: 2, tokens: 0, nodes: ['cash1'], best: 0 });
  });
});
