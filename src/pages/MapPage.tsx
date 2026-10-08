import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { geoDistance } from 'd3-geo';
import { FlatEarth } from '../map/FlatEarth';
import { Globe } from '../map/Globe';
import { EARTH_RADIUS_MI, LOCAL_ZOOM, MAX_ZOOM, formatMiles, milesBetween, reaches, type EarthHandle, type View } from '../map/shared';
import { ActiveFilters, FilterPanel, NO_FILTERS, countFilters, matches, type Filters } from '../components/MapFilters';
import { CITY_NAMES, cityCoords } from '../data/creatives';
import { hasRole, roleInfo, rolesOf } from '../data/roles';
import type { Creative } from '../data/types';
import { useStore } from '../store';
import { Avatar } from '../components/Avatar';
import { RoleLine } from '../components/RoleBadge';
import { CreativeRow } from '../components/CreativeRow';
import { splitPromoted, usePromotionFlags } from '../backend/promotions';
import { Icon } from '../components/Icon';
import { SocialLinks } from '../components/SocialLinks';
import { GenreChips } from '../components/Genres';

const nearestCity = (p: [number, number]) =>
  CITY_NAMES.reduce((best, c) => (geoDistance(cityCoords(c), p) < geoDistance(cityCoords(best), p) ? c : best));

