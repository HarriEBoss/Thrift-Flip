import { ITEMS } from './data';
import { Rng } from './prng';
import { conditionFactor, rarityMult, snapPrice } from './economy';
import type { Offer } from './market';

export interface Bidder {
  name: string;
  max: number;
  /** Seconds until this bidder reacts. */
  wait: number;
}

export interface AuctionState {
  lot: Offer;
  price: number;
  inc: number;
  /** -1 nobody, 0 player, 1..n bidder index + 1 */
  leader: number;
  bidders: Bidder[];
  timeLeft: number;
  done: boolean;
  rng: number;
  bids: number;
}

export const BID_WINDOW = 4.5;
const NPC_NAMES = ['Mrs. Pebble', 'Sir Bargain', 'Auntie Dot'];

export function startAuction(lot: Offer, seed: number): AuctionState {
  const rng = new Rng(seed);
  const n = rng.int(2, 3);
  const arch = ITEMS[lot.a];
  // NPCs judge by what they can see (gems look common to them too).
  const est = arch.base * rarityMult(lot.apparent) * conditionFactor(0.85);
  const bidders: Bidder[] = [];
  for (let i = 0; i < n; i++) {
    bidders.push({
      name: NPC_NAMES[i],
      max: Math.round(est * rng.range(0.35, 0.8)),
      wait: rng.range(0.6, 2.2),
    });
  }
  const start = Math.max(1, Math.round(lot.ask * 0.6));
  return {
    lot,
    price: start,
    inc: Math.max(1, snapPrice(Math.max(1, est * 0.06))),
    leader: -1,
    bidders,
    timeLeft: BID_WINDOW + 1.5,
    done: false,
    rng: rng.state,
    bids: 0,
  };
}

/** Price the player would pay if they bid now. */
export function nextBid(a: AuctionState): number {
  return a.leader === -1 ? a.price : a.price + a.inc;
}

export function playerBid(a: AuctionState, coins: number): boolean {
  if (a.done || a.leader === 0) return false;
  const p = nextBid(a);
  if (p > coins) return false;
  a.price = p;
  a.leader = 0;
  a.bids++;
  a.timeLeft = Math.max(a.timeLeft, BID_WINDOW);
  return true;
}

/** Advances the auction by dt seconds. Returns true if something changed (a bid or the end). */
export function tickAuction(a: AuctionState, dt: number): boolean {
  if (a.done) return false;
  const rng = new Rng(a.rng);
  let changed = false;
  a.timeLeft -= dt;
  for (let i = 0; i < a.bidders.length; i++) {
    const b = a.bidders[i];
    b.wait -= dt;
    if (b.wait > 0) continue;
    b.wait = rng.range(0.7, 2.4);
    const want = nextBid(a);
    if (a.leader !== i + 1 && want <= b.max && rng.chance(0.75)) {
      a.price = want;
      a.leader = i + 1;
      a.bids++;
      a.timeLeft = Math.max(a.timeLeft, 2.5);
      changed = true;
    }
  }
  if (a.timeLeft <= 0) {
    a.done = true;
    changed = true;
  }
  a.rng = rng.state;
  return changed;
}

export function playerWon(a: AuctionState): boolean {
  return a.done && a.leader === 0;
}
