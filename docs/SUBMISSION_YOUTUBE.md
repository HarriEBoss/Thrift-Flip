# YouTube Playables submission checklist

Build: `npm run build:youtube` produces `dist-youtube/` and `thrift-flip-youtube.zip`. The build runs
`scripts/check-youtube-bundle.ts` and fails on any MUST violation.

> Re-read the official pages before every submission: they change, and this build environment
> could not fetch them directly (requirements were verified through search snippets of the official
> pages on 2026-10-02):
> - <https://developers.google.com/youtube/gaming/playables/certification/requirements>
> - <https://developers.google.com/youtube/gaming/playables/reference/sdk>

Legend:
- **A**: automated (unit test, e2e test or bundle checker); the test is named.
- **M**: manual check before submission.

## Integration

| Requirement | How it is met | Verified by |
|---|---|---|
| `index.html` at bundle root | Vite output | A: bundle checker |
| SDK `<script src="https://www.youtube.com/game_api/v1">` before any game code | Injected first in `<head>` by the `platformHtml` Vite plugin (youtube mode only) | A: bundle checker ("first `<script>`") |
| `firstFrameReady()` once a loading screen with visible progress is showing | `src/main.ts`: the HTML boot screen (progress bar + %) is painted (2× rAF), then `notifyFirstFrame()` | A: `readiness.spec.ts` |
| `gameReady()` only when interactive, never during splash/loading | `MainMenuScene.markReady()` on the first `POST_RENDER` of the main menu, after the loader is hidden | A: `readiness.spec.ts` (order, exactly once) |
| `IN_PLAYABLES_ENV` + `typeof ytgame` only in the adapter | `src/platform/youtube/YouTubePlatform.ts` | A: ESLint `no-restricted-globals/properties` outside `src/platform` |
| Save only via `saveData`/`loadData`; `loadData` awaited before any `saveData` | `SaveManager` writes only after `load()`; the adapter also awaits its load promise | A: `readiness.spec.ts` (`afterLoad`), unit `save.test.ts` |
| Save at material progress + on `onPause` | After each restoration and sale (debounced ≤1 per 2 s); forced on day end, purchases and upgrades, and pause | A: `certification.spec.ts` (save on pause), unit tests |
| No localStorage / IndexedDB / cookies in the YouTube build | Storage only in the platform adapters; Phaser's localStorage probe removed at build time | A: ESLint + bundle checker forbidden-API scan |
| Save string well-formed UTF-16, < 3 MiB (target < 500 KiB); small exit save | `isWellFormed()` checked before write; size limits enforced; a maxed late-game save is ~6 KiB | A: `save.test.ts` (late-game < 500 KiB), `youtube.spec.ts` |
| Saves from every previous version load | Versioned schema + `migrations.ts`; fixtures in `tests/fixtures/saves/` | A: `save.test.ts` "every shipped schema version has a fixture" |
| `sendScore`: single consistent integer dimension; best sent = best stored | Lifetime profit (floored integer); sent only when it beats `bestScore`, which is stored in the save | A: `youtube.spec.ts` |
| Audio: init from `isAudioEnabled`, follow `onAudioEnabledChange`; muted means no audio; sliders can't override | `AudioEngine.setPlatformEnabled` sets master gain 0 and suspends the context | A: `certification.spec.ts` (audio disabled) |
| No overall in-game mute button on YouTube | `capabilities.masterMute = false`; separate Music/SFX sliders only | A: `certification.spec.ts` (`mute` not present) |
| No unexpected sounds | AudioContext only created after a user gesture; music only after `gameReady` | M: listen on device |
| Pause: stop loop, tweens, timers, audio, input, rendering, and save; resume only on `onResume` | `game.loop.sleep()`, input disabled, context suspended, music stopped, forced save | A: `certification.spec.ts` (frame counter frozen, context suspended, saveData) |
| No Page Visibility API | Phaser's `VisibilityHandler` stripped by `phaserSanitize` | A: `readiness.spec.ts` (no `visibilitychange` listener), bundle checker |
| Language only from `getLanguage()`; never stored | `session.init` → `setLanguage(platform.getLanguage())`; schema has no language field | A: `save.test.ts` "never stores language", ESLint (`navigator.language` banned) |

## Design

| Requirement | How it is met | Verified by |
|---|---|---|
| Responsive 9:32 … 32:9, live resize without losing state, letterbox/pillarbox | Logical frame system (`ui/layout.ts`); objects are repositioned, never recreated | A: `layout.test.ts` (all 9 ratios), `certification.spec.ts` (resize through 9 ratios mid-scrub keeps progress) |
| Never lock orientation | No `lockOrientation` anywhere; both orientations have layouts | A: grep in review; M |
| Touch AND mouse everywhere; keyboard for menus; Esc closes modals and is never `preventDefault`-ed | Phaser pointer events; Tab/arrows/Enter focus navigation; Esc handler | A: `loop.spec.ts` (mouse-only and touch-only full loop), `certification.spec.ts` (Esc on every modal, `defaultPrevented === false`, touch-only menus) |
| Haptics toggle | Settings → Vibration (shown where haptics exist) | M (iOS) |
| Crisp at all resolutions and DPRs | Canvas at DPR (cap 3), vector graphics, text resolution follows scale, item textures sized to device pixels | M: screenshots at DPR 1/2/3 (`npm run screenshots`) |
| No exit button, sharing prompts, external links, QR-like graphics, ToS, login, or personal-info prompts | None exist; external links and the store hidden through `capabilities` | A: bundle checker (no absolute URLs except SDK and XML namespaces); `i18n.test.ts`; M: UI review |
| No icons resembling YouTube close/mute/menu near those controls | No ✕, speaker or hamburger icons. The home button is a house icon at bottom-left; settings is a text button | M |
| Clear "no more content" state | `CompleteScene` ("You've flipped it all! … no more new stuff to unlock"), shown once; endless play after | A: `content.spec.ts`, `catalog.test.ts` |

