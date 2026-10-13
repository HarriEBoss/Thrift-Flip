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

**Detailed assembly** (`core/assembly.ts` layouts and rules, `repair/assembly.ts` tasks): a chip
`socket` (open the lever, turn the chip to its corner mark, drop it in, lock), `torque` sequences
with stamped numbers (cross for a cooler, centre-out for an engine, star for a nozzle; snug in order,
then torque each to the green on the gauge, past it strips the bolt), `ram` (latches, notch, slot
A2, press until it clicks), the front-panel `header` (switch and LED plugs, LED polarity), the
serpentine `belt` (route it from the under-hood diagram, then the tensioner), `servo` centring and
the fuel line `leak` test (pressurise, find the bubbling fitting, tighten). Magnified panels fade
away when their job is done.

**Car repairs** (`core/carRepair.ts` rules, `repair/carTasks.ts` tasks): `obd` (scanner, trouble
code from the rig via `troubleCode`), `plugs` (one misfiring cylinder or all four: coil, plug out,
gap, in, torque), `battery` (terminal order, `fit` for a new build), `filter` (oil filter with the
gasket step), `fuse` (seeded fuse box: legend, test light, matching amps) and `unplug` (phone
battery connector first). Cables marked `last` only go in once everything else is connected, and
glued phone backs get a `pry` phase in `RepairGame` after the heat.

A custom design contract is **built**, not repaired: its recipe is Design → **Build** → Polish, and the
Build step uses a build rig (`buildRigFor`, `rig.build`). The frame starts open and empty (no screws to
undo), every `swap` is a `fit` (an empty mount, just put the new part in), then bolts, cables and fluids,
and finally the cover and its screws go on.

**How it looks.** Cables and hoses are drawn by `repair/cableArt.ts` with a look per cable id: ATX 24-pin,
EPS and PCIe bundles of coloured wires into latched housings, flat SATA power, twisted front-panel pairs,
amber phone flex ribbons with board-to-board plugs, servo leads, a grey IDC ribbon, an XT60 battery lead,
rubber hoses with worm-drive or spring clamps (a corrugated air duct), and braided steel rocket lines with
AN fittings. Loose wiring comes out of a stripped multicore sheath; mains cores end in twisted copper and
low-voltage ones in crimped ring terminals on a barrier strip.

## Company and business ladder (`core/empire.ts`, `core/names.ts`, `core/jobs.ts`)

**Company name.** On first play (and once for older saves) `NameScene` asks for a company name: three
word wheels from kid-safe lists (`src/data/names.json`) with a shuffle, or an in-game keyboard (Phaser
buttons, no browser text box, so it behaves the same on YouTube and iOS). Typed names are tidied
(`cleanName`, max 20 characters) and checked by `checkName` against `src/data/blocklist.json`: `word`
entries must match a whole word (so "Classic" is fine), `part` entries are rejected anywhere after
removing spaces, look-alike characters and stretched letters. A rejected name is never shown back. The
name shows on the shop sign, the main menu, the business ladder and job cards. Rename from Settings
(main menu only).

**Business ladder** (data: `balance.json` → `empire.businesses`, typed in `core/types.ts`). Each entry
has `capital` (savings needed), `spendPct` (share spent to open it), `income` (daily income once
managers exist), `needs` (previous business, shop size) and `jobs` (what customers bring, how many a day,
fee curve, optional item shapes). Today: Reselling Shop (the original game, whose 5 shop sizes are its
levels) → Phone Repair → Computer Repair → Mechanic → Robotics Lab → Rocket Repair. Adding a rung is a
JSON entry plus i18n keys (`biz.*`, `bizDesc.*`); categories that only come in as jobs set `business` in
`categories.json` (robots, rockets) and are never at markets.

- `businessStatus`: owned / locked (needs unmet) / saving (still saving the capital) / available.
  `openBusiness` spends `openCost`. `nextBusinessGoal` feeds the goal banner once the shop is at its top
  size. The Upgrades hub has a "Your businesses" row with the ladder.
