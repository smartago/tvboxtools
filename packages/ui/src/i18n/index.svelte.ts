// i18n — one table per language file (`en.ts`, `el.ts`, …); more languages = more files in this folder
// registered in `TABLES`. `t(key)` is reactive on `lang` (Svelte 5 runes) and applies the brand
// substitution from core (`brandText`: HOTELTV → Premium TV Launcher etc.) plus the tool's CLI name.
import { brandText, type BrandConfig } from '@tvlm/core';
import { en, type StrKey, type Strings } from './en.js';
import { el } from './el.js';

export type { StrKey, Strings } from './en.js';

/** Languages with a table. Add a file + an entry here; the PLUI i18n pipeline fills the rest later. */
export const TABLES: Record<string, Strings> = { en, el };

/** The picker on W1 — the prototype lists six, only EN/EL exist today (others fall back to EN, as the prototype did). */
// `flag` = the file under brand/flags/ — the same artwork PLUI shows for its languages
// (smartago.net/flags), shipped with the app so a box with no route out still sees it (Jim, 23/9).
export const LANGS: ReadonlyArray<{ tag: string; name: string; code: string; flag: string }> = [
  { tag: 'en', name: 'English', code: 'EN', flag: 'us' },
  { tag: 'el', name: 'Ελληνικά', code: 'EL', flag: 'gr' },
  { tag: 'de', name: 'Deutsch', code: 'DE', flag: 'de' },
  { tag: 'fr', name: 'Français', code: 'FR', flag: 'fr' },
  { tag: 'es', name: 'Español', code: 'ES', flag: 'es' },
  { tag: 'it', name: 'Italiano', code: 'IT', flag: 'it' },
];

export function hasLang(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(TABLES, tag);
}

export class I18n {
  lang = $state('en');
  constructor(
    private readonly brand: BrandConfig,
    lang?: string,
  ) {
    if (lang && hasLang(lang)) this.lang = lang;
  }

  /** Set the UI language; unknown tags fall back to English (the prototype's behaviour). */
  set(tag: string) {
    this.lang = hasLang(tag) ? tag : 'en';
  }

  get code(): string {
    return this.lang.toUpperCase();
  }

  get langName(): string {
    return LANGS.find((l) => l.tag === this.lang)?.name ?? 'English';
  }
  /** The flag file (brand/flags/<flag>.svg) of the current language. */
  get flag(): string {
    return LANGS.find((l) => l.tag === this.lang)?.flag ?? 'us';
  }

  /** Reactive lookup + brand words. `{n}`-style params are filled from `params`. */
  t(key: StrKey, params?: Record<string, string | number>): string {
    const table = TABLES[this.lang] ?? en;
    let s: string = table[key] ?? en[key] ?? key;
    s = brandText(this.brand, s).replace(/tv-setup/g, this.brand.cli);
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return s;
  }

  /** For strings the engine writes into the report as keys (`err_*`, `st_*`). */
  has(key: string): key is StrKey {
    return Object.prototype.hasOwnProperty.call(en, key);
  }
}
