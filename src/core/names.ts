/**
 * Company names. Kids pick from kid-safe word lists ("Sparkle Fix Co.") or type their own; a typed
 * name must pass a word filter. Pure.
 */
import namesJson from '../data/names.json';
import blockJson from '../data/blocklist.json';
import { Rng, hashSeed } from './prng';

export const NAME_WORDS = namesJson as { first: string[]; second: string[]; suffix: string[] };
const BLOCK = blockJson as { word: string[]; part: string[] };

export const NAME_MAX = 20;

/** A name from the word lists: [first, second, suffix] indices. */
export type NameParts = [number, number, number];

export function nameFromParts(p: NameParts): string {
  const w = NAME_WORDS;
  const at = <T>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];
  return `${at(w.first, p[0])} ${at(w.second, p[1])} ${at(w.suffix, p[2])}`;
}

export function randomParts(seed: number): NameParts {
  const rng = new Rng(hashSeed(seed, 'company'));
  const w = NAME_WORDS;
  return [rng.int(0, w.first.length - 1), rng.int(0, w.second.length - 1), rng.int(0, w.suffix.length - 1)];
}

/** The suggested name for a new save (deterministic per save seed). */
export function suggestName(seed: number): string {
  return nameFromParts(randomParts(seed));
}

/** Tidies typed text: allowed characters only, single spaces, at most NAME_MAX characters. */
export function cleanName(s: string): string {
  return s
    .replace(/[^A-Za-z0-9 &'.-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, NAME_MAX);
}

/** Lower case with look-alike characters mapped to letters (0 -> o, 1 -> i, $ -> s ...). */
function normalize(s: string): string {
  const map: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    $: 's',
    '!': 'i',
  };
  return s
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}

export type NameCheck = 'ok' | 'short' | 'blocked';

/** Whether a typed company name may be used. */
export function checkName(raw: string): NameCheck {
  const s = cleanName(raw).trim();
  if (s.replace(/[^A-Za-z0-9]/g, '').length < 2) return 'short';
  const n = normalize(s);
  const words = n.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BLOCK.word.includes(w))) return 'blocked';
  const squashed = n.replace(/[^a-z]/g, '');
  // Also catch doubled letters used to sneak a word past ("fuuuck").
  const single = squashed.replace(/(.)\1+/g, '$1');
  if (BLOCK.part.some((p) => squashed.includes(p) || single.includes(p.replace(/(.)\1+/g, '$1'))))
    return 'blocked';
  return 'ok';
}
