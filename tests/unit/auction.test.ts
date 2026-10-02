import { describe, expect, it } from 'vitest';
import { nextBid, playerBid, playerWon, startAuction, tickAuction } from '../../src/core/auction';
import type { Offer } from '../../src/core/market';

const lot: Offer = { idx: 0, a: 10, r: 1, apparent: 1, d: 1, s: 5, ask: 40, floor: 0.9, seller: 0 };

describe('auction', () => {
  it('starts with 2-3 bidders below the visible value', () => {
    const a = startAuction(lot, 1);
    expect(a.bidders.length).toBeGreaterThanOrEqual(2);
    expect(a.bidders.length).toBeLessThanOrEqual(3);
    expect(nextBid(a)).toBe(a.price);
    expect(a.leader).toBe(-1);
  });
  it('player can win by outbidding until NPCs drop out', () => {
    for (let seed = 1; seed < 30; seed++) {
      const a = startAuction(lot, seed);
      let guard = 0;
      while (!a.done && guard++ < 2000) {
        if (a.leader !== 0) playerBid(a, 1e6);
        tickAuction(a, 0.25);
      }
      expect(a.done).toBe(true);
      expect(playerWon(a)).toBe(true);
      expect(a.price).toBeLessThanOrEqual(
        Math.max(...a.bidders.map((b) => b.max)) + a.inc + Math.round(lot.ask * 0.6),
      );
      expect(tickAuction(a, 1)).toBe(false);
      expect(playerBid(a, 1e6)).toBe(false);
    }
  });
  it('npcs win if the player never bids; player cannot overspend', () => {
    const a = startAuction(lot, 3);
    expect(playerBid(a, 0)).toBe(false);
    let guard = 0;
    while (!a.done && guard++ < 1000) tickAuction(a, 0.25);
    expect(playerWon(a)).toBe(false);
  });
  it('leading player cannot bid against themselves', () => {
    const a = startAuction(lot, 4);
    expect(playerBid(a, 1e6)).toBe(true);
    expect(playerBid(a, 1e6)).toBe(false);
  });
});
