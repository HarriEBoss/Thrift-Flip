/**
 * The Gold Bar store: lists the packs and turns a successful payment into Gold Bars. The payment
 * itself is a PaymentProvider's job (./payments); without one (YouTube) the store is hidden and
 * Gold Bars only come from playing.
 */
import { PRODUCTS, grantProduct } from '../products';
import type { GameState } from '../state';
import type { ProductDef } from '../types';
import type { PaymentProvider, PayResult } from './payments';

export class StoreService {
  constructor(private readonly provider: PaymentProvider | null) {}

  /** Whether packs can be bought here at all. */
  get available(): boolean {
    return !!this.provider;
  }

  /** Purchases are pretend (playtest): the UI says so and asks first. */
  get pretend(): boolean {
    return this.provider?.kind === 'mock';
  }

  /** Gold Bar packs, smallest first. */
  goldPacks(): ProductDef[] {
    return PRODUCTS.filter((p) => (p.gold ?? 0) > 0).sort((a, b) => (a.gold ?? 0) - (b.gold ?? 0));
  }

  async prices(): Promise<Record<string, string>> {
    const fallback = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]));
    if (!this.provider) return fallback;
    try {
      return { ...fallback, ...(await this.provider.prices()) };
    } catch {
      return fallback;
    }
  }

  /** Buys a pack: Gold Bars are added only after the payment succeeded. */
  async buy(state: GameState, productId: string): Promise<PayResult> {
    if (!this.provider || !this.goldPacks().some((p) => p.id === productId)) return 'failed';
    let r: PayResult;
    try {
      r = await this.provider.buy(productId);
    } catch {
      r = 'failed';
    }
    if (r === 'success') grantProduct(state, productId);
    return r;
  }
}
