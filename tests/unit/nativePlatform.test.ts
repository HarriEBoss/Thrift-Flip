import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, Array<(arg?: unknown) => void>>();
const store = new Map<string, string>();
const admob = {
  requestConsentInfo: vi.fn(async () => ({
    status: 'OBTAINED',
    isConsentFormAvailable: false,
    canRequestAds: true,
  })),
  showConsentForm: vi.fn(async () => ({ status: 'OBTAINED', canRequestAds: true })),
  trackingAuthorizationStatus: vi.fn(async () => ({ status: 'denied' })),
  requestTrackingAuthorization: vi.fn(async () => undefined),
  initialize: vi.fn(async () => undefined),
  addListener: vi.fn(async (ev: string, cb: (arg?: unknown) => void) => {
    listeners.set(ev, [...(listeners.get(ev) ?? []), cb]);
    return { remove: async () => listeners.set(ev, []) };
  }),
  prepareRewardVideoAd: vi.fn(async () => ({ adUnitId: 'x' })),
  showRewardVideoAd: vi.fn(async () => {
    if (rewardOnShow)
      listeners.get('onRewardedVideoAdReward')?.forEach((cb) => cb({ type: 'coins', amount: 1 }));
    listeners.get('onRewardedVideoAdDismissed')?.forEach((cb) => cb());
    return { type: 'coins', amount: 1 };
  }),
  prepareInterstitial: vi.fn(async () => ({ adUnitId: 'x' })),
  showInterstitial: vi.fn(async () => listeners.get('interstitialAdDismissed')?.forEach((cb) => cb())),
  showPrivacyOptionsForm: vi.fn(async () => undefined),
};
let rewardOnShow = true;
const purchases = {
  configure: vi.fn(async () => undefined),
  getProducts: vi.fn(async () => ({
    products: [{ identifier: 'remove_ads', title: 'Remove Ads', priceString: '€4.99' }],
  })),
  purchaseStoreProduct: vi.fn(async () => ({})),
  restorePurchases: vi.fn(async () => ({ customerInfo: { allPurchasedProductIdentifiers: ['remove_ads'] } })),
};

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: async () => undefined })) },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void store.set(key, value)),
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => undefined), notification: vi.fn(async () => undefined) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
  NotificationType: { Success: 'SUCCESS' },
}));
vi.mock('@capacitor/device', () => ({ Device: { getLanguageTag: vi.fn(async () => ({ value: 'de-DE' })) } }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { hide: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(async () => undefined) } }));
vi.mock('@capacitor-community/admob', () => ({
  AdMob: admob,
  AdmobConsentStatus: { REQUIRED: 'REQUIRED', OBTAINED: 'OBTAINED' },
  MaxAdContentRating: { General: 'General' },
  RewardAdPluginEvents: {
    Rewarded: 'onRewardedVideoAdReward',
    Dismissed: 'onRewardedVideoAdDismissed',
    FailedToShow: 'onRewardedVideoAdFailedToShow',
  },
  InterstitialAdPluginEvents: {
    Dismissed: 'interstitialAdDismissed',
    FailedToShow: 'interstitialAdFailedToShow',
  },
}));
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: purchases,
  PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' },
}));

const { createPlatform } = await import('../../src/platform/ios/IOSPlatform');
const android = await import('../../src/platform/android/AndroidPlatform');
const { App } = await import('@capacitor/app');

