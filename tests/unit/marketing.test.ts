import { describe, expect, it } from 'vitest';
import {
  CAMPAIGNS,
  brandFlow,
  campaignStatus,
  fadeBrand,
  runCampaign,
  runnableCampaigns,
} from '../../src/core/marketing';
import { BALANCE } from '../../src/core/data';
import { advancePhase } from '../../src/core/day';
import { customersPerDay } from '../../src/core/perks';
import { deserialize, serialize } from '../../src/core/save/schema';
import { game } from './helpers';

const M = BALANCE.empire.marketing;

describe('marketing', () => {
  it('brand flow starts at 1, grows with brand, with diminishing returns, and never passes the cap', () => {
    expect(brandFlow(0)).toBe(1);
    const steps = [0, 50, 100, 150, 200].map(brandFlow);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    // Each extra 50 points adds less than the 50 before.
    for (let i = 2; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeLessThan(steps[i - 1] - steps[i - 2]);
    expect(brandFlow(1e9)).toBeLessThanOrEqual(1 + M.flowMax);
  });

  it('campaigns need their business, cost coins, add brand and run once a day', () => {
    const g = game(1, { coins: 100 });
    const flyers = CAMPAIGNS.find((c) => c.id === 'flyers')!;
    const radio = CAMPAIGNS.find((c) => c.id === 'radio')!;
    expect(campaignStatus(g, radio)).toBe('locked');
    expect(campaignStatus(g, flyers)).toBe('available');
    expect(runnableCampaigns(g)).toBe(1);
    expect(runCampaign(g, 'flyers')).toBe(flyers.brand);
    expect(g.coins).toBe(100 - flyers.cost);
    expect(g.brand).toBe(flyers.brand);
    expect(g.day.stats.spent).toBe(flyers.cost);
    expect(campaignStatus(g, flyers)).toBe('ran');
    expect(runCampaign(g, 'flyers')).toBe(0);
    g.biz.own.push('phone');
    expect(campaignStatus(g, radio)).toBe('poor');
  });

  it('the brand fades a little each day, and campaigns can run again the next day', () => {
    const g = game(1, { coins: 1000, brand: 100 });
    runCampaign(g, 'flyers');
    advancePhase(g, 'workshop');
    advancePhase(g, 'shop');
    advancePhase(g, 'summary');
    advancePhase(g, 'market');
    expect(g.brand).toBeCloseTo((100 + 12) * (1 - M.decay), 1);
    expect(g.day.ads).toEqual([]);
    fadeBrand(g);
    expect(g.brand).toBeLessThan(100);
  });

  it('a strong brand brings more shop customers', () => {
    const g = game(1, { tier: 2 });
    const base = customersPerDay(g);
    g.brand = 500;
    expect(customersPerDay(g)).toBeGreaterThan(base);
    expect(customersPerDay(g)).toBeLessThanOrEqual(10);
  });

  it("brand and today's campaigns survive a save", () => {
    const g = game(1, { coins: 100 });
    runCampaign(g, 'flyers');
    const back = deserialize(serialize(g));
    expect(back.brand).toBe(g.brand);
    expect(back.day.ads).toEqual(['flyers']);
  });
});
