import type { Platform, PlatformCapabilities, Product, PurchaseResult } from '../Platform';

const SAVE_KEY = 'thrift-flip-web-save';

/**
 * Public web release (GitHub Pages, itch.io, any static host): the full game with no ads and no
 * purchases of any kind (not even pretend ones). Gold Bars are earned by playing, as on YouTube.
 * Progress lives in this browser's localStorage.
 */
export class SitePlatform implements Platform {
  readonly id = 'web' as const;
  readonly capabilities: PlatformCapabilities = {
    iap: false,
    rewardedAds: false,
    interstitialAds: false,
    haptics: false,
    masterMute: true,
    externalLinks: false,
    privacyOptions: false,
    mockPurchases: false,
  };
  private pauseCbs: Array<() => void> = [];
  private resumeCbs: Array<() => void> = [];

  async init(): Promise<void> {
    window.addEventListener('error', (e) => this.logError(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => this.logError(e.reason));
    // Pause when the tab is hidden (the platform adapter owns pause/resume; Phaser's own handler is off).
    document.addEventListener('visibilitychange', () =>
      (document.hidden ? this.pauseCbs : this.resumeCbs).forEach((cb) => cb()),
    );
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
    } catch {
      // Storage blocked (private window): the game still plays, progress just isn't kept.
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
  async showRewardedAd(_rewardId: string): Promise<boolean> {
    return false;
  }
  async showInterstitialAd(): Promise<void> {}
  async purchase(_productId: string): Promise<PurchaseResult> {
    return 'failed';
  }
  async restorePurchases(): Promise<string[]> {
    return [];
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
  return new SitePlatform();
}
