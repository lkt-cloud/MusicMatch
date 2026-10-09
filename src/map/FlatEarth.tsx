import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { geoAzimuthalEquidistant, geoGraticule10, geoPath } from 'd3-geo';
import { interpolateZoom } from 'd3-interpolate';
import type { Creative } from '../data/types';
import { FAN_ZOOM, PinLayer, fanCityNames } from './PinLayer';
import { useSky } from './sky';
import { tween, useMapGestures, type Point } from './gestures';
import { C, fromView, rotateAbout, svgTransform, toView, viewAt, wrapAngle, zoomAbout, type FlatView } from './flatView';
import { DETAIL_ZOOM, useMapDetail } from './detail/useMapDetail';
import { DetailLabels } from './detail/DetailLabels';
import { LINE_STYLE, ROAD_STYLE, roadsAt, tilePaths } from './detail/draw';
import type { Counties } from './detail/counties';
import { COARSE, DETAILED, LAND_STOPS, MAX_ZOOM, STATE_LINES, borderOpacity, radiusCircle, stateOpacity, type EarthProps } from './shared';

// Night is many stacked, faint circles around the point opposite the sun. Their radii step
// 0.7° apart across a ~28° band centred near the true terminator (90°), so the darkness fades
// in gradually instead of in visible steps. They're painted once into an image (refreshed
// each minute as the sun moves) so the map doesn't redraw 40 shapes on every frame.
const NIGHT_LAYERS = Array.from({ length: 40 }, (_, i) => 104 - i * 0.7);
const NIGHT_PX = 1536;

// Everything is projected once into a fixed 1000×1000 "world" space; the view (pan,
// zoom, rotation) then maps world space to the screen. That keeps the heavy land paths static.
const SIZE = 1000;
const RADIUS = 485;

const projection = geoAzimuthalEquidistant()
  .rotate([0, -90]) // north pole in the middle, like the classic flat-earth map
  .clipAngle(180 - 1e-3)
  .scale(RADIUS / Math.PI)
  .translate([SIZE / 2, SIZE / 2])
  .precision(0.2);

const path = geoPath(projection);
// Street-level detail needs more decimal places: at full zoom one world unit is >1000 px.
const detailPath = geoPath(projection).digits(5);

const LAND = path(DETAILED.land) ?? '';
const ICE = path(DETAILED.ice) ?? '';
const BORDERS = path(DETAILED.borders) ?? '';
const STATES = path(STATE_LINES) ?? '';
const GRATICULE = path(geoGraticule10()) ?? '';
// Lighter outlines drawn while you're moving the map zoomed out (swapped back when you stop).
const LAND_LITE = path(COARSE.land) ?? '';
const BORDERS_LITE = path(COARSE.borders) ?? '';
const LITE_BELOW = 6; // zoom below which the light outlines are used while moving
// Concentric "record grooves" around the disc.
const GROOVES = Array.from({ length: 9 }, (_, i) => RADIUS + 22 + i * 16);

const project = (coords: [number, number]) => projection(coords) as [number, number];

