import type { Platform, PlatformCapabilities, Product, PurchaseResult } from '../Platform';

const SAVE_KEY = 'thrift-flip-playtest-save';

/**
 * Playtest build: behaves like the YouTube version (no shop, no overall mute, YouTube-style ads)
 * but runs anywhere. Ads are "pretend ads": a short overlay, then the reward is granted, so every
 * reward button can be tried. Progress lives in this browser's localStorage. Open the page with
 * `#reset` to start over.
 */
export class PlaytestPlatform implements Platform {
  readonly id = 'web' as const;
  readonly capabilities: PlatformCapabilities = {
    iap: false,
    rewardedAds: true,
    interstitialAds: true,
    haptics: false,
    masterMute: false,
    externalLinks: false,
    privacyOptions: false,
    mockPurchases: true,
  };

  private lastShown = 0;

  async init(): Promise<void> {
    window.addEventListener('error', (e) => this.logError(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => this.logError(e.reason));
  }
  notifyFirstFrame(): void {}
  notifyGameReady(): void {}
  onPause(_cb: () => void): void {}
  onResume(_cb: () => void): void {}

  async loadSave(): Promise<string | null> {
    try {
      if (location.hash === '#reset') {
        localStorage.removeItem(SAVE_KEY);
        history.replaceState(null, '', location.pathname + location.search);
        return null;
      }
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
    return 'en';
  }
  async submitScore(_value: number): Promise<void> {}

  async showRewardedAd(_rewardId: string): Promise<boolean> {
    await this.pretendAd(
      'Pretend reward ad',
      'On YouTube a real ad plays here. Your reward is on its way!',
      2000,
    );
    return true;
  }

  async showInterstitialAd(): Promise<void> {
    await this.pretendAd('Pretend ad break', 'On YouTube a short ad can appear here between days.', 1500);
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
  openPrivacyPolicy(): void {}
  haptic(_kind: 'light' | 'medium' | 'success'): void {}
  logError(err: unknown): void {
    console.error('[ThriftFlip]', err);
    this.showError(err);
  }

  /** Playtest only: a small note the tester can screenshot so we know what went wrong. */
  private showError(err: unknown): void {
    const now = Date.now();
    if (now - this.lastShown < 15000) return;
    this.lastShown = now;
    const e = err instanceof Error ? err : new Error(String(err));
    const where = (e.stack ?? '').split('\n').slice(1, 3).join(' · ');
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:8px;right:8px;bottom:8px;z-index:60;padding:10px 12px;border-radius:12px;' +
      'background:#2a1f3d;color:#fffaf0;font:13px/1.35 system-ui,sans-serif;opacity:.94;word-break:break-word';
    el.textContent = `Oops, something went wrong (please send a screenshot): ${e.message} ${where}`.slice(
      0,
      400,
    );
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 12000);
  }
  logWarning(msg: string): void {
    console.warn('[ThriftFlip]', msg);
  }

  private pretendAd(title: string, body: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.setAttribute('role', 'dialog');
      el.style.cssText =
        'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(30,24,40,0.86);font-family:"Nunito","Trebuchet MS",system-ui,sans-serif;padding:16px';
      el.innerHTML =
        '<div style="max-width:420px;background:#fffaf0;color:#2a1f3d;border:4px solid #2a1f3d;border-radius:0;' +
        'padding:24px 22px;text-align:center;box-shadow:8px 8px 0 rgba(42,31,61,.35)">' +
        `<div style="font-size:26px;font-weight:700;margin-bottom:8px">${title}</div>` +
        `<div style="font-size:17px;line-height:1.4">${body}</div>` +
        '<div style="margin-top:16px;height:10px;border-radius:5px;background:#e9dccb;overflow:hidden">' +
        `<div style="height:100%;width:0;background:#2f8f8a;transition:width ${ms}ms linear"></div></div></div>`;
      document.body.appendChild(el);
      const bar = el.querySelector('div > div:last-child > div') as HTMLDivElement | null;
      requestAnimationFrame(() => requestAnimationFrame(() => bar && (bar.style.width = '100%')));
      setTimeout(() => {
        el.remove();
        resolve();
      }, ms);
    });
  }
}

export function createPlatform(): Platform {
  return new PlaytestPlatform();
}
