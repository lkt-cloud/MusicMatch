// The genre list. Each genre has its own colour; people pick as many as they like.

export type GenreInfo = { id: string; label: string; color: string };

export const GENRES: GenreInfo[] = [
  { id: 'rap', label: 'Rap', color: '#8a4b2f' },
  { id: 'hiphop', label: 'Hip-Hop', color: '#a0603a' },
  { id: 'trap', label: 'Trap', color: '#5a3a5e' },
  { id: 'drill', label: 'Drill', color: '#3a3f4a' },
  { id: 'boombap', label: 'Boom Bap', color: '#7a6a3a' },
  { id: 'rnb', label: 'R&B', color: '#9a4a5a' },
  { id: 'soul', label: 'Soul', color: '#b8743f' },
  { id: 'pop', label: 'Pop', color: '#c4687a' },
  { id: 'afrobeats', label: 'Afrobeats', color: '#c9902a' },
  { id: 'amapiano', label: 'Amapiano', color: '#3f7a78' },
  { id: 'dancehall', label: 'Dancehall', color: '#4f7a3a' },
  { id: 'reggae', label: 'Reggae', color: '#6b8a2f' },
  { id: 'latin', label: 'Latin', color: '#c0573a' },
  { id: 'grime', label: 'Grime', color: '#4a4a44' },
  { id: 'funk', label: 'Funk', color: '#a8762a' },
  { id: 'jazz', label: 'Jazz', color: '#44627a' },
  { id: 'gospel', label: 'Gospel', color: '#8a7a3c' },
  { id: 'rock', label: 'Rock', color: '#7a2f3a' },
  { id: 'alt', label: 'Alternative', color: '#6a6a8a' },
  { id: 'electronic', label: 'Electronic', color: '#4a5590' },
  { id: 'house', label: 'House', color: '#5a8aa8' },
  { id: 'lofi', label: 'Lo-fi', color: '#7f9a7a' },
  { id: 'country', label: 'Country', color: '#9a6a3a' },
  { id: 'kpop', label: 'K-Pop', color: '#b06a9a' },
];

const BY_ID = new Map(GENRES.map((g) => [g.id, g]));
export const genreInfo = (id: string) => BY_ID.get(id);

// Older free-text genres → genre ids.
const ALIASES: Record<string, string[]> = {
  rap: ['rap'],
  'rap fr': ['rap'],
  melodic: ['rap', 'rnb'],
  chopped: ['rap', 'hiphop'],
  memphis: ['rap', 'hiphop'],
  'west coast': ['hiphop'],
  bay: ['hiphop'],
  'k-hip hop': ['hiphop', 'kpop'],
  'hip-hop': ['hiphop'],
  'hip hop': ['hiphop'],
  'boom bap': ['boombap'],
  'uk drill': ['drill'],
  'afro-rap': ['afrobeats', 'rap'],
  corridos: ['latin'],
  gqom: ['electronic'],
  'r&b': ['rnb'],
};

/** Maps any mix of ids, labels or old free-text names onto genre ids (unknowns dropped). */
/**
 * Turns anything genre-like (ids, labels, old free-text tags) into known genre ids: no
 * duplicates, nothing unknown, always in the catalogue's order so profiles look consistent.
 */
export function toGenreIds(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (BY_ID.has(key)) out.add(key);
    else {
      const byLabel = GENRES.find((g) => g.label.toLowerCase() === key);
      if (byLabel) out.add(byLabel.id);
      else ALIASES[key]?.forEach((id) => out.add(id));
    }
  }
  return GENRES.filter((g) => out.has(g.id)).map((g) => g.id);
}
