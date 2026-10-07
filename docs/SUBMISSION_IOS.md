# iOS App Store submission checklist

Verify every item against current Apple documentation at submission time; requirements change.

## 0. Toolchain

- **Xcode 26 or later with the iOS 26 / iPadOS 26 SDK** is required for uploads since **April 28, 2026**
  (Apple "Upcoming requirements"). The deployment target can stay lower (Capacitor 8 supports iOS 15+;
  check `ios/App/App.xcodeproj` → Deployment Target).
- Node 22, `npm ci`, then `npm run build:ios` (Vite iOS build → bundle check → `cap sync ios`).
- Open `ios/App/App.xcodeproj` in Xcode. Swift Package Manager resolves the plugins on first open.

## 1. Project identity

- [ ] Register a bundle id in the Apple Developer portal (e.g. `com.<you>.thriftflip`) and set it in
      `capacitor.config.ts` (`appId`) **and** in Xcode → Target App → General → Bundle Identifier.
- [ ] Version 1.0.0 (`MARKETING_VERSION`), build 1 (`CURRENT_PROJECT_VERSION`).
- [ ] Signing: Team, automatic signing, or a distribution certificate plus an App Store provisioning profile.
- [ ] Capabilities: **In-App Purchase**. No push notifications, no Game Center (unless added later).

## 2. Before building a release

- [ ] `src/platform/ios/config.ts`: `adsTesting: false`, real AdMob rewarded and interstitial unit ids, the RevenueCat
      public iOS key, and the privacy policy URL.
- [ ] `scripts/ios-configure.py`: the real `GADApplicationIdentifier`. Paste **Google's full current SKAdNetwork
      list** (AdMob iOS docs → "SKAdNetwork") into `SKAdNetworkItems`. Then run `python3 scripts/ios-configure.py`.
- [ ] `npm run check` is green, then `npm run build:ios`.
- [ ] In Xcode: Product → Archive. Before uploading, open the **Privacy Report** (Organizer → archive →
      Generate Privacy Report) and confirm it matches section 6.
- [ ] Test on a real iPhone and iPad: rotation, notch and home indicator, background/foreground (pause and save),
      airplane mode (offline play; ads and IAP unavailable), the UMP form from the EEA (use a VPN or a debug geography),
      the ATT prompt, rewarded and interstitial ads, every purchase in the sandbox, and Restore Purchases.

## 3. App Store Connect app record

- [ ] New App: platform iOS, name **Thrift Flip** (check availability; see STORE_LISTING.md for alternatives),
      primary language English, bundle id, SKU `thriftflip-ios`.
- [ ] Category: **Games**, subcategories **Simulation** and **Casual**.
- [ ] Price: Free (with in-app purchases).
- [ ] Availability: all territories you want. EU distribution needs the DSA trader declaration (section 8).

## 4. In-app purchases (create in App Store Connect, then mirror in RevenueCat)

| Product id | Type | Suggested price tier | Content |
|---|---|---|---|
| `starter_pack` | Non-consumable | €2.99 | 1,000 coins + Golden Sponge (permanent) |
| `remove_ads` | Non-consumable | €4.99 | No interstitials (rewarded ads stay optional) |
| `golden_toolkit` | Non-consumable | €6.99 | All golden tools permanently |
| `shop_expansion` | Non-consumable | €3.99 | +4 shelves, +1 customer per day |
| `appraiser_pass` | Non-consumable | €2.99 | Hidden gems visible at markets |
| `mega_bundle` | Non-consumable | €14.99 | All perks above + 5,000 coins |
| `coins_small` | Consumable | €0.99 | 500 coins |
| `coins_medium` | Consumable | €4.99 | 3,000 coins |
| `coins_large` | Consumable | €9.99 | 8,000 coins |

- [ ] Each product needs a display name, a description and a review screenshot (use the in-game Shop Perks screen).
- [ ] **No paid randomised rewards** exist (Guideline 3.1.1 loot-box disclosure is therefore not needed).
- [ ] The Restore Purchases button is in Settings and in the Shop Perks screen (required for non-consumables).
- [ ] RevenueCat: create the project, add the App Store app, upload the In-App Purchase key (App Store Connect →
      Users and Access → Integrations), import the products, and copy the public SDK key into `config.ts`.

## 5. Age rating questionnaire (expected answers)

The game is friendly to all ages but is **not** submitted to the Kids Category (third-party ads). Answer truthfully:

- Violence (cartoon/fantasy/realistic): **None**
- Sexual content / nudity: **None**
- Profanity / crude humour: **None**
- Horror / fear themes: **None**
- Alcohol, tobacco, drugs: **None**
- Simulated gambling: **None**. No paid randomised items. The auction is a bidding mini-game with in-game
  coins only and no real-money stakes.