describe('IOSPlatform (mocked Capacitor plugins)', () => {
  beforeEach(() => {
    listeners.clear();
    rewardOnShow = true;
  });

  it('saves via Preferences and reads the device language', async () => {
    const p = createPlatform();
    await p.init();
    await p.writeSave('{"v":1}');
    expect(await p.loadSave()).toBe('{"v":1}');
    expect(await p.getLanguage()).toBe('de-DE');
    expect(p.capabilities.iap).toBe(true);
  });

  it('runs consent -> ATT -> init (G-rated) after gameReady and uses non-personalised ads when ATT is denied', async () => {
    const p = createPlatform();
    p.notifyGameReady();
    expect(await p.showRewardedAd('free-gift')).toBe(true);
    expect(admob.initialize).toHaveBeenCalledWith(expect.objectContaining({ maxAdContentRating: 'General' }));
    expect(admob.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({ npa: true }));
  });

  it('grants a rewarded ad only if the reward event fired', async () => {
    const p = createPlatform();
    p.notifyGameReady();
    rewardOnShow = false;
    expect(await p.showRewardedAd('free-gift')).toBe(false);
  });

  it('never requests ads when consent does not allow it', async () => {
    admob.requestConsentInfo.mockResolvedValueOnce({
      status: 'REQUIRED',
      isConsentFormAvailable: true,
      canRequestAds: false,
    });
    admob.showConsentForm.mockResolvedValueOnce({ status: 'REQUIRED', canRequestAds: false });
    admob.prepareRewardVideoAd.mockClear();
    const p = createPlatform();
    p.notifyGameReady();
    expect(await p.showRewardedAd('free-gift')).toBe(false);
    await p.showInterstitialAd();
    expect(admob.prepareRewardVideoAd).not.toHaveBeenCalled();
  });

  it('purchases, cancels and restores through RevenueCat', async () => {
    const p = createPlatform();
    p.notifyGameReady();
    expect(await p.getProducts()).toEqual([{ id: 'remove_ads', title: 'Remove Ads', price: '€4.99' }]);
    expect(await p.purchase('remove_ads')).toBe('success');
    purchases.purchaseStoreProduct.mockRejectedValueOnce(
      Object.assign(new Error('x'), { userCancelled: true }),
    );
    expect(await p.purchase('remove_ads')).toBe('cancelled');
    purchases.purchaseStoreProduct.mockRejectedValueOnce(new Error('net'));
    expect(await p.purchase('remove_ads')).toBe('failed');
    expect(await p.purchase('unknown')).toBe('failed');
    expect(await p.restorePurchases()).toEqual(['remove_ads']);
    p.haptic('success');
    p.haptic('light');
    await p.showInterstitialAd();
    await p.showPrivacyOptions();
    p.openPrivacyPolicy();
  });
});

describe('AndroidPlatform (same native adapter, Google Play ids)', () => {
  beforeEach(() => listeners.clear());

  it('reports android, uses the Android ad units and never shows the iOS tracking prompt', async () => {
    const p = android.createPlatform();
    expect(p.id).toBe('android');
    await p.init();
    admob.trackingAuthorizationStatus.mockClear();
    admob.prepareRewardVideoAd.mockClear();
    p.notifyGameReady();
    expect(await p.showRewardedAd('free-gift')).toBe(true);
    expect(admob.trackingAuthorizationStatus).not.toHaveBeenCalled();
    expect(admob.prepareRewardVideoAd).toHaveBeenCalledWith(
      expect.objectContaining({ adId: 'ca-app-pub-3940256099942544/5224354917', npa: true }),
    );
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: expect.stringMatching(/^goog_/) });
  });

  it('the system Back button acts like Esc', async () => {
    const add = vi.mocked(App.addListener);
    add.mockClear();
    const p = android.createPlatform();
    await p.init();
    const back = add.mock.calls.find((c) => c[0] === 'backButton');
    expect(back).toBeDefined();
    const keys: string[] = [];
    const onKey = (e: Event) => keys.push(`${e.type}:${(e as Event & { key: string }).key}`);
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    vi.stubGlobal(
      'KeyboardEvent',
      class extends Event {
        key: string;
        constructor(type: string, init: { key: string }) {
          super(type);
          this.key = init.key;
        }
      },
    );
    target.addEventListener('keydown', onKey);
    target.addEventListener('keyup', onKey);
    (back![1] as () => void)();
    vi.unstubAllGlobals();
    expect(keys).toEqual(['keydown:Escape', 'keyup:Escape']);
  });
});
