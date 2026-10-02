import en from './en.json';

type Table = Record<string, string>;
const tables: Record<string, Table> = { en: en as Table };
let active: Table = tables.en;
let activeLang = 'en';

/** Supported languages. English ships in v1; DE/FR/ES/PT-BR tables can be added later. */
export const SUPPORTED = Object.keys(tables);

/** Picks the best table for a BCP-47 tag (e.g. "pt-BR" -> "pt-BR", "pt", or "en"). */
export function setLanguage(tag: string | null | undefined): string {
  const t = (tag || 'en').replace('_', '-');
  const candidates = [t, t.split('-')[0], 'en'];
  for (const c of candidates) {
    const key = Object.keys(tables).find((k) => k.toLowerCase() === c.toLowerCase());
    if (key) {
      active = tables[key];
      activeLang = key;
      return key;
    }
  }
  return activeLang;
}

export function getLanguage(): string {
  return activeLang;
}

/** Translate with {param} substitution. Missing keys fall back to English, then the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = active[key] ?? tables.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** Registers extra strings (used by data-driven content and tests). */
export function registerStrings(lang: string, strings: Table): void {
  tables[lang] = { ...(tables[lang] ?? {}), ...strings };
  if (lang === activeLang) active = tables[lang];
}
