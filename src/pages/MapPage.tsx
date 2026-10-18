import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { geoDistance } from 'd3-geo';
import { FlatEarth } from '../map/FlatEarth';
import { CountryMap, hasCountryMap } from '../map/CountryMap';
import { CountryPicker } from '../components/CountryPicker';
import { AREA_MILES, EARTH_RADIUS_MI, LOCAL_ZOOM, MAX_ZOOM, countryAt, countryCenter, formatDistance, formatRadius, milesBetween, reaches, type EarthHandle, type View } from '../map/shared';
import { ActiveFilters, FilterPanel, NO_FILTERS, countFilters, matches, type Filters } from '../components/MapFilters';
import { CITY_NAMES, cityCoords, cityCountry } from '../data/creatives';
import { cityName, countryName } from '../data/places';
import { hasRole, roleInfo, rolesOf } from '../data/roles';
import type { Creative } from '../data/types';
import { useStore } from '../store';
import { Avatar } from '../components/Avatar';
import { RoleLine } from '../components/RoleBadge';
import { CreativeRow } from '../components/CreativeRow';
import { splitPromoted, usePromotionFlags } from '../backend/promotions';
import { Compass } from '../components/Compass';
import { getSettings } from '../settings';
import { getDeviceLocation } from '../location';
import { Icon } from '../components/Icon';
import { SocialLinks } from '../components/SocialLinks';
import { GenreChips } from '../components/Genres';
import { plural, t } from '../i18n';

type Sheet = 'peek' | 'half' | 'full';
/** The list sits beside the map on wide screens (no sheet to pull up). */
const isWide = () => window.matchMedia('(min-width: 1024px)').matches;

/** The phone's or browser's region (e.g. ja-JP → JP), for guests' first country. */
function deviceRegion() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch {
    // older browsers
  }
  return 'US';
}

// The country picked on the map lasts while the app is open (leaving the map and coming back
// keeps it), but each new visit starts on your own country.
let sessionCountry: string | null = null;

const nearestCity = (p: [number, number]) =>
  CITY_NAMES.reduce((best, c) => (geoDistance(cityCoords(c), p) < geoDistance(cityCoords(best), p) ? c : best));

