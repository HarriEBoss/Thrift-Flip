import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json';
import { getLanguage, registerStrings, setLanguage, t } from '../../src/i18n';
import { BALANCE, CATEGORIES, MARKETS } from '../../src/core/data';
import { STEP_ORDER } from '../../src/core/types';

const table = en as Record<string, string>;

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('i18n', () => {
  it('falls back to English and substitutes params', () => {
    expect(setLanguage('pt-BR')).toBe('en');
    expect(setLanguage(undefined)).toBe('en');
    expect(getLanguage()).toBe('en');
    expect(t('common.day', { n: 3 })).toBe('Day 3');
    expect(t('no.such.key')).toBe('no.such.key');
    registerStrings('de', { 'common.day': 'Tag {n}' });
    expect(setLanguage('de-AT')).toBe('de');
    expect(t('common.day', { n: 2 })).toBe('Tag 2');
    expect(t('common.close')).toBe(table['common.close']);
    registerStrings('de', { 'common.ok': 'Juhu!' });
    expect(t('common.ok')).toBe('Juhu!');
    setLanguage('en');
  });

  it('every literal t() key used in the source exists in en.json', () => {
    const missing: string[] = [];
    for (const f of walk('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g))
        if (!(m[1] in table)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('every data-driven key family is translated', () => {
    const keys: string[] = [];
    for (const k of STEP_ORDER) keys.push(`step.${k}`, `hint.${k}`, `mg.${k}`);
    for (const c of CATEGORIES) keys.push(`cat.${c.id}`, `catOne.${c.id}`);
    for (const p of BALANCE.palette) keys.push(`color.${p.id}`);
    for (const m of MARKETS) keys.push(`market.${m.id}`, `market.${m.id}.desc`);
    for (const tier of BALANCE.tiers) keys.push(`tier.${tier.id}`);
    for (const tier of BALANCE.tiers.slice(1)) keys.push(`tier.unlock.${tier.id}`);
    for (const u of BALANCE.upgrades) keys.push(`up.${u.id}`, `up.${u.id}.d`);
    for (const s of BALANCE.skills) keys.push(`skill.${s.branch}`, `skill.${s.branch}.d`);
    for (const p of BALANCE.products) {
      keys.push(`store.${p.id}`, `store.${p.id}.d`);
      if (p.badge) keys.push(`store.badge.${p.badge}`);
    }
    for (const mood of ['happy', 'think', 'sad']) keys.push(`shop.mood.${mood}`);
    keys.push('mg.paintPick', 'tut.scrub', 'tut.polish');
    expect(keys.filter((k) => !(k in table))).toEqual([]);
  });

  it('never mentions purchases or personal info prompts in YouTube-visible copy', () => {
    for (const [k, v] of Object.entries(table)) {
      if (k.startsWith('store.') || k === 'settings.restore' || k === 'menu.store' || k === 'summary.treat')
        continue;
      expect(/\b(name|age|email|address|username)\?/i.test(v), k).toBe(false);
    }
  });
});
