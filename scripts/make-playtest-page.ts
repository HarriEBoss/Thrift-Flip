/**
 * Turns the playtest build into one self-contained page for a Claude artifact (or any static host):
 *   npx vite build --mode playtest && npx tsx scripts/make-playtest-page.ts
 * Output: dist-playtest/thrift-flip-playtest.html (no <html>/<head>/<body> tags: the artifact host adds them).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'dist-playtest';
const html = readFileSync(join(DIR, 'index.html'), 'utf8');
const inlineStyle = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
const cssFiles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]);
const jsFiles = [...html.matchAll(/<script type="module"[^>]*src="\.\/([^"]+)"/g)].map((m) => m[1]);
const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
const bodyMarkup = body.replace(/<script[\s\S]*?<\/script>/g, '').trim();
const css = cssFiles.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
// Keep "</script" sequences inside the bundle from closing the inline tag early.
const js = jsFiles
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')
  .replace(/<\/script/gi, '<\\/script');
const page = `<title>Thrift Flip</title>
<meta name="theme-color" content="#2f8f8a">
<style>
${inlineStyle}
${css}
</style>
${bodyMarkup}
<script type="module">
${js}
</script>
`;
const out = join(DIR, 'thrift-flip-playtest.html');
writeFileSync(out, page);
console.log(
  `${out}: ${(page.length / 1024 / 1024).toFixed(2)} MiB, ${cssFiles.length} css, ${jsFiles.length} js`,
);
