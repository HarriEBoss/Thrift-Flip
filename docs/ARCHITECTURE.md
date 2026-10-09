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
    art/               pixel pipeline, itemArt (vector parts → pixel sprites), damage layers, characters, texture LRU
    audio/             procedural Web Audio SFX + generative music
    ui/                layout frame, widgets (Button/Slider/ProgressBar), icons, modals, menus, coach
  platform/          Platform interface + YouTube / iOS / web adapters (the ONLY place for
                     ytgame, Capacitor, storage, locale and ad/IAP SDKs)
  i18n/              string tables (en.json) + loader with fallback
  data/              items, categories (vector shapes), recipes, customers, markets, requests, balance
  assets/            fonts (Nunito, OFL), manifest.json (art swap-in points), items/ (optional art)
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

Sticker peel uses speed-based tearing, glue uses path following and polish weights coverage by gesture
circularity. All of these are pure and unit-tested.

### The wiring repair (`minigames/RepairGame.ts`, `core/repair.ts`, `art/repairArt.ts`)

The wire step is done "for real", and differs per object. `rigFor(category, shape)` says how each item
turns and what is inside:

- **Lamps, globes, trophies, snow globes, record players, typewriters** tip over to show their **base**;
  **radios, TVs, clocks and cameras** spin round to show their **back**; pocket watches and wall clocks have
  a **twist-off case back**.
- Inside is a lamp socket block, a circuit board, a valve chassis (tube radio / TV), a clock movement or a
  battery box, with mains colours (brown / blue / green-yellow) or low-voltage colours.

The flow: turn animation → hold the screwdriver on each screw (or twist the back round) → tap or drag the
cover away → drag each loose wire (stripped copper end) to the brass terminal with the same colour and
symbol (the terminal screw tightens) → the light/valves/screen glow as a test → the cover and screws go
back on and the item turns back. Scoring is the same pure wire puzzle (`makeWirePuzzle`, mistakes cost a
little). Positions are pure (`screwLayout`, `wireLayout`, unit-tested); screw slots and the case back's
grip marks are drawn as lines rather than rotating images (rotated textured quads rendered with a missing
triangle in the workshop stage).

### Big repairs: task modules (`minigames/repair/`)

A rig has a list of **tasks** (`TaskSpec` in `core/repair.ts`). `RepairGame` only orchestrates: turn → open
→ each task in order → test → close. Each task is a module in `minigames/repair/tasks.ts` built on
`RepairTask` (`repair/host.ts`): `init()` places what is there when the cover comes off (a broken part,
bolts, dust), `start()` makes it the current job, plus pointer handlers, `progress()`, `score()` and
`bot()` (the next action for the e2e bot: wait, tap, hold, hold-to-level, drag or circle).

- **wires**: the wire puzzle above. **swap**: drag the broken part (marked !) to the bin, then the new part
  into its slot; a CPU cooler swap adds a thermal-paste stage (hold, stop in the green).
- **pour / drain / paste**: hold on a cap; fill to the green band, or let the old oil run out.
- **bolts**: hold the ratchet on each bolt to undo or tighten it. **hoist**: drag the engine up out of the
  bay on the chain hoist, or lower the new one in. **cables**: plug each motherboard cable or engine hose
  into the socket with the same label and shape (wrong sockets cost a little). **dust**: hold the air can
  over each dust bunny.

Computers and vehicles have a **Repair** (`fix`) step with their own rig (`fixRigFor`). Customer jobs add
two long rigs: a **PC rebuild** (dust, cooler + paste, memory, graphics card, card bolts, five motherboard
cables) and an **engine swap** (drain, 4 bolts out, hoist out, hoist in, 4 bolts in, 4 hoses, oil, coolant,
battery, ignition wiring). All layouts are pure and unit-tested; the score is the product of the task scores.

## Workshops and customer jobs (`core/jobs.ts`)

Workshops are bought in the Upgrades hub: the **Repair Shop** (Corner Store tier), then the **Computer
Workshop** (Vintage Boutique) and the **Car Garage** (Grand Emporium), both needing the Repair Shop.
Each day, `jobOffers` deals deterministic jobs per owned workshop (small repairs, PC rebuilds, engine
swaps). They are taken at the market's **Repair Desk**; a job item goes through the workshop with a repair
recipe (scrub, repair, optional polish) and is never sold: on the reveal the customer pays the fee
(`jobFee`; engine swaps pay the most) plus a tip of up to 20% for great work (`completeJob`). Job items do
not count against shop space.

## Growing the shop

Every way to grow sits behind one **Upgrades** button (Main Menu, Market header, Day Summary), in
`game/ui/upgradesHub.ts`: bigger shop (tiers), decorations, tools and skills. A goal banner shows the
next shop tier with coin and reputation progress (`nextGoal` in `core/progression.ts`). Workshops
(see below) are bought from the same hub.

