import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoCircle, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { Creative } from '../data/types';
import { FAN_ZOOM, PinLayer, fanCityNames } from './PinLayer';
import { DETAIL_ZOOM, useMapDetail } from './detail/useMapDetail';
import { DetailLabels } from './detail/DetailLabels';
import { drawDetail } from './detail/draw';
import { useMapGestures, type Point } from './gestures';
import { getSettings } from '../settings';
import { COARSE, DETAILED, MAX_ZOOM, STATE_LINES, borderOpacity, landColorAt, radiusCircle, stateOpacity, type EarthProps } from './shared';

// The globe's `k` is its scale relative to fitting the viewport. Zoom levels shared
// with the flat map are expressed as `k * PI`, which gives the same on-screen
// scale near the center of view for both projections.
const MAX_K = MAX_ZOOM / Math.PI;
const GRATICULE = geoGraticule10();
const SPHERE = { type: 'Sphere' } as const;

// Latitude bands for tinting land, painted from the south pole up.
const BANDS = Array.from({ length: 60 }, (_, i) => {
  const radius = Math.min(179.5, 180 - i * 3);
  return { shape: geoCircle().center([0, 90]).radius(radius).precision(3)(), color: landColorAt(radius / 180) };
});

type GlobeView = { center: [number, number]; k: number };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat));
const clampK = (k: number) => Math.max(0.9, Math.min(MAX_K, k));

