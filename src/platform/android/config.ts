import type { NativeConfig } from '../native/NativePlatform';
import { IOS_CONFIG } from '../ios/config';

/**
 * Android (Google Play) build configuration. REPLACE before release (see docs/SUBMISSION_ANDROID.md):
 * - AdMob ad unit ids (these are Google's public Android TEST ids); the AdMob app id goes in
 *   android/app/src/main/AndroidManifest.xml
 * - RevenueCat public Google Play SDK key (starts with goog_)
 * - Privacy policy URL
 */
export const ANDROID_CONFIG: NativeConfig = {
  adsTesting: true,
  admob: {
    // Google public test ad units for Android.
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  revenueCatApiKey: 'goog_REPLACE_WITH_REVENUECAT_PUBLIC_KEY',
  privacyPolicyUrl: IOS_CONFIG.privacyPolicyUrl,
  /** Same product ids as the App Store (create them in Play Console with these ids). */
  productIds: IOS_CONFIG.productIds,
};
