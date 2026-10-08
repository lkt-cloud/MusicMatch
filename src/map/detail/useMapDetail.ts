import { useEffect, useRef, useState } from 'react';
import { loadCounties, US_BOUNDS, type Counties } from './counties';
import { MAX_TILE_Z, MIN_TILE_Z, latToY, loadTile, lngToX, type TileData } from './tiles';

/** Below this zoom (multiple of the whole-map view) no detail is shown or loaded. */
export const DETAIL_ZOOM = 25;
/** County lines and names appear from here. */
export const COUNTY_ZOOM = 45;
/** Never request more tiles than this for one view. */
const MAX_TILES = 30;

type Args = {
  /** Zoom as a multiple of the whole-map view. */
  zoom: number;
  size: { w: number; h: number };
  /** Screen point → [lng, lat], or null if it's off the earth (e.g. space around the globe). */
  invert: (p: [number, number]) => [number, number] | null;
  /** Changes whenever the view moves, so the hook knows to recompute. */
  viewKey: string;
};

/**
 * Works out which map tiles cover the screen at a sensible detail level and loads them
 * (plus US counties when relevant). New tiles replace old ones all at once, so roads
 * don't flicker in and out while you pan.
 */
export function useMapDetail({ zoom, size, invert, viewKey }: Args) {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [counties, setCounties] = useState<Counties | null>(null);
  const [tileZ, setTileZ] = useState(0);
  const invertRef = useRef(invert);
  invertRef.current = invert;
  const generation = useRef(0);

  const active = zoom >= DETAIL_ZOOM && size.w > 0;

  useEffect(() => {
    if (!active) {
      generation.current++;
      setTiles([]);
      return;
    }
    // Wait until the view settles (e.g. after a fly-to) before fetching.
    const timer = window.setTimeout(() => {
      const gen = ++generation.current;

      // Visible area: sample a grid of screen points and keep the ones that hit the earth.
      const pts: [number, number][] = [];
      for (let i = 0; i <= 6; i++)
        for (let j = 0; j <= 6; j++) {
          const p = invertRef.current([(size.w * i) / 6, (size.h * j) / 6]);
          if (p) pts.push(p);
        }
      if (!pts.length) return;
      const lngs = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      let [west, east, south, north] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
      if (east - west > 180) [west, east] = [-180, 180]; // view straddles the date line; just cover it all
      const midLat = (south + north) / 2;

      // Pick a tile zoom where one tile is roughly 512 px wide on screen.
      const pxPerDeg = (Math.min(size.w, size.h) * 0.47 * zoom) / 180;
      let z = Math.round(Math.log2((360 * Math.cos((midLat * Math.PI) / 180) * pxPerDeg) / 512));
      z = Math.max(MIN_TILE_Z, Math.min(MAX_TILE_Z, z));
      const range = (zz: number) => ({
        x0: lngToX(west, zz),
        x1: Math.min(2 ** zz - 1, lngToX(east, zz)),
        y0: latToY(north, zz),
        y1: Math.min(2 ** zz - 1, latToY(south, zz)),
      });
      let r = range(z);
      while (z > MIN_TILE_Z && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_TILES) r = range(--z);

      const wanted: Promise<TileData | null>[] = [];
      for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) wanted.push(loadTile(x, y, z));
      Promise.all(wanted).then((loaded) => {
        if (gen !== generation.current) return; // the view has moved on
        setTiles(loaded.filter((t): t is TileData => t !== null));
        setTileZ(z);
      });

      const overUS = east > US_BOUNDS.west && west < US_BOUNDS.east && north > US_BOUNDS.south && south < US_BOUNDS.north;
      if (zoom >= COUNTY_ZOOM && overUS) loadCounties().then((c) => gen === generation.current && setCounties(c));
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, viewKey, size.w, size.h]);

  return { tiles: active ? tiles : [], counties: active && zoom >= COUNTY_ZOOM ? counties : null, tileZ };
}
