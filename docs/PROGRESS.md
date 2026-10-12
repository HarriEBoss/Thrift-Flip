# Thrift Flip — Progress log

## Decisions agreed with the owner

- **Audience:** kid-friendly _all ages_ presentation (bright cartoon art, simple words, big buttons), but
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

| Package                         | Version          | Note                                                                                                                                      |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| phaser                          | 4.2.1            | Latest stable major (v4). The Canvas renderer is deprecated in v4 but still available; we use `Phaser.AUTO` (WebGL with Canvas fallback). |
| vite                            | 8.3.2            | Rolldown-based; uses `build.rolldownOptions.output.codeSplitting` instead of `manualChunks`.                                              |
| typescript                      | 6.0.3            | TS 7.0.2 (native) is "latest", but typescript-eslint 8.71 supports `<6.1`, so we pin 6.0.x.                                               |
| vitest / @vitest/coverage-v8    | 5.0.3            |                                                                                                                                           |
| @playwright/test                | 1.56.1           | Pinned to match the Chromium build pre-installed in the CI container (latest is 1.63.0).                                                  |
| eslint / typescript-eslint      | 10.11.0 / 8.71.0 |                                                                                                                                           |
| prettier                        | 3.9.9            |                                                                                                                                           |
| @fontsource/fredoka             | 5.3.0            | OFL-1.1 font, bundled locally (no CDN).                                                                                                   |
| fflate                          | latest           | Builds the YouTube zip.                                                                                                                   |
| @capacitor/*                    | 8.5.x            | Phase 7                                                                                                                                   |
| @capacitor-community/admob      | 8.1.0            | Phase 7                                                                                                                                   |
| @revenuecat/purchases-capacitor | 13.7.0           | Phase 7                                                                                                                                   |

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

## Playtest round 2 ✅

- **Game froze on the reveal screen (day 2, iPhone).** Root cause: the Workshop kept the pixel memory
  of every item's large canvases until Safari garbage-collected them (about 6 MB per item at 1×, much
  more at 3×), which hits iOS's canvas memory limit after roughly a day of play. Canvases are now freed
  immediately (canvas memory stays flat across items), and a frame guard keeps the game running if any
  single frame throws.

## Playtest round 3 ✅

- **"Do it!" before bonus steps removed.** Bonus steps start straight away like every other step; a
  Skip button sits next to Done, and a short toast says it is a bonus step.
- **"Lags out and goes back to the main screen".** That was the frame guard's last resort after a run
  of failing frames. Changes: the guard now repairs in place (hide objects with removed textures, then
  restart the current scene) and works more than once per session; the thumbnail cache no longer
  evicts textures shown inside containers (drawing a removed texture throws every frame); more
  temporary canvases are freed at once. The playtest build shows the error text if anything still
  fails, so the next report can name the cause.

## Art style: pixel art (owner feedback) ✅

- The owner did not like the flat vector look and chose **pixel art**; everything looked too simple, and
  characters, screens, buttons and colours all needed work.
- One pipeline (`game/art/pixel.ts`) turns all existing vector art into pixel art (items, characters,
  decorations, icons, coins, stars), with outlines and light/shadow rims. The workshop became a 64×64
  pixel world with dithered grime that comes off pixel by pixel. UI boxes and buttons get stepped pixel
  corners, particles are pixel blocks, the background is a pixel twinkle pattern, the palette is brighter,
  and the font was Pixelify Sans (OFL).
- **Readability pass (owner: "hard to read everything").** The pixel font was replaced with Nunito
  ExtraBold/Black (OFL), all font sizes went up, secondary text is darker, market item names stay on one
  line, locked decorations say "Locked" with the requirement in the description, and grime and rust are
  less speckled so items stay recognisable.

## Playtest round 4 ✅

- **Error report from the owner's phone** (via the playtest error note): `Cannot read properties of null
(reading 'sourceSize') at setCropUVs`. Cause: pressing "Next item" while the reveal's before/after slider
  was still sweeping. The old item's texture was removed, but the sweep tween kept cropping the destroyed
  image on every frame, which caused the lag and, after 20 failing frames, the scene restart (the earlier
  "lags out and goes back to the main screen"). Fix: the sweep tween is stopped when the item is cleaned up,
  and the slider never touches destroyed objects. A new e2e test reproduces the exact error on the old code.

## Realistic objects + real wiring repair (owner request) ✅

- **Objects are smooth and realistic again** (the owner asked for "a bit more realistic and smooth on the
  objects"): items are drawn at full resolution with soft top-left lighting, shaded bottoms, specular
  spots on glass and metal, thin natural edges and soft contact shadows. The workshop uses smooth,
  high-resolution grime and brush erasing again. Characters, icons and UI keep the pixel look.
- **New wiring repair** (`RepairGame`), different per object: the item turns to its base or back, the
  player unscrews the cover with a screwdriver (or twists off a watch back), lifts it off, reconnects the
  wires inside (lamp socket block, circuit board, valve chassis, clock movement or battery box) to brass
  terminals, sees it light up as a test, and the item goes back together. Unit tests for the rigs and
  layouts; the e2e bot plays the new flow.

## Computers, cars, detailed repairs and workshops (owner request) ✅

- **New late-game categories:** Computers & Games (tier 3) and Cars & Bikes (tier 4), 30 items worth far
  more than flea-market finds, with two new customers (Gamer Gabe, Racer Rita).
- **Repair step, done for real and in detail:** repairs are now a list of hands-on tasks, each its own
  mini-game: blow out dust, swap broken parts (fans, memory, drives, batteries, spark plugs, graphics cards,
  CPU coolers with thermal paste), drain and pour oil and coolant, undo and tighten bolts with a ratchet,
  hoist engines out and in, and plug in motherboard cables and engine hoses.
- **Workshops:** Repair Shop, Computer Workshop and Car Garage. Customers bring jobs to the Repair Desk:
  small repairs, full PC rebuilds and full engine swaps (lots to do, big pay, tips for great work).
- **Save v3** with migration and fixtures; unit tests for rigs, layouts, jobs and saves; e2e tests for a
  full PC rebuild job. Balance: the Grand Emporium now costs 4400 coins and 80 reputation (the new
  categories had pulled it to day 29; it is now day 37 again).

## Business empire, phase 1: company name and business ladder ✅

- **Name your company** on first play: spin three word wheels or type a name on an in-game keyboard; a
  word filter keeps names kid-friendly. The name is on the shop sign, the main menu, the business ladder
  and job cards, and can be changed from Settings.
- **Business ladder** (data-driven): Reselling Shop → Phone Repair → Computer Repair → Mechanic →
  Robotics Lab → Rocket Repair. Each is locked until the one before it (and a shop size) is reached,
  then you save up its capital and open it. Progress to the next one shows in the goal banner.
- **Work at a different business each day.** A repair business turns the market into a job board;
  customers pay when their job is done.
- **New content:** Phones & Gadgets (sold at markets too), Robots and Rockets & Spacecraft (jobs only),
  45 items with their own detailed repairs: heat-gun glued phone backs, screens, batteries, cameras,
  servos, controller chips, fuel pumps, fuel and oxidiser lines, phone flex cables and robot harnesses.
- The earlier workshops became businesses (save v4 migrates them). Tests: ladder gating, the name filter,
  jobs per business, v3 → v4 migration and fixtures, e2e for naming, opening Phone Repair and fixing a
  customer's phone, and a PC rebuild at Computer Repair.

## Business empire, phase 2: marketing and contracts ✅

- **Marketing:** six campaigns from flyers to satellite ads, unlocked by your businesses. They grow your
  brand, which brings more shop customers and more contracts, with diminishing returns; the brand fades
  a little every day.
- **Contracts in your company's name:** each job is now a contract with a client (customers or companies
  such as "Sky Post" or "Orbit Labs"), a difficulty (1–5 stars), the quality the client wants and the
  pay. Fleet orders bring 2–3 items at once. Missing the quality target pays less. Contracts get harder
  and pay more as you climb the ladder.
- **Custom engineering:** your biggest business offers a design contract each day: design a new PC,
  car, robot or rocket on a blueprint to the client's spec (power, weight, budget), then build and polish
  it, for about twice the pay.
- Save v5 (brand, today's campaigns, contract details). Tests: brand curve and decay, campaign rules,
  contract scaling, fleet orders, quality targets, design specs always solvable, migration, and e2e for
  running ads and completing a design contract.

## Business empire, phase 3: managers and branches ✅

- **Managers** (from Rocket Repair on): hire a manager for any of your businesses; they run it while you
  work somewhere else and pay its takings at the end of each day (minus a small wage). Train them through
  five levels, from 50% to 110% efficiency.
- **Branches:** open more shops of any business (Phone Repair #2, #3…). Each one multiplies what that
  business makes, and each costs more than the last, so there is always a next goal.
- The day summary shows "Managers earned". Marketing (brand) boosts managed businesses too.
- Save v6. Tests: unlock gating, hire/train costs and efficiency, branch cost growth and income, daily
  payout (not at the business you work at), migration; e2e: hire, train, open a branch, earn.

## Business empire, phase 4: global expansion ✅

- **World expansion** (from Rocket Repair on): a world map with seven regions. Open an office in a region,
  then deliver its flagship contract (a big custom design job for a famous client, such as the Tokyo
  Robot Expo) to conquer it. A flag goes up on the map.
- **Each region gives a permanent bonus** (shop prices, contract pay or manager income) and **opens its
  own market**: Route 66 Swap Meet, Rio Street Fair, Paris Brocante, Marrakech Souk, Tokyo Night
  Market, Sydney Surplus Yard and Polar Station Swap, each specialising in a few categories.
- Conquering all seven regions is what unlocks space (phase 5).
- Save v7. Tests: gating, offices and flagship contracts, conquering (and not on a missed target),
  region bonuses, regional markets, migration; e2e: open North America, deliver the flagship, conquer.

## Business empire, phase 5: space and the Dyson project ✅

- **Space program** (after conquering every Earth region): research space technology on Earth (each
  takes a few days), found colonies on the Moon (optional), Mars, the asteroid belt, Europa, Titan and
  Mercury. Each colony harvests its own material and earns coins every day, and sends rover and lander
  repair contracts to Rocket Repair that ship extra material home.
- **The Dyson project:** ten stages built from the colonies' materials; each one harvests 10% more of
  the Sun and sells energy every day. Finishing it means the whole Sun powers your company: the end of
  the race (prestige comes next).
- **Pacing:** all space numbers are in one place (`balance.json` → `empire.space`). The balance bot's
  long run reaches the whole Sun at about 110 hours of play (target 50–150 h); see `docs/BALANCE.md`.
- Big numbers are shown short in the HUD and space screens (23.5M). Save v8. Tests: research gating and
  timing, colony requirements, harvest and income, colony contracts, Dyson stages, migration; e2e:
  research, found Mars, harvest, build a Dyson stage.

## Business empire, phase 6: prestige and the legacy tree ✅

- **Design contracts are built, not repaired** (owner feedback): Design → **Build** → Polish. The Build
  step starts from an open, empty frame: fit each part into its empty mount, bolt it, plug in the cables,
  fill it, then the cover and screws go on. Build rigs for PCs, cars, robots and rockets.
- **Realistic wiring** (owner request): real connectors and cables (ATX 24-pin, EPS/PCIe, SATA, front
  panel pairs, phone flex ribbons, servo leads, IDC ribbon, XT60, hoses with clamps, braided rocket lines
  with AN fittings), stripped multicore sheath, twisted copper and crimped ring terminals on a barrier
  strip, a detailed motherboard, and flat Li-ion pouch batteries in phones.
- **Prestige:** once the whole Sun is harvested, prestige from the Dyson screen or the Legacy tree. The
  n-th prestige gives n tokens (1, 2, 3...). A new run keeps the company name, the tree and tokens, the
  catalog, decorations, purchases and lifetime stats; coins, shops, businesses, regions and space reset.
- **Legacy tree:** 22 nodes in five branches (Money, Growth, Brand, Team, Space) with prerequisites, all in
  `balance.json` → `empire.prestige`: more income and contract pay, discounts on unlock costs, a head start
  (coins and businesses), stronger marketing, better managers, faster research, bigger harvests and a
  cheaper Dyson project. Upgrades → Legacy tree (shown after the first prestige or once it is possible).
- **Pacing:** the balance bot's second run reaches the whole Sun in about 105 h, the third in about 94 h
  (first: 117 h). Save v9. Tests: token math (n per prestige, n(n+1)/2 total), what resets and what is
  kept, node prerequisites and costs, every bonus reaching the game, save round trip and v8 → v9; e2e:
  prestige from the Dyson screen, spend the token, the tree survives a reload.

## Business empire, phase 7: the tablet ✅

- A **tablet** button at the right of the HUD opens an in-game tablet over any game screen (the game
  behind pauses). A plain dark device: no real brand or logos. Home screen with the day, company name
  and two apps; ✕ or Esc puts it away.
- **Legacy tree app:** the whole prestige tree as a map: skills as round nodes by branch colour, gold
  links between the ones you own, a gold ring on the ones you can buy now. Tap a skill to see what it
  does and buy it. Prestige from here when the Sun is harvested.
- **Solar system app:** the Sun with its Dyson ring, Earth and the Moon, Mercury, Mars, the asteroid
  belt, Europa and Titan slowly going round. Flags on your colonies, a gold ring where you can found one
  now, padlocks on the rest. Tap a body for its material, harvest, income and what it still needs, and
  found the colony; tap the Sun for the Dyson project.
- Drag to look around and zoom with + / − or the mouse wheel. Works at 9:16, 16:9 and 1:1 (on wide
  screens the info panel sits beside the map).
- Tests: tree and orbit layout (fits, no overlaps, orbits in order, the Moon circles Earth, line
  clipping); e2e: open the tablet over the market, buy a skill on the map, found Mars, put it away.

## Business empire, phase 8: Gold Bars, time skips and the store ✅

- **Gold Bars**, a premium currency, earned by playing: a new business (3), a conquered region (5), a new
  colony (5), a Dyson stage (3), a perfect contract (1), a 3-star daily challenge (1) and every prestige
  (10). A toast says when you earn some. They are kept through prestiges.
- The tablet's new **Gold Bars** app:
  - **Skip ahead** 1, 3 or 7 days (4, 10 or 20 bars) at the start of a day: managers, research,
    colonies and the Dyson project work through the skipped days exactly as on a real day.
  - **Tools early**: a tool before your shop is big enough, for Gold Bars instead of coins.
  - **Get Gold Bars**: packs of 20, 120 and 280. Mock store only, behind a `PaymentProvider`
    interface: pretend purchases in the playtest (it says no money is paid and asks first), the
    platform store where one exists, and hidden on YouTube (no purchases there; bars come from play).
- Save v10. Tests: wallet, milestones, skips (only at the start of a day, real end-of-day effects),
  early tools, the store service with mock and failing providers, migration; e2e on the YouTube build:
  no store, unlock a tool early, skip three days.

## Owner feedback: realistic assembly, more to buy with Gold Bars ✅

- **Assembly is now hands-on and realistic**, not just "drag the part in":
  - PC build: seat the CPU (lever, line up the gold triangle, a wrong drop bends pins), paste and
    cooler, cooler screws in a cross pattern with a torque gauge, RAM into A2 (latches, notch, click),
    graphics card, SSD, the power cables and the front-panel pins with LED polarity.
  - Cars: engine bolts torqued centre-out, the serpentine belt routed from the under-hood diagram and
    the tensioner, hoses, fluids, battery, wiring. Robots: servo centred at 90°, controller chip
    seated in its socket. Rockets: nozzle bolts in a star pattern and a fuel line leak test.
  - The PC rebuild, engine swap, rocket and robot repairs use these steps too.
- **More to buy with Gold Bars**, in tabs on the tablet: finish research now, cargo runs of colony
  materials, a brand boost, new market stock, golden tools, and two golden decorations (Founder's
  Statue, Golden Register).

## Definition of done: status

| Item                                                                                   | Status                                                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (lint, typecheck, unit + coverage, YouTube build + bundle checks, e2e) | ✅ passes in this container (see the final run log in the commit message / PR)                                                |
| `thrift-flip-youtube.zip` meets every automatable MUST in §7                           | ✅ automated; manual items listed in SUBMISSION_YOUTUBE.md                                                                    |
| iOS project builds in Xcode                                                            | ⏳ **human step**: no Xcode on Linux. `build:ios` + `cap sync` pass; IAP and ads are absent from the YouTube bundle (checked) |
| Old-save migration tests                                                               | ✅ (v1–v10 fixtures; every migration tested)                                                                                  |
| Docs complete                                                                          | ✅ ARCHITECTURE, BALANCE, PROGRESS, HUMAN_TODO, SUBMISSION_IOS, SUBMISSION_YOUTUBE, PRIVACY_POLICY, STORE_LISTING             |
| HUMAN_TODO lists every required human step                                             | ✅                                                                                                                            |
