import type { Ref } from 'react';
import { geoCircle, geoDistance } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world50 from 'world-atlas/countries-50m.json';
import world110 from 'world-atlas/countries-110m.json';
import subdivisions from '../data/subdivisions.json';
import type { Creative } from '../data/types';

/**
 * Zoom that frames roughly 80 miles around a point: your city plus its neighbours.
 * (Zoom is a multiple of the whole-map view; ~1.9 / radius-in-radians fits that radius on screen.)
 */
export const LOCAL_ZOOM = 90;

/** Max zoom, as a multiple of the whole-map view. */
export const MAX_ZOOM = 1200;
export const EARTH_RADIUS_MI = 3958.8;

export type View = { center: [number, number]; zoom: number };

export type EarthHandle = {
  flyTo: (coords: [number, number], zoom?: number) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
  /** Flat map only: spin the disc (radians, clockwise) / turn it back so north is up. */
  rotateBy?: (radians: number) => void;
  resetNorth?: () => void;
};

export type EarthProps = {
  creatives: Creative[];
  me: Creative;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewChange?: (visible: Creative[], center: [number, number], zoom: number) => void;
  /** Where to start, e.g. the view from before switching between flat and globe. */
  initialView?: View;
  /** Search radius drawn around a point (e.g. "within 25 mi of me"). */
  range?: { center: [number, number]; miles: number } | null;
  /** Where you actually are (device location), if you shared it; otherwise your profile location is used. */
  here?: [number, number] | null;
  /** Flat map: called with the current rotation in degrees (0 = the usual way up). */
  onRotate?: (degrees: number) => void;
  ref?: Ref<EarthHandle>;
};

const ANTARCTICA = '010';

function landLayers(world: unknown) {
  const topo = world as Topology<{ countries: GeometryCollection }>;
  const geoms = topo.objects.countries.geometries;
  return {
    land: merge(topo, geoms.filter((g) => g.id !== ANTARCTICA) as never),
    ice: feature(topo, geoms.find((g) => g.id === ANTARCTICA)!),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
  };
}

export const DETAILED = landLayers(world50);
/** Lighter outlines for drawing while the globe is moving. */
export const COARSE = landLayers(world110);

/** US state and Canadian province lines. */
const subTopo = subdivisions as unknown as Topology<{ lines: GeometryCollection }>;
export const STATE_LINES = mesh(subTopo, subTopo.objects.lines);

/** Country borders are always shown, getting a little stronger as you zoom in. */
export const borderOpacity = (zoom: number) => Math.min(1, 0.45 + (zoom - 1) * 0.12);
/** State / province lines fade in once you're past the whole-world view. */
export const stateOpacity = (zoom: number) => Math.max(0, Math.min(1, (zoom - 1.5) / 2.5));

/**
 * Natural land tint by latitude: tundra, forest, desert, tropics.
 * Offsets are distance from the north pole as a fraction of 180°.
 */
// Daylight tones (the flat map darkens the night side on top of these).
export const LAND_STOPS: [number, string][] = [
  [0, '#d8dbd2'],
  [0.14, '#8f9c6e'],
  [0.28, '#a6a477'],
  [0.37, '#c7b383'],
  [0.5, '#7f9160'],
  [0.61, '#bda677'],
  [0.74, '#97a174'],
  [1, '#d5d9d0'],
];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function landColorAt(f: number) {
  const i = Math.max(0, LAND_STOPS.findIndex(([o]) => o >= f) - 1);
  const [o0, c0] = LAND_STOPS[i];
  const [o1, c1] = LAND_STOPS[Math.min(i + 1, LAND_STOPS.length - 1)];
  const t = o1 === o0 ? 0 : (f - o0) / (o1 - o0);
  const a = hexToRgb(c0);
  const b = hexToRgb(c1);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`;
}

/** A circle on the earth's surface, `miles` in radius. */
export const radiusCircle = (center: [number, number], miles: number) =>
  geoCircle()
    .center(center)
    .radius((miles / EARTH_RADIUS_MI) * (180 / Math.PI))
    .precision(2)();

export const milesBetween = (a: [number, number], b: [number, number]) => geoDistance(a, b) * EARTH_RADIUS_MI;

/** Does this creative's travel radius reach `point`? */
export const reaches = (c: Creative, point: [number, number]) =>
  c.travelMiles != null && milesBetween(c.coords, point) <= c.travelMiles;

/** Is this person's pin at a precise spot (a studio address, or they opted in)? */
export const isExact = (c: Pick<Creative, 'address' | 'exactLocation'>) => !!c.address || !!c.exactLocation;

/** For people who only share their city: the area they could be anywhere in, shown on hover. */
export const CITY_AREA_MILES = 12;

export const formatMiles = (mi: number) => (mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString()} mi`);
