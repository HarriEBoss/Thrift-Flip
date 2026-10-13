# Thrift Flip

A cozy, all-ages "buy junk, restore it, sell it" game that grows into a repair empire reaching the
stars. One TypeScript + Phaser 4 codebase ships as a **YouTube Playables** HTML5 bundle, **iOS** and
**Android** apps (Capacitor) and a public **web** release.

```bash
npm ci
npm run dev             # local browser dev (web adapter: localStorage, simulated ads/IAP; F9/F10 = pause/resume)
npm run check           # lint, typecheck, unit tests (coverage), YouTube build + bundle checks, e2e
npm run build:youtube   # dist-youtube/ + thrift-flip-youtube.zip
npm run build:ios       # dist-ios/ + cap sync -> open ios/App/App.xcodeproj in Xcode 26+
npm run build:android   # dist-android/ + cap sync -> open android/ in Android Studio (SDK 36)
npm run build:site      # dist-site/ + thrift-flip-web.zip: the public web release (no ads, no purchases)
npm run build:playtest  # one self-contained HTML page for playtesting (pretend ads and store)
npm run simulate        # balance simulation (writes docs/BALANCE.md with --write)
npm run screenshots     # after build:e2e: App Store + Google Play screenshots, Play feature graphic, YouTube key art
```

Docs: [ARCHITECTURE](docs/ARCHITECTURE.md) · [PROGRESS](docs/PROGRESS.md) · [BALANCE](docs/BALANCE.md) ·
[HUMAN_TODO](docs/HUMAN_TODO.md) · [SUBMISSION_YOUTUBE](docs/SUBMISSION_YOUTUBE.md) ·
[SUBMISSION_IOS](docs/SUBMISSION_IOS.md) · [SUBMISSION_ANDROID](docs/SUBMISSION_ANDROID.md) · [PRIVACY_POLICY (draft)](docs/PRIVACY_POLICY.md) ·
[STORE_LISTING](docs/STORE_LISTING.md)
