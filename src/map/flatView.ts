// The flat map's view maths, kept separate so it can be tested on its own.
// screen = k · rotate(a) · (world − C) + o, in the map's fixed 1000×1000 world space.
// Pan moves o, zoom scales k about a point, and rotation spins the disc about a point.

import type { Point } from './gestures';

export type FlatView = { k: number; o: [number, number]; a: number };

/** Centre of the world space (the north pole). */
export const C = 500;

export const rot = (a: number, [x, y]: [number, number]): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
export const toView = (v: FlatView, w: [number, number]): [number, number] => {
  const [x, y] = rot(v.a, [w[0] - C, w[1] - C]);
  return [v.k * x + v.o[0], v.k * y + v.o[1]];
};
export const fromView = (v: FlatView, s: [number, number]): [number, number] => {
  const [x, y] = rot(-v.a, [(s[0] - v.o[0]) / v.k, (s[1] - v.o[1]) / v.k]);
  return [x + C, y + C];
};
export const zoomAbout = (v: FlatView, f: number, p: Point): FlatView => ({ ...v, k: v.k * f, o: [p[0] + f * (v.o[0] - p[0]), p[1] + f * (v.o[1] - p[1])] });
export const rotateAbout = (v: FlatView, da: number, p: Point): FlatView => {
  const [x, y] = rot(da, [v.o[0] - p[0], v.o[1] - p[1]]);
  return { ...v, a: v.a + da, o: [p[0] + x, p[1] + y] };
};
/** The view that puts world point `w` at screen point `s` with scale k and angle a. */
export const viewAt = (w: [number, number], s: Point, k: number, a: number): FlatView => {
  const [x, y] = rot(a, [w[0] - C, w[1] - C]);
  return { k, a, o: [s[0] - k * x, s[1] - k * y] };
};
export const svgTransform = (v: FlatView) =>
  `translate(${v.o[0]},${v.o[1]}) rotate(${(v.a * 180) / Math.PI}) scale(${v.k}) translate(${-C},${-C})`;
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