/** The night shade as an image in world space (one draw per frame instead of 40 paths). */
function paintNight(sun: [number, number]): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = NIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(NIGHT_PX / SIZE, NIGHT_PX / SIZE);
  const draw = geoPath(projection, ctx);
  const antisolar: [number, number] = [sun[0] + 180, -sun[1]];
  ctx.fillStyle = 'rgba(5, 8, 14, 0.033)';
  for (const deg of NIGHT_LAYERS) {
    ctx.beginPath();
    draw(radiusCircle(antisolar, (deg * Math.PI * 3958.8) / 180));
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

const countyPaths = new WeakMap<Counties, string>();
const countyPath = (c: Counties) => {
  let d = countyPaths.get(c);
  if (d === undefined) countyPaths.set(c, (d = detailPath(c.lines) ?? ''));
  return d;
};

export function FlatEarth({ creatives, me, selectedId, onSelect, onViewChange, onRotate, initialView, range, here, ref }: EarthProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const startView = useRef(initialView);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<FlatView>({ k: 1, o: [0, 0], a: 0 });
  const viewRef = useRef(view);
  // Touch screens can send 120+ move events a second (two per pinch); the map only redraws
  // once per frame with the latest view.
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
    // The timeout is a backstop for when frames are paused (a hidden tab).
    frame.current = { raf: requestAnimationFrame(() => flush()), timer: window.setTimeout(() => flush(), 50) };
  }, [flush]);
  useEffect(() => () => {
    if (frame.current) {
      cancelAnimationFrame(frame.current.raf);
      window.clearTimeout(frame.current.timer);
    }
  }, []);
  const cancelAnim = useRef<(() => void) | null>(null);
  // True while the user is dragging or pinching, so the heavier street detail can be skipped.
  const [moving, setMoving] = useState(false);

  const fitK = (Math.min(size.w, size.h) / SIZE) * 0.94 || 1;
  const rel = view.k / fitK; // 1 = whole disc fits the viewport
  const limits = useRef({ fitK, w: size.w, h: size.h });
  limits.current = { fitK, w: size.w, h: size.h };
  const centre = (): Point => [limits.current.w / 2, limits.current.h / 2];

  /**
   * Applies a change, keeping the zoom in range and the disc on screen. Fully zoomed out
   * (the whole disc fitting the screen) it stays centred; the closer you zoom in, the
   * further you can pan, so the disc can never drift off to one side.
   */
  const setView = useCallback((change: (v: FlatView) => FlatView) => {
    const { fitK: fk, w, h } = limits.current;
    let v = change(viewRef.current);
    const k = Math.max(fk, Math.min(fk * MAX_ZOOM, v.k));
    if (k !== v.k) v = zoomAbout(v, k / v.k, [w / 2, h / 2]);
    const mid = fromView(v, [w / 2, h / 2]);
    const d = Math.hypot(mid[0] - C, mid[1] - C);
    const lim = RADIUS * (1 - fk / v.k);
    if (d > lim) v = d > 0 ? viewAt([C + ((mid[0] - C) * lim) / d, C + ((mid[1] - C) * lim) / d], [w / 2, h / 2], v.k, v.a) : v;
    // Never accept a broken view (e.g. maths done before the map knew its size): one NaN
    // would stick, and every later drag would just add to it, freezing the map.
    if (![v.k, v.o[0], v.o[1], v.a].every(Number.isFinite) || v.k <= 0) return;
    viewRef.current = v;
    scheduleDraw();
  }, [scheduleDraw]);

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

  const fitView = (): FlatView => ({ k: limits.current.fitK, a: 0, o: centre() });

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First size: open where we were asked to (or on the whole disc). Later resizes keep the
  // same spot in the middle.
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  // Requests that arrive before the map has measured itself (location often comes back
  // instantly once permission is granted) wait here and run as soon as it has.
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
      setView(() => (start && start.zoom > 1.5 ? viewAt(project(start.center), centre(), fitK * start.zoom, 0) : fitView()));
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
    onRotate: (da, at) => setView((v) => rotateAbout(v, da, at)),
    onDoubleTap: (at) => {
      const v0 = viewRef.current;
      animate(300, (e) => zoomAbout(v0, 2 ** e, at));
    },
    onEnd: () => {
      flush();
      setMoving(false);
    },
  });

  /** Smooth zoom-out-and-in flight to a world point (van Wijk & Nuij), keeping the rotation. */
  const flyToWorld = (w: [number, number], k: number, ms: number) => {
    const v0 = viewRef.current;
    const span = Math.min(limits.current.w, limits.current.h);
    const from = fromView(v0, centre());
    const interp = interpolateZoom([from[0], from[1], span / v0.k], [w[0], w[1], span / k]);
    animate(ms, (e) => {
      const [x, y, width] = interp(e);
      return viewAt([x, y], centre(), span / width, v0.a);
    });
  };

  useImperativeHandle(ref, () => ({
    flyTo: (coords, zoom = 140) => whenReady(() => flyToWorld(project(coords), limits.current.fitK * zoom, 1400)),
    zoomBy: (factor) => {
      const v0 = viewRef.current;
      animate(350, (e) => zoomAbout(v0, factor ** e, centre()));
    },
    reset: () => {
      const v0 = viewRef.current;
      const from = fromView(v0, centre());
      const a0 = wrapAngle(v0.a);
      const [l0, l1] = [Math.log(v0.k), Math.log(limits.current.fitK)];
      animate(1000, (e) => viewAt([from[0] + (C - from[0]) * e, from[1] + (C - from[1]) * e], centre(), Math.exp(l0 + (l1 - l0) * e), a0 * (1 - e)));
    },
    rotateBy: (radians) => {
      stopAnim();
      setView((v) => rotateAbout(v, radians, centre()));
    },
    resetNorth: () => {
      const v0 = viewRef.current;
      const a0 = wrapAngle(v0.a);
      animate(450, (e) => rotateAbout(v0, -a0 * e, centre()));
    },
  }));

  // Tell the page which way is up (for the compass).
  useEffect(() => {
    onRotate?.((wrapAngle(view.a) * 180) / Math.PI);
  }, [view.a, onRotate]);

  const toScreen = useCallback((coords: [number, number]) => toView(view, project(coords)), [view]);

  // Report which creatives are on screen (for the list). At most every 150 ms while moving:
  // re-rendering the whole page on every frame is what made dragging feel heavy.
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
      const center = projection.invert!(fromView(v, [size.w / 2, size.h / 2])) as [number, number];
      onViewChange(visible, center, v.k / limits.current.fitK);
    };
    const wait = 150 - (performance.now() - lastReport.current);
    if (wait <= 0) return report();
    const t = window.setTimeout(report, wait);
    return () => window.clearTimeout(t);
  }, [view, creatives, size, onViewChange]);

  const zoomToCluster = (members: Creative[]) => {
    const pts = members.map((m) => project(m.coords));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const span = Math.max(x1 - x0, y1 - y0, 0.01);
    const k = Math.min(fitK * MAX_ZOOM, Math.max(view.k * 2.5, (Math.min(size.w, size.h) * 0.5) / span));
    flyToWorld([(x0 + x1) / 2, (y0 + y1) / 2], k, 900);
  };

  const selected = creatives.find((c) => c.id === selectedId);
  const radiusPath = useMemo(
    () => (selected?.travelMiles ? path(radiusCircle(selected.coords, selected.travelMiles)) : null),
    [selected],
  );

  const rangePath = useMemo(() => (range ? path(radiusCircle(range.center, range.miles)) : null), [range]);

  const sky = useSky();
  const nightImage = useMemo(() => paintNight(sky.sun), [sky]);
  const lite = moving && rel < LITE_BELOW;

  // Roads, city & county lines, water and place names once you're zoomed in.
  const invert = useCallback(
    (p: [number, number]) => {
      const [wx, wy] = fromView(view, p);
      if (Math.hypot(wx - SIZE / 2, wy - SIZE / 2) > RADIUS) return null; // off the disc
      return projection.invert!([wx, wy]) as [number, number];
    },
    [view],
  );
  const crowdCities = useMemo(() => fanCityNames(creatives), [creatives]);
  const detail = useMapDetail({ zoom: rel, size, invert, viewKey: svgTransform(view) });
  const detailAlpha = Math.max(0, Math.min(1, (rel - DETAIL_ZOOM) / 15));
  // Zoomed into a region, night is lightened a little so streets and labels stay readable.
  const nightOpacity = rel < 20 ? 1 : Math.max(0.62, 1 - (rel - 20) / 180);
  const tilePathList = detail.tiles.map((tile) => ({ key: tile.key, d: tilePaths(tile, detailPath) }));

  return (
    <div className="earth" ref={wrapRef}>
      <svg width={size.w} height={size.h} role="img" aria-label="Map of creatives" onClick={() => onSelect(null)}>
        <defs>
          {/* In map units (not per shape), so tile water matches the ocean around it. */}
          <radialGradient id="ocean" gradientUnits="userSpaceOnUse" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}>
            <stop offset="0%" stopColor="var(--ocean-center)" />
            <stop offset="100%" stopColor="var(--ocean-edge)" />
          </radialGradient>
          <radialGradient id="land" gradientUnits="userSpaceOnUse" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}>
            {LAND_STOPS.map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </radialGradient>
        </defs>
        <g transform={svgTransform(view)}>
          {GROOVES.map((r, i) => (
            <circle key={r} cx={SIZE / 2} cy={SIZE / 2} r={r} className="earth-groove" style={{ opacity: 0.5 - i * 0.05 }} />
          ))}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS + 5} className="earth-rim" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="url(#ocean)" />
          <path d={GRATICULE} className="earth-graticule" />
          <path d={ICE} className="earth-ice" />
          <path d={lite ? LAND_LITE : LAND} className="earth-land" />
          {tilePathList.length > 0 && (
            <g className="detail" style={{ opacity: detailAlpha }}>
              {tilePathList.map(({ key, d }) => (
                <g key={key}>
                  <path d={d.land} className="detail-land" />
                  <path d={d.water} className="detail-water" />
                </g>
              ))}
            </g>
          )}
          {!lite && <path d={STATES} className="earth-states" style={{ opacity: stateOpacity(rel) }} />}
          <path d={lite ? BORDERS_LITE : BORDERS} className="earth-borders" style={{ opacity: borderOpacity(rel) }} />
          {nightImage && (
            <image href={nightImage} x={0} y={0} width={SIZE} height={SIZE} className="earth-night" aria-hidden style={{ opacity: nightOpacity }} />
          )}
          {/* Lines and roads sit above the night shade, so after dark the road network glows. */}
          {tilePathList.length > 0 && (
            <g className="detail" style={{ opacity: detailAlpha }}>
              {detail.counties && !moving && <path d={countyPath(detail.counties)} className="detail-line" style={lineStyle('county')} />}
              {(moving ? [] : (['county', 'city', 'state'] as const)).map((level) =>
                tilePathList.map(({ key, d }) => (
                  <path key={`${level}-${key}`} d={d.lines[level]} className="detail-line" style={lineStyle(level)} />
                )),
              )}
              {roadsAt(detail.tileZ).filter((c) => !moving || c === 'motorway' || c === 'trunk').map((cls) =>
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
          {rangePath && <path d={rangePath} className="earth-range" />}
          {radiusPath && selected && (
            <path d={radiusPath} className="earth-radius" />
          )}
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
        cityLabels={detail.tiles.length === 0}
        beneath={
          <DetailLabels owned={rel >= FAN_ZOOM ? crowdCities : undefined} tiles={detail.tiles} counties={detail.counties} tileZ={detail.tileZ} size={size} toScreen={toScreen} />
        }
      />
    </div>
  );
}

const lineStyle = (level: keyof typeof LINE_STYLE) => ({
  stroke: LINE_STYLE[level].color,
  strokeWidth: LINE_STYLE[level].width,
  strokeDasharray: LINE_STYLE[level].dash.join(' '),
});
