import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, Array<(arg?: unknown) => void>>();
const store = new Map<string, string>();
const admob = {
  requestConsentInfo: vi.fn(async () => ({ status: 'OBTAINED', isConsentFormAvailable: false, canRequestAds: true })),
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
    if (rewardOnShow) listeners.get('onRewardedVideoAdReward')?.forEach((cb) => cb({ type: 'coins', amount: 1 }));
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
  getProducts: vi.fn(async () => ({ products: [{ identifier: 'remove_ads', title: 'Remove Ads', priceString: '€4.99' }] })),
  purchaseStoreProduct: vi.fn(async () => ({})),
  restorePurchases: vi.fn(async () => ({ customerInfo: { allPurchasedProductIdentifiers: ['remove_ads'] } })),
};

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => undefined })) } }));
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
  RewardAdPluginEvents: { Rewarded: 'onRewardedVideoAdReward', Dismissed: 'onRewardedVideoAdDismissed', FailedToShow: 'onRewardedVideoAdFailedToShow' },
  InterstitialAdPluginEvents: { Dismissed: 'interstitialAdDismissed', FailedToShow: 'interstitialAdFailedToShow' },
}));
vi.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: purchases, PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION' } }));

const { createPlatform } = await import('../../src/platform/ios/IOSPlatform');

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
    admob.requestConsentInfo.mockResolvedValueOnce({ status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false });
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
    purchases.purchaseStoreProduct.mockRejectedValueOnce(Object.assign(new Error('x'), { userCancelled: true }));
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
