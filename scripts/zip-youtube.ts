/**
 * Packages a build folder into a zip with index.html at the root (relative paths): by default
 * dist-youtube/ into thrift-flip-youtube.zip; `tsx scripts/zip-youtube.ts dist-site thrift-flip-web.zip`
 * for the web release (itch.io and other HTML5 portals take this zip as is).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const DIR = process.argv[2] ?? 'dist-youtube';
const OUT = process.argv[3] ?? 'thrift-flip-youtube.zip';
const tree: Zippable = {};
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else tree[relative(DIR, p).split('\\').join('/')] = [readFileSync(p), { level: 9 }];
  }
};
walk(DIR);
const zip = zipSync(tree);
writeFileSync(OUT, zip);
console.log(`Wrote ${OUT} (${(zip.length / 1024).toFixed(0)} KiB, ${Object.keys(tree).length} files)`);
