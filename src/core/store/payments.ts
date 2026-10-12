/**
 * Payments behind one small interface so the game never depends on a particular store. Today:
 * the platform's own store (StoreKit on iOS, a dev mock on web) wrapped by the game layer, or the
 * mock below (pretend purchases, no money moves). A real payment provider only needs to implement
 * PaymentProvider.
 */
import { PRODUCTS } from '../products';

export type PayResult = 'success' | 'cancelled' | 'failed';

export interface PaymentProvider {
  /** 'mock' for pretend purchases, else the real store's name. */
  readonly kind: 'mock' | 'platform';
  /** Display prices by product id (the store's own, local currency). */
  prices(): Promise<Record<string, string>>;
  /** Asks the store to charge for a product. Never grants anything itself. */
  buy(productId: string): Promise<PayResult>;
}

/** Pretend purchases for playtests: every purchase succeeds and no money moves. */
export class MockPaymentProvider implements PaymentProvider {
  readonly kind = 'mock' as const;
  readonly bought: string[] = [];

  async prices(): Promise<Record<string, string>> {
    return Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]));
  }

  async buy(productId: string): Promise<PayResult> {
    if (!PRODUCTS.some((p) => p.id === productId)) return 'failed';
    this.bought.push(productId);
    return 'success';
  }
}
