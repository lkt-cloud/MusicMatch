// Where the sun and moon are overhead right now. Low-precision formulas from the
// Astronomical Almanac — good to a fraction of a degree for the sun and ~1° for the
// moon, which is far below what you can see on the map.

import { useEffect, useState } from 'react';
import { geoDistance } from 'd3-geo';

const RAD = Math.PI / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;
const norm180 = (x: number) => norm360(x + 180) - 180;

/** Days since J2000.0 (2000-01-01 12:00 UTC). */
const daysSinceJ2000 = (date: Date) => date.getTime() / 86_400_000 + 2440587.5 - 2451545.0;

/** Greenwich mean sidereal time, in degrees. */
const gmst = (n: number) => norm360(280.46061837 + 360.98564736629 * n);

function subPoint(n: number, eclLon: number, eclLat: number): [number, number] {
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const l = eclLon * RAD;
  const b = eclLat * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) / RAD;
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) / RAD;
  return [norm180(ra - gmst(n)), dec];
}

function sunEcliptic(n: number) {
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * RAD;
  return norm360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

function moonEcliptic(n: number) {
  const L = 218.316 + 13.176396 * n;
  const M = (134.963 + 13.064993 * n) * RAD;
  const F = (93.272 + 13.22935 * n) * RAD;
  return { lon: norm360(L + 6.289 * Math.sin(M)), lat: 5.128 * Math.sin(F) };
}

export type Sky = {
  /** Point where the sun is straight overhead (local noon). [lng, lat] */
  sun: [number, number];
  /** Point where the moon is straight overhead. [lng, lat] */
  moon: [number, number];
  /** Moon's angle from the sun along the ecliptic: 0 = new, 180 = full. */
  moonElongation: number;
};

export function skyAt(date: Date): Sky {
  const n = daysSinceJ2000(date);
  const sunLon = sunEcliptic(n);
  const moon = moonEcliptic(n);
  return {
    sun: subPoint(n, sunLon, 0),
    moon: subPoint(n, moon.lon, moon.lat),
    moonElongation: norm360(moon.lon - sunLon),
  };
}

/** Is it night at `coords` (sun below the horizon)? */
export const isNight = (sky: Sky, coords: [number, number]) => geoDistance(coords, sky.sun) > Math.PI / 2;

/** The sky, refreshed every minute so the sun and moon creep across the map in real time. */
export function useSky(): Sky {
  const [sky, setSky] = useState(() => skyAt(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setSky(skyAt(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return sky;
}
