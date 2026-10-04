import { BALANCE } from './data';
import type { GameState } from './state';
import type { ToolParams } from './types';
import { decorFx } from './decor';

export const BASE_TOOLS: ToolParams = {
  scrubBrush: 1,
  rustBrush: 1,
  rustPower: 1,
  sandBrush: 1,
  paintBrush: 1,
  paintOverspray: 1,
  polishRate: 1,
  glueTolerance: 1,
  stickerTear: 1,
  wireHints: 0,
  magnifier: 0,
};

export function hasPerk(state: GameState, perk: string): boolean {
  return state.perks.includes(perk);
}

export function skillRank(state: GameState, branch: string): number {
  let rank = 0;
  for (const s of BALANCE.skills)
    if (s.branch === branch && state.skills.includes(s.id)) rank = Math.max(rank, s.rank);
  return rank;
}

/**
 * Effective tool parameters for the mini-games: workshop upgrades x Craft skill x premium tools.
 * Every upgrade measurably changes these numbers (see tests).
 */
export function toolParams(state: GameState, premiumOnce = false): ToolParams {
  const p: ToolParams = { ...BASE_TOOLS };
  for (const up of BALANCE.upgrades) {
    if (!state.upgrades.includes(up.id)) continue;
    for (const [k, v] of Object.entries(up.fx) as Array<[keyof ToolParams, number]>) {
      if (k === 'wireHints' || k === 'magnifier') p[k] = Math.max(p[k], v);
      else p[k] *= v;
    }
  }
  const craft = skillRank(state, 'craft');
  if (craft > 0) {
    const m = 1 + 0.1 * craft;
    p.scrubBrush *= m;
    p.rustBrush *= m;
    p.sandBrush *= m;
    p.paintBrush *= m;
    p.polishRate *= m;
    p.glueTolerance *= 1 + 0.15 * craft;
    p.stickerTear *= 1 + 0.15 * craft;
  }
  const golden = hasPerk(state, 'golden_sponge') || premiumOnce;
  const kit = hasPerk(state, 'golden_toolkit') || premiumOnce;
  if (golden) {
    p.scrubBrush *= 1.5;
    p.polishRate *= 1.5;
    p.sandBrush *= 1.4;
  }
  if (kit) {
    p.rustBrush *= 1.4;
    p.rustPower *= 1.5;
    p.paintBrush *= 1.3;
    p.paintOverspray *= 0.5;
    p.glueTolerance *= 1.5;
    p.stickerTear *= 1.5;
    p.wireHints = 1;
  }
  return p;
}

/** Appraisal level used for estimate widths (0..3). Magnifier / Appraiser Pass add precision. */
export function appraisalLevel(state: GameState): number {
  let lvl = skillRank(state, 'appraisal');
  if (state.upgrades.includes('magnifier')) lvl += 1;
  if (hasPerk(state, 'appraiser_pass')) lvl = 3;
  return Math.min(3, lvl);
}

/** Hidden gems are visible in the market at Appraisal III or with the Appraiser Pass. */
export function revealsGems(state: GameState): boolean {
  return skillRank(state, 'appraisal') >= 3 || hasPerk(state, 'appraiser_pass');
}

export function charmBonus(state: GameState): number {
  return 1 + 0.05 * skillRank(state, 'charm') + decorFx(state).price;
}

export function shelfCapacity(state: GameState): number {
  return BALANCE.tiers[state.tier].shelves + (hasPerk(state, 'shop_expansion') ? 4 : 0);
}

export function customersPerDay(state: GameState): number {
  const base = BALANCE.tiers[state.tier].customers;
  const repBonus = state.rep >= 100 ? 1 : 0;
  const perk = hasPerk(state, 'shop_expansion') ? 1 : 0;
  return Math.min(8, Math.max(3, base + repBonus + perk + decorFx(state).customers));
}

/** Items the player may buy at the market per day: 3..6. */
export function marketSlots(state: GameState): number {
  const tierBonus = (state.tier >= 2 ? 1 : 0) + (state.tier >= 4 ? 1 : 0);
  return Math.min(6, 3 + tierBonus + skillRank(state, 'logistics'));
}

export function adsRemoved(state: GameState): boolean {
  return hasPerk(state, 'no_ads');
}
