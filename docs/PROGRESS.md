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
