import type { Platform, PlatformCapabilities, Product, PurchaseResult } from '../Platform';
import type { YtGame } from './ytgame';

/** The only place in the codebase allowed to touch `ytgame`. */
function getYt(): YtGame | null {
  const g = globalThis as unknown as { ytgame?: YtGame };
  if (typeof g.ytgame === 'undefined' || !g.ytgame) return null;
  return g.ytgame;
}

export class YouTubePlatform implements Platform {
  readonly id = 'youtube' as const;
  readonly capabilities: PlatformCapabilities = {
    iap: false, // YouTube forbids IAP of any kind
    rewardedAds: true,
    interstitialAds: true,
    haptics: false,
    masterMute: false, // YouTube owns the overall mute
    externalLinks: false,
    privacyOptions: false,
  };

  private yt: YtGame | null = null;
  private loadPromise: Promise<string | null> | null = null;
  private loaded = false;
  private audioListeners: Array<(enabled: boolean) => void> = [];

  async init(): Promise<void> {
    this.yt = getYt();
    if (!this.yt || !this.yt.IN_PLAYABLES_ENV) {
      // Outside the Playables environment (e.g. local preview of the YT bundle) the SDK
      // still exposes the API surface; we keep going but warn.
      console.warn('[ThriftFlip] Not running inside YouTube Playables (IN_PLAYABLES_ENV is false).');
    }
    if (this.yt) {
      this.yt.system.onAudioEnabledChange((enabled) => {
        for (const cb of this.audioListeners) cb(enabled);
      });
    }
  }

  notifyFirstFrame(): void {
    this.yt?.game.firstFrameReady();
  }

  notifyGameReady(): void {
    this.yt?.game.gameReady();
  }

  onPause(cb: () => void): void {
    this.yt?.system.onPause(cb);
  }

  onResume(cb: () => void): void {
    this.yt?.system.onResume(cb);
  }

  loadSave(): Promise<string | null> {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          if (!this.yt) return null;
          const data = await this.yt.game.loadData();
          return data && data.length > 0 ? data : null;
        } finally {
          this.loaded = true;
        }
      })();
    }
    return this.loadPromise;
  }

  async writeSave(data: string): Promise<void> {
    if (!this.yt) return;
    // Requirement: loadData must have resolved before any saveData call.
    if (!this.loaded) await this.loadSave().catch(() => null);
    const sw = data as string & { isWellFormed?: () => boolean };
    if (typeof sw.isWellFormed === 'function' && !sw.isWellFormed()) {
      throw new Error('Save string is not well-formed UTF-16');
    }
    await this.yt.game.saveData(data);
  }

  isAudioEnabled(): boolean {
    return this.yt ? this.yt.system.isAudioEnabled() : true;
  }

  onAudioEnabledChange(cb: (enabled: boolean) => void): void {
    this.audioListeners.push(cb);
  }

  async getLanguage(): Promise<string> {
    if (!this.yt) return 'en';
    try {
      return await this.yt.system.getLanguage();
    } catch {
      return 'en';
    }
  }

  async submitScore(value: number): Promise<void> {
    if (!this.yt) return;
    await this.yt.engagement.sendScore({ value: Math.max(0, Math.round(value)) });
  }

  async showRewardedAd(rewardId: string): Promise<boolean> {
    if (!this.yt) return false;
    try {
      return (await this.yt.ads.requestRewardedAd(rewardId)) === true;
    } catch {
      return false;
    }
  }

  async showInterstitialAd(): Promise<void> {
    if (!this.yt) return;
    try {
      await this.yt.ads.requestInterstitialAd();
    } catch {
      // No ad available: nothing to do, never grant anything for interstitials.
    }
  }

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

  openExternal(_url: string): void {}

  haptic(_kind: 'light' | 'medium' | 'success'): void {}

  logError(err: unknown): void {
    console.error('[ThriftFlip]', err);
    this.yt?.health.logError();
  }

  logWarning(msg: string): void {
    console.warn('[ThriftFlip]', msg);
    this.yt?.health.logWarning();
  }
}

export function createPlatform(): Platform {
  return new YouTubePlatform();
}
