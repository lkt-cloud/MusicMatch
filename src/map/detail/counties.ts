// US county lines and names (U.S. Census data via the us-atlas package). Loaded only
// when you zoom in over the US, since the file is ~800 KB.

import { geoCentroid } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { MultiLineString } from 'geojson';

export type CountyLabel = { name: string; coords: [number, number] };
export type Counties = { lines: MultiLineString; labels: CountyLabel[] };

/** Roughly the area worth loading counties for: lower 48, Alaska, Hawaii. */
export const US_BOUNDS = { west: -180, east: -64, south: 17, north: 72 };

// Louisiana has parishes, Alaska boroughs; everywhere else counties.
const SUFFIX: Record<string, string> = { '22': 'Parish', '02': 'Borough' };

let promise: Promise<Counties> | null = null;

export function loadCounties(): Promise<Counties> {
  return (promise ??= import('us-atlas/counties-10m.json').then((m) => {
    const topo = m.default as unknown as Topology<{ counties: GeometryCollection<{ name: string }> }>;
    const counties = feature(topo, topo.objects.counties);
    return {
      // Only the lines between counties (state lines and coasts are drawn elsewhere).
      lines: mesh(topo, topo.objects.counties, (a, b) => a !== b),
      labels: counties.features.map((f) => {
        const name = f.properties.name;
        const suffix = SUFFIX[String(f.id).slice(0, 2)] ?? 'County';
        return {
          name: name.endsWith(suffix) || name.includes('City') ? name : `${name} ${suffix}`,
          coords: geoCentroid(f) as [number, number],
        };
      }),
    };
  }));
}
