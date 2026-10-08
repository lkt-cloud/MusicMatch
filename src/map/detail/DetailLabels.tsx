import { useMemo } from 'react';
import type { Counties } from './counties';
import { TILE_ATTRIBUTION, type PlaceClass, type TileData } from './tiles';

type Props = {
  tiles: TileData[];
  counties: Counties | null;
  tileZ: number;
  size: { w: number; h: number };
  toScreen: (coords: [number, number]) => [number, number] | null;
  /** Place names drawn elsewhere (under a crowd of pins), so they aren't doubled up. */
  owned?: Set<string>;
};

// Which place types to show at each tile zoom, and in what order they claim space.
const MIN_Z: Record<PlaceClass, number> = { city: 0, town: 7, village: 9, suburb: 10 };
const PRIORITY: Record<PlaceClass | 'county', number> = { city: 0, county: 1, town: 2, village: 3, suburb: 4 };
const MAX_LABELS = 70;

type Candidate = { text: string; coords: [number, number]; kind: PlaceClass | 'county'; rank: number };

/** Place and county names over the detailed map, skipping any that would overlap. */
export function DetailLabels({ tiles, counties, tileZ, size, toScreen, owned }: Props) {
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: Candidate[] = [];
    for (const t of tiles)
      for (const p of t.places) {
        if (tileZ < MIN_Z[p.cls] || seen.has(p.name) || owned?.has(p.name)) continue; // the same town appears in neighbouring tiles
        seen.add(p.name);
        out.push({ text: p.name, coords: p.coords, kind: p.cls, rank: p.rank });
      }
    for (const c of counties?.labels ?? []) out.push({ text: c.name, coords: c.coords, kind: 'county', rank: 0 });
    return out.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.rank - b.rank);
  }, [tiles, counties, tileZ, owned]);

  // Greedy placement: highest priority first; drop anything that would collide.
  const placed: { c: Candidate; x: number; y: number }[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const c of candidates) {
    if (placed.length >= MAX_LABELS) break;
    const p = toScreen(c.coords);
    if (!p || p[0] < -40 || p[1] < -20 || p[0] > size.w + 40 || p[1] > size.h + 20) continue;
    const charW = c.kind === 'city' ? 7.4 : c.kind === 'county' ? 6.6 : 6.2;
    const w = c.text.length * charW + 10;
    const h = c.kind === 'city' ? 18 : 15;
    const box: [number, number, number, number] = [p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2];
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    placed.push({ c, x: p[0], y: p[1] });
  }

  return (
    <>
      {placed.map(({ c, x, y }) => (
        <span key={`${c.kind}:${c.text}:${c.coords.join()}`} className={`map-label is-${c.kind}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
          {c.text}
        </span>
      ))}
      {tiles.length > 0 && <span className="map-attribution">{TILE_ATTRIBUTION}</span>}
    </>
  );
}
