import { GENRES, genreInfo } from '../data/genres';
import { ROLES, roleInfo, rolesOf } from '../data/roles';
import type { Creative, Role } from '../data/types';
import { milesBetween, reaches } from '../map/shared';
import { Icon, RoleIcon } from './Icon';

export type Filters = {
  /** Only people within this many miles of you; null = anywhere. */
  miles: number | null;
  /** Services wanted — matches anyone who does any of them (main role or not). */
  roles: Role[];
  /** Genres — matches anyone tagged with any of them. */
  genres: string[];
  comesToMe: boolean;
  availableOnly: boolean;
};

export const NO_FILTERS: Filters = { miles: null, roles: [], genres: [], comesToMe: false, availableOnly: false };

export const countFilters = (f: Filters) =>
  (f.miles != null ? 1 : 0) + f.roles.length + f.genres.length + (f.comesToMe ? 1 : 0) + (f.availableOnly ? 1 : 0);

export function matches(c: Creative, f: Filters, me: Creative) {
  if (f.miles != null && milesBetween(me.coords, c.coords) > f.miles) return false;
  if (f.roles.length && !rolesOf(c).some((r) => f.roles.includes(r))) return false;
  if (f.genres.length && !c.genres.some((g) => f.genres.includes(g))) return false;
  if (f.comesToMe && !reaches(c, me.coords)) return false;
  if (f.availableOnly && !c.available) return false;
  return true;
}

// Slider stops: non-linear so short distances are easy to pick.
const STOPS = [1, 5, 10, 15, 25, 50, 75, 100, 150, 250, 500, 1000];
const SERVICE: Record<Role, string> = {
  producer: 'Beats & production',
  engineer: 'Mixing & mastering',
  studio: 'Studio time',
  videographer: 'Music videos',
  artist: 'Artists & features',
};

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function FilterPanel({
  value,
  onChange,
  onClose,
  resultCount,
  me,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  resultCount: number;
  me: Creative;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const stop = value.miles == null ? STOPS.length : STOPS.indexOf(value.miles);

  return (
    <div className="filter-panel" role="dialog" aria-label="Filters">
      <div className="filter-head">
        <h2>Filters</h2>
        <button className="icon-btn ghost" onClick={onClose} aria-label="Close filters">
          <Icon name="close" size={18} />
        </button>
      </div>

      <section className="filter-section">
        <div className="filter-label">
          <span><Icon name="radius" size={16} /> Distance from you</span>
          <strong>{value.miles == null ? 'Anywhere' : `Within ${value.miles} mi`}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={STOPS.length}
          step={1}
          value={stop}
          onChange={(e) => {
            const i = Number(e.target.value);
            set({ miles: i >= STOPS.length ? null : STOPS[i] });
          }}
          style={{ ['--pct' as string]: `${(stop / STOPS.length) * 100}%` }}
          className="range-input"
          aria-label="Distance from you"
          aria-valuetext={value.miles == null ? 'Anywhere' : `${value.miles} miles`}
        />
        <div className="range-scale small muted">
          <span>1 mi</span>
          <span>from {me.city || 'you'}</span>
          <span>Anywhere</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={value.comesToMe} onChange={(e) => set({ comesToMe: e.target.checked })} />
          <span>Only people who’ll travel to me</span>
        </label>
      </section>

      <section className="filter-section">
        <div className="filter-label">
          <span><Icon name="headphones" size={16} /> Services</span>
          {value.roles.length > 0 && <button className="link" onClick={() => set({ roles: [] })}>Clear</button>}
        </div>
        <div className="service-grid">
          {ROLES.map((r) => {
            const on = value.roles.includes(r.id);
            return (
              <button
                key={r.id}
                className={`service${on ? ' is-on' : ''}`}
                style={{ ['--role' as string]: r.color }}
                onClick={() => set({ roles: toggle(value.roles, r.id) })}
                aria-pressed={on}
              >
                <span className="service-icon"><RoleIcon role={r.id} size={18} /></span>
                <span>
                  <strong>{SERVICE[r.id]}</strong>
                  <span>{r.plural}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <div className="filter-label">
          <span><Icon name="notes" size={16} /> Genres</span>
          {value.genres.length > 0 && <button className="link" onClick={() => set({ genres: [] })}>Clear</button>}
        </div>
        <div className="chips genre-picker">
          {GENRES.map((g) => {
            const on = value.genres.includes(g.id);
            return (
              <button
                key={g.id}
                className={`genre${on ? ' is-on' : ''}`}
                style={{ ['--genre' as string]: g.color }}
                onClick={() => set({ genres: toggle(value.genres, g.id) })}
                aria-pressed={on}
              >
                <i className="genre-dot" aria-hidden />
                {g.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-section">
        <label className="check">
          <input type="checkbox" checked={value.availableOnly} onChange={(e) => set({ availableOnly: e.target.checked })} />
          <span>Available now only</span>
        </label>
      </section>

      <div className="filter-foot">
        <button className="btn" onClick={() => onChange(NO_FILTERS)} disabled={!countFilters(value)}>
          Clear all
        </button>
        <button className="btn primary" onClick={onClose}>
          Show {resultCount} {resultCount === 1 ? 'creative' : 'creatives'}
        </button>
      </div>
    </div>
  );
}

/** Removable summary pills for the active filters. */
export function ActiveFilters({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  if (!countFilters(value)) return null;
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <div className="active-filters">
      {value.miles != null && (
        <button className="pill range-pill" onClick={() => set({ miles: null })}>
          <Icon name="radius" size={13} /> Within {value.miles} mi <Icon name="close" size={11} />
        </button>
      )}
      {value.roles.map((r) => (
        <button key={r} className="pill" style={{ ['--c' as string]: roleInfo(r).color }} onClick={() => set({ roles: value.roles.filter((x) => x !== r) })}>
          <RoleIcon role={r} size={13} /> {roleInfo(r).plural} <Icon name="close" size={11} />
        </button>
      ))}
      {value.genres.map((g) => (
        <button key={g} className="pill" style={{ ['--c' as string]: genreInfo(g)!.color }} onClick={() => set({ genres: value.genres.filter((x) => x !== g) })}>
          <i className="genre-dot" aria-hidden /> {genreInfo(g)!.label} <Icon name="close" size={11} />
        </button>
      ))}
      {value.comesToMe && (
        <button className="pill" onClick={() => set({ comesToMe: false })}>
          Travels to me <Icon name="close" size={11} />
        </button>
      )}
      {value.availableOnly && (
        <button className="pill" onClick={() => set({ availableOnly: false })}>
          Available now <Icon name="close" size={11} />
        </button>
      )}
      <button className="pill clear" onClick={() => onChange(NO_FILTERS)}>Clear all</button>
    </div>
  );
}
