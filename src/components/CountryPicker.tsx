import { useEffect, useMemo, useRef, useState } from 'react';
import { countryName, flag, loadCountries } from '../data/places';
import { hasCountryMap } from '../map/CountryMap';
import { Icon } from './Icon';
import { t } from '../i18n';

/** The map's country switcher: a flag-and-name button that opens a searchable list. */
export function CountryPicker({ value, home, onChange }: { value: string; home: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="country-btn" onClick={() => setOpen(true)} aria-label={t('Choose a country')} aria-haspopup="dialog">
        <span className="country-flag" aria-hidden>
          {flag(value)}
        </span>
        <span className="country-name">{countryName(value)}</span>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <CountryList
          value={value}
          home={home}
          onPick={(code) => {
            setOpen(false);
            if (code !== value) onChange(code);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CountryList({ value, home, onPick, onClose }: { value: string; home: string; onPick: (code: string) => void; onClose: () => void }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only countries the map can draw on their own.
    loadCountries().then((list) => setCodes(list.map((c) => c.code).filter(hasCountryMap)));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const english = new Intl.DisplayNames(['en'], { type: 'region' });
    const named = codes.map((code) => ({ code, name: countryName(code) }));
    const hits = q
      ? named.filter(({ code, name }) => name.toLowerCase().includes(q) || (english.of(code) ?? '').toLowerCase().includes(q) || code.toLowerCase() === q)
      : named;
    return hits.sort((a, b) => a.name.localeCompare(b.name));
  }, [codes, query]);

  const row = (code: string, note?: string) => (
    <li key={code}>
      <button className={`country-row${code === value ? ' is-on' : ''}`} onClick={() => onPick(code)}>
        <span className="country-flag" aria-hidden>
          {flag(code)}
        </span>
        <span className="country-row-name">{countryName(code)}</span>
        {note && <span className="muted small">{note}</span>}
        {code === value && <Icon name="star" size={13} filled />}
      </button>
    </li>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal country-modal" role="dialog" aria-modal="true" aria-label={t('Choose a country')} onClick={(e) => e.stopPropagation()}>
        <div className="cropper-head">
          <h2>{t('Choose a country')}</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label={t('Close')}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="country-search">
          <Icon name="search" size={16} />
          <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search countries…')} aria-label={t('Search countries…')} />
        </div>
        <ul className="country-list">
          {!query && hasCountryMap(home) && row(home, t('Your country'))}
          {shown.filter((c) => query || c.code !== home).map((c) => row(c.code))}
          {codes.length > 0 && shown.length === 0 && <li className="muted small country-none">{t('No countries match that.')}</li>}
        </ul>
      </div>
    </div>
  );
}
