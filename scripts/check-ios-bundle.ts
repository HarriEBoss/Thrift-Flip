/** iOS bundle checks: assets bundled locally, no YouTube SDK, no remote game URL. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'dist-ios';
const errors: string[] = [];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
if (!existsSync(join(DIR, 'index.html'))) errors.push('index.html missing');
for (const f of walk(DIR)) {
  if (!/\.(js|html|css)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (/ytgame|youtube\.com\/game_api/.test(text)) errors.push(`YouTube SDK reference in ${f}`);
}
const cap = readFileSync('capacitor.config.ts', 'utf8');
if (/server\s*:\s*\{[^}]*url/.test(cap)) errors.push('capacitor.config.ts loads the game from a remote URL');
if (errors.length) {
  errors.forEach((e) => console.error('  ERROR:', e));
  process.exit(1);
}
console.log('iOS bundle checks passed');
