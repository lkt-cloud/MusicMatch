// How the street-map detail is drawn: once as SVG path strings for the flat earth
// (cached per tile, since that projection never changes), and straight to canvas for
// the globe (redrawn as it turns).

import type { GeoPath, GeoPermissibleObjects } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import type { Counties } from './counties';
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

/** Draws the detail onto the globe's canvas with the current projection. */
export function drawDetail(
  ctx: CanvasRenderingContext2D,
  path: GeoPath<unknown, GeoPermissibleObjects>,
  tiles: TileData[],
  counties: Counties | null,
  opts: { alpha: number; tileZ: number; landColor: (lat: number) => string; water: string; moving?: boolean },
) {
  if (!tiles.length) return;
  // While the globe is being dragged, only the highways are drawn so it stays smooth.
  const light = !!opts.moving;
  ctx.save();
  ctx.globalAlpha = opts.alpha;

  // Each tile's square as land, then its water on top: sharper coasts and lakes than the base map.
  for (const t of light ? [] : tiles) {
    const ring = t.bounds.geometry.coordinates[0];
    ctx.beginPath();
    path(t.bounds);
    ctx.fillStyle = opts.landColor((ring[0][1] + ring[Math.floor(ring.length / 2)][1]) / 2);
    ctx.fill();
    ctx.beginPath();
    path(collection(t.water));
    ctx.fillStyle = opts.water;
    ctx.fill();
  }

  const stroke = (geom: GeoPermissibleObjects, width: number, color: string, dash: number[] = []) => {
    ctx.beginPath();
    path(geom);
    ctx.setLineDash(dash);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (counties && !light) stroke(counties.lines, LINE_STYLE.county.width, LINE_STYLE.county.color, LINE_STYLE.county.dash);
  for (const level of light ? [] : (['county', 'city', 'state'] as const)) {
    const s = LINE_STYLE[level];
    stroke(collection(tiles.flatMap((t) => t.boundaries[level])), s.width, s.color, s.dash);
  }
  for (const cls of roadsAt(opts.tileZ).filter((c) => !light || c === 'motorway' || c === 'trunk')) {
    const s = ROAD_STYLE[cls];
    const roads = collection(tiles.flatMap((t) => t.roads[cls]));
    if (s.casing) stroke(roads, s.casing, 'rgba(40, 34, 24, 0.45)');
    stroke(roads, s.width, s.color);
  }
  ctx.restore();
}
