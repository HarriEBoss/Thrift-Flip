import { describe, expect, it } from 'vitest';
import { NAME_MAX, NAME_WORDS, checkName, cleanName, nameFromParts, suggestName } from '../../src/core/names';
import { newGame } from '../../src/core/state';

describe('company names', () => {
  it('a new save gets a friendly suggested name, the same for the same seed', () => {
    expect(suggestName(42)).toBe(suggestName(42));
    expect(newGame(42).company).toBe(suggestName(42));
    expect(newGame(42).flags.named).toBe(false);
  });

  it('every word-wheel name passes the filter and fits', () => {
    const w = NAME_WORDS;
    for (let a = 0; a < w.first.length; a++)
      for (let c = 0; c < w.suffix.length; c++) {
        const n = nameFromParts([a, a * 7, c]);
        expect(checkName(n), n).toBe('ok');
        expect(n.length).toBeLessThanOrEqual(32);
      }
    expect(nameFromParts([-1, -1, -1])).toBe(
      nameFromParts([w.first.length - 1, w.second.length - 1, w.suffix.length - 1]),
    );
  });

  it('typed names are tidied: allowed characters, single spaces, max length', () => {
    expect(cleanName('  Super   Fix<script>  ')).toBe('Super Fixscript ');
    expect(cleanName('A'.repeat(40))).toHaveLength(NAME_MAX);
    expect(cleanName('Sam & Sons 2!')).toBe('Sam & Sons 2');
  });

  it('the filter blocks bad words, look-alikes and stretched spellings, but not innocent words', () => {
    expect(checkName('Happy Fix Co.')).toBe('ok');
    expect(checkName('a')).toBe('short');
    expect(checkName('Shit Repairs')).toBe('blocked');
    expect(checkName('Sh1t Co')).toBe('blocked');
    expect(checkName('Fuuuck Labs')).toBe('blocked');
    expect(checkName('Big Butt Co')).toBe('blocked');
    // Whole-word entries never block longer innocent words.
    expect(checkName('Classic Glass Co')).toBe('ok');
    expect(checkName('Hello Shop')).toBe('ok');
    expect(checkName('Bass Guitars')).toBe('ok');
  });
});
