# Human TODO

Everything that code cannot do. Items are grouped by platform and listed roughly in order.

## Accounts & legal
- [ ] **Apple Developer Program** enrollment (organisation or individual).
- [ ] **EU Digital Services Act trader status**: declare it in App Store Connect (Business → Compliance) and verify
      the address, phone and email. Needed for EU distribution.
- [ ] **Legal review of `docs/PRIVACY_POLICY.md`**: fill in placeholders, confirm legal bases, the under-16 approach in the EEA
      and the RevenueCat transfer basis, then host it at a stable URL.
- [ ] **YouTube Playables Developer Portal** access (apply / contact your Partner Manager) and accept the terms.
- [ ] Decide the final name and bundle id after checking availability (STORE_LISTING.md lists options).

## iOS build & release
- [ ] Build on a Mac with **Xcode 26+ (iOS 26 SDK)**. Required for App Store uploads since Apr 28, 2026.
      This container is Linux, so the simulator build was **not** run here. `npm run build:ios` (web build + `cap sync`) does pass.
- [ ] **Signing:** team, distribution certificate, App Store provisioning profile (or automatic signing).
- [ ] Set the bundle id in `capacitor.config.ts` (`appId`) and in Xcode.
- [ ] **App Store Connect app record** (SUBMISSION_IOS.md §3).
- [ ] **Create the 9 IAP products** in App Store Connect (SUBMISSION_IOS.md §4), each with a review screenshot.
- [ ] **RevenueCat:** create the project, connect App Store Connect (In-App Purchase key), import the products, and put the
      public iOS SDK key in `src/platform/ios/config.ts`.
- [ ] **AdMob:** create the account and iOS app, plus one rewarded and one interstitial ad unit. Put the ids in
      `src/platform/ios/config.ts`, set `adsTesting: false`, and set the real `GADApplicationIdentifier` in
      `scripts/ios-configure.py`, then run it.
- [ ] Paste **Google's full current SKAdNetwork identifier list** (AdMob iOS docs) into `scripts/ios-configure.py`
      (only `cstr6suwn9` is included now) and rerun.
- [ ] AdMob: configure the **UMP/GDPR consent message** (AdMob → Privacy & messaging) and the **IDFA explainer**
      message if wanted. Without a published GDPR message the consent form will not show in the EEA.
- [ ] Set the content rating cap in AdMob to G as well (the code already requests `MaxAdContentRating.General`).
- [ ] Generate the Xcode **Privacy Report** from the archive and confirm the App Privacy answers (SUBMISSION_IOS.md §6).
- [ ] Device testing on a real iPhone and iPad: rotation, notch and home indicator, background/foreground, offline, ATT, UMP
      from the EEA, ads, sandbox purchases, Restore Purchases, haptics.
- [ ] **Performance on device:** confirm 60 fps on a mid-range device in Safari/WKWebView and Chrome Android
      (CI only has software WebGL, so this could not be measured here). Check that the heap stays < 200 MB during a long session.
- [ ] Fill in the age rating questionnaire (expected answers in SUBMISSION_IOS.md §5) and the review contact info.
- [ ] Final screenshots: `npm run build:e2e && npm run screenshots`, then add captions. Verify the current required
      sizes in App Store Connect.

## YouTube Playables
- [ ] Upload `thrift-flip-youtube.zip` (from `npm run build:youtube`) to the Developer Portal.
- [ ] **Enable monetization (YouTube ads)** for the game in the Playables Developer Portal; rewarded and
      interstitial ads only work once this is on.
- [ ] Run Google's **official Playables test suite** and the **bundle analyzer**; fix anything they report.
- [ ] Re-check the certification requirements pages (they could not be fetched from the build container) and
      the current **thumbnail sizes**; re-render key art with `scripts/screenshots.ts` if needed.
- [ ] Test inside the YouTube app on Android and iOS: mute/unmute, pause/resume, rotation, save persistence, ads.
- [ ] Fill in metadata (SUBMISSION_YOUTUBE.md): title, description, genre, thumbnails, and only the accessibility tags
      whose official criteria are met.

## Content & assets
- [ ] **Music/art rights:** all current art and audio are generated in code by this project (original). If you
      replace them with licensed or commissioned work (`src/assets/manifest.json`), keep written proof of rights.
- [ ] Font: Pixelify Sans is SIL OFL 1.1; the license text is in `src/assets/fonts/OFL-LICENSE.txt` (keep it with the font).
- [ ] Optional: human playtest with a few target players (all ages) and tune `src/data/balance.json`, then
      rerun `npx tsx scripts/simulate.ts --write`.
