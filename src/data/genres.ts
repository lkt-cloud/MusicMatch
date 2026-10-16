// The genre list. Each genre has its own colour; people pick as many as they like.

import { t } from '../i18n';

export type GenreInfo = { id: string; label: string; color: string };

export const GENRES: GenreInfo[] = [
  { id: 'rap', get label() { return t('Rap'); }, color: '#8a4b2f' },
  { id: 'hiphop', get label() { return t('Hip-Hop'); }, color: '#a0603a' },
  { id: 'trap', get label() { return t('Trap'); }, color: '#5a3a5e' },
  { id: 'drill', get label() { return t('Drill'); }, color: '#3a3f4a' },
  { id: 'boombap', get label() { return t('Boom Bap'); }, color: '#7a6a3a' },
  { id: 'rnb', get label() { return t('R&B'); }, color: '#9a4a5a' },
  { id: 'soul', get label() { return t('Soul'); }, color: '#b8743f' },
  { id: 'pop', get label() { return t('Pop'); }, color: '#c4687a' },
  { id: 'afrobeats', get label() { return t('Afrobeats'); }, color: '#c9902a' },
  { id: 'amapiano', get label() { return t('Amapiano'); }, color: '#3f7a78' },
  { id: 'dancehall', get label() { return t('Dancehall'); }, color: '#4f7a3a' },
  { id: 'reggae', get label() { return t('Reggae'); }, color: '#6b8a2f' },
  { id: 'latin', get label() { return t('Latin'); }, color: '#c0573a' },
  { id: 'grime', get label() { return t('Grime'); }, color: '#4a4a44' },
  { id: 'funk', get label() { return t('Funk'); }, color: '#a8762a' },
  { id: 'jazz', get label() { return t('Jazz'); }, color: '#44627a' },
  { id: 'gospel', get label() { return t('Gospel'); }, color: '#8a7a3c' },
  { id: 'rock', get label() { return t('Rock'); }, color: '#7a2f3a' },
  { id: 'alt', get label() { return t('Alternative'); }, color: '#6a6a8a' },
  { id: 'electronic', get label() { return t('Electronic'); }, color: '#4a5590' },
  { id: 'house', get label() { return t('House'); }, color: '#5a8aa8' },
  { id: 'lofi', get label() { return t('Lo-fi'); }, color: '#7f9a7a' },
  { id: 'country', get label() { return t('Country'); }, color: '#9a6a3a' },
  { id: 'kpop', get label() { return t('K-Pop'); }, color: '#b06a9a' },
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
