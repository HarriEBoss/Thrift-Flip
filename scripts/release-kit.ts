/**
 * Assembles the publishing pack handed to whoever publishes the game:
 *
 *   npm run build:youtube && npm run build:site && npm run build:e2e && npm run screenshots
 *   npx tsx scripts/release-kit.ts
 *
 * Output: thrift-flip-release-kit.zip with
 *   START-HERE.md                    what is in the pack and the order to do things in
 *   1-builds/                        YouTube Playables zip, web release zip, source snapshot (for the app builds)
 *   2-store-assets/                  screenshots, icons, feature graphic, YouTube key art
 *   3-listing-and-checklists/        store copy, per-store submission checklists, accounts/keys to-do, privacy policy draft
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const OUT = 'thrift-flip-release-kit.zip';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const tree: Zippable = {};
const missing: string[] = [];

function add(from: string, to: string): void {
  if (!existsSync(from)) {
    missing.push(from);
    return;
  }
  if (statSync(from).isDirectory()) {
    for (const f of readdirSync(from)) add(join(from, f), `${to}/${f}`);
    return;
  }
  tree[to] = [readFileSync(from), { level: 9 }];
}

// 1. Builds.
add('thrift-flip-youtube.zip', '1-builds/youtube-playables/thrift-flip-youtube.zip');
add('thrift-flip-web.zip', '1-builds/web/thrift-flip-web.zip');
// The app builds need Xcode (iOS) and Android Studio (Android): ship the exact source they come from.
const source = execFileSync('git', ['archive', '--format=zip', 'HEAD'], { maxBuffer: 1 << 30 });
tree['1-builds/app-source/thrift-flip-source.zip'] = [source, { level: 0 }];

// 2. Store assets.
add('dist-store/ios-iphone-6.9', '2-store-assets/app-store/iphone-6.9');
add('dist-store/ios-ipad-13', '2-store-assets/app-store/ipad-13');
add('assets/icon-only.png', '2-store-assets/app-store/icon-1024.png');
add('dist-store/android-phone', '2-store-assets/google-play/phone');
add('dist-store/android-tablet', '2-store-assets/google-play/tablet-10');
add('dist-store/google-play/feature-graphic.png', '2-store-assets/google-play/feature-graphic-1024x500.png');
add('dist-store/google-play/icon-512.png', '2-store-assets/google-play/icon-512.png');
add('dist-store/youtube', '2-store-assets/youtube-playables');

// 3. Listing copy and checklists.
for (const [doc, name] of [
  ['docs/STORE_LISTING.md', 'store-listing-copy.md'],
  ['docs/HUMAN_TODO.md', 'accounts-keys-and-todo.md'],
  ['docs/SUBMISSION_YOUTUBE.md', 'checklist-youtube-playables.md'],
  ['docs/SUBMISSION_IOS.md', 'checklist-app-store-ios.md'],
  ['docs/SUBMISSION_ANDROID.md', 'checklist-google-play-android.md'],
  ['docs/PRIVACY_POLICY.md', 'privacy-policy-DRAFT-needs-legal-review.md'],
] as const)
  add(doc, `3-listing-and-checklists/${name}`);

tree['START-HERE.md'] = [
  new TextEncoder().encode(`# Thrift Flip ${pkg.version}: publishing pack

Built ${new Date().toISOString().slice(0, 10)} from commit ${execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim()}.

## What is ready
| Platform | State | What to upload |
|---|---|---|
| YouTube Playables | Ready to upload | \`1-builds/youtube-playables/thrift-flip-youtube.zip\` |
| Web (itch.io, own site, GitHub Pages) | Ready to upload | \`1-builds/web/thrift-flip-web.zip\` (no ads, no purchases) |
| iOS App Store | Project ready; needs a Mac with Xcode 26+, an Apple Developer account, signing, ad and purchase keys | build from \`1-builds/app-source\` |
| Google Play | Project ready; needs Android Studio, a Play Console account, an upload key, ad and purchase keys | build from \`1-builds/app-source\` |

## Order of work
1. Accounts: Apple Developer Program, Google Play Console, YouTube Playables portal, AdMob, RevenueCat
   (\`3-listing-and-checklists/accounts-keys-and-todo.md\`).
2. Privacy policy: legal review of the draft, then host it at a permanent URL.
3. YouTube Playables: upload the zip, fill in the listing, run Google's test suite
   (\`checklist-youtube-playables.md\`).
4. Web: upload \`thrift-flip-web.zip\` to itch.io as an HTML5 game (or unzip it on any web host).
5. iOS: \`checklist-app-store-ios.md\`. Android: \`checklist-google-play-android.md\`. Both start with putting
   the real ad and purchase keys into the config files named there, then building on the right machine.

## Store assets
\`2-store-assets/\` has every screenshot, icon and banner in the sizes each store asked for when this pack
was made. Check each store's current size rules before uploading. Text for every listing is in
\`3-listing-and-checklists/store-listing-copy.md\`.
`),
  { level: 9 },
];

if (missing.length) {
  console.error('Missing (build them first):\n  ' + missing.join('\n  '));
  process.exit(1);
}
const zip = zipSync(tree);
writeFileSync(OUT, zip);
console.log(`Wrote ${OUT} (${(zip.length / 1024 / 1024).toFixed(1)} MiB, ${Object.keys(tree).length} files)`);
