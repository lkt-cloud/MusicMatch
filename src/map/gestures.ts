import { useEffect, useRef } from 'react';
import { getSettings } from '../settings';

// One gesture engine for both maps, built on pointer events so it behaves the same with a
// mouse, a trackpad and fingers:
//   drag            → pan (with a little momentum when you let go)
//   pinch           → zoom around the point between your fingers
//   two-finger twist→ rotate around that point (and it keeps spinning briefly if flicked)
//   wheel / trackpad→ zoom around the cursor
//   shift- or right-drag → rotate around the map's centre (mouse users)
//   double-tap / double-click → zoom in there
// Every pinch/twist is applied about the current midpoint of the fingers, so the spot
// under them stays under them: zooming feels anchored instead of drifting.

export type Point = [number, number];

export type GestureHandlers = {
  /** A gesture (or its momentum) began: good moment to stop animations and draw light. */
  onStart?: () => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (factor: number, at: Point) => void;
  /** Radians, clockwise on screen. Omit to ignore rotation. */
  onRotate?: (radians: number, at: Point) => void;
  onDoubleTap?: (at: Point) => void;
  /** Everything (including momentum) has finished. */
  onEnd?: () => void;
};

type Sample = { t: number; x: number; y: number; a: number };

const DRAG_START_PX = 4; // movement before a press counts as a drag (so taps still click)
const FRICTION = 0.0045; // momentum decay per ms (higher stops sooner)

