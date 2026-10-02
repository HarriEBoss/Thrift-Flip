/**
 * YouTube Playables bundle checker. Run after `vite build --mode youtube`.
 * Fails (exit 1) on any MUST violation; prints warnings for SHOULD targets.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIR = process.argv[2] ?? 'dist-youtube';
const SDK = 'https://www.youtube.com/game_api/v1';
const MiB = 1024 * 1024;
const KiB = 1024;

const errors: string[] = [];
const warnings: string[] = [];

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIR)) {
  console.error(`No build output at ${DIR}`);
  process.exit(1);
}

// ---- boot manifest (written by Vite) -> initial download estimate ----
const manifestPath = join(DIR, '.vite', 'manifest.json');
type Chunk = {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
  isEntry?: boolean;
  name?: string;
};
let manifest: Record<string, Chunk> | null = null;
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  rmSync(join(DIR, '.vite'), { recursive: true, force: true });
} else warnings.push('No Vite manifest found; initial-size estimate uses all files.');

const files = walk(DIR);
const rel = (p: string) => relative(DIR, p).split('\\').join('/');

// ---- structure ----
if (!existsSync(join(DIR, 'index.html'))) errors.push('index.html missing at bundle root');
if (files.length > 8000) errors.push(`Too many files: ${files.length} (max 8000)`);
let total = 0;
for (const f of files) {
  const r = rel(f);
  const size = statSync(f).size;
  total += size;
  for (const part of r.split('/')) {
    if (!/^[A-Za-z0-9._-]+$/.test(part)) errors.push(`Bad filename characters: ${r}`);
  }
  if (size >= 30 * MiB) errors.push(`File too large (>= 30 MiB): ${r}`);
  else if (size > 512 * KiB)
    warnings.push(`File above 512 KiB target: ${r} (${(size / KiB).toFixed(0)} KiB)`);
}
if (total >= 250 * MiB) errors.push(`Total bundle too large: ${(total / MiB).toFixed(2)} MiB`);
else if (total > 15 * MiB) warnings.push(`Total bundle above 15 MiB target: ${(total / MiB).toFixed(2)} MiB`);

// ---- index.html: SDK must be the first script ----
const html = existsSync(join(DIR, 'index.html')) ? readFileSync(join(DIR, 'index.html'), 'utf8') : '';
const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
if (!scripts.length || !scripts[0].includes(`src="${SDK}"`)) {
  errors.push(`The YouTube SDK <script src="${SDK}"> must be the first <script> in index.html`);
}

// ---- absolute URLs + forbidden APIs in text output ----
// Non-network strings that legitimately appear in Phaser (XML namespaces, an unused console banner).
const URL_ALLOW = [SDK, 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io'];
const FORBIDDEN: Array<[RegExp, string]> = [
  [
    /\blocalStorage\s*\.\s*(getItem|setItem|removeItem|clear|key)\b|window\.localStorage|\bsessionStorage\b|\bindexedDB\b|document\.cookie/,
    'storage API',
  ],
  [/navigator\.languages?\b/, 'navigator.language'],
  [/visibilitychange/, 'visibilitychange'],
  [/\beval\s*\(/, 'eval('],
  [/new\s+Function\s*\(/, 'new Function('],
  [/new\s+(Shared)?Worker\s*\(/, 'new Worker'],
  [/\bWebAssembly\b/, 'WebAssembly'],
  [/navigator\.clipboard/, 'clipboard'],
  [/\bfetch\s*\(/, 'fetch('],
  // Platform isolation: no native wrapper / ad network / IAP code in the YouTube bundle.
  [/@capacitor|CapacitorPlatforms|purchaseStoreProduct|RevenueCat|prepareRewardVideoAd/, 'Capacitor/AdMob/IAP code'],
];
for (const f of files) {
  if (!/\.(js|css|html|json)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  const r = rel(f);
  for (const m of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`)<>]*/g)) {
    const url = m[0];
    const prev = text[m.index! - 1] ?? '';
    // Skip things like "a//b" inside regexes or comments-free code that are not URL references.
    if (!url.startsWith('http') && /[A-Za-z0-9]/.test(prev)) continue;
    if (url.startsWith('//') && !/^\/\/[a-z0-9-]+\.[a-z]{2,}\//i.test(url)) continue;
    if (!URL_ALLOW.some((a) => url.startsWith(a))) errors.push(`Absolute URL in ${r}: ${url.slice(0, 80)}`);
  }
  for (const [re, name] of FORBIDDEN) if (re.test(text)) errors.push(`Forbidden API "${name}" in ${r}`);
}

// ---- initial download estimate (everything reachable from the entry, except lazy-* chunks) ----
let initial = 0;
if (manifest) {
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const c = manifest![key];
    if (!c) return;
    if (c.name?.startsWith('lazy-')) return;
    for (const f of [c.file, ...(c.css ?? []), ...(c.assets ?? [])]) {
      const p = join(DIR, f);
      if (existsSync(p) && !seen.has('f:' + f)) {
        seen.add('f:' + f);
        initial += statSync(p).size;
      }
    }
    for (const i of c.imports ?? []) visit(i);
    for (const i of c.dynamicImports ?? []) visit(i);
  };
  for (const [k, c] of Object.entries(manifest)) if (c.isEntry) visit(k);
  initial += Buffer.byteLength(html);
} else initial = total;
if (initial >= 30 * MiB) errors.push(`Initial download too large: ${(initial / MiB).toFixed(2)} MiB`);
else if (initial > 5 * MiB)
  warnings.push(`Initial download above 5 MiB target: ${(initial / MiB).toFixed(2)} MiB`);

console.log(
  `YouTube bundle: ${files.length} files, total ${(total / MiB).toFixed(2)} MiB, initial ~${(initial / MiB).toFixed(2)} MiB`,
);
for (const w of warnings) console.warn(`  warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
console.log('  OK: bundle checks passed');
