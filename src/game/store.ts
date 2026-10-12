/**
 * Picks the payment provider for this platform: the platform's own store where it has one (iOS
 * StoreKit, the web dev mock), pretend purchases in the playtest build, none on YouTube (no
 * purchases of any kind there: Gold Bars only come from playing).
 */
import type { Platform } from '../platform/Platform';
import { MockPaymentProvider, type PaymentProvider, type PayResult } from '../core/store/payments';
import { StoreService } from '../core/store/storeService';
import { session } from './session';

class PlatformPaymentProvider implements PaymentProvider {
  readonly kind = 'platform' as const;
  constructor(private readonly platform: Platform) {}

  async prices(): Promise<Record<string, string>> {
    const live = await this.platform.getProducts();
    return Object.fromEntries(live.map((p) => [p.id, p.price]));
  }

  buy(productId: string): Promise<PayResult> {
    return this.platform.purchase(productId);
  }
}

let cached: { platform: Platform; store: StoreService } | null = null;

export function goldStore(): StoreService {
  const p = session.platform;
  if (cached && cached.platform === p) return cached.store;
  const provider: PaymentProvider | null = p.capabilities.iap
    ? new PlatformPaymentProvider(p)
    : p.capabilities.mockPurchases
      ? new MockPaymentProvider()
      : null;
  cached = { platform: p, store: new StoreService(provider) };
  return cached.store;
}