- **Where you work today:** the market's top-left button ("Work at", from the second business on) picks
  the business for the day, before buying or taking jobs (`setCurrentBusiness`). At the Reselling Shop
  the day is market → workshop → shop. At a repair business the market becomes a **job board**
  (`businessOffers`): take jobs, fix them in the workshop, the customers pay on the reveal
  (`completeJob`, fee plus a tip for great work), then straight to the summary.
- Job ids are stable per day (ladder index × 10 + slot), so taking a job survives saves. Job items do not
  count against shop space and are never sold.

### Contracts, marketing and custom engineering

- **Contracts** (`core/jobs.ts`, numbers in `business.contract` and `empire.contracts`): every offer is a
  contract between your company and a client (a customer, or a client company for bigger work). It has a
  difficulty (1–5 stars: pay × (1 + payPerStar × (stars − 1)), one star more once you own a bigger
  business), a quality the client wants (reveal stars; missing it pays `belowTarget` of the fee, no tip,
  no reputation) and may be a **fleet order** of 2–3 items (pay per item, plus `fleetBonus` per extra
  item). The signing screen shows the parties, the work, difficulty, quality wanted and pay. Job items
  carry `t` (target) and `c` (client company).
- **Marketing** (`core/marketing.ts`, `empire.marketing`): campaigns (flyers → radio → TV → billboards →
  web → satellite ads, each needing a business) cost coins and add brand points, once a day each. Brand
  gives a flow multiplier `1 + flowMax × (1 − e^(−brand / flowK))`, so returns diminish. It multiplies
  contract offers per job type (up to 4) and adds shop customers (half the bonus, up to 10 a day). The
  brand fades by `decay` every night. Upgrades hub → Marketing.
- **Custom engineering** (`core/design.ts`, `src/data/designs.json`, `minigames/DesignGame.ts`): your
  biggest business (from Computer Repair on) offers one design contract a day. Its recipe is
  design → repair → polish. The design step is a blueprint: tap a slot, pick one of three parts; gauges
  show power (speed, strength or thrust), weight and cost against the client's spec. `makeSpec` builds
  the spec from a hidden mixed design and loosens it a little, so it can always be met but the strongest
  parts are too heavy or too pricey. `solveDesign` finds a solution (bot and tests). It pays
  `designPay` (about 2× a normal contract).

## Growing the shop

Every way to grow sits behind one **Upgrades** button (Main Menu, Market header, Day Summary), in
`game/ui/upgradesHub.ts`: bigger shop (tiers), decorations, tools and skills. A goal banner shows the
next shop tier with coin and reputation progress (`nextGoal` in `core/progression.ts`), then the next
business. The business ladder (see below) is opened from the same hub.

- **Bigger shops find better items:** `rarityWeights` in `core/market.ts` shifts the rarity odds up with
  the shop tier.
- **Decorations** (`core/decor.ts`, `balance.json` → `decor`): 10 items, unlocked by tier and bought with
  coins. Each one has a small passive effect (price bonus, extra customer, daily reputation, rarer finds,
  hidden gems, better rare-item prices) and is drawn on the shop counter (`game/art/decor.ts`).

### Managers and branches (`core/managers.ts`, `empire.managers`)

Once you own the top of the ladder (`managers.unlock`, Rocket Repair), Upgrades → Managers & branches lets
you hire a manager for any business you own and train them through efficiency levels (50% → 110%), and
open extra branches of any business. Each day you are not working at a managed business, it pays
`income × shops × efficiency × brand flow`, minus a wage (`wagePct`), when the day ends (`payManagers`
in `advancePhase(…, 'summary')`); the summary shows "Managers earned". Hiring costs the business capital ×
`hireCost`, each training level × `upgradeGrowth` more; each branch costs `branchCost × branchGrowth^n`
of the capital. Income grows linearly with branches while their cost grows exponentially: a repeatable
loop that keeps scaling without ever running out.

### Global expansion (`core/regions.ts`, `empire.regions`, regional markets in `markets.json`)

