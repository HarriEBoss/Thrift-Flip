/**
 * Marketing: spend coins on campaigns (flyers, radio, TV, billboards, web, satellite ads) to grow
 * your brand. A bigger brand brings more shop customers and more contracts, with diminishing returns
 * (flow = 1 + max x (1 - e^(-brand / K))), and it fades a little every day. Each campaign can run once
 * a day. Numbers in balance.json -> empire.marketing. Pure.
 */
import { BALANCE } from './data';
import { ownsBusiness } from './empire';
import type { GameState } from './state';
import type { CampaignDef } from './types';
import { prestigeFx } from './skilltree';

const M = () => BALANCE.empire.marketing;

export const CAMPAIGNS: CampaignDef[] = BALANCE.empire.marketing.campaigns;

/** Customer and contract flow multiplier for a brand value (1 = no marketing). */
export function brandFlow(brand: number): number {
  const m = M();
  return 1 + m.flowMax * (1 - Math.exp(-Math.max(0, brand) / m.flowK));
}

export type CampaignStatus = 'locked' | 'ran' | 'poor' | 'available';

export function campaignStatus(state: GameState, c: CampaignDef): CampaignStatus {
  if (!ownsBusiness(state, c.needs)) return 'locked';
  if (state.day.ads.includes(c.id)) return 'ran';
  if (state.coins < c.cost) return 'poor';
  return 'available';
}

/** Runs a campaign today. Returns the brand points gained (0 when it cannot run). */
export function runCampaign(state: GameState, id: string): number {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c || campaignStatus(state, c) !== 'available') return 0;
  state.coins -= c.cost;
  state.day.stats.spent += c.cost;
  state.day.ads.push(id);
  const gain = Math.round(c.brand * (1 + prestigeFx(state).marketing) * 10) / 10;
  state.brand += gain;
  return gain;
}

/** Overnight, the brand fades a little (call once per new day). */
export function fadeBrand(state: GameState): void {
  state.brand = Math.round(state.brand * (1 - M().decay * (1 - prestigeFx(state).loyal)) * 10) / 10;
}

/** Extra shop customers a day from the brand (half of the flow bonus, rounded down). */
export function brandCustomers(state: GameState, base: number): number {
  return Math.floor(base * (brandFlow(state.brand) - 1) * 0.5);
}

/** Campaigns that could run right now (for "!" badges). */
export function runnableCampaigns(state: GameState): number {
  return CAMPAIGNS.filter((c) => campaignStatus(state, c) === 'available').length;
}
