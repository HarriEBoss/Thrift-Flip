# Thrift Flip — Architecture

One TypeScript codebase produces three bundles: the **YouTube Playables** HTML5 zip, the
**iOS** app (Capacitor), and a local **web** dev build. Platform differences live only behind
the platform adapter.

```
src/
  main.ts            HTML boot screen → platform.init → firstFrameReady → lazy-load engine chunk
  boot/              DOM loading screen (progress bar) shown before Phaser is downloaded
  core/              PURE game logic: no Phaser, no DOM (lint-enforced). Fully unit-tested.
    prng.ts            mulberry32 + hashSeed. All randomness is seeded.
    data.ts types.ts   typed access to src/data/*.json
    economy.ts         value formula, asking price, estimates, haggling, customer decisions
    items.ts           recipes (2–5 steps), instance values
    market.ts          offerings, haggling, appraiser tip, reroll, soft-lock guard
    customers.ts       personas, visits, requests, price responses
    auction.ts         Auction Night bidding vs NPCs
    day.ts             day state machine (market → workshop → shop → summary → market)
    progression.ts     XP/levels, skills, workshop upgrades, shop tiers
    perks.ts           derived tool parameters, perks, capacities
    catalog.ts trends.ts daily.ts products.ts ads.ts complete.ts
    minigame.ts        coverage grid + scoring for every mini-game (no rendering)
    save/              compact schema, migrations, SaveManager (debounce, force, size checks)
  game/              Phaser 4 scenes, UI kit, art, audio
    bootGame.ts        Phaser config, DPR-crisp resize, platform pause/resume wiring
    session.ts         the single GameState + SaveManager + AudioEngine + platform
    scenes/            Boot, MainMenu, Market, Auction, Workshop, Shop, Summary, Catalog, Daily, Complete
    minigames/         EraseGame (scrub/rust/sand/polish), Sticker, Glue, Paint, Wire
    art/               itemArt (vector parts → Canvas 2D), damage layers, characters, texture LRU
    audio/             procedural Web Audio SFX + generative music
    ui/                layout frame, widgets (Button/Slider/ProgressBar), icons, modals, menus, coach
  platform/          Platform interface + YouTube / iOS / web adapters (the ONLY place for
                     ytgame, Capacitor, storage, locale and ad/IAP SDKs)
  i18n/              string tables (en.json) + loader with fallback
  data/              items, categories (vector shapes), recipes, customers, markets, requests, balance
  assets/            fonts (Fredoka, OFL), manifest.json (art swap-in points), items/ (optional art)
```

## Platform adapter

`src/platform/Platform.ts` defines the interface from the brief, plus a few additions:
`capabilities.masterMute`, `externalLinks` and `privacyOptions`, `showPrivacyOptions()` and `openExternal()`.
The build picks one implementation through the Vite alias `@platform-impl`
(`vite build --mode youtube|ios|web`). The YouTube bundle therefore contains no Capacitor, AdMob or IAP
code, and the iOS bundle never references the YouTube SDK.

Game code asks `capabilities` before showing anything platform-specific:

- `iap: false` on YouTube. The store, Restore Purchases and Starter Pack offer are never created.
- `masterMute: false` on YouTube. There is no overall mute toggle; separate Music and SFX sliders remain.
- `externalLinks: false` on YouTube. There is no privacy policy link.

## Rendering, responsiveness and crispness

- The Phaser canvas backing store is `CSS size × devicePixelRatio`, with DPR capped at 3. The zoom is `1/DPR`,
  using ScaleManager NONE mode and a manual resize.
- Every scene draws into a `root` container that lives in a **logical frame** with a short side of 720:
  portrait is 720×(960–1280) and landscape is (960–1280)×720. Aspect ratios beyond that are
  letterboxed or pillarboxed over a full-bleed background (9:32 through 32:9 are tested).
- On resize the frame is recomputed and each scene's `layout()` repositions its existing objects.
  Nothing is recreated, so state (including half-scrubbed dirt) survives. Text resolution follows the frame scale.
- Mini-games use a fixed 560-unit stage. Layer textures are sized to the stage's device pixels
  (384–1024 px).

## Restoration mini-games

Erase-style games follow the brief's rule: **no per-frame GPU reads.**

1. Damage layers (dirt, rust, worn varnish, faded paint, dullness) are generated procedurally per
   instance with the seeded PRNG. They are drawn with Canvas 2D, clipped to the item silhouette, and shown
   as Phaser canvas textures.
2. One small CPU read per step: the layer is downsampled to 64×64 to build a `CoverageGrid` mask
   (rust also gets hardness 1–3).
3. Pointer moves are queued and processed **once per frame**: brush stamps are interpolated between
   pointer events, update the grid, and erase the canvas (`destination-out`) by stamping one
   pre-rendered soft brush image. The texture is uploaded once per frame and particles come from one
   cached emitter (throttled), which keeps phones smooth.
4. Damage layers are capped at 512 px (`MAX_LAYER` in `game/art/damage.ts`) whatever the stage size, so
   each upload stays small on high-DPR phones.
5. Completion and score are computed from the grid in `src/core/minigame.ts`. Polish finishes at 85%
   coverage (`POLISH_DONE`), and circles add a bonus rather than being required.

Cracks follow a path chosen **inside the item silhouette** (`crackPathInMask`) and are also clipped to the
silhouette when drawn (`crackCanvas`), so they never spill past the item's edge.

Sticker peel uses speed-based tearing, glue uses path following, wires use a matching puzzle, and polish
weights coverage by gesture circularity. All of these are pure and unit-tested.

