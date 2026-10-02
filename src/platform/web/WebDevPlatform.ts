import type { Platform, PlatformCapabilities, Product, PurchaseResult } from '../Platform';

const SAVE_KEY = 'thrift-flip-save';

/**
 * Local browser development only. Uses localStorage (allowed here: this file lives under
 * src/platform and is never part of the YouTube or iOS bundles). Ads/IAP are simulated so
 * every flow can be exercised during development.
 */
export class WebDevPlatform implements Platform {
  readonly id = 'web' as const;
  readonly capabilities: PlatformCapabilities = {
    iap: true,
    rewardedAds: true,
    interstitialAds: true,
    haptics: false,
    masterMute: true,
    externalLinks: false,
    privacyOptions: false,
  };
  private owned = new Set<string>();
  private pauseCbs: Array<() => void> = [];
  private resumeCbs: Array<() => void> = [];

  async init(): Promise<void> {
    // Dev convenience: press F9 to simulate a platform pause, F10 to resume.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F9') this.pauseCbs.forEach((cb) => cb());
      if (e.key === 'F10') this.resumeCbs.forEach((cb) => cb());
    });
  }
  notifyFirstFrame(): void {}
  notifyGameReady(): void {}
  onPause(cb: () => void): void {
    this.pauseCbs.push(cb);
  }
  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }
  async loadSave(): Promise<string | null> {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }
  async writeSave(data: string): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, data);
    } catch (e) {
      this.logError(e);
    }
  }
  isAudioEnabled(): boolean {
    return true;
  }
  onAudioEnabledChange(_cb: (enabled: boolean) => void): void {}
  async getLanguage(): Promise<string> {
    return navigator.language || 'en';
  }
  async submitScore(_value: number): Promise<void> {}
  async showRewardedAd(rewardId: string): Promise<boolean> {
    console.info('[dev] rewarded ad', rewardId);
    return true;
  }
  async showInterstitialAd(): Promise<void> {
    console.info('[dev] interstitial ad');
  }
  async purchase(productId: string): Promise<PurchaseResult> {
    this.owned.add(productId);
    return 'success';
  }
  async restorePurchases(): Promise<string[]> {
    return [...this.owned];
  }
  async getProducts(): Promise<Product[]> {
    return [];
  }
  async showPrivacyOptions(): Promise<void> {}
  openPrivacyPolicy(): void {}
  haptic(_kind: 'light' | 'medium' | 'success'): void {}
  logError(err: unknown): void {
    console.error('[ThriftFlip]', err);
  }
  logWarning(msg: string): void {
    console.warn('[ThriftFlip]', msg);
  }
}

export function createPlatform(): Platform {
  return new WebDevPlatform();
}
