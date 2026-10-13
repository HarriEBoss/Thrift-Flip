# Google Play (Android) submission checklist

Verify every item against current Google Play Console help at submission time; requirements change.

## 0. Toolchain

- **Android Studio** (current stable) with the Android SDK Platform **36** (the project's `compileSdk` and
  `targetSdk`). Google Play requires new apps to target a recent API level; 36 satisfies the 2026 rule.
  `minSdk` is 24 (Android 7.0).
- JDK 21 (bundled with Android Studio).
- Node 22, `npm ci`, then `npm run build:android` (Vite Android build → bundle check → `cap sync android`).
- Open the `android/` folder in Android Studio and let Gradle sync. (This container could not download the
  Android SDK, so the Gradle build was **not** run here; `npm run build:android` does pass.)

## 1. Project identity

- [ ] Choose the application id (package name). It is **permanent** once uploaded. The project uses
      `com.thriftflip.game` (same as iOS); change it in `capacitor.config.ts` (`appId`),
      `android/app/build.gradle` (`applicationId` and `namespace`) and
      `android/app/src/main/res/values/strings.xml` if you pick another.
- [ ] Version: `versionName` and `versionCode` come from `package.json` (1.0.0 → 10000) via
      `python3 scripts/android-configure.py`. Bump `package.json` and rerun it for every upload.
- [ ] **Upload key:** Android Studio → Build → Generate Signed App Bundle → create a new keystore. Store
      the keystore and its passwords safely (a password manager plus an offline backup). Enrol in
      **Play App Signing** (the default): Google holds the app signing key; you keep the upload key.

## 2. Before building a release

- [ ] `src/platform/android/config.ts`: `adsTesting: false`, the real AdMob **Android** rewarded and
      interstitial unit ids, the RevenueCat **Google Play** public SDK key (`goog_…`), the privacy policy URL.
- [ ] `scripts/android-configure.py`: the real AdMob **Android app id** (`ca-app-pub-…~…`), then run
      `python3 scripts/android-configure.py`. (Without a valid id the ads SDK stops the app at launch.)
- [ ] `npm run check` is green, then `npm run build:android`.
- [ ] Android Studio → Build → **Generate Signed App Bundle** → `release` → `app-release.aab`.
- [ ] Test on real phones and a tablet (or the emulator): rotation and split screen, the system Back button
      (closes panels like Esc), background/foreground (pause and save), airplane mode (offline play; ads and
      purchases unavailable), the UMP consent form from the EEA (VPN or debug geography), rewarded and
      interstitial test ads, every purchase with a **license tester** account, and Restore Purchases.
- [ ] Upload to the **Internal testing** track first; install from the Play Store link on a device.

## 3. Play Console app record

- [ ] Create app: name **Thrift Flip**, default language English (UK or US), **Game**, **Free**.
- [ ] Declarations: developer program policies and US export laws.
- [ ] Category: **Games → Simulation** (or Casual). Tags: Simulation, Casual, Tycoon, Restoration.
- [ ] Contact details: email (required), website and phone (optional), shown on the store page.
- [ ] Privacy policy URL (same hosted page as iOS).

## 4. App content (Policy → App content)

- [ ] **Privacy policy:** URL above.
- [ ] **Ads:** Yes, the app contains ads (AdMob).
- [ ] **App access:** all functionality is available without special access (no login).
- [ ] **Target audience and content:** choose **13–15, 16–17 and 18+**. Do **not** include under-13 age
      groups: the game is all-ages friendly but is a general-audience game with third-party ads (the same
      position as iOS and YouTube, which requires 13+). Answer "No" to "Could your store listing
      unintentionally appeal to children?" only if the listing follows STORE_LISTING.md (no "for kids").
      If Google decides it appeals to children, the **Families** policy applies; contact the team first.
- [ ] **Content rating (IARC questionnaire):** category _Game_. Violence, fear, sexuality, language,
      controlled substances, crude humour: **none**. Gambling: **none** (no real-money stakes; the auction
      is a coin-only bidding game; no paid random rewards). Users interact / share info / location:
      **no**. Digital purchases: **yes**. Expected result: **PEGI 3 / ESRB Everyone** with "In-App
      Purchases".
