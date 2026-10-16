// Country → city lookup. The city list is ~120 KB gzipped, so it's loaded on demand.

import { lang, locale } from '../i18n';
import { JP_CITY_JA } from './jp-cities';
export type Place = { name: string; coords: [number, number]; region?: string };
type Raw = Record<string, [string, number, number, string?][]>;

let cache: Promise<Raw> | null = null;
const loadRaw = () => (cache ??= import('./places.json').then((m) => m.default as unknown as Raw));

export async function loadCountries() {
  const raw = await loadRaw();
  return Object.keys(raw)
    .map((code) => ({ code, name: countryName(code) }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCities(country: string): Promise<Place[]> {
  const raw = await loadRaw();
  return (raw[country] ?? []).map(([name, lng, lat, region]) => ({ name, coords: [lng, lat], region }));
}

/**
 * A city's name for showing: Japanese cities are written in Japanese when the app is in
 * Japanese; everywhere else keeps its usual (English) name. What's stored is always the English.
 */
export const cityName = (city: string, country: string) => (country === 'JP' && lang() === 'ja' ? (JP_CITY_JA[city] ?? city) : city);

/** A country's name in the app's language. */
export const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const flag = (code: string) =>
  code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : '';