From the top of the ladder (`regions.unlock`), Upgrades → World expansion shows a world map with seven
regions (North America, South America, Europe, Africa, Asia, Oceania, Antarctica). Each region: pay
`cost` to open an office (`openRegion`), which puts a **flagship contract** (a 5-star custom design for
`client`, pay = design pay × `flagshipPay`) on the job board of business `biz` (slots 9, 8, 7 of that
board; never offered while one is in the workshop). Delivering it at the quality wanted conquers the
region (`completeJob` → `conquerRegion`). Conquered regions add permanent bonuses (`regionFx`: shop
prices in `instanceValue`, contract pay in `businessOffers`, manager income in `dailyIncome`) and open
the region's own market: a `markets.json` entry with `region` and `cats` (it only offers those
categories). `allRegionsWon` gates space (Phase 5).

### Space and the Dyson project (`core/space.ts`, `empire.space`, `ui/spaceMenus.ts`)

Once every Earth region is conquered (`spaceUnlocked`), Upgrades → Space program opens three screens:

- **Research** (`empire.space.tech`): a tech tree (reusable rockets → life support → habitats; space
  mining → ion drive → deep-cold tech / heat shields → Dyson swarm). One at a time; it costs coins and
  takes `days` in-game days (`startResearch`, ticked by `spaceDay` at the end of each day).
- **Colonies** (`empire.space.bodies`): the Moon (optional), Mars, the asteroid belt, Europa, Titan and
  Mercury, each needing technologies and the colony before it. A colony harvests its material
  (`rate` a day: helium-3, Mars dust, nickel-iron, ice, methane, solar silicon) and pays `income` a day.
  Each colony also sends a daily repair contract (rovers, landers, drones; ids 100+) to the top
  business's board; delivering it ships `rate × contract.reward` extra material home.
- **Dyson project** (`empire.space.dyson`): stage n needs `coins × n` and `materials[m] × n`; each built
  stage sells `energy` coins a day. Ten stages harvest the whole Sun (`dysonDone`), the end of the race
  and the trigger for prestige.

All space numbers live in `balance.json` → `empire.space`, the one place to tune the long game.
`scripts/simulate.ts` plays a long run (`LONG_DAYS`, `LONG_BOTS`) and reports the median day and play
time of every milestone in `docs/BALANCE.md`. Big numbers are shown short (`ui/format.ts`: 23.5M).

### Prestige and the legacy tree (`core/prestige.ts`, `core/skilltree.ts`, `ui/prestigeMenus.ts`)

When the whole Sun is harvested (`canPrestige`), the Dyson screen and the Legacy tree offer a prestige.
`prestige(state)` returns a fresh run (new seed) that keeps the company name, prestige count, tokens and
nodes, settings, catalog, purchases (`owned`, `perks`), decorations, lifetime stats and the daily
challenge; everything else starts again. The n-th prestige gives n tokens (`tokensFor(n) = n`, so n
prestiges give `totalTokens(n) = n(n+1)/2`). It also records the fewest days a run took (`best`).

Tokens buy nodes of the **legacy tree** (`balance.json` → `empire.prestige.nodes`: `{ id, branch, cost,
req[], fx, pos }`, branches Money, Growth, Brand, Team and Space). `prestigeFx(state)` adds up the bonuses
of the nodes owned and the rest of the game asks it: `income` (sales, contracts, managers, colonies),
`fees` (contracts), `discount` (business capital and opening, managers, branches, regional offices,
colonies; capped by `maxDiscount`), `marketing` and `loyal` (brand gain and fade), `managers` and `wages`,
`research` (tech cost and days), `harvest`, `dyson`, and the head start of the next run (`startCoins`,
`startBiz`, applied by `applyHeadStart`). `pos` places a node on the tree map (the tablet, phase 7).
The balance bot plays prestige runs too and reports them in `docs/BALANCE.md`.

### The tablet (`scenes/TabletScene.ts`, `core/tablet.ts`)