export function Globe({ creatives, me, selectedId, onSelect, onViewChange, initialView, range, here, ref }: EarthProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = useRef<number | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [moving, setMoving] = useState(false);
  const [view, setViewState] = useState<GlobeView>(() =>
    initialView && initialView.zoom > 1.5
      ? { center: initialView.center, k: clampK(initialView.zoom / Math.PI) }
      : { center: [me.coords[0], clampLat(me.coords[1] * 0.6)], k: 1 },
  );
  const viewRef = useRef(view);
  // Several pointer events can arrive between renders; each builds on the previous one.
  const setView = (v: GlobeView) => {
    viewRef.current = v;
    setViewState(v);
  };

  const baseR = Math.min(size.w, size.h) * 0.46 || 1;
  const zoom = view.k * Math.PI;

  const projection = geoOrthographic()
    .rotate([-view.center[0], -view.center[1]])
    .scale(baseR * view.k)
    .translate([size.w / 2, size.h / 2])
    .clipAngle(90)
    .precision(0.4);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bumpMoving = () => {
    setMoving(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setMoving(false), 180);
  };

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  /** Degrees of arc per screen pixel at the middle of the globe. */
  const degPerPx = (k: number) => 180 / Math.PI / (baseR * k);

  /** Zoom by f keeping the spot under `at` in place (exact near the middle, close enough elsewhere). */
  const zoomedAbout = (v: GlobeView, f: number, at: Point): GlobeView => {
    const k = clampK(v.k * f);
    const dx = at[0] - size.w / 2;
    const dy = at[1] - size.h / 2;
    const shift = degPerPx(v.k) - degPerPx(k);
    return { k, center: [v.center[0] + dx * shift, clampLat(v.center[1] - dy * shift)] };
  };

  // Drag to spin, pinch / scroll to zoom toward your fingers or cursor, double-tap to zoom in.
  useMapGestures(wrapRef, {
    onStart: stopAnim,
    onPan: (dx, dy) => {
      const { center, k } = viewRef.current;
      const d = degPerPx(k);
      setView({ k, center: [center[0] - dx * d, clampLat(center[1] + dy * d)] });
      bumpMoving();
    },
    onZoom: (f, at) => {
      setView(zoomedAbout(viewRef.current, f, at));
      bumpMoving();
    },
    onDoubleTap: (at) => animate(zoomedAbout(viewRef.current, 2, at), 350),
  });

  const animate = (target: GlobeView, ms: number) => {
    if (getSettings().reduceMotion) ms = 1; // Settings → Reduce motion
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    const travel = geoDistance(from.center, target.center);
    const interp = geoInterpolate(from.center, target.center);
    const [l0, l1] = [Math.log(from.k), Math.log(target.k)];
    // Pull back mid-flight when going far, so you see where you're headed.
    const midK = Math.min(from.k, target.k, Math.max(1, 0.6 / Math.max(travel, 1e-3)));
    const dip = Math.max(0, (l0 + l1) / 2 - Math.log(midK));
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = easeInOut(t);
      setView({ center: interp(e) as [number, number], k: Math.exp(l0 + (l1 - l0) * e - dip * Math.sin(Math.PI * t)) });
      bumpMoving();
      if (t < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  };

  useImperativeHandle(ref, () => ({
    flyTo: (coords, z = 140) => animate({ center: coords, k: clampK(z / Math.PI) }, 1600),
    zoomBy: (factor) => animate({ center: viewRef.current.center, k: clampK(viewRef.current.k * factor) }, 350),
    reset: () => animate({ center: viewRef.current.center, k: 1 }, 1000),
  }));

  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    window.clearTimeout(settle.current);
  }, []);

  const selected = creatives.find((c) => c.id === selectedId);

  // Roads, city & county lines, water and place names once you're zoomed in.
  const crowdCities = useMemo(() => fanCityNames(creatives), [creatives]);
  const detail = useMapDetail({
    zoom,
    size,
    invert: (p) => {
      if (Math.hypot(p[0] - size.w / 2, p[1] - size.h / 2) > baseR * view.k) return null; // space around the globe
      return projection.invert!(p) as [number, number];
    },
    viewKey: `${view.center[0].toFixed(4)},${view.center[1].toFixed(4)},${view.k.toFixed(3)},${size.w}x${size.h}`,
  });

  // Paint.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size.w * dpr) {
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    projection.clipExtent([[-10, -10], [size.w + 10, size.h + 10]]);
    const path = geoPath(projection, ctx);
    const css = getComputedStyle(canvas);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const layers = moving ? COARSE : DETAILED;
    const [cx, cy] = [size.w / 2, size.h / 2];
    const r = baseR * view.k;

    // Soft halo.
    if (view.k < 3) {
      const halo = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.18);
      halo.addColorStop(0, 'rgba(120,160,175,0.16)');
      halo.addColorStop(1, 'rgba(120,160,175,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size.w, size.h);
    }

    // Ocean.
    // Evenly lit: no highlight, so the whole globe stays easy to read.
    ctx.beginPath();
    path(SPHERE);
    ctx.fillStyle = color('--ocean-globe');
    ctx.fill();

    ctx.beginPath();
    path(GRATICULE);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Antarctica.
    ctx.beginPath();
    path(layers.ice);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color('--ice');
    ctx.fill();
    ctx.globalAlpha = 1;

    // Land, tinted by latitude.
    ctx.save();
    ctx.beginPath();
    path(layers.land);
    ctx.clip();
    for (const band of BANDS) {
      ctx.beginPath();
      path(band.shape);
      ctx.fillStyle = band.color;
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    path(layers.land);
    ctx.strokeStyle = color('--coast');
    ctx.lineWidth = 0.6;
    ctx.stroke();

    drawDetail(ctx, path, detail.tiles, detail.counties, {
      alpha: Math.max(0, Math.min(1, (zoom - DETAIL_ZOOM) / 15)),
      tileZ: detail.tileZ,
      landColor: (lat) => landColorAt((90 - lat) / 180),
      water: color('--ocean-globe'),
      moving,
    });

    const statesAlpha = stateOpacity(zoom);
    if (statesAlpha > 0) {
      ctx.beginPath();
      path(STATE_LINES);
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = `rgba(30,34,28,${0.3 * statesAlpha})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    path(layers.borders);
    ctx.strokeStyle = `rgba(30,34,28,${0.45 * borderOpacity(zoom)})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    if (range) {
      ctx.beginPath();
      path(radiusCircle(range.center, range.miles));
      ctx.fillStyle = 'rgba(226,176,74,0.07)';
      ctx.fill();
      ctx.setLineDash([2, 5]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#e2b04a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }

    if (selected?.travelMiles) {
      const tint = '#e2b04a';
      ctx.beginPath();
      path(radiusCircle(selected.coords, selected.travelMiles));
      ctx.fillStyle = tint + '22';
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  const toScreen = useCallback(
    (coords: [number, number]) => {
      if (geoDistance(coords, view.center) > Math.PI / 2 - 0.02) return null;
      return projection(coords) as [number, number];
    },
    // projection is rebuilt from these each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, size, baseR],
  );

  useEffect(() => {
    if (!onViewChange || !size.w) return;
    const visible = creatives.filter((c) => {
      const p = toScreen(c.coords);
      return p && p[0] > -20 && p[1] > -20 && p[0] < size.w + 20 && p[1] < size.h + 20;
    });
    onViewChange(visible, view.center, zoom);
  }, [toScreen, creatives, size, view, zoom, onViewChange]);

  const zoomToCluster = (members: Creative[]) => {
    const lng = members.reduce((s, m) => s + m.coords[0], 0) / members.length;
    const lat = members.reduce((s, m) => s + m.coords[1], 0) / members.length;
    const center: [number, number] = [lng, lat];
    const spread = Math.max(...members.map((m) => geoDistance(m.coords, center)), 1e-4);
    const k = clampK(Math.max(view.k * 2.5, 0.5 / spread / 0.92));
    animate({ center, k }, 900);
  };

  return (
    <div className="earth" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h }}
        className="globe-canvas"
        role="img"
        aria-label="Globe of creatives"
        onClick={() => onSelect(null)}
      />
      <PinLayer
        size={size}
        zoom={zoom}
        toScreen={toScreen}
        creatives={creatives}
        me={me}
        selectedId={selectedId}
        onSelect={onSelect}
        onClusterClick={zoomToCluster}
        here={here}
        cityLabels={detail.tiles.length === 0}
        beneath={
          <DetailLabels owned={zoom >= FAN_ZOOM ? crowdCities : undefined} tiles={detail.tiles} counties={detail.counties} tileZ={detail.tileZ} size={size} toScreen={toScreen} />
        }
      />
    </div>
  );
}