## Growing the shop

Every way to grow sits behind one **Upgrades** button (Main Menu, Market header, Day Summary), in
`game/ui/upgradesHub.ts`: bigger shop (tiers), decorations, tools and skills. A goal banner shows the
next shop tier with coin and reputation progress (`nextGoal` in `core/progression.ts`).

- **Bigger shops find better items:** `rarityWeights` in `core/market.ts` shifts the rarity odds up with
  the shop tier.
- **Decorations** (`core/decor.ts`, `balance.json` → `decor`): 10 items, unlocked by tier and bought with
  coins. Each one has a small passive effect (price bonus, extra customer, daily reputation, rarer finds,
  hidden gems, better rare-item prices) and is drawn on the shop counter (`game/art/decor.ts`).

## Asset pipeline

- **Items:** 40 vector shapes in `src/data/categories.json` (rects, ellipses, polygons, lines and arcs in a
  100×100 box, with colour tokens). The 120 items in `src/data/items.json` pick a shape plus body and accent colours.
  `game/art/itemArt.ts` renders them with Canvas 2D at the needed resolution. The same data
  produces the silhouette masks.
- **Swapping in hand-made art:** put a square transparent PNG or WebP in `src/assets/items/` and map the
  item id to it in `src/assets/manifest.json` (`"items": { "kit_polka_dot_mug": "mug.png" }`).
  `game/art/manifest.ts` loads overrides after `gameReady` (lazy). Silhouettes and paint recolouring
  work automatically, and no code changes are needed.
- **Characters** (Rory the Raccoon and the customers) are drawn from persona data in `game/art/characters.ts`.
- **Audio** is fully procedural (`game/audio/AudioEngine.ts`), including SFX and three short generative
  music loops. `manifest.json` has `music` slots for future licensed or original tracks
  (see HUMAN_TODO).
- **Font:** Fredoka (SIL OFL 1.1), bundled as woff2. No CDN.

## Saving

`src/core/save/` contains the following:

- `schema.ts`: compact JSON `{ v, ... }`. Item instances and requests are stored as tuples, with no derived data
  and no language. Deserialisation tolerates missing or wrong-typed fields and rejects corrupt data with `SaveError`.
- `migrations.ts`: an ordered list of `vN → vN+1` functions. Every shipped version has a fixture in
  `tests/fixtures/saves/`.
- `saveManager.ts`: never writes before `loadData` resolves, writes at most once every 2 s (debounced), and
  forces a write on day end, purchases and pause. It checks UTF-16 well-formedness and the 3 MiB / 500 KiB limits.
  A corrupt save is kept in memory and writing is blocked until the player sees a friendly message.

Current version: **v2** (adds `dc`, the owned decorations; v1 saves migrate to an empty list).

Saves happen at material progress: after each restoration and each sale (debounced), on purchases
(forced), on day transitions (forced) and on platform pause (forced).

## Robustness on phones

- **Frame guard** (`guardLoop` in `game/bootGame.ts`): Phaser requests the next animation frame only
  after the current one returns, so one uncaught exception would stop the game for good (a frozen
  picture). The frame callback is wrapped: errors are logged through the platform, the loop keeps
  running, and after 30 failing frames in a row the game returns to the main menu.
- **Canvas memory**: iOS Safari counts canvas memory until garbage collection and refuses new canvases
  past its limit. Canvases we are done with (workshop textures, damage layers, thumbnail intermediates,
  evicted thumbnails, small read-back canvases) are shrunk to 0×0 immediately (`releaseCanvas`). An e2e
  test checks that workshop visits do not accumulate canvas memory.
- Sound effects are wrapped so an audio error can never break a frame.

## Pause, audio and lifecycle

- `platform.onPause` triggers `game.loop.sleep()`, disables input, suspends the AudioContext, stops music scheduling
  and force-saves. `onResume` reverses all of it. Phaser's built-in Page Visibility handler is removed
  at build time (`phaserSanitize` in `vite.config.ts`).
- The AudioContext is created on the first user gesture. When the platform reports audio as disabled, the
  master gain is set to 0 and the context is suspended. In-game sliders cannot override this.
- `firstFrameReady` fires once the HTML loading screen with its progress bar has painted.
  `gameReady` fires on the first render of the interactive main menu.

## Monetisation flow

- Rewarded ads use `REWARD_IDS` (hard-coded, no user data) through `platform.showRewardedAd`. The reward is
  granted only when it resolves `true`; otherwise the player sees "No ad available right now".
- Interstitials are shown only on the Summary → next day transition (`core/ads.ts`): never before day 3, at most one
  per 3 minutes, and never for Remove Ads owners.
- IAP products are defined in `src/data/balance.json` and granted by `core/products.ts`. There are no randomised
  paid rewards.

## Testing

- `npm test`: Vitest unit tests. Coverage of `src/core` must stay at or above 90% of lines.
- `npm run test:e2e`: builds an E2E bundle (`--mode youtube` with `E2E=1`, which exposes `window.__tf`
  hooks) and runs Playwright with a mock `ytgame`:
  - readiness order, load before save, no visibility listeners
  - pause and resume, the audio switch, Esc on modals, no mute button, resize through 9 aspect ratios mid-game
  - a full loop with mouse only and with touch only, and a 120-item content smoke test
- `scripts/check-youtube-bundle.ts`: size, files, names, first-script SDK, absolute URLs, forbidden APIs,
  and the initial-download estimate.
