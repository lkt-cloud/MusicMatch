// How the street-map detail is drawn: as SVG path strings, cached per tile (each map's
// projection never changes, and the country map uses its own copies of the tiles).

import type { GeoPath, GeoPermissibleObjects } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import type { RoadClass, TileData } from './tiles';

export const ROAD_ORDER: RoadClass[] = ['secondary', 'primary', 'trunk', 'motorway'];

/** Road classes worth drawing at a tile zoom: highways regionally, more as you get closer. */
const ROAD_MIN_Z: Record<RoadClass, number> = { motorway: 0, trunk: 0, primary: 9, secondary: 11 };
export const roadsAt = (tileZ: number) => ROAD_ORDER.filter((c) => tileZ >= ROAD_MIN_Z[c]);

/** Road widths in screen pixels (fill, and the darker casing drawn underneath). */
export const ROAD_STYLE: Record<RoadClass, { width: number; casing: number; color: string }> = {
  motorway: { width: 2.2, casing: 3.8, color: '#f3d48a' },
  trunk: { width: 1.8, casing: 3.2, color: '#efdba6' },
  primary: { width: 1.1, casing: 0, color: 'rgba(241, 232, 210, 0.75)' },
  secondary: { width: 0.7, casing: 0, color: 'rgba(250, 246, 234, 0.5)' },
};

export const LINE_STYLE = {
  state: { width: 1.1, dash: [6, 3], color: 'rgba(28, 30, 24, 0.55)' },
  county: { width: 0.8, dash: [3, 3], color: 'rgba(28, 30, 24, 0.42)' },
  city: { width: 1, dash: [1, 2.5], color: 'rgba(120, 62, 30, 0.75)' },
};

const collection = (features: GeoPermissibleObjects[]) =>
  ({ type: 'FeatureCollection', features }) as unknown as FeatureCollection;

export type TilePaths = {
  land: string;
  water: string;
  roads: Record<RoadClass, string>;
  lines: Record<'state' | 'county' | 'city', string>;
};

const svgCache = new WeakMap<TileData, TilePaths>();

/** SVG path strings for one tile in the flat earth's fixed projection (computed once). */
export function tilePaths(tile: TileData, path: GeoPath): TilePaths {
  let p = svgCache.get(tile);
  if (!p) {
    p = {
      land: path(tile.bounds) ?? '',
      water: path(collection(tile.water)) ?? '',
      roads: Object.fromEntries(ROAD_ORDER.map((c) => [c, path(collection(tile.roads[c])) ?? ''])) as Record<RoadClass, string>,
      lines: {
        state: path(collection(tile.boundaries.state)) ?? '',
        county: path(collection(tile.boundaries.county)) ?? '',
        city: path(collection(tile.boundaries.city)) ?? '',
      },
    };
    svgCache.set(tile, p);
  }
  return p;
}