## Privacy & code

| Requirement | Verified by |
|---|---|
| No network calls except the SDK; no CDN fonts, analytics or remote config | A: every e2e test records requests and asserts no external ones; bundle checker absolute-URL scan; font bundled (woff2) |
| No clipboard access | A: ESLint + bundle checker |
| Single Page Application | Vite SPA; one `index.html` |
| Minified, not obfuscated; no WASM, eval, `new Function` or Workers | A: bundle checker; Phaser's `new Function` fallback stripped at build time |

## Stability & bundle (current numbers)

| Requirement | Current | Verified by |
|---|---|---|
| Initial download (until `gameReady`) < 30 MiB (target < 5 MiB) | ~1.6 MiB | A: bundle checker (manifest walk) |
| Total < 250 MiB (target < 15 MiB) | ~1.6 MiB, 7 files | A: bundle checker |
| Every file < 30 MiB (target < 512 KiB) | Largest: Phaser chunk ~1.34 MiB (warning: one pre-bundled module; cannot be split) | A: bundle checker |
| ≤ 8000 files, `[A-Za-z0-9._-]` names, relative paths | 7 files, `base: './'` | A: bundle checker |
| Interactive < 5 s on a mid-range phone | ~1.5 s to menu in CI on software rendering | M: test on a real mid-range Android + iPhone |
| Peak JS heap < 512 MB (target < 200 MB) | well under 200 MB in e2e | A: `certification.spec.ts`; M: DevTools memory profile during a 30-min session |
| Works in Chrome, Safari, Firefox, Edge, YouTube app (Android/iOS) | Chromium automated | M: run the official Playables test suite + the YouTube app on both OSes |

## Ads (YouTube-provided only)

- **Rewarded:** `ytgame.ads.requestRewardedAd(id)` with hard-coded ids:
  `appraiser-tip`, `double-day-earnings`, `market-reroll`, `premium-tool-once`, `free-gift`, `sale-tip`.
  Rewards are granted only on `true`; otherwise the player sees "No ad available right now". (A: `youtube.spec.ts`)
- **Interstitial:** `ytgame.ads.requestInterstitialAd()` only on the Day Summary → next day transition.
  Never before day 3, at most 1 per 3 min of play, never during a mini-game, the tutorial or a purchase. It never grants anything.
  (A: `youtube.spec.ts`, `misc.test.ts`)
- Audio is suspended while an ad shows and restored afterwards; platform pause/resume still applies.
- **Human step:** enable monetization (ads) for the game in the Playables Developer Portal.
- No IAP UI exists in this build (`capabilities.iap = false`). The game is balanced without purchases (see `docs/BALANCE.md`).

## Manual pre-submission steps

1. `npm run check`. Everything must be green.
2. Upload `thrift-flip-youtube.zip` to the Playables Developer Portal test environment.
3. Run Google's **Playables test suite** and the **bundle analyzer** from the portal; fix anything they report.
4. Play a full session in the YouTube app on Android and iOS: mute/unmute from YouTube, background the app
   (pause and resume), rotate the device, resize on desktop, and exercise rewarded and interstitial ads.
5. Confirm the save persists across sessions in the real environment.

## Trust & safety / metadata (for the Developer Portal)

- **Audience:** general audience (13+). Bright, friendly, all-ages art, but **not made for kids**. Do not use
  "for kids/children" wording or child-directed marketing in any metadata.
- **IP:** all items are generic (no real brands); all art and audio are original or generated in code; the font is
  Fredoka (OFL). No logos or branding in the title, thumbnails or description.

### Title (max length per portal; verify)
**Thrift Flip**

### Short description
Buy dusty junk, scrub it, fix it and make it sparkle, then sell it in your own little shop!

### Description
Hunt for treasure at flea markets, car boot sales and auctions. Back in your workshop, scrub off the
grime, brush away rust, peel stickers, glue cracks, sand, paint, polish and fix wires with quick,
satisfying touch mini-games. Drag the slider for the big before-and-after reveal, then set your
price and sell to quirky customers. Grow from a flea stall into a grand emporium, fill your sticker
book with 120 collectibles, spot hidden gems, and take on the Daily Fix.

### Genre
Casual / Simulation (pick the closest portal categories, e.g. "Casual" + "Simulation" or "Puzzle").

### Thumbnails / key art
`npm run build:e2e && npm run screenshots` writes text-free key art (before/after split + mascot) to
`dist-store/youtube/` in 16:9 (1920×1080), 1:1 (1080×1080) and 9:16 (1080×1920). **Check the portal's current
required sizes and aspect ratios** and re-render with the matching viewport in `scripts/screenshots.ts`.

### Accessible Games Initiative tags (verify exact names and criteria at accessiblegames.com before claiming)
Candidates that match implemented features:
- **Clear Text / Adjustable text size**: large rounded font by default plus a "Bigger text" option.
- **Colour alternatives**: information is never conveyed by colour alone (symbols and text on paint swatches and
  wires, ON/OFF labels, rarity stars plus labels) plus a colour-blind paint palette.
- **Playable without audio**: every audio cue has a visual counterpart.
- **Reduced motion**: option for fewer particles and no slide-in animations.
- **Save anytime / autosave**: the game saves automatically at every meaningful step and on pause.
- **No time pressure** for the core loop (mini-games have no fail timers; only the optional Auction Night has a short
  bidding timer).
Only claim tags whose official criteria the build fully meets.
