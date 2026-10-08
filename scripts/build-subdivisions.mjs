// Builds src/data/subdivisions.json: US state and Canadian province boundary lines
// (internal ones only — country borders come from world-atlas). Source: Natural Earth
// 1:50m via the sane-topojson package (MIT).
// Run with: node scripts/build-subdivisions.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const na = require('sane-topojson/dist/north-america_50m.json');
const COUNTRIES = new Set(['USA', 'CAN']);

const lines = mesh(
  na,
  na.objects.subunits,
  (a, b) => a !== b && a.properties.gu === b.properties.gu && COUNTRIES.has(a.properties.gu),
);

// Re-encode as compact TopoJSON so it's small to ship.
let topo = topology({ lines }, 1e5);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.35));
writeFileSync(new URL('../src/data/subdivisions.json', import.meta.url), JSON.stringify(topo));
console.log('segments:', lines.coordinates.length);