export function useMapGestures(target: React.RefObject<HTMLElement | null>, handlers: GestureHandlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    const pointers = new Map<number, Point>();
    let downAt: Point | null = null;
    let dragging = false; // this press has moved enough to be a gesture
    let active = false; // onStart has fired and onEnd hasn't
    let rotating = false; // mouse rotate mode (shift / right button)
    let prevMid: Point = [0, 0];
    let prevDist = 0;
    let prevAngle = 0;
    let samples: Sample[] = [];
    let totalAngle = 0;
    let momentum = 0;
    let wheelTimer: number | undefined;
    let lastTap = { t: 0, x: 0, y: 0 };
    let suppressClick = false;

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const centre = (): Point => [el.clientWidth / 2, el.clientHeight / 2];
    /** Keep receiving this pointer's moves even if it leaves the map (ignored if the pointer is gone). */
    const capture = (id: number) => {
      try {
        el.setPointerCapture(id);
      } catch {
        // the pointer already ended
      }
    };

    const start = () => {
      if (momentum) cancelAnimationFrame(momentum);
      momentum = 0;
      if (!active) {
        active = true;
        h.current.onStart?.();
      }
    };
    const end = () => {
      if (!active) return;
      active = false;
      h.current.onEnd?.();
    };

    const sample = (x: number, y: number) => {
      const t = performance.now();
      samples.push({ t, x, y, a: totalAngle });
      samples = samples.filter((s) => t - s.t < 100);
    };

    /** After letting go: keep gliding (and spinning) in the direction you flicked, slowing down. */
    const glide = () => {
      if (getSettings().reduceMotion) return end(); // Settings → Reduce motion: just stop
      const last = samples[samples.length - 1];
      const first = samples[0];
      const dt = last && first ? last.t - first.t : 0;
      if (!last || dt < 8 || performance.now() - last.t > 60) return end();
      let vx = (last.x - first.x) / dt;
      let vy = (last.y - first.y) / dt;
      let va = (last.a - first.a) / dt;
      if (Math.hypot(vx, vy) < 0.15 && Math.abs(va) < 0.0006) return end();
      if (Math.hypot(vx, vy) < 0.15) vx = vy = 0;
      if (Math.abs(va) < 0.0006) va = 0;
      let then = performance.now();
      const step = (now: number) => {
        const ms = Math.min(32, now - then);
        then = now;
        const decay = Math.exp(-FRICTION * ms);
        vx *= decay;
        vy *= decay;
        va *= decay;
        if (vx || vy) h.current.onPan(vx * ms, vy * ms);
        if (va && h.current.onRotate) h.current.onRotate(va * ms, centre());
        if (Math.hypot(vx, vy) < 0.02 && Math.abs(va) < 0.00005) {
          momentum = 0;
          return end();
        }
        momentum = requestAnimationFrame(step);
      };
      momentum = requestAnimationFrame(step);
    };

    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return { mid, dist: Math.hypot(b[0] - a[0], b[1] - a[1]), angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    };
    const resetBaseline = () => {
      if (pointers.size >= 2) {
        const g = twoFinger();
        prevMid = g.mid;
        prevDist = g.dist;
        prevAngle = g.angle;
      } else if (pointers.size === 1) {
        prevMid = [...pointers.values()][0];
      }
      samples = [];
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (momentum) {
        // Touching the map stops the glide (and that touch isn't a tap).
        cancelAnimationFrame(momentum);
        momentum = 0;
        end();
      }
      if (pointers.size === 1) {
        downAt = p;
        dragging = false;
        rotating = e.pointerType === 'mouse' && (e.shiftKey || e.button === 2);
        totalAngle = 0;
      } else {
        // A second finger: this is a pinch/twist from here on.
        dragging = true;
        start();
        capture(e.pointerId);
      }
      resetBaseline();
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);

      if (pointers.size === 1) {
        if (!dragging) {
          if (!downAt || Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) < DRAG_START_PX) return;
          dragging = true;
          start();
          // Only capture once it's really a drag, so taps on pins still reach the pins.
          capture(e.pointerId);
        }
        if (rotating && h.current.onRotate) {
          const c = centre();
          const d = Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(prevMid[1] - c[1], prevMid[0] - c[0]);
          const da = Math.atan2(Math.sin(d), Math.cos(d));
          totalAngle += da;
          h.current.onRotate(da, c);
          sample(0, 0);
        } else {
          h.current.onPan(p[0] - prevMid[0], p[1] - prevMid[1]);
          sample(p[0], p[1]);
        }
        prevMid = p;
        return;
      }

      const g = twoFinger();
      h.current.onPan(g.mid[0] - prevMid[0], g.mid[1] - prevMid[1]);
      if (prevDist > 0 && g.dist > 0) h.current.onZoom(g.dist / prevDist, g.mid);
      if (h.current.onRotate) {
        const d = g.angle - prevAngle;
        const da = Math.atan2(Math.sin(d), Math.cos(d));
        totalAngle += da;
        h.current.onRotate(da, g.mid);
      }
      sample(g.mid[0], g.mid[1]);
      prevMid = g.mid;
      prevDist = g.dist;
      prevAngle = g.angle;
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      const wasDragging = dragging;
      pointers.delete(e.pointerId);
      if (pointers.size > 0) {
        // Lifted one of two fingers: carry on panning with the other, without a jump.
        resetBaseline();
        return;
      }
      if (wasDragging) {
        suppressClick = true; // the click that follows a drag shouldn't deselect things
        window.setTimeout(() => (suppressClick = false), 0);
        if (e.type === 'pointercancel') end();
        else glide();
        return;
      }
      // A tap: two in quick succession, close together, zoom in.
      const now = performance.now();
      if (now - lastTap.t < 300 && Math.hypot(p[0] - lastTap.x, p[1] - lastTap.y) < 30) {
        lastTap.t = 0;
        h.current.onDoubleTap?.(p);
      } else lastTap = { t: now, x: p[0], y: p[1] };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      start();
      // Same feel as before: a mouse notch ≈ ×1.25; trackpad pinch (ctrlKey) is finer and faster.
      const dy = e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1);
      h.current.onZoom(2 ** -dy, local(e));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(end, 160);
    };

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
    };
    // Safari's own pinch-to-zoom-the-page; the map handles pinches itself.
    const stopGesture = (e: Event) => e.preventDefault();
    const stopMenu = (e: MouseEvent) => {
      if (rotating || dragging) e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('click', onClick, true);
    el.addEventListener('gesturestart', stopGesture);
    el.addEventListener('gesturechange', stopGesture);
    el.addEventListener('contextmenu', stopMenu);
    return () => {
      if (momentum) cancelAnimationFrame(momentum);
      window.clearTimeout(wheelTimer);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('gesturestart', stopGesture);
      el.removeEventListener('gesturechange', stopGesture);
      el.removeEventListener('contextmenu', stopMenu);
    };
  }, [target]);
}

/** Runs `frame(e)` with an eased 0→1 over `ms`; returns a cancel function. */
export function tween(ms: number, frame: (e: number) => void, done?: () => void) {
  if (getSettings().reduceMotion) {
    // Settings → Reduce motion: jump straight there.
    frame(1);
    done?.();
    return () => undefined;
  }
  const t0 = performance.now();
  let raf = 0;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    frame(ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
