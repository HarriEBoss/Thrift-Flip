# Thrift Flip — Progress log

## Decisions agreed with the owner
- **Audience:** kid-friendly *all ages* presentation (bright cartoon art, simple words, big buttons), but
  officially a **general-audience** game that is not "made for kids". YouTube Playables bans games
  made for kids (13+ only), and Apple's Kids Category bans third-party ads such as AdMob. This choice keeps
  both builds and the ad/IAP plan. Store metadata must not market the game as being for children.
- **Monetization:** "money max it" with paid perks, but only within platform rules. On iOS: coin packs,
  starter pack, Remove Ads, permanent perk unlocks (Golden Toolkit, Shop Expansion, Appraiser Pass),
  a Mega Bundle, and plenty of **optional rewarded ads with small rewards**: Free Gift coins,
  +20% sale tip, Appraiser's Tip, Double Day Earnings, Market Reroll, and Premium Tool for one use.
  YouTube allows no IAP, so only YouTube-provided ads ship there.
  Not included, by design and by store rules: paid randomized rewards (loot boxes), countdown
  pressure to buy, ads during mini-games, and punishing streaks.

## Package versions (checked on npm, 2026-10-02)
| Package | Version | Note |
|---|---|---|
| phaser | 4.2.1 | Latest stable major (v4). The Canvas renderer is deprecated in v4 but still available; we use `Phaser.AUTO` (WebGL with Canvas fallback). |
| vite | 8.3.2 | Rolldown-based; uses `build.rolldownOptions.output.codeSplitting` instead of `manualChunks`. |
| typescript | 6.0.3 | TS 7.0.2 (native) is "latest", but typescript-eslint 8.71 supports `<6.1`, so we pin 6.0.x. |
| vitest / @vitest/coverage-v8 | 5.0.3 | |
| @playwright/test | 1.56.1 | Pinned to match the Chromium build pre-installed in the CI container (latest is 1.63.0). |
| eslint / typescript-eslint | 10.11.0 / 8.71.0 | |
| prettier | 3.9.9 | |
| @fontsource/fredoka | 5.3.0 | OFL-1.1 font, bundled locally (no CDN). |
| fflate | latest | Builds the YouTube zip. |
| @capacitor/* | 8.5.x | Phase 7 |
| @capacitor-community/admob | 8.1.0 | Phase 7 |
| @revenuecat/purchases-capacitor | 13.7.0 | Phase 7 |

## Where the brief and current docs differ (or need a note)
- **Phaser** registers a `visibilitychange` listener in its core (`VisibilityHandler`). It also feature-detects
  `localStorage` and has a `new Function` fallback in its webpack runtime. YouTube forbids the Page
  Visibility API and storage APIs. A Vite build plugin (`phaserSanitize` in `vite.config.ts`) removes all
  three at build time. Pause and resume come only from the platform adapter. An e2e test checks that no
  visibility listener is registered.
- **`ytgame.health.logError()` / `logWarning()` take no arguments** in the current SDK reference. The adapter
  logs details to the console and then calls them without arguments.
- **YouTube initial bundle:** the official requirement is MUST < 30 MiB and SHOULD < 15 MiB. The brief's
  target of < 5 MiB is stricter, and we meet it (about 1.5 MiB).
- **Phaser chunk exceeds the 512 KiB per-file SHOULD target** (about 1.34 MiB minified). It is a single
  pre-bundled module and cannot be split. It is still far below the 30 MiB MUST limit. The checker reports it
  as a warning.
- Google developer docs could not be fetched directly from this build environment, because egress is blocked.
  Requirements were verified through search snippets of the official pages. Re-check them before submitting
  (listed in HUMAN_TODO).

## Phase 1 — Foundation ✅
- Vite + TS (strict) + Phaser 4. One codebase, and the platform adapter is chosen at build time through
  the `@platform-impl` alias (`--mode youtube|ios|web`).
- `Platform` interface plus `WebDevPlatform` (localStorage, simulated ads/IAP) and `YouTubePlatform`
  (the only file that touches `ytgame`). `IOSPlatform` is a placeholder until Phase 7.
- Responsive frame system (`src/game/ui/layout.ts`): portrait 720×(960–1280) or landscape (960–1280)×720,
  letterboxed or pillarboxed beyond that. Rendering happens at devicePixelRatio, capped at 3. Resizing
  repositions objects without recreating them, so no state is lost.
- Boot flow: an HTML loading screen with a progress bar is painted, then `firstFrameReady`, then the engine
  chunk is lazy-loaded, then the main menu renders, then `gameReady`.
- Tooling: ESLint forbidden-API rules (verified with a probe file that triggers 12 errors), Vitest,
  Playwright with a mock `ytgame`, `scripts/check-youtube-bundle.ts`, and `scripts/zip-youtube.ts`.
- e2e: readiness order, loadData before saveData, no visibility listeners, no external requests.

Next: Phase 2, which brings the pure core logic with full unit tests and the balance simulation.

## Phase 2 — Core logic ✅
- Pure TS in `src/core` (no Phaser, no DOM; enforced by lint):
  - seeded PRNG (mulberry32) and data schemas
  - economy: value formula, asking price, estimates, haggling, customer decisions, price snapping
  - recipes (2–5 steps, required or optional) and markets (gems hidden at about 5%, an unseen-item bias
    that helps catalog completion), haggling once per item, Appraiser's Tip and reroll
  - customers (12 personas), 25 request templates, Auction Night bidding logic
  - day state machine, XP and levels, 12 skills, 9 workshop upgrades, 5 shop tiers
  - catalog with set bonuses, weekly trends, daily challenge, products and perks, ad pacing rules,
    content-complete detection
- Save schema v1 (compact tuples, no derived data, no language) with a migration framework and a
  SaveManager that loads before it saves, writes at most once per 2 s, force-writes on demand,
  keeps a corrupt-save backup and enforces size and UTF-16 checks.
- Fixtures in `tests/fixtures/saves/` (v1 fresh and midgame). The maxed late-game save size test passes (< 500 KiB).
- 108 unit tests. Coverage on `src/core`: 97.8% lines, 92.9% branches.
- `scripts/simulate.ts` drives the balance, with output in `docs/BALANCE.md`: tier 2 around day 3, tier 5 around
  day 39, content completion around day 53 (about 4 h), about 4.9 min per in-game day.

Next: Phase 3, the playable core loop in Phaser.

## Phase 3 — The core loop, playable ✅
- Scenes: Main Menu, Market (cards, detail card, one-shot haggle slider, Appraiser's Tip, trends,
  market switch, reroll), Workshop (step chips, optional bonus steps with Skip, per-step stars,
  before/after split-slider reveal with an auto-sweep and a value pop-up), Shop (customers with persona looks
  and a live mood face plus a text label, price slider with snapping, counter-offers, walk-aways, requests),
  Day Summary (stats, best flip, XP, reputation, Double Earnings, shop/skills/tools upgrades).
- Tutorial day: Rory the Raccoon coaches the player through mug, scrub, polish, reveal and first sale.
- Erase-style mini-games stamp a canvas texture and a 64×64 CPU grid with the same interpolated
  brush. Completion comes from the grid (`src/core/minigame.ts`), never from GPU reads.
- Juice: coin fountains, floating numbers, sparkles, particles per tool, procedural SFX tied to
  stroke speed, haptics hooks, squash and stretch on buttons.
- e2e `loop.spec.ts`: the tutorial plus two more full days with **mouse only** and with **touch only**
  (CDP touch events). First sale in under 90 s.
  Note: in this CI container Chromium renders WebGL in software (SwiftShader). The workshop runs at about
  15–20 fps here, so each loop test takes about 6 min. JS profiling showed under 10% of frame time in game code.

## Phase 4 — All mini-games and content ✅
- All 8 mini-games: Scrub, Rust (2–3 hardness levels), Sticker Peel (too fast tears it, leaving residue that
  becomes extra grime), Glue (path tracing), Sand (coverage × evenness), Paint (palette with
  shape symbols, overspray penalty, trend-colour bonus, colour-blind palette), Polish
  (circularity × coverage), Re-wire (colour + symbol matching, mistakes reduce the score).
- 120 catalog items (8 categories × 15) composed from 40 data-driven vector shapes.
- 5 markets including **Auction Night** (timed bidding vs 2–3 NPCs), 5 shop tiers, 12 personas,
  25 request templates, weekly trends.
- Sticker Book (catalog UI with set bonuses), **Daily Fix** (seeded per date, 1–3 stars, coins per new
  star, gentle streak counter), and the **"You've flipped it all!"** completion screen.
- e2e `content.spec.ts`: all 120 catalog items are generated, rendered (every damage layer),
  restored and sold in the browser, and all 8 mini-game kinds occur. Auction, catalog, daily and
  completion screens are reachable.
- Soft-lock guard: a broke player with an empty inventory always gets one affordable offer.

## Phase 5 — Polish ✅ (with environment caveats)
- Art: each shop tier has its own look (awning stripes, wall and background colours, name sign). Dirt was
  toned down so items stay recognisable. Market card badges fixed.
- `src/assets/manifest.json` + `game/art/manifest.ts`: hand-made art can replace any generated
  item art without code changes. It is loaded lazily after `gameReady`.
- Audio: all SFX and the 3 music loops are procedural. Music starts only after `gameReady`. Master gain changes
  apply immediately, even while the context is suspended.
- Settings: Music and SFX sliders, haptics (where supported), reduced motion, bigger text,
  colour-blind paints, Restore Purchases and ad privacy (iOS only), credits. The overall mute is only offered where
  `capabilities.masterMute` is true (never on YouTube).
- Localization: `src/i18n` loader with BCP-47 fallback. English ships. Tests check that every literal
  `t('…')` key and every data-driven key family exists. DE/FR/ES/PT-BR can be added as new tables.
- Performance: the initial download is about 1.56 MiB (fonts trimmed to woff2). A texture LRU caps cached item textures.
  Per-frame redraws were removed (progress bars and buttons only redraw on change). The e2e heap check is < 200 MB.
- New e2e suite `certification.spec.ts`: pause/resume (loop, audio, frame counter, save on pause),
  YouTube audio off means silent and sliders can't override it, no mute button and no store on YouTube, Esc closes every
  modal and is never `preventDefault`-ed, resizing through all 9 aspect ratios mid-scrub keeps state, touch-only
  menus, and the heap budget.
- **Not verifiable here:** a real "60 fps on a mid-range device" measurement. This container only
  has software WebGL (SwiftShader). Profiling showed game JS under 10% of frame time; the rest is
  software rasterisation. Listed in HUMAN_TODO as an on-device check.

## Phase 6 — YouTube Playables build ✅
- `npm run build:youtube` produces `dist-youtube/` (7 files, ~1.6 MiB) and `thrift-flip-youtube.zip` (~460 KiB). The bundle checker passes
  (the only warning is the 1.34 MiB Phaser chunk vs the 512 KiB SHOULD target).
- YouTube ads are wired through `ytgame.ads` in the adapter. New e2e `youtube.spec.ts` covers: rewarded grants only on
  `true`; interstitial only on summary → next day (day ≥ 3, 3-min cooldown); `sendScore` equals the stored best;
  save round-trip across a reload; a corrupt save shows a non-dismissable friendly message and is never overwritten.
- `docs/SUBMISSION_YOUTUBE.md` lists every requirement with how it is met and how it is verified, plus metadata,
  thumbnail and accessibility-tag notes.
- `scripts/screenshots.ts` + a text-free `PromoScene` (E2E builds only) render App Store screenshots
  (1320×2868, 2064×2752) and YouTube key art (16:9, 1:1, 9:16) into `dist-store/`.

## Phase 7 — iOS build ✅ (Xcode build is a human step)
- Capacitor 8.5 iOS project (Swift Package Manager; no CocoaPods), web assets bundled in the app (no
  `server.url`). `npm run build:ios` runs the Vite iOS build, `scripts/check-ios-bundle.ts` (no YouTube SDK, no remote URL),
  then `cap sync ios`. Bundle isolation is checked both ways (the YouTube checker rejects any Capacitor, AdMob or IAP code).
- `IOSPlatform`: Preferences saves, App `pause`/`resume`, Haptics, Device language tag, hidden status bar,
  splash hidden at first frame. **AdMob** (`@capacitor-community/admob` 8.1) runs after `gameReady`:
  UMP consent first, then the ATT prompt, then init with `maxAdContentRating: General` (all-ages friendly).
  If ATT is denied, ads are non-personalised. A rewarded ad grants only if the reward event fired.
  **RevenueCat** (`@revenuecat/purchases-capacitor` 13.7) handles products, purchase, cancel and Restore.
  - Why RevenueCat over `cordova-plugin-purchase`: it is a native Capacitor plugin with SPM support (Cordova
    plugins and Capacitor 8 SPM projects don't mix well), has server-side receipt validation, and is actively maintained.
    Trade-off: a RevenueCat account is needed and it appears in the privacy label.
- Offline: ads and IAP report unavailable and the game is fully playable (all assets local).
- Safe area: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding around the canvas.
- Info.plist: AdMob app id (TEST), ATT purpose string, SKAdNetwork (Google's id; the full list is in HUMAN_TODO),
  `ITSAppUsesNonExemptEncryption=false`, status bar hidden, all orientations, arm64. These are applied by the
  re-runnable `scripts/ios-configure.py`.
- `PrivacyInfo.xcprivacy` (UserDefaults reason CA92.1, no tracking or collection by the app itself; the SDKs ship
  their own manifests), registered in the Xcode project.
- App icon and launch screen generated from the original `resources/icon.svg` (`scripts/render-icons.ts` +
  `@capacitor/assets`).
- Unit test `iosPlatform.test.ts` mocks all plugins and covers saves, language, consent/ATT/G-rated init,
  non-personalised ads, reward-only-on-event, no ads without consent, and purchase success/cancel/fail/restore.
- **Not possible here:** building in Xcode for the simulator. This is a Linux container without Xcode (HUMAN_TODO).

## Phase 8 — Release prep ✅
- `docs/SUBMISSION_IOS.md`: toolchain (Xcode 26 / iOS 26 SDK, required since 2026-04-28), identity and signing,
  App Store Connect record, the 9 IAP products, age-rating answers (not Kids Category; no simulated gambling),
  the App Privacy label derived from AdMob + RevenueCat, reviewer notes (bundled assets, where IAP and ads are),
  export compliance, **EU DSA trader status**, screenshots.
- `docs/PRIVACY_POLICY.md`: per-platform draft (YouTube: no data collected by the developer; iOS: AdMob +
  RevenueCat), marked as needing legal review.
- `docs/STORE_LISTING.md`: name options, subtitles, keywords (96 chars), description, promo text,
  What's New, screenshot captions, YouTube copy (all-ages friendly, never "made for kids").
- `docs/HUMAN_TODO.md`: the complete list of human steps.
- Version **1.0.0** (package.json, Xcode `MARKETING_VERSION`), tag `v1.0.0`.

## Playtest round 1 (owner feedback) ✅
- **Polish froze on phones.** Erase games now batch pointer input per frame, stamp a pre-rendered brush,
  upload the texture once per frame, reuse one particle emitter, and cap damage layers at 512 px. Polish
  is also quicker: a bigger cloth, done at 85%, and circles are a bonus instead of a requirement.
- **Cracks went past the item.** The crack path is now picked inside the item's outline and clipped to it.
- **"More features like upgrading your shop and better items".** A new Upgrades hub (bigger shop,
  decorations, tools, skills) with a next-shop goal tracker. Ten decorations with small bonuses appear on
  the shop counter, and bigger shops find rarer items. Save format v2 with migration and fixtures.
  Balance re-run (BALANCE.md): about 4.8 real minutes per in-game day, with completion around 4 hours.

## Definition of done: status
| Item | Status |
|---|---|
| `npm run check` (lint, typecheck, unit + coverage, YouTube build + bundle checks, e2e) | ✅ passes in this container (see the final run log in the commit message / PR) |
| `thrift-flip-youtube.zip` meets every automatable MUST in §7 | ✅ automated; manual items listed in SUBMISSION_YOUTUBE.md |
| iOS project builds in Xcode | ⏳ **human step**: no Xcode on Linux. `build:ios` + `cap sync` pass; IAP and ads are absent from the YouTube bundle (checked) |
| Old-save migration tests | ✅ (v1 and v2 fixtures; v1 → v2 migration tested) |
| Docs complete | ✅ ARCHITECTURE, BALANCE, PROGRESS, HUMAN_TODO, SUBMISSION_IOS, SUBMISSION_YOUTUBE, PRIVACY_POLICY, STORE_LISTING |
| HUMAN_TODO lists every required human step | ✅ |