export function MapPage() {
  const { me, mapMode, setMapMode, creatives, located, requireSignIn, setDeviceLocation } = useStore();
  const navigate = useNavigate();
  const earth = useRef<EarthHandle>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // /?focus=<id> opens the map zoomed in on someone (used by "See on map" links).
  const [params] = useSearchParams();
  const focused = creatives.find((c) => c.id === params.get('focus'));
  const [selectedId, setSelectedId] = useState<string | null>(focused?.id ?? null);
  const [view, setView] = useState<{ visible: Creative[]; center: [number, number]; zoom: number }>({
    visible: [],
    center: [0, 90],
    zoom: 1,
  });
  // Open on you: a "See on map" link wins, otherwise your profile location at city-and-neighbours zoom
  // (no flash of the whole world first). Device location, if shared, refines it below. Guests
  // start on the whole map until they share where they are.
  const lastView = useRef<View | undefined>(
    focused ? { center: focused.coords, zoom: 220 } : located ? { center: me.coords, zoom: LOCAL_ZOOM } : undefined,
  );
  const [here, setHere] = useState<[number, number] | null>(null);

  // Ask for location once when the map opens. If it's refused or unavailable (e.g. not on
  // https), the map simply stays on the location set in your profile.
  useEffect(() => {
    if (focused || !navigator.geolocation) return;
    let live = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!live) return;
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setHere(coords);
        setDeviceLocation(coords);
        earth.current?.flyTo(coords, LOCAL_ZOOM);
      },
      () => undefined,
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => creatives.filter((c) => matches(c, filters, me)), [creatives, filters, me]);
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

  const onViewChange = useCallback((visible: Creative[], center: [number, number], zoom: number) => {
    lastView.current = { center, zoom };
    setView({ visible, center, zoom });
  }, []);

  const flags = usePromotionFlags();
  const sameCity = (c: Creative) => !!me.city && c.city.toLowerCase() === me.city.toLowerCase();
  // Featured profiles in your city lead the list (max 2, marked Promoted); then nearest first.
  const { top: featuredTop, rest: listed } = useMemo(() => {
    const byDistance = [...view.visible].sort((a, b) => geoDistance(a.coords, view.center) - geoDistance(b.coords, view.center));
    return splitPromoted(byDistance, (c) => flags.isFeatured(c.id) && sameCity(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flags, me.city]);

  const place = view.zoom < 5 ? 'Everywhere' : `Around ${nearestCity(view.center)}`;

  const q = query.trim().toLowerCase();
  const results = q
    ? [
        ...CITY_NAMES.filter((c) => c.toLowerCase().includes(q)).map((c) => ({ kind: 'city' as const, city: c })),
        ...creatives
          .filter((c) => c.name.toLowerCase().includes(q) || c.genres.some((g) => g.toLowerCase().includes(q)))
          // Featured profiles from your city come first in search too.
          .sort((a, b) => Number(flags.isFeatured(b.id) && sameCity(b)) - Number(flags.isFeatured(a.id) && sameCity(a)))
          .map((c) => ({ kind: 'person' as const, person: c })),
      ].slice(0, 7)
    : [];

  const focus = (c: Creative) => {
    setSelectedId(c.id);
    earth.current?.flyTo(c.coords, 320);
  };

  const locate = () => {
    const fallback = () => (here || located) && earth.current?.flyTo(here ?? me.coords, LOCAL_ZOOM);
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setHere(coords);
        setDeviceLocation(coords);
        earth.current?.flyTo(coords, LOCAL_ZOOM);
      },
      fallback,
      { timeout: 5000 },
    );
  };

  const Earth = mapMode === 'globe' ? Globe : FlatEarth;

  return (
    <div className="map-page">
      <div className={`map-stage is-${mapMode}`}>
        <Earth
          key={mapMode}
          ref={earth}
          creatives={filtered}
          me={me}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onViewChange={onViewChange}
          initialView={lastView.current}
          range={range}
          here={here}
        />

        <div className="map-top">
          <div className="map-top-row">
          <div className="search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search a city, name or genre"
              aria-label="Search"
            />
            {query && (
              <button className="icon-btn ghost" onClick={() => setQuery('')} aria-label="Clear search">
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
                          earth.current?.flyTo(cityCoords(r.city), 140);
                          setQuery('');
                        }}
                      >
                        <span className="search-icon"><Icon name="pin" size={16} /></span>
                        <span>{r.city}</span>
                        <span className="muted small">{creatives.filter((c) => c.city === r.city).length} creatives</span>
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
                        <span className="muted small">{rolesOf(r.person).map((x) => roleInfo(x).label).join(' + ')} · {r.person.city}</span>
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
            <Icon name="levels" size={17} /> Filters
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

        <div className="mode-toggle" role="radiogroup" aria-label="Map style">
          {(['flat', 'globe'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mapMode === m}
              className={mapMode === m ? 'is-on' : ''}
              onClick={() => setMapMode(m)}
            >
              <Icon name={m === 'flat' ? 'flat' : 'sphere'} size={17} />
              {m === 'flat' ? 'Flat' : 'Globe'}
            </button>
          ))}
        </div>

        <div className="map-controls">
          <button className="icon-btn" onClick={() => earth.current?.zoomBy(2)} aria-label="Zoom in">
            <Icon name="plus" />
          </button>
          <button className="icon-btn" onClick={() => earth.current?.zoomBy(0.5)} aria-label="Zoom out">
            <Icon name="minus" />
          </button>
          <button className="icon-btn" onClick={() => earth.current?.reset()} aria-label="Show whole map">
            <Icon name="globe" />
          </button>
          <button className="icon-btn accent" onClick={locate} aria-label="Near me">
            <Icon name="locate" />
          </button>
        </div>

        {selected && (
          <div className="preview-card" key={selected.id} style={{ ['--role' as string]: roleInfo(selected.role).color }}>
            <button className="icon-btn ghost preview-close" onClick={() => setSelectedId(null)} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
            <div className="preview-head">
              <Avatar person={selected} size={54} badge />
              <div>
                <h3>{selected.name}</h3>
                {flags.isVerifiedStudio(selected.id) && (
                  <span className="verified">
                    <Icon name="speaker" size={12} /> Verified Studio
                  </span>
                )}
                <div className="muted small">
                  <RoleLine person={selected} /> · {selected.city}
                  {located && <> · {formatMiles(milesBetween(me.coords, selected.coords))}</>}
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
                <Icon name="radius" size={15} /> Travels up to {selected.travelMiles} mi
                {located && reaches(selected, me.coords) && <span className="tag-good">reaches you</span>}
              </p>
            )}
            <div className="preview-meta small">
              <span>{selected.rate}</span>
              {selected.reviews ? (
                <span className="rating">
                  <Icon name="star" size={13} filled /> {selected.rating.toFixed(1)} <span className="muted">({selected.reviews})</span>
                </span>
              ) : (
                <span className="muted">New</span>
              )}
              {selected.available ? <span className="available">Available</span> : <span className="muted">Booked up</span>}
            </div>
            <GenreChips ids={selected.genres} small />
            <SocialLinks socials={selected.socials} compact />
            <div className="preview-actions">
              <button className="btn primary" onClick={() => requireSignIn(`Sign in to message ${selected.name}.`) && navigate(`/messages/${selected.id}`)}>
                <Icon name="chat" size={17} /> Message
              </button>
              <Link className="btn" to={`/u/${selected.id}`}>
                View profile
              </Link>
            </div>
          </div>
        )}
      </div>

      <aside className={`panel${sheetOpen ? ' is-open' : ''}`}>
        <button className="panel-head" onClick={() => setSheetOpen((o) => !o)}>
          <span>
            <strong>
              {place}
            </strong>
            <span className="muted small">
              {featuredTop.length + listed.length} creatives in view
            </span>
          </span>
          <span className="panel-toggle">
            <Icon name="chevron" size={18} />
          </span>
        </button>
        <div className="panel-list">
          {featuredTop.length + listed.length === 0 && (
            <p className="empty">
              No one here. Zoom out or loosen your filters.
              {filterCount > 0 && (
                <button className="btn block" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
              )}
            </p>
          )}
          {featuredTop.map((c) => (
            <CreativeRow key={c.id} person={c} promoted active={c.id === selectedId} onClick={() => focus(c)} />
          ))}
          {listed.map((c) => (
            <CreativeRow
              key={c.id}
              person={c}
              active={c.id === selectedId}
              onClick={() => focus(c)}
              meta={located ? formatMiles(milesBetween(me.coords, c.coords)) : undefined}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}
