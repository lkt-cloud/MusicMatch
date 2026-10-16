// English and Japanese. Text is written in English in the code and wrapped in t(); the
// Japanese for each piece lives in i18n-ja.ts, keyed by the English. Anything without a
// translation shows in English. {name}-style placeholders are filled from `vars`.
//
// The app redraws from the top when the language changes (see LanguageRoot in main.tsx), so
// t() can be called anywhere without a hook.

import { getSettings, type Settings } from './settings';
import { JA } from './i18n-ja';

export type Lang = 'en' | 'ja';
type Vars = Record<string, string | number>;

export const resolveLang = (choice: Settings['language'] = getSettings().language): Lang =>
  choice === 'en' || choice === 'ja' ? choice : (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

export const lang = () => resolveLang();
/** For dates and numbers. */
export const locale = () => (lang() === 'ja' ? 'ja-JP' : 'en-US');

const missing = new Set<string>();

export function t(text: string, vars?: Vars): string {
  let out = text;
  if (lang() === 'ja') {
    const ja = JA[text];
    if (ja !== undefined) out = ja;
    else if (import.meta.env.DEV && /[A-Za-z]{2}/.test(text) && !missing.has(text)) {
      missing.add(text);
      console.debug('[i18n] missing ja:', JSON.stringify(text));
    }
  }
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** English singular/plural, e.g. plural(n, '{n} creative', '{n} creatives'). Japanese has one form. */
export const plural = (n: number, one: string, many: string, vars?: Vars) => t(n === 1 ? one : many, { n, ...vars });