- Contests: **None**
- Unrestricted web access: **No** (the privacy policy opens in an in-app browser sheet).
- User-generated content / messaging: **No**
- In-app purchases: **Yes**. Advertising: **Yes** (declare it where the questionnaire asks)
- Expected rating: the lowest bracket (4+ / "for all ages") with an in-app purchase notice. The app is not
  in the Kids Category, so do **not** select "Made for Kids".

## 6. App Privacy ("nutrition label")

Derived from the SDKs actually linked: Google Mobile Ads (AdMob, with UMP) and RevenueCat. Verify against
each vendor's current App Store privacy guidance and the Xcode privacy report.

**Data Used to Track You** (only when the user allows ATT):
- Identifiers → **Device ID** (IDFA), used by AdMob for third-party advertising.

**Data Linked to You:** none by the developer. RevenueCat assigns an anonymous App User ID for purchases;
declare it per RevenueCat's guidance:
- Purchases → **Purchase History**: App Functionality (RevenueCat). Usually *linked to the user via
  an anonymous ID*. Follow RevenueCat's current recommendation.

**Data Not Linked to You** (AdMob):
- Identifiers → Device ID (when ATT is not granted, AdMob may use non-IDFA identifiers): Third-Party Advertising,
  Analytics.
- Usage Data → **Advertising Data** and **Product Interaction**: Third-Party Advertising, Analytics.
- Diagnostics → **Crash Data / Performance Data**: Third-Party Advertising (as Google declares for the
  Mobile Ads SDK).
- Location → **Coarse Location** (derived from IP by AdMob): Third-Party Advertising.

**Not collected:** contact info, health, financial info, precise location, contacts, user content,
browsing or search history, sensitive info. The game itself has no accounts, no analytics and no server.

## 7. Review information

- Contact: name, phone, email (a human must provide these).
- Demo account: **not needed** (no login).
- Notes for the reviewer (paste):

> Thrift Flip is a native-wrapped HTML5 game built with Phaser and Capacitor. All game code, art (generated
> pixel art) and audio (procedural Web Audio) are bundled inside the app; nothing is loaded from a website.
> It is fully playable offline.
> - In-app purchases: Main Menu → "Shop Perks" (also reachable from the Day Summary after day 3 via
>   "Starter Pack deal"). Restore Purchases: Settings → "Restore purchases" or the bottom of Shop Perks.
> - Rewarded ads (always optional): the gift button on the Main Menu and Market, "Appraiser's tip" in a
>   market item card, "New stock" in the Market, "Golden tools" in the Workshop, "Ask for a tip" after a sale,
>   and "Double today's profit" on the Day Summary.
> - Interstitial ads appear only when moving from the Day Summary to the next day, never before day 3, and at most
>   once every 3 minutes. Remove Ads disables them.
> - Ad consent: the Google UMP form (EEA/UK) and then the ATT prompt appear once after the main menu has
>   loaded. Ad privacy choices can be changed in Settings → "Ad privacy choices".
> - There are no paid random rewards.

## 8. Compliance

- [ ] **Export compliance:** uses only standard encryption (HTTPS via the OS). `ITSAppUsesNonExemptEncryption = NO`
      is set in Info.plist, so no annual self-classification report is needed.
- [ ] **EU Digital Services Act trader status** (Business → Compliance in App Store Connect): the developer
      is based in the EU and monetises the app (ads + IAP), so they are almost certainly a **trader**. Provide
      and verify an address, phone number and email (Apple sends verification codes to both). These are shown on
      the EU product page. Without a verified declaration, the app cannot be distributed in the EU.
- [ ] **Privacy policy URL** (required): host docs/PRIVACY_POLICY.md after legal review, and use the same URL in
      `config.ts` and App Store Connect.
- [ ] **Advertising identifier:** answered via the privacy label (ATT is implemented).
- [ ] **Content rights:** all content is original or licensed (Nunito OFL, Phaser MIT). Confirm in App Store Connect.

## 9. Screenshots & metadata

- `npm run build:e2e && npm run screenshots` writes `dist-store/ios-iphone-6.9/` (1320×2868) and
  `dist-store/ios-ipad-13/` (2064×2752). Check App Store Connect for the currently required display sizes.
  Add captions from STORE_LISTING.md (e.g. with Apple's frame templates or any editor).
- Text: STORE_LISTING.md (subtitle, keywords, description, promotional text, What's New).

## 10. Submit

- [ ] Upload the build (Xcode Organizer or Transporter), wait for processing, attach it to version 1.0.0.
- [ ] Attach the IAPs to the version (first-time IAPs must be submitted with an app version).
- [ ] Submit for review.
