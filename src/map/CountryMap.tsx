import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { geoBounds, geoCentroid, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { interpolateZoom } from 'd3-interpolate';
import type { Creative } from '../data/types';
import { FAN_ZOOM, PinLayer, fanCityNames } from './PinLayer';
import { useSky } from './sky';
import { tween, useMapGestures } from './gestures';
import { fromView, svgTransform, toView, viewAt, zoomAbout, type FlatView } from './flatView';
import { DETAIL_ZOOM, useMapDetail } from './detail/useMapDetail';
import { DetailLabels } from './detail/DetailLabels';
import { LINE_STYLE, ROAD_STYLE, roadsAt, tilePaths } from './detail/draw';
import type { TileData } from './detail/tiles';
import { MAX_ZOOM, STATE_LINES, countriesNear, countryAt, countryShape, mainland, radiusCircle, type EarthProps } from './shared';
import { t } from '../i18n';

// One country on its own, the way people mostly use the map: their own country, not the
// whole world. It's a plain Mercator map fitted to the country, drawn once as SVG paths and
// then only moved and scaled, so zooming stays light.
//
// Zoom is reported in the same units as the flat earth ("multiple of the whole-world view"),
// so pins, place names and street detail switch on at the same points on both maps.

const SIZE = 1000; // the fixed world space the country is fitted into

type Country = {
  projection: GeoProjection;
  land: string;
  /** Neighbouring countries, painted in the sea colour over the street detail so only this country shows. */
  neighbours: string;
  states: string;
  detailPath: ReturnType<typeof geoPath>;
  /** World-space boxes: the mainland (the opening view) and everything (how far you can pan). */
  main: [[number, number], [number, number]];
  all: [[number, number], [number, number]];
  /** Latitude the map is centred on, for converting distances to zoom. */
  lat: number;
  /** Lng/lat box of the whole country, for keeping place names to this country. */
  geoBox: [[number, number], [number, number]];
};

const built = new Map<string, Country | null>();

/** Everything that depends only on the country, worked out once per country. */
function buildCountry(code: string): Country | null {
  if (built.has(code)) return built.get(code)!;
  const shape = countryShape(code);
  if (!shape) {
    built.set(code, null);
    return null;
  }
  const main = mainland(shape);
  const [lng, lat] = geoCentroid(main);
  // Rotated to the country's centre, so countries across the date line (Russia, Fiji) stay whole.
  const projection = geoMercator().rotate([-lng, 0]).fitExtent([[0, 0], [SIZE, SIZE]], main).precision(0.2);
  const path = geoPath(projection);
  const country: Country = {
    projection,
    land: path(shape) ?? '',
    neighbours: path({ type: 'FeatureCollection', features: countriesNear(geoBounds(shape) as Country['geoBox'], code) }) ?? '',
    states: path(STATE_LINES) ?? '',
    detailPath: geoPath(projection).digits(5),
    main: path.bounds(main) as Country['main'],
    all: path.bounds(shape) as Country['all'],
    lat,
    geoBox: geoBounds(shape) as Country['geoBox'],
  };
  built.set(code, country);
  return country;
}

/** Can this country be shown on its own? (A few tiny places have no outline.) */
export const hasCountryMap = (code: string) => countryShape(code) !== null;

const cosLat = (lat: number) => Math.max(0.2, Math.cos((lat * Math.PI) / 180));

export function CountryMap({ country: code, creatives, me, selectedId, onSelect, onViewChange, initialView, range, here, ref }: EarthProps & { country: string }) {
  const country = buildCountry(code)!;
  const { projection } = country;
  const project = useCallback((coords: [number, number]) => projection(coords) as [number, number], [projection]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const startView = useRef(initialView);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<FlatView>({ k: 1, o: [0, 0], a: 0 });
  const viewRef = useRef(view);
  const [moving, setMoving] = useState(false);
  const cancelAnim = useRef<(() => void) | null>(null);

  // Redraw at most once a frame (touch screens send far more move events than that).
  const frame = useRef<{ raf: number; timer: number } | null>(null);
  const flush = useCallback(() => {
    if (!frame.current) return;
    cancelAnimationFrame(frame.current.raf);
    window.clearTimeout(frame.current.timer);
    frame.current = null;
    setViewState(viewRef.current);
  }, []);
  const scheduleDraw = useCallback(() => {
    if (frame.current) return;
    frame.current = { raf: requestAnimationFrame(() => flush()), timer: window.setTimeout(() => flush(), 50) };
  }, [flush]);
  useEffect(() => () => {
    if (frame.current) {
      cancelAnimationFrame(frame.current.raf);
      window.clearTimeout(frame.current.timer);
    }
  }, []);

  // ---------------------------------------------------------------- scale

  /** Zoom that fits the mainland on screen, with a little room around it. */
  const fitK = (w: number, h: number) => {
    const [[x0, y0], [x1, y1]] = country.main;
    return Math.min(w / Math.max(x1 - x0, 1), h / Math.max(y1 - y0, 1)) * 0.88 || 1;
  };
  /** Screen pixels per degree of latitude at scale k (Mercator stretches with latitude). */
  const pxPerDeg = (k: number, lat: number) => (k * projection.scale() * Math.PI) / 180 / cosLat(lat);
  /** The flat earth's zoom (multiple of its whole-world view) for a scale here, and back. */
  const worldZoom = (k: number, lat: number, min: number) => (pxPerDeg(k, lat) * 180) / (0.47 * min);
  const kForZoom = (zoom: number, lat: number, min: number) => (zoom * 0.47 * min) / 180 / ((projection.scale() * Math.PI) / 180 / cosLat(lat));

  const limits = useRef({ w: 0, h: 0, minK: 1, maxK: 1 });
  limits.current = {
    w: size.w,
    h: size.h,
    minK: fitK(size.w, size.h) * 0.85,
    maxK: kForZoom(MAX_ZOOM, country.lat, Math.min(size.w, size.h) || 1),
  };
  const centre = (): [number, number] => [limits.current.w / 2, limits.current.h / 2];

  /** Applies a change, keeping the zoom in range and the country on screen. */
  const setView = useCallback(
    (change: (v: FlatView) => FlatView) => {
      const { w, h, minK, maxK } = limits.current;
      let v = change(viewRef.current);
      const k = Math.max(minK, Math.min(maxK, v.k));
      if (k !== v.k) v = zoomAbout(v, k / v.k, [w / 2, h / 2]);
      // The middle of the screen stays over the country (its full extent, islands included).
      const [[x0, y0], [x1, y1]] = country.all;
      const mid = fromView(v, [w / 2, h / 2]);
      const clamped: [number, number] = [Math.max(x0, Math.min(x1, mid[0])), Math.max(y0, Math.min(y1, mid[1]))];
      if (clamped[0] !== mid[0] || clamped[1] !== mid[1]) v = viewAt(clamped, [w / 2, h / 2], v.k, 0);
      if (![v.k, v.o[0], v.o[1]].every(Number.isFinite) || v.k <= 0) return;
      viewRef.current = v;
      scheduleDraw();
    },
    [country, scheduleDraw],
  );

  const stopAnim = () => {
    if (!cancelAnim.current) return;
    cancelAnim.current();
    cancelAnim.current = null;
    setMoving(false);
  };
  const animate = (ms: number, step: (e: number) => FlatView) => {
    stopAnim();
    setMoving(true);
    cancelAnim.current = tween(ms, (e) => setView(() => step(e)), () => {
      cancelAnim.current = null;
      setMoving(false);
    });
  };

  const fitView = (): FlatView => {
    const [[x0, y0], [x1, y1]] = country.main;
    return viewAt([(x0 + x1) / 2, (y0 + y1) / 2], centre(), fitK(limits.current.w, limits.current.h), 0);
  };

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First size: open where we were asked to (or on the whole country). Later resizes keep the
  // same spot in the middle. Requests that come before the first size wait for it.
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const whenReady = (fn: () => void) => {
    if (lastSize.current) fn();
    else pending.current = fn;
  };
  useEffect(() => {
    if (!size.w || !size.h) return;
    const prev = lastSize.current;
    lastSize.current = size;
    if (!prev) {
      const start = startView.current;
      startView.current = undefined;
      const min = Math.min(size.w, size.h);
      setView(() =>
        start && start.zoom > 1.5 ? viewAt(project(start.center), centre(), kForZoom(start.zoom, start.center[1], min), 0) : fitView(),
      );
      flush();
      const queued = pending.current;
      pending.current = null;
      queued?.();
    } else setView((v) => ({ ...v, o: [v.o[0] + (size.w - prev.w) / 2, v.o[1] + (size.h - prev.h) / 2] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  useMapGestures(wrapRef, {
    onStart: () => {
      stopAnim();
      setMoving(true);
    },
    onPan: (dx, dy) => setView((v) => ({ ...v, o: [v.o[0] + dx, v.o[1] + dy] })),
    onZoom: (f, at) => setView((v) => zoomAbout(v, f, at)),
    onDoubleTap: (at) => {
      const v0 = viewRef.current;
      animate(300, (e) => zoomAbout(v0, 2 ** e, at));
    },
    onEnd: () => {
      flush();
      setMoving(false);
    },
  });

  /** Smooth zoom-out-and-in flight to a world point (van Wijk & Nuij). */
  const flyToWorld = (w: [number, number], k: number, ms: number) => {
    const v0 = viewRef.current;
    const span = Math.min(limits.current.w, limits.current.h);
    const from = fromView(v0, centre());
    const target = Math.max(limits.current.minK, Math.min(limits.current.maxK, k));
    const interp = interpolateZoom([from[0], from[1], span / v0.k], [w[0], w[1], span / target]);
    animate(ms, (e) => {
      const [x, y, width] = interp(e);
      return viewAt([x, y], centre(), span / width, 0);
    });
  };

  useImperativeHandle(ref, () => ({
    flyTo: (coords, zoom = 140) =>
      whenReady(() => flyToWorld(project(coords), kForZoom(zoom, coords[1], Math.min(limits.current.w, limits.current.h)), 1200)),
    zoomBy: (factor) => {
      const v0 = viewRef.current;
      animate(350, (e) => zoomAbout(v0, factor ** e, centre()));
    },
    reset: () => {
      const v0 = viewRef.current;
      const target = fitView();
      const from = fromView(v0, centre());
      const to = fromView(target, centre());
      const [l0, l1] = [Math.log(v0.k), Math.log(target.k)];
      animate(800, (e) => viewAt([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e], centre(), Math.exp(l0 + (l1 - l0) * e), 0));
    },
  }));

  const toScreen = useCallback((coords: [number, number]) => toView(view, project(coords)), [view, project]);
  const invertScreen = useCallback(
    (p: [number, number]) => (projection.invert!(fromView(view, p)) as [number, number] | null) ?? null,
    [view, projection],
  );
  const min = Math.min(size.w, size.h) || 1;
  const midLat = (invertScreen([size.w / 2, size.h / 2]) ?? [0, country.lat])[1];
  const rel = worldZoom(view.k, midLat, min);

  // Which creatives are on screen (for the list), at most every 150 ms while moving.
  const lastReport = useRef(0);
  useEffect(() => {
    if (!onViewChange || !size.w) return;
    const report = () => {
      lastReport.current = performance.now();
      const v = viewRef.current;
      const visible = creatives.filter((c) => {
        const [x, y] = toView(v, project(c.coords));
        return x > -20 && y > -20 && x < size.w + 20 && y < size.h + 20;
      });
      const center = (projection.invert!(fromView(v, [size.w / 2, size.h / 2])) as [number, number]) ?? [0, 0];
      onViewChange(visible, center, worldZoom(v.k, center[1], min), v.k <= fitK(size.w, size.h) * 1.15);
    };
    const wait = 150 - (performance.now() - lastReport.current);
    if (wait <= 0) return report();
    const timer = window.setTimeout(report, wait);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, creatives, size, onViewChange]);

  const zoomToCluster = (members: Creative[]) => {
    const pts = members.map((m) => project(m.coords));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const span = Math.max(x1 - x0, y1 - y0, 0.01);
    flyToWorld([(x0 + x1) / 2, (y0 + y1) / 2], Math.max(view.k * 2.5, (min * 0.5) / span), 900);
  };

  const path = useMemo(() => geoPath(projection), [projection]);
  const selected = creatives.find((c) => c.id === selectedId);
  const radiusPath = useMemo(() => (selected?.travelMiles ? path(radiusCircle(selected.coords, selected.travelMiles)) : null), [selected, path]);
  const rangePath = useMemo(() => (range ? path(radiusCircle(range.center, range.miles)) : null), [range, path]);
  const sky = useSky();

  // Streets, lines and place names once you're zoomed in, kept to this country.
  const crowdCities = useMemo(() => fanCityNames(creatives), [creatives]);
  const detail = useMapDetail({ zoom: rel, size, invert: invertScreen, viewKey: svgTransform(view) });
  const detailAlpha = Math.max(0, Math.min(1, (rel - DETAIL_ZOOM) / 15));
  const tiles = useMemo(() => detail.tiles.map((tile) => ownPlaces(tile, code, country.geoBox)), [detail.tiles, code, country.geoBox]);
  const tilePathList = tiles.map((tile) => ({ key: tile.key, d: tilePaths(tile, country.detailPath) }));

  return (
    <div className="earth country-map" ref={wrapRef}>
      <svg width={size.w} height={size.h} role="img" aria-label={t('Map of creatives')} onClick={() => onSelect(null)}>
        <defs>
          <linearGradient id="country-land" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={SIZE}>
            <stop offset="0%" stopColor="#a9a77c" />
            <stop offset="100%" stopColor="#93a072" />
          </linearGradient>
        </defs>
        <g transform={svgTransform(view)}>
          <path d={country.land} className="country-land" />
          {tilePathList.length > 0 && (
            <g className="detail" style={{ opacity: detailAlpha }}>
              {tilePathList.map(({ key, d }) => (
                <g key={key}>
                  <path d={d.land} className="country-detail-land" />
                  <path d={d.water} className="country-detail-water" />
                </g>
              ))}
            </g>
          )}
          {!moving && <path d={country.states} className="earth-states" style={{ opacity: Math.min(1, rel / 4) }} />}
          {tilePathList.length > 0 && (
            <g className="detail" style={{ opacity: detailAlpha }}>
              {(moving ? [] : (['county', 'city', 'state'] as const)).map((level) =>
                tilePathList.map(({ key, d }) => <path key={`${level}-${key}`} d={d.lines[level]} className="detail-line" style={lineStyle(level)} />),
              )}
              {roadsAt(detail.tileZ)
                .filter((c) => !moving || c === 'motorway' || c === 'trunk')
                .map((cls) =>
                  tilePathList.map(({ key, d }) => (
                    <g key={`${cls}-${key}`}>
                      {ROAD_STYLE[cls].casing > 0 && (
                        <path d={d.roads[cls]} className="detail-road-casing" style={{ strokeWidth: ROAD_STYLE[cls].casing }} />
                      )}
                      <path d={d.roads[cls]} className="detail-road" style={{ strokeWidth: ROAD_STYLE[cls].width, stroke: ROAD_STYLE[cls].color }} />
                    </g>
                  )),
                )}
            </g>
          )}
          {/* Only this country shows: neighbours' streets and lines are covered in sea colour.
              (No SVG mask: phones redraw masks on every frame, which made dragging stall.) */}
          {tilePathList.length > 0 && <path d={country.neighbours} className="country-cover" />}
          <path d={country.land} className="country-coast" />
          {rangePath && <path d={rangePath} className="earth-range" />}
          {radiusPath && selected && <path d={radiusPath} className="earth-radius" />}
        </g>
      </svg>

      <PinLayer
        size={size}
        zoom={rel}
        toScreen={toScreen}
        creatives={creatives}
        me={me}
        selectedId={selectedId}
        onSelect={onSelect}
        onClusterClick={zoomToCluster}
        sky={sky}
        here={here}
        cityLabels={false}
        beneath={
          <DetailLabels owned={rel >= FAN_ZOOM ? crowdCities : undefined} tiles={tiles} counties={detail.counties} tileZ={detail.tileZ} size={size} toScreen={toScreen} />
        }
      />
    </div>
  );
}

// Place names from the map tiles, kept to this country (tiles near a border also carry the
// neighbour's towns). Worked out once per tile.
const ownCache = new WeakMap<TileData, Map<string, TileData>>();
function ownPlaces(tile: TileData, code: string, box: [[number, number], [number, number]]): TileData {
  let byCountry = ownCache.get(tile);
  if (!byCountry) ownCache.set(tile, (byCountry = new Map()));
  let kept = byCountry.get(code);
  if (!kept) {
    const [[w, s], [e, n]] = box;
    const inBox = ([lng, lat]: [number, number]) => lat >= s && lat <= n && (w <= e ? lng >= w && lng <= e : lng >= w || lng <= e);
    kept = {
      ...tile,
      // Towns in this country, plus coastal ones whose point falls just off the simplified coastline.
      places: tile.places.filter((p) => {
        if (!inBox(p.coords)) return false;
        const at = countryAt(p.coords);
        return at === code || at === null;
      }),
    };
    byCountry.set(code, kept);
  }
  return kept;
}

const lineStyle = (level: keyof typeof LINE_STYLE) => ({
  stroke: LINE_STYLE[level].color,
  strokeWidth: LINE_STYLE[level].width,
  strokeDasharray: LINE_STYLE[level].dash.join(' '),
});
