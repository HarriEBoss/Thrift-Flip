import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Device } from '@capacitor/device';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Browser } from '@capacitor/browser';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { Purchases, PRODUCT_CATEGORY, type PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import type { Platform, PlatformCapabilities, Product, PurchaseResult } from '../Platform';

/** What differs between the App Store and Google Play builds (ids and keys; see docs/HUMAN_TODO.md). */
export interface NativeConfig {
  /** Keep true until real ad unit ids are in place; test ads only. */
  adsTesting: boolean;
  admob: { rewarded: string; interstitial: string };
  revenueCatApiKey: string;
  privacyPolicyUrl: string;
  /** All IAP product ids (must match the store and RevenueCat). */
  productIds: readonly string[];
}

const SAVE_KEY = 'thrift-flip-save';

/**
 * Native app (Capacitor) adapter for iOS and Android: Preferences for saves, App lifecycle for
 * pause/resume, Haptics, Device language, AdMob (UMP consent -> ATT on iOS -> ads, G-rated content
 * only) and RevenueCat IAP (StoreKit on iOS, Google Play Billing on Android). Everything degrades
 * gracefully offline: ads/IAP simply report unavailable.
 */
export class NativePlatform implements Platform {
  readonly capabilities: PlatformCapabilities = {
    iap: true,
    rewardedAds: true,
    interstitialAds: true,
    haptics: true,
    masterMute: true,
    externalLinks: true,
    privacyOptions: true,
    mockPurchases: false,
  };

  private adsReady: Promise<boolean> | null = null;
  private npa = true;
  private iapReady: Promise<boolean> | null = null;
  private products = new Map<string, PurchasesStoreProduct>();

  constructor(
    readonly id: 'ios' | 'android',
    private cfg: NativeConfig,
  ) {}

  async init(): Promise<void> {
    try {
      await StatusBar.hide();
    } catch {
      // not fatal (e.g. iPad split view)
    }
    if (this.id === 'android') {
      // The system Back button works like Esc in the game (close the open panel, go back a screen).
      void App.addListener('backButton', () => {
        for (const type of ['keydown', 'keyup'])
          window.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', bubbles: true }));
      });
    }
  }

  notifyFirstFrame(): void {
    void SplashScreen.hide().catch(() => undefined);
  }

  notifyGameReady(): void {
    // Consent/ATT and store setup happen after the game is interactive so they never block loading.
    this.adsReady = this.setupAds();
    this.iapReady = this.setupIap();
  }

  onPause(cb: () => void): void {
    void App.addListener('pause', cb);
  }

  onResume(cb: () => void): void {
    void App.addListener('resume', cb);
  }

  async loadSave(): Promise<string | null> {
    const { value } = await Preferences.get({ key: SAVE_KEY });
    return value;
  }

  async writeSave(data: string): Promise<void> {
    await Preferences.set({ key: SAVE_KEY, value: data });
  }

  isAudioEnabled(): boolean {
    return true;
  }

  onAudioEnabledChange(_cb: (enabled: boolean) => void): void {}

  async getLanguage(): Promise<string> {
    try {
      const { value } = await Device.getLanguageTag();
      return value;
    } catch {
      return 'en';
    }
  }

  async submitScore(_value: number): Promise<void> {
    // Game Center could be added later.
  }

  // ---------------- ads ----------------

  private async setupAds(): Promise<boolean> {
    try {
      // 1) Google UMP consent (EEA/UK) before any ad request.
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      if (!consent.canRequestAds) return false;
      // 2) iOS: App Tracking Transparency, only after consent; denied -> non-personalized ads.
      // Android has no such prompt: ads stay non-personalized (a family-friendly game).
      if (this.id === 'ios') {
        let att = await AdMob.trackingAuthorizationStatus();
        if (att.status === 'notDetermined') {
          await AdMob.requestTrackingAuthorization();
          att = await AdMob.trackingAuthorizationStatus();
        }
        this.npa = att.status !== 'authorized';
      }
      await AdMob.initialize({
        initializeForTesting: this.cfg.adsTesting,
        // All-ages friendly presentation: keep ads family-safe.
        maxAdContentRating: MaxAdContentRating.General,
      });
      return true;
    } catch (e) {
      this.logWarning(`ads unavailable: ${String(e)}`);
      return false;
    }
  }

  async showRewardedAd(_rewardId: string): Promise<boolean> {
    if (!(await (this.adsReady ?? Promise.resolve(false)))) return false;
    try {
      let rewarded = false;
      const handles = [
        await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          rewarded = true;
        }),
      ];
      const closed = new Promise<void>((resolve) => {
        void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()).then((h) => handles.push(h));
        void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()).then((h) =>
          handles.push(h),
        );
      });
      await AdMob.prepareRewardVideoAd({
        adId: this.cfg.admob.rewarded,
        isTesting: this.cfg.adsTesting,
        npa: this.npa,
      });
      await AdMob.showRewardVideoAd();
      await closed;
      for (const h of handles) void h.remove();
      return rewarded;
    } catch {
      return false;
    }
  }

  async showInterstitialAd(): Promise<void> {
    if (!(await (this.adsReady ?? Promise.resolve(false)))) return;
    try {
      const handles: Array<{ remove: () => Promise<void> }> = [];
      const closed = new Promise<void>((resolve) => {
        void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => resolve()).then((h) =>
          handles.push(h),
        );
        void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => resolve()).then((h) =>
          handles.push(h),
        );
      });
      await AdMob.prepareInterstitial({
        adId: this.cfg.admob.interstitial,
        isTesting: this.cfg.adsTesting,
        npa: this.npa,
      });
      await AdMob.showInterstitial();
      await closed;
      for (const h of handles) void h.remove();
    } catch {
      // No ad available: continue silently.
    }
  }

  async showPrivacyOptions(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
    } catch (e) {
      this.logWarning(`privacy options unavailable: ${String(e)}`);
    }
  }

  openPrivacyPolicy(): void {
    void Browser.open({ url: this.cfg.privacyPolicyUrl });
  }

  // ---------------- in-app purchases (RevenueCat) ----------------

  private async setupIap(): Promise<boolean> {
    try {
      await Purchases.configure({ apiKey: this.cfg.revenueCatApiKey });
      const { products } = await Purchases.getProducts({
        productIdentifiers: [...this.cfg.productIds],
        type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });
      for (const p of products) this.products.set(p.identifier, p);
      return true;
    } catch (e) {
      this.logWarning(`store unavailable: ${String(e)}`);
      return false;
    }
  }

  async getProducts(): Promise<Product[]> {
    await (this.iapReady ?? Promise.resolve(false));
    return [...this.products.values()].map((p) => ({
      id: p.identifier,
      title: p.title,
      price: p.priceString,
    }));
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    if (!(await (this.iapReady ?? Promise.resolve(false)))) return 'failed';
    const product = this.products.get(productId);
    if (!product) return 'failed';
    try {
      await Purchases.purchaseStoreProduct({ product });
      return 'success';
    } catch (e) {
      return (e as { userCancelled?: boolean }).userCancelled ? 'cancelled' : 'failed';
    }
  }

  async restorePurchases(): Promise<string[]> {
    if (!(await (this.iapReady ?? Promise.resolve(false)))) return [];
    const { customerInfo } = await Purchases.restorePurchases();
    return customerInfo.allPurchasedProductIdentifiers;
  }

  // ---------------- device / health ----------------

  haptic(kind: 'light' | 'medium' | 'success'): void {
    if (kind === 'success')
      void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    else
      void Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(
        () => undefined,
      );
  }

  logError(err: unknown): void {
    console.error('[ThriftFlip]', err);
  }

  logWarning(msg: string): void {
    console.warn('[ThriftFlip]', msg);
  }
}
