# Thrift Flip

A cozy, kid-friendly (all ages) "buy junk, restore it, sell it" game. One TypeScript + Phaser 4 codebase
ships as a **YouTube Playables** HTML5 bundle and an **iOS** app (Capacitor).

```bash
npm ci
npm run dev             # local browser dev (web adapter: localStorage, simulated ads/IAP; F9/F10 = pause/resume)
npm run check           # lint, typecheck, unit tests (coverage), YouTube build + bundle checks, e2e
npm run build:youtube   # dist-youtube/ + thrift-flip-youtube.zip
npm run build:ios       # dist-ios/ + cap sync -> open ios/App/App.xcodeproj in Xcode 26+
npm run simulate        # balance simulation (writes docs/BALANCE.md with --write)
npm run screenshots     # after build:e2e: App Store screenshots + YouTube key art in dist-store/
```

Docs: [ARCHITECTURE](docs/ARCHITECTURE.md) · [PROGRESS](docs/PROGRESS.md) · [BALANCE](docs/BALANCE.md) ·
[HUMAN_TODO](docs/HUMAN_TODO.md) · [SUBMISSION_YOUTUBE](docs/SUBMISSION_YOUTUBE.md) ·
[SUBMISSION_IOS](docs/SUBMISSION_IOS.md) · [PRIVACY_POLICY (draft)](docs/PRIVACY_POLICY.md) ·
[STORE_LISTING](docs/STORE_LISTING.md)
