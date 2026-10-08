// Street-map detail (main roads, city & county lines, water, place names) for when you zoom in.
// Data: OpenFreeMap vector tiles (OpenMapTiles schema, © OpenStreetMap contributors),
// free and keyless. Tiles are Web-Mercator squares; we decode them to longitude/latitude
// GeoJSON and draw them through our own projections, so they sit on both the flat earth
// and the globe.

import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { geoArea } from 'd3-geo';
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
export const TILE_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

/** Coarsest / finest tile zoom we load. Below 6 roads are meaningless; above 12 is street level. */
export const MIN_TILE_Z = 6;
export const MAX_TILE_Z = 12;

export type RoadClass = 'motorway' | 'trunk' | 'primary' | 'secondary';
export type PlaceClass = 'city' | 'town' | 'village' | 'suburb';

export type Place = { name: string; coords: [number, number]; cls: PlaceClass; rank: number };

export type TileData = {
  key: string;
  /** The tile's square, so the area can be painted as land before its water is drawn. */
  bounds: Feature<Polygon>;
  water: Feature<Polygon | MultiPolygon>[];
  roads: Record<RoadClass, Feature<LineString | MultiLineString>[]>;
  /** admin_level 4 / 6 / 8: state, county, city limits. */
  boundaries: Record<'state' | 'county' | 'city', Feature<LineString | MultiLineString>[]>;
  places: Place[];
};

// ------------------------------------------------------------------ tile maths (Web Mercator)

export const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const latToY = (lat: number, z: number) => {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const xToLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const yToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

/** A tile's outline as a polygon, traced clockwise (what d3-geo treats as "inside"). */
function tileBounds(x: number, y: number, z: number): Feature<Polygon> {
  const [w, e, n, s] = [xToLng(x, z), xToLng(x + 1, z), yToLat(y, z), yToLat(y + 1, z)];
  const ring: [number, number][] = [];
  // Densify edges so the square bends correctly in curved projections.
  const steps = 8;
  for (let i = 0; i <= steps; i++) ring.push([w + ((e - w) * i) / steps, n]);
  for (let i = 1; i <= steps; i++) ring.push([e, n + ((s - n) * i) / steps]);
  for (let i = 1; i <= steps; i++) ring.push([e - ((e - w) * i) / steps, s]);
  for (let i = 1; i < steps; i++) ring.push([w, s - ((s - n) * i) / steps]);
  ring.push(ring[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/**
 * Vector-tile polygons come out wound the opposite way to what d3-geo expects, which would
 * make each lake cover the whole planet. Flip any ring set whose area is over a hemisphere.
 */
function rewind<T extends Polygon | MultiPolygon>(f: Feature<T>): Feature<T> {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys as number[][][][]) {
    const poly: Polygon = { type: 'Polygon', coordinates: rings };
    if (geoArea(poly) > 2 * Math.PI) rings.forEach((ring) => ring.reverse());
  }
  return f;
}

// ------------------------------------------------------------------ fetching & decoding

let templatePromise: Promise<string> | null = null;
/** The tile URL changes with each weekly data release, so read it from the TileJSON once. */
const tileTemplate = () =>
  (templatePromise ??= fetch(TILEJSON)
    .then((r) => r.json())
    .then((j: { tiles: string[] }) => j.tiles[0])
    .catch((e) => {
      templatePromise = null; // try again next time
      throw e;
    }));

const ROAD_CLASSES = new Set<string>(['motorway', 'trunk', 'primary', 'secondary']);
const PLACE_CLASSES = new Set<string>(['city', 'town', 'village', 'suburb']);
const BOUNDARY_LEVEL: Record<number, 'state' | 'county' | 'city'> = { 4: 'state', 6: 'county', 8: 'city' };

function decode(buf: ArrayBuffer, x: number, y: number, z: number, key: string): TileData {
  const tile = new VectorTile(new PbfReader(new Uint8Array(buf)));
  const data: TileData = {
    key,
    bounds: tileBounds(x, y, z),
    water: [],
    roads: { motorway: [], trunk: [], primary: [], secondary: [] },
    boundaries: { state: [], county: [], city: [] },
    places: [],
  };

  const each = (name: string, fn: (f: ReturnType<VectorTile['layers'][string]['feature']>) => void) => {
    const layer = tile.layers[name];
    if (layer) for (let i = 0; i < layer.length; i++) fn(layer.feature(i));
  };

  each('water', (f) => {
    if (f.type !== 3) return;
    data.water.push(rewind(f.toGeoJSON(x, y, z) as Feature<Polygon | MultiPolygon>));
  });
  each('transportation', (f) => {
    const cls = String(f.properties.class);
    // Secondary roads only once you're zoomed in enough for them to help.
    if (f.type !== 2 || !ROAD_CLASSES.has(cls) || (cls === 'secondary' && z < 9)) return;
    if (f.properties.brunnel === 'tunnel') return;
    data.roads[cls as RoadClass].push(f.toGeoJSON(x, y, z) as Feature<LineString | MultiLineString>);
  });
  each('boundary', (f) => {
    const level = BOUNDARY_LEVEL[Number(f.properties.admin_level)];
    if (f.type !== 2 || !level || f.properties.maritime === 1) return;
    data.boundaries[level].push(f.toGeoJSON(x, y, z) as Feature<LineString | MultiLineString>);
  });
  each('place', (f) => {
    const cls = String(f.properties.class);
    const name = (f.properties['name:en'] ?? f.properties['name:latin'] ?? f.properties.name) as string | undefined;
    if (f.type !== 1 || !PLACE_CLASSES.has(cls) || !name) return;
    const g = f.toGeoJSON(x, y, z).geometry;
    if (g.type !== 'Point') return;
    data.places.push({ name, coords: g.coordinates as [number, number], cls: cls as PlaceClass, rank: Number(f.properties.rank ?? 10) });
  });
  return data;
}

// Recently used tiles stay in memory so panning back is instant.
const cache = new Map<string, Promise<TileData | null>>();
const CACHE_LIMIT = 160;

export function loadTile(x: number, y: number, z: number): Promise<TileData | null> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // mark as recently used
    return hit;
  }
  const p = tileTemplate()
    .then((tpl) => fetch(tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))))
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((buf) => (buf ? decode(buf, x, y, z, key) : null))
    .catch(() => {
      cache.delete(key); // network hiccup: allow a retry
      return null;
    });
  cache.set(key, p);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return p;
}