export function MapPage() {
  const { me, mapMode, setMapMode, creatives, located, signedIn, requireSignIn, setDeviceLocation, findPerson, loadArea, searchPeople } = useStore();
  const navigate = useNavigate();
  const earth = useRef<EarthHandle>(null);
  const [northDeg, setNorthDeg] = useState(0); // flat map rotation, for the compass
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // /?focus=<id> opens the map zoomed in on someone (used by "See on map" links).
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const focused = (focusId && findPerson(focusId)) || undefined;
  const [selectedId, setSelectedId] = useState<string | null>(focused?.id ?? null);
  const [view, setView] = useState<{ visible: Creative[]; center: [number, number]; zoom: number; whole: boolean; ready: boolean }>({
    visible: [],
    center: [0, 90],
    zoom: 1,
    whole: true,
    ready: false,
  });

  // Which country the country map shows: your profile's, a guest's phone region, or one picked.
  const home = signedIn && me.city ? me.country : deviceRegion();
  const [mapCountry, setMapCountryState] = useState(() => focused?.country ?? sessionCountry ?? home);
  const setMapCountry = (code: string) => {
    sessionCountry = code;
    setMapCountryState(code);
  };
  // Countries without an outline of their own fall back to the flat map.
  const countryMode = mapMode === 'country' && hasCountryMap(mapCountry);
  // Open on you: a "See on map" link wins, otherwise your profile location at city-and-neighbours zoom
  // (no flash of the whole world first). Device location, if shared, refines it below. Guests
  // start on the whole map until they share where they are.
  const lastView = useRef<View | undefined>(
    focused ? { center: focused.coords, zoom: 220 } : located ? { center: me.coords, zoom: LOCAL_ZOOM } : undefined,
  );
  const [here, setHere] = useState<[number, number] | null>(null);
  // Only people within a wide area of here are drawn, so the map stays light and uncluttered. The area
  // follows you: it's your home, and moves when you search a city or a person, or tap "Near me".
  // Guests who haven't shared a location yet see everyone until they do.
  const [areaCenter, setAreaCenter] = useState<[number, number] | null>(focused ? focused.coords : located ? me.coords : null);
  useEffect(() => {
    if (!areaCenter && located) setAreaCenter(me.coords);
  }, [areaCenter, located, me.coords]);
  // Profiles are loaded by area, so moving the area loads the people there.
  useEffect(() => {
    if (areaCenter) loadArea(areaCenter);
  }, [areaCenter, loadArea]);

  // On the country map the area follows what you're looking at: once the map settles a fair
  // way from the current area, the people around the new spot are loaded and shown. Zoomed all
  // the way out to the whole country, it stays put (the middle of a country is rarely anyone's spot).
  useEffect(() => {
    if (!countryMode || !view.ready || view.whole) return;
    const timer = window.setTimeout(() => {
      if (!areaCenter || milesBetween(view.center, areaCenter) > 60) setAreaCenter(view.center);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [countryMode, view.ready, view.whole, view.center, areaCenter]);

  /** Switches the country map (it re-fits); `at` opens it on a spot instead of the whole country. */
  const switchCountry = (code: string, at?: View) => {
    setSelectedId(null);
    const isHome = code === home && located;
    lastView.current = at ?? (isHome ? { center: me.coords, zoom: LOCAL_ZOOM } : undefined);
    setAreaCenter(at?.center ?? (isHome ? me.coords : countryCenter(code)));
    setView((v) => ({ ...v, visible: [], ready: false }));
    setMapCountry(code);
  };

  // Find you when the map opens. The prompt only ever appears once (see src/location.ts);
  // if it's refused or unavailable, the map stays on the location set in your profile.
  useEffect(() => {
    // Settings → "Find me when the map opens" can turn this off; the locate button still works.
    if (focused || !getSettings().locateOnOpen) return;
    let live = true;
    getDeviceLocation('auto').then((r) => {
      if (!live || !('coords' in r)) return;
      setHere(r.coords);
      setDeviceLocation(r.coords);
      // On the country map, only if you're in the country it's showing.
      if (mapMode !== 'country' || countryAt(r.coords) === mapCountry) earth.current?.flyTo(r.coords, LOCAL_ZOOM);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The list of creatives: a sheet on phones that rests closed, half-way or full screen.
  const [sheet, setSheetState] = useState<Sheet>('peek');
  // What it lists: whoever's on the map right now, or everyone nearby (closest first).
  const [listMode, setListMode] = useState<'view' | 'all'>('view');
  const setSheet = (s: Sheet) => {
    setSheetState(s);
    // Pulled all the way up, it's for browsing everyone near you without moving the map.
    if (s === 'full') setListMode('all');
  };

  const nearby = useMemo(
    () =>
      creatives.filter(
        (c) => (!areaCenter || milesBetween(c.coords, areaCenter) <= AREA_MILES) && (!countryMode || c.country === mapCountry),
      ),
    [creatives, areaCenter, countryMode, mapCountry],
  );
  const filtered = useMemo(() => nearby.filter((c) => matches(c, filters, me)), [nearby, filters, me]);
  const filterCount = countFilters(filters);
  const range = useMemo(() => (filters.miles != null ? { center: me.coords, miles: filters.miles } : null), [filters.miles, me.coords]);

  // When the distance changes, frame the circle around you.
  useEffect(() => {
    if (filters.miles == null) return;
    const t = window.setTimeout(() => {
      const angle = filters.miles! / EARTH_RADIUS_MI; // radians
      earth.current?.flyTo(me.coords, Math.max(1, Math.min(MAX_ZOOM, 1.9 / angle)));
    }, 350);
    return () => window.clearTimeout(t);
  }, [filters.miles, me.coords]);
  const selected = creatives.find((c) => c.id === selectedId) ?? null;

  const onViewChange = useCallback((visible: Creative[], center: [number, number], zoom: number, whole = zoom < 5) => {
    lastView.current = { center, zoom };
    setView({ visible, center, zoom, whole, ready: true });
  }, []);

  const flags = usePromotionFlags();
  const sameCity = (c: Creative) => !!me.city && c.city.toLowerCase() === me.city.toLowerCase();
  // Featured profiles in your city lead the list (max 2, marked Promoted); then nearest first.
  const { top: featuredTop, rest: listed } = useMemo(() => {
    const byDistance = [...view.visible].sort((a, b) => geoDistance(a.coords, view.center) - geoDistance(b.coords, view.center));
    return splitPromoted(byDistance, (c) => flags.isFeatured(c.id) && sameCity(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flags, me.city]);

  // Everyone in the area who matches the filters, closest to you first.
  const from = here ?? (located ? me.coords : areaCenter ?? view.center);
  const { top: allTop, rest: allRest } = useMemo(() => {
    const byDistance = [...filtered].sort((a, b) => geoDistance(a.coords, from) - geoDistance(b.coords, from));
    return splitPromoted(byDistance, (c) => flags.isFeatured(c.id) && sameCity(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, from[0], from[1], flags, me.city]);
  const [shownAll, setShownAll] = useState(60);
  const listTop = listMode === 'all' ? allTop : featuredTop;
  const listRest = listMode === 'all' ? allRest.slice(0, shownAll) : listed;
  const listCount = listMode === 'all' ? allTop.length + allRest.length : featuredTop.length + listed.length;

  const place = view.whole
    ? countryMode
      ? countryName(mapCountry)
      : t('Everywhere')
    : t('Around {city}', { city: ((c) => cityName(c, cityCountry(c)))(nearestCity(view.center)) });

  const q = query.trim().toLowerCase();
  // Search looks through everyone, not just who's loaded: matches are fetched and then listed below.
  useEffect(() => {
    if (q.length < 2) return;
    const t = window.setTimeout(() => searchPeople(q).catch(console.error), 250);
    return () => window.clearTimeout(t);
  }, [q, searchPeople]);
  const results = q
    ? [
        ...CITY_NAMES.filter((c) => c.toLowerCase().includes(q) || cityName(c, cityCountry(c)).includes(q)).map((c) => ({ kind: 'city' as const, city: c })),
        ...creatives
          .filter((c) => c.name.toLowerCase().includes(q) || c.genres.some((g) => g.toLowerCase().includes(q)))
          // Featured profiles from your city come first in search too.
          .sort((a, b) => Number(flags.isFeatured(b.id) && sameCity(b)) - Number(flags.isFeatured(a.id) && sameCity(a)))
          .map((c) => ({ kind: 'person' as const, person: c })),
      ].slice(0, 7)
    : [];

  /** Goes to a spot, switching the country map first if it's in another country. */
  const goTo = (coords: [number, number], country: string, zoom: number) => {
    if (countryMode && country && country !== mapCountry && hasCountryMap(country)) {
      switchCountry(country, { center: coords, zoom });
      return;
    }
    setAreaCenter(coords);
    earth.current?.flyTo(coords, zoom);
  };

  const focus = (c: Creative) => {
    goTo(c.coords, c.country, 320);
    setSelectedId(c.id);
  };

  /** Picking someone in the list: the sheet drops out of the way so you see them on the map. */
  const pickFromList = (c: Creative) => {
    if (sheet === 'full' || sheet === 'half') setSheet('peek');
    focus(c);
  };

  // Dragging the sheet's handle: it follows the finger, then settles at the nearest height
  // (or the next one in the direction of a quick flick).
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y0: number; t0: number; base: number; id: number } | null>(null);
  const dragged = useRef(false);
  const sheetOffset = (s: Sheet, h: number) => (s === 'full' ? 0 : s === 'half' ? h * 0.45 : h - 72);
  const onSheetDown = (e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel || isWide()) return;
    drag.current = { y0: e.clientY, t0: performance.now(), base: sheetOffset(sheet, panel.offsetHeight), id: e.pointerId };
    dragged.current = false;
  };
  const onSheetMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (!dragged.current && Math.abs(dy) < 6) return;
    if (!dragged.current) {
      dragged.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
    }
    const y = Math.max(0, Math.min(panel.offsetHeight - 72, d.base + dy));
    panel.style.transform = `translateY(${y}px)`;
  };
  const onSheetUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel || !dragged.current) return;
    const h = panel.offsetHeight;
    const dy = e.clientY - d.y0;
    const y = d.base + dy;
    const speed = dy / Math.max(1, performance.now() - d.t0); // px per ms, + is down
    // Where it was heading: a quick flick carries on a little past where the finger let go.
    const aim = y + speed * 220;
    const stops: Sheet[] = ['full', 'half', 'peek'];
    const next = stops.reduce((best, s) => (Math.abs(sheetOffset(s, h) - aim) < Math.abs(sheetOffset(best, h) - aim) ? s : best));
    panel.style.transition = '';
    panel.style.transform = '';
    setSheet(next);
    // The click that follows a drag shouldn't also toggle the sheet.
    window.setTimeout(() => (dragged.current = false), 0);
  };

  const locate = () => {
    getDeviceLocation('user').then((r) => {
      if (!('coords' in r)) return (here || located) && earth.current?.flyTo(here ?? me.coords, LOCAL_ZOOM);
      setHere(r.coords);
      setDeviceLocation(r.coords);
      goTo(r.coords, countryAt(r.coords) ?? mapCountry, LOCAL_ZOOM);
    });
  };

  return (
    <div className="map-page">
      <div className={`map-stage is-${countryMode ? 'country' : 'flat'}`}>
        {countryMode ? (
          <CountryMap
            key={`country:${mapCountry}`}
            ref={earth}
            country={mapCountry}
            creatives={filtered}
            me={me}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onViewChange={onViewChange}
            initialView={lastView.current && countryAt(lastView.current.center) === mapCountry ? lastView.current : undefined}
            range={range}
            here={here}
          />
        ) : (
          <FlatEarth
            key="flat"
            ref={earth}
            creatives={filtered}
            me={me}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onViewChange={onViewChange}
            initialView={lastView.current}
            range={range}
            here={here}
            onRotate={setNorthDeg}
          />
        )}

        <div className="map-top">
          <div className="map-top-row">
          <div className="search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder={t('Search a city, name or genre')}
              aria-label={t('Search')}
            />
            {query && (
              <button className="icon-btn ghost" onClick={() => setQuery('')} aria-label={t('Clear search')}>
                <Icon name="close" size={16} />
              </button>
            )}
            {searchOpen && results.length > 0 && (
              <ul className="search-results">
                {results.map((r) =>
                  r.kind === 'city' ? (
                    <li key={r.city}>
                      <button
                        onClick={() => {
                          goTo(cityCoords(r.city), cityCountry(r.city), 140);
                          setQuery('');
                        }}
                      >
                        <span className="search-icon"><Icon name="pin" size={16} /></span>
                        <span>{cityName(r.city, cityCountry(r.city))}</span>
                      </button>
                    </li>
                  ) : (
                    <li key={r.person.id}>
                      <button
                        onClick={() => {
                          focus(r.person);
                          setQuery('');
                        }}
                      >
                        <Avatar person={r.person} size={26} />
                        <span>{r.person.name}</span>
                        <span className="muted small">{rolesOf(r.person).map((x) => roleInfo(x).label).join(' + ')} · {cityName(r.person.city, r.person.country)}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
          <button
            className={`filter-btn${filterCount ? ' is-active' : ''}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <Icon name="levels" size={17} /> {t('Filters')}
            {filterCount > 0 && <span className="count">{filterCount}</span>}
          </button>
          </div>
          <ActiveFilters value={filters} onChange={setFilters} />
        </div>

        {filtersOpen && (
          <FilterPanel
            value={filters}
            onChange={setFilters}
            onClose={() => setFiltersOpen(false)}
            resultCount={filtered.length}
            me={me}
          />
        )}

        <div className="map-mode">
          {mapMode === 'country' && <CountryPicker value={mapCountry} home={home} onChange={(code) => switchCountry(code)} />}
          <div className="mode-toggle" role="radiogroup" aria-label={t('Map style')}>
            {(['country', 'flat'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mapMode === m}
                className={mapMode === m ? 'is-on' : ''}
                onClick={() => setMapMode(m)}
              >
                <Icon name={m === 'flat' ? 'flat' : 'map'} size={17} />
                {m === 'flat' ? t('Flat') : t('Country')}
              </button>
            ))}
          </div>
        </div>

        <div className="map-controls">
          {mapMode === 'flat' && (
            <Compass degrees={northDeg} onRotate={(r) => earth.current?.rotateBy?.(r)} onReset={() => earth.current?.resetNorth?.()} />
          )}
          <button className="icon-btn" onClick={() => earth.current?.zoomBy(2)} aria-label={t('Zoom in')}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" onClick={() => earth.current?.zoomBy(0.5)} aria-label={t('Zoom out')}>
            <Icon name="minus" />
          </button>
          <button className="icon-btn" onClick={() => earth.current?.reset()} aria-label={t('Show whole map')}>
            <Icon name="globe" />
          </button>
          <button className="icon-btn accent" onClick={locate} aria-label={t('Near me')}>
            <Icon name="locate" />
          </button>
        </div>

        {selected && (
          <div className="preview-card" key={selected.id} style={{ ['--role' as string]: roleInfo(selected.role).color }}>
            <button className="icon-btn ghost preview-close" onClick={() => setSelectedId(null)} aria-label={t('Close')}>
              <Icon name="close" size={16} />
            </button>
            <div className="preview-head">
              <Avatar person={selected} size={54} badge />
              <div>
                <h3>{selected.name}</h3>
                {flags.isVerifiedStudio(selected.id) && (
                  <span className="verified">
                    <Icon name="speaker" size={12} /> {t('Verified Studio')}
                  </span>
                )}
                <div className="muted small">
                  <RoleLine person={selected} /> · {cityName(selected.city, selected.country)}
                  {located && <> · {formatDistance(milesBetween(me.coords, selected.coords))}</>}
                </div>
              </div>
            </div>
            <p className="preview-bio">{selected.bio}</p>
            {selected.address && hasRole(selected, 'studio') && (
              <p className="preview-place small">
                <Icon name="pin" size={15} /> {selected.address}
              </p>
            )}
            {selected.travelMiles != null && (
              <p className="preview-place small">
                <Icon name="radius" size={15} /> {t('Travels up to {radius}', { radius: formatRadius(selected.travelMiles) })}
                {located && reaches(selected, me.coords) && <span className="tag-good">{t('reaches you')}</span>}
              </p>
            )}
            <div className="preview-meta small">
              <span>{selected.rate}</span>
              {selected.reviews ? (
                <span className="rating">
                  <Icon name="star" size={13} filled /> {selected.rating.toFixed(1)} <span className="muted">({selected.reviews})</span>
                </span>
              ) : (
                <span className="muted">{t('New')}</span>
              )}
              {selected.available ? <span className="available">{t('Available')}</span> : <span className="muted">{t('Booked up')}</span>}
            </div>
            <GenreChips ids={selected.genres} small />
            <SocialLinks socials={selected.socials} compact />
            <div className="preview-actions">
              <button className="btn primary" onClick={() => requireSignIn(t('Sign in to message {name}.', { name: selected.name })) && navigate(`/messages/${selected.id}`)}>
                <Icon name="chat" size={17} /> {t('Message')}
              </button>
              <Link className="btn" to={`/u/${selected.id}`}>
                {t('View profile')}
              </Link>
            </div>
          </div>
        )}
      </div>

      <aside className={`panel is-${sheet}`} ref={panelRef}>
        <button
          className="panel-head"
          onClick={() => !dragged.current && !isWide() && setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'half')}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          aria-expanded={sheet !== 'peek'}
        >
          <span>
            <strong>{listMode === 'all' ? (located ? t('Near you') : place) : place}</strong>
            <span className="muted small">
              {listMode === 'all'
                ? plural(listCount, '{n} creative within {radius}', '{n} creatives within {radius}', { radius: formatRadius(AREA_MILES) })
                : plural(listCount, '{n} creative in view', '{n} creatives in view')}
            </span>
          </span>
          <span className="panel-toggle">
            <Icon name="chevron" size={18} />
          </span>
        </button>
        <div className="panel-mode">
          <div className="segmented" role="radiogroup" aria-label={t('List')}>
            {(
              [
                ['view', t('On the map')],
                ['all', t('All nearby')],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={listMode === m} className={listMode === m ? 'is-on' : ''} onClick={() => setListMode(m)}>
                {label}
              </button>
            ))}
          </div>
          {sheet === 'full' && (
            <button className="link panel-back" onClick={() => setSheet('peek')}>
              <Icon name="map" size={15} /> {t('Show map')}
            </button>
          )}
        </div>
        <div className="panel-list">
          {listCount === 0 && (
            <p className="empty">
              {areaCenter
                ? t('No one here. The map shows people within {radius}; search a city to look elsewhere.', { radius: formatRadius(AREA_MILES) })
                : t('No one here. Zoom out or loosen your filters.')}
              {filterCount > 0 && (
                <button className="btn block" onClick={() => setFilters(NO_FILTERS)}>{t('Clear filters')}</button>
              )}
            </p>
          )}
          {listTop.map((c) => (
            <CreativeRow key={c.id} person={c} promoted active={c.id === selectedId} onClick={() => pickFromList(c)} />
          ))}
          {listRest.map((c) => (
            <CreativeRow
              key={c.id}
              person={c}
              active={c.id === selectedId}
              onClick={() => pickFromList(c)}
              meta={located ? formatDistance(milesBetween(me.coords, c.coords)) : undefined}
            />
          ))}
          {listMode === 'all' && allRest.length > shownAll && (
            <button className="btn block" onClick={() => setShownAll((n) => n + 60)}>
              {t('Show more')}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
