import { useEffect, useMemo, useState } from 'react';
import { countryName, flag, loadCities, loadCountries, type Place } from '../data/places';

/** Native select of every country, by name. */
export function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    loadCountries().then(setCountries);
  }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!countries.length && <option value={value}>{flag(value)} {countryName(value)}</option>}
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {flag(c.code)} {c.name}
        </option>
      ))}
    </select>
  );
}

/** Type-ahead city picker limited to one country. */
export function CityPicker({
  country,
  value,
  onPick,
}: {
  country: string;
  value: string;
  onPick: (place: Place) => void;
}) {
  const [cities, setCities] = useState<Place[]>([]);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let live = true;
    loadCities(country).then((c) => live && setCities(c));
    return () => {
      live = false;
    };
  }, [country]);

  useEffect(() => setText(value), [value]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = q && q !== value.toLowerCase() ? cities.filter((c) => c.name.toLowerCase().includes(q)) : cities;
    // Prefix matches first; the list is already biggest-city-first.
    return [...list].sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, 8);
  }, [cities, text, value]);

  const pick = (p: Place) => {
    onPick(p);
    setText(p.name);
    setOpen(false);
  };

  return (
    <div className="combo">
      <input
        value={text}
        placeholder={cities.length ? `Search ${cities.length.toLocaleString()} cities…` : 'Loading cities…'}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, matches.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') pick(matches[active]);
          else return;
          e.preventDefault();
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <ul className="combo-list" role="listbox">
          {matches.map((c, i) => (
            <li key={c.name + c.region + c.coords.join()} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={() => pick(c)}>
                {c.name}
                {c.region && <span className="muted"> · {c.region}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Looks up a street address with OpenStreetMap's free geocoder.
 * Fine for a prototype; swap for a keyed service (Mapbox, Google) before launch.
 */
export async function geocodeAddress(query: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? [Number(hit.lon), Number(hit.lat)] : null;
}
