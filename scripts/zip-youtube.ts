/** Packages dist-youtube/ into thrift-flip-youtube.zip (relative paths, index.html at root). */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const DIR = 'dist-youtube';
const OUT = 'thrift-flip-youtube.zip';
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
