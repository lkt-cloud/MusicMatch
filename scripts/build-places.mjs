// Builds src/data/places.json: { [countryCode]: [name, lng, lat, region?][] }, biggest cities first.
// Run with: node scripts/build-places.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const cities = createRequire(import.meta.url)('all-the-cities');
const MIN_POP = 50_000;
const MIN_PER_COUNTRY = 8;
// Admin codes are only human-readable (e.g. "GA") for these countries.
const SHOW_REGION = new Set(['US', 'CA', 'AU']);

const byCountry = {};
for (const c of [...cities].sort((a, b) => b.population - a.population)) {
  (byCountry[c.country] ??= []).push(c);
}

const out = {};
for (const [code, list] of Object.entries(byCountry)) {
  const seen = new Set();
  const rows = [];
  for (const c of list) {
    if (c.population < MIN_POP && rows.length >= MIN_PER_COUNTRY) break;
    const region = SHOW_REGION.has(code) ? c.adminCode : '';
    const key = c.name + '|' + region;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = c.loc.coordinates;
    const row = [c.name, Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000];
    if (region) row.push(region);
    rows.push(row);
  }
  out[code] = rows;
}

writeFileSync(new URL('../src/data/places.json', import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length, 'countries,', Object.values(out).reduce((n, r) => n + r.length, 0), 'cities');
