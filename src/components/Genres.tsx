import { GENRES, genreInfo } from '../data/genres';
import { Icon } from './Icon';

/** Colour-coded genre tags. */
export function GenreChips({ ids, small = false }: { ids: string[]; small?: boolean }) {
  const known = ids.map(genreInfo).filter((g) => !!g);
  if (!known.length) return null;
  return (
    <div className={`chips genre-chips${small ? ' is-small' : ''}`}>
      {known.map((g) => (
        <span key={g.id} className="genre" style={{ ['--genre' as string]: g.color }}>
          <i className="genre-dot" aria-hidden />
          {g.label}
        </span>
      ))}
    </div>
  );
}

/** Pick any number of genres — all equal, none is "main". */
export function GenrePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="chips genre-picker">
      {GENRES.map((g) => {
        const on = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={`genre${on ? ' is-on' : ''}`}
            style={{ ['--genre' as string]: g.color }}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== g.id) : [...value, g.id])}
          >
            {on ? <Icon name="close" size={12} /> : <i className="genre-dot" aria-hidden />}
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
