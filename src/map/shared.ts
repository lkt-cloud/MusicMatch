import type { Ref } from 'react';
import { geoArea, geoBounds, geoCentroid, geoCircle, geoContains, geoDistance } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world50 from 'world-atlas/countries-50m.json';
import world110 from 'world-atlas/countries-110m.json';
import subdivisions from '../data/subdivisions.json';
import type { Creative } from '../data/types';
import { getSettings } from '../settings';
import { NUMERIC } from '../data/country-codes';

/**
 * Zoom that frames roughly 80 miles around a point: your city plus its neighbours.
 * (Zoom is a multiple of the whole-map view; ~1.9 / radius-in-radians fits that radius on screen.)
 */
export const LOCAL_ZOOM = 90;
/** The map only draws creatives within this many miles of where you live (or where you last jumped to). */
export const AREA_MILES = 250;

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
  /** `whole`: the country map is showing the whole country (zoomed all the way out). */
  onViewChange?: (visible: Creative[], center: [number, number], zoom: number, whole?: boolean) => void;
  /** Where to start, e.g. the view from before switching between the country and flat maps. */
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
/** Lighter outlines for drawing while the map is moving. */
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

const KM_PER_MI = 1.609344;
const useKm = () => getSettings().units === 'km';

/** A distance (worked out in miles) in the units chosen in Settings. */
export const formatDistance = (mi: number) => {
  const [n, unit] = useKm() ? [mi * KM_PER_MI, 'km'] : [mi, 'mi'];
  return n < 10 ? `${n.toFixed(1)} ${unit}` : `${Math.round(n).toLocaleString()} ${unit}`;
};

/** A round radius (in miles), e.g. "25 mi" or "40 km". */
export const formatRadius = (mi: number) => (useKm() ? `${Math.round(mi * KM_PER_MI)} km` : `${mi} mi`);

// ------------------------------------------------------------------ countries

type CountryShape = Feature<Polygon | MultiPolygon>;
const topo50 = world50 as unknown as Topology<{ countries: GeometryCollection }>;
const ALPHA2 = Object.fromEntries(Object.entries(NUMERIC).map(([a2, n]) => [n, a2]));

// Every country's outline and bounding box, worked out once when first needed.
let countries: { code: string; shape: CountryShape; box: [[number, number], [number, number]] }[] | null = null;
const allCountries = () =>
  (countries ??= topo50.objects.countries.geometries.flatMap((g) => {
    const code = ALPHA2[String(g.id)];
    if (!code) return [];
    const shape = feature(topo50, g) as unknown as CountryShape;
    return [{ code, shape, box: geoBounds(shape) as [[number, number], [number, number]] }];
  }));

/** A country's outline (ISO alpha-2), or null for the few tiny places the world map doesn't have. */
export const countryShape = (code: string): CountryShape | null => allCountries().find((c) => c.code === code)?.shape ?? null;

const inBox = ([lng, lat]: [number, number], [[w, s], [e, n]]: [[number, number], [number, number]]) =>
  lat >= s && lat <= n && (w <= e ? lng >= w && lng <= e : lng >= w || lng <= e);

/** Which country a point is in (ISO alpha-2), or null at sea. */
export function countryAt(point: [number, number]): string | null {
  for (const c of allCountries()) if (inBox(point, c.box) && geoContains(c.shape, point)) return c.code;
  return null;
}

/** Middle of a country's main landmass, e.g. for loading people when switching to it. */
export const countryCenter = (code: string): [number, number] | null => {
  const shape = countryShape(code);
  return shape ? (geoCentroid(mainland(shape)) as [number, number]) : null;
};

/**
 * A country's main landmass: its biggest piece plus other large pieces near it, so far-off
 * territories (Alaska, Hawaii, Okinawa, overseas departments) don't shrink the opening view.
 */
export function mainland(shape: CountryShape): Feature<MultiPolygon> {
  const polys: Position[][][] = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
  const parts = polys.map((coordinates) => {
    const poly: Polygon = { type: 'Polygon', coordinates };
    return { coordinates, area: geoArea(poly), centroid: geoCentroid(poly) };
  });
  const biggest = parts.reduce((a, b) => (b.area > a.area ? b : a));
  const NEAR_MILES = 1600;
  const keep = parts.filter((p) => p.area >= biggest.area * 0.04 && geoDistance(p.centroid, biggest.centroid) * EARTH_RADIUS_MI <= NEAR_MILES);
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: keep.map((p) => p.coordinates) } };
}