- [ ] **Data safety form** (derived from the linked SDKs; check each vendor's current Data safety guidance):
  - Data collected: **Device or other IDs** (advertising ID, by AdMob) → _Advertising or marketing_,
    _Analytics_; shared with Google. **App interactions** and **diagnostics** (AdMob) → _Advertising_,
    _Analytics_. **Purchase history** (RevenueCat, anonymous app user id) → _App functionality_.
    **Approximate location** (from IP, AdMob) → _Advertising_.
  - Data is **encrypted in transit**: yes. Users can request deletion: game progress is only on the
    device (uninstalling deletes it); the anonymous RevenueCat id can be deleted on request (privacy policy).
  - The game itself has no accounts, no analytics and no server.
- [ ] **Advertising ID:** the app uses it (AdMob). The `AD_ID` permission comes from the Google Mobile Ads
      SDK's manifest; keep it (not a Families app).
- [ ] **Government apps / financial features / health:** no.

## 5. In-app products (Monetize → Products → In-app products)

Create the same ids as the App Store (they are shared in `src/platform/ios/config.ts`):

| Product id                                     | Type in RevenueCat | Price                 | Content                                       |
| ---------------------------------------------- | ------------------ | --------------------- | --------------------------------------------- |
| `starter_pack`                                 | Non-consumable     | €2.99                 | 1,000 coins + Golden Sponge (permanent)       |
| `remove_ads`                                   | Non-consumable     | €4.99                 | No interstitials (rewarded ads stay optional) |
| `golden_toolkit`                               | Non-consumable     | €6.99                 | All golden tools permanently                  |
| `shop_expansion`                               | Non-consumable     | €3.99                 | +4 shelves, +1 customer per day               |
| `appraiser_pass`                               | Non-consumable     | €2.99                 | Hidden gems visible at markets                |
| `mega_bundle`                                  | Non-consumable     | €14.99                | All perks above + 5,000 coins                 |
| `coins_small` / `coins_medium` / `coins_large` | Consumable         | €0.99 / €4.99 / €9.99 | 500 / 3,000 / 8,000 coins                     |
| `gold_small` / `gold_medium` / `gold_large`    | Consumable         | €0.99 / €4.99 / €9.99 | 20 / 120 / 280 Gold Bars                      |

- [ ] Google Play has one "in-app product" type; consumable vs non-consumable is decided in RevenueCat
      (set each product's type there to match the table).
- [ ] Set up a **payments profile** (Play Console → Setup → Payments profile) before products can be priced.
- [ ] RevenueCat: add the Play Store app (package name), upload the **service account JSON** (Google Cloud
      → service account with Play Console financial access), import the products, copy the public
      Google SDK key into `src/platform/android/config.ts`.
- [ ] License testers: Play Console → Setup → License testing → add the testers' Google accounts.

## 6. Store listing (Grow → Store presence → Main store listing)

- **App name** (≤ 30): Thrift Flip
- **Short description** (≤ 80): see STORE_LISTING.md → "Google Play"
- **Full description** (≤ 4,000): STORE_LISTING.md → "Description"
- **App icon:** `dist-store/google-play/icon-512.png` (512 × 512, 32-bit PNG)
- **Feature graphic:** `dist-store/google-play/feature-graphic.png` (1024 × 500)
- **Phone screenshots** (2–8): `dist-store/android-phone/*.png` (1080 × 1920)
- **Tablet screenshots** (7" and 10"): `dist-store/android-tablet/*.png` (1600 × 2560)
- Regenerate all of them with `npm run build:e2e && npm run screenshots`.

## 7. Release

- [ ] Testing → **Internal testing** → create a release, upload `app-release.aab`, roll out to testers.
- [ ] New personal developer accounts must run a **closed test with at least 12 testers for 14 days**
      before production access (check whether this applies to your account type; organisation accounts
      are exempt).
- [ ] Production → create a release, upload the same bundle (or a newer version code), add release notes
      (STORE_LISTING.md → What's New), choose countries, **send for review**.

## 8. Notes for the reviewer (App content → App access is "all available"; paste in release notes if asked)

> Thrift Flip is an HTML5 game (Phaser) in a Capacitor wrapper. All code, art and audio are bundled in the
> app; nothing is loaded from a website and it works offline. Purchases: Main Menu → "Shop Perks";
> Restore Purchases: Settings or the bottom of Shop Perks. Rewarded ads are always optional; interstitials
> only appear between days (never before day 3, at most every 3 minutes) and Remove Ads turns them off.
> No paid random rewards.