- **Bigger shops find better items:** `rarityWeights` in `core/market.ts` shifts the rarity odds up with
  the shop tier.
- **Decorations** (`core/decor.ts`, `balance.json` → `decor`): 10 items, unlocked by tier and bought with
  coins. Each one has a small passive effect (price bonus, extra customer, daily reputation, rarer finds,
  hidden gems, better rare-item prices) and is drawn on the shop counter (`game/art/decor.ts`).

## Asset pipeline

**Art style.** Objects (items, the workshop, thumbnails) are drawn smooth and lit: soft light from the
top-left, a shaded bottom, specular spots on glass and metal, thin natural edges and a soft contact
shadow (`shadePart` in `game/art/itemArt.ts`). Characters, icons and UI chrome use a pixel look.

Characters, icons, coins and stars are _authored_ as simple vector shapes and _shown_
as pixel art by one pipeline in `game/art/pixel.ts`:

1. the shapes are drawn into a canvas at 4× the target pixel grid;
2. each 4×4 block becomes one pixel with its most common colour (no muddy blends);
3. a 1-pixel ink outline (only where none exists) and light/shadow rims are added;
4. the bitmap is emitted as solid rectangles into a Phaser Graphics object (`pixelDraw`: characters,
   icons, coins, stars), so every call site that draws into a Graphics stays unchanged.

Bitmaps are cached. Other pieces of the look: stepped pixel corners for every rounded rectangle
(`ui/pixelChrome.ts`, installed at boot), block particles (BootScene), a twinkle background, the
bright palette in `theme.ts` and the Nunito font.

- **Items:** 40 vector shapes in `src/data/categories.json` (rects, ellipses, polygons, lines and arcs in a
  100×100 box, with colour tokens). The 120 items in `src/data/items.json` pick a shape plus body and accent colours.
  `game/art/itemArt.ts` renders them with Canvas 2D at the needed resolution, with soft lighting. The same
  data produces the silhouette masks.
- **Swapping in hand-made art:** put a square transparent PNG or WebP in `src/assets/items/` and map the
  item id to it in `src/assets/manifest.json` (`"items": { "kit_polka_dot_mug": "mug.png" }`).
  `game/art/manifest.ts` loads overrides after `gameReady` (lazy). Silhouettes and paint recolouring
  work automatically, and no code changes are needed.
- **Characters** (Rory the Raccoon and the customers) are drawn from persona data in `game/art/characters.ts`
  and turned into pixel art (cached per persona and mood).
- **Audio** is fully procedural (`game/audio/AudioEngine.ts`), including SFX and three short generative
  music loops. `manifest.json` has `music` slots for future licensed or original tracks
  (see HUMAN_TODO).
- **Font:** Nunito (SIL OFL 1.1), bundled as woff2. No CDN.

## Saving

`src/core/save/` contains the following:

- `schema.ts`: compact JSON `{ v, ... }`. Item instances and requests are stored as tuples, with no derived data
  and no language. Deserialisation tolerates missing or wrong-typed fields and rejects corrupt data with `SaveError`.
- `migrations.ts`: an ordered list of `vN → vN+1` functions. Every shipped version has a fixture in
  `tests/fixtures/saves/`.
- `saveManager.ts`: never writes before `loadData` resolves, writes at most once every 2 s (debounced), and
  forces a write on day end, purchases and pause. It checks UTF-16 well-formedness and the 3 MiB / 500 KiB limits.
  A corrupt save is kept in memory and writing is blocked until the player sees a friendly message.

Current version: **v3**. v2 added `dc` (owned decorations); v3 adds `ws` (owned workshops), `dy[15]`
(today's taken jobs) and an optional job tuple `[fee, persona, kind]` at the end of an item. Older saves
migrate to empty lists.

Saves happen at material progress: after each restoration and each sale (debounced), on purchases
(forced), on day transitions (forced) and on platform pause (forced).

## Robustness on phones

- **Frame guard** (`guardLoop` in `game/bootGame.ts`): Phaser requests the next animation frame only
  after the current one returns, so one uncaught exception would stop the game for good (a frozen
  picture). The frame callback is wrapped and errors are logged through the platform. If frames keep
  failing, the game repairs itself in steps: hide objects whose texture was removed, then restart the
  current scene (it rebuilds from the saved state), and only if that fails straight away, go to the
  main menu. The playtest build also shows the error text on screen so testers can screenshot it.
- **Thumbnail cache** (`game/art/textures.ts`): the LRU never evicts a texture that any object in the
  scene still shows, including objects inside containers.
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