A tablet button at the right end of the HUD (every game screen, once the first day is done) launches
`TabletScene` over the current scene, which is paused until the tablet is put away (✕, Esc, or Esc
twice from an app). It is a generic dark device (rounded bezel, camera dot, status bar with the day,
company name and a battery): no real brand, logo or icons. The home screen has two apps:

- **Legacy tree**: the skill tree as a map. `treeLayout` places nodes from their `pos` (turned so
  branches run down a tall screen), with gold links between owned skills. Tap a node to see its effect,
  needs and cost in the info panel and buy it; prestige from here when the run is finished.
- **Solar system**: the Sun with its Dyson swarm ring (built stages lit), Earth with the Moon, and
  every colony body on its orbit (`orbitRadius` spreads the orbits out; `orbitAngle` gives each a
  fixed start per save and a slow drift, stopped with Reduced Motion). Founded colonies have a flag,
  bodies ready to colonise a pulsing gold ring, locked ones a padlock. Tap a body for its material,
  harvest and income, needs or cost, and found the colony; tap the Sun to open the Dyson project.

Both maps pan (drag) and zoom (+/− buttons, mouse wheel). Phaser 4 has no simple clip mask, so the
maps clip their own drawing to the map area (`clipSegment`, nodes and bodies hidden outside it). On
wide screens the info panel sits beside the map, on tall ones under it.

### Gold Bars, time skips and the store (`core/gold.ts`, `core/timeskip.ts`, `core/store/`, `game/store.ts`)

**Gold Bars** are the premium currency (`state.gold`, all numbers in `balance.json` → `empire.gold`).
They are earned by playing (`earnGold`: opening a business, conquering a region, founding a colony,
building a Dyson stage, a perfect contract, a 3-star daily challenge, every prestige) and kept through
prestiges. The tablet's **Gold Bars** app spends them:

- **Time skips** (`skipDays`): 1, 3 or 7 days pass at the start of a day. Each day runs the same
  `endOfDay` code as a real one (managers, research, colonies, the Dyson project, decorations) with
  `away` set, so every managed business pays (you are not working at any), then the next day starts.
- **Tools early** (`unlockEarly`): a tool before your shop size, for `base + perTier × sizes to go`
  Gold Bars and no coins.
- **More** (`core/goldShop.ts`, `empire.gold.shop`): finish the research in progress now (bars per day
  to go), cargo runs of a founded colony's material, a brand boost (once a day), new market stock,
  golden tools for the next item, and golden decorations (`gold` price in `balance.json` → `decor`).
  The app shows them in tabs: Time, Boosts, Space, Shop and Get.

**The store** is mock-only and isolated behind an interface. `core/store/payments.ts` defines
`PaymentProvider` (`prices()`, `buy()`); `StoreService` lists the Gold Bar packs and grants them only
after `buy` returns success. `game/store.ts` picks the provider: the platform's own store where
`capabilities.iap` (iOS StoreKit via RevenueCat; the web dev build's mock), `MockPaymentProvider`
where `capabilities.mockPurchases` (the playtest: pretend purchases after a "no money is paid"
confirmation), and none on YouTube (no purchases of any kind: the packs are not shown and Gold Bars
only come from playing). Wiring in a real payment provider means implementing `PaymentProvider`.

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

Current version: **v10** (v10 adds `gb`: `[Gold Bars, earned by playing]`; v9 added `pr`: `[prestiges, tokens, nodes, best run in days]`; v5 added `br`, the brand, `dy[16]`, today's campaigns, and the job tuple's
quality target and client company; v6 added `mg` managers, `bn` branches and today's manager takings;
v7 added `rg` regions and the job tuple's region; v8 adds `sp`, the space program, and the job
tuple's colony). v2 added `dc` (owned decorations); v3 added `ws` (owned workshops), `dy[15]`
(today's taken jobs) and an optional job tuple `[fee, persona, kind]` at the end of an item; v4 adds `cn`
(company name), `bz` (`[owned businesses, today's business]`) and `fl.nm` (named), and drops `ws`: the
Repair Shop becomes Phone Repair, the Computer Workshop Computer Repair and the Car Garage Mechanic.

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
