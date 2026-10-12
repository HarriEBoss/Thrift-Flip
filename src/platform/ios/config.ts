/**
 * iOS build configuration. REPLACE before release (see docs/HUMAN_TODO.md):
 * - AdMob app id + ad unit ids (these are Google's public TEST ids)
 * - RevenueCat public iOS SDK key
 * - Privacy policy URL
 */
export const IOS_CONFIG = {
  /** Keep true until real ad unit ids are in place; test ads only. */
  adsTesting: true,
  admob: {
    // Google public test ad units for iOS.
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
  revenueCatApiKey: 'appl_REPLACE_WITH_REVENUECAT_PUBLIC_KEY',
  privacyPolicyUrl: 'https://REPLACE-ME.example/thrift-flip/privacy',
  /** All IAP product ids (must match App Store Connect + RevenueCat). */
  productIds: [
    'starter_pack',
    'remove_ads',
    'golden_toolkit',
    'shop_expansion',
    'appraiser_pass',
    'mega_bundle',
    'coins_small',
    'coins_medium',
    'coins_large',
    'gold_small',
    'gold_medium',
    'gold_large',
  ],
} as const;
