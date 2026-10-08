import { Fragment, useEffect, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import { CITY_NAMES, cityCoords } from '../data/creatives';
import { roleInfo, rolesOf } from '../data/roles';
import type { Creative } from '../data/types';
import { Avatar } from '../components/Avatar';
import { useStore } from '../store';
import { RoleIcon } from '../components/Icon';
import { isNight, type Sky } from './sky';
import { CITY_AREA_MILES, isExact, radiusCircle } from './shared';
import { DETAIL_ZOOM } from './detail/useMapDetail';

type Props = {
  size: { w: number; h: number };
  /** Current zoom as a multiple of the whole-map view. */
  zoom: number;
  /** Screen position for a coordinate, or null when it's out of sight (e.g. the far side of the globe). */
  toScreen: (coords: [number, number]) => [number, number] | null;
  creatives: Creative[];
  me: Creative;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClusterClick: (members: Creative[]) => void;
  /** Sun and moon; when given, they're drawn and city lights only show on the night side. */
  sky?: Sky;
  /** Device location, when shared; the 'you' dot goes here instead of your profile location. */
  here?: [number, number] | null;
  /** Drawn under the pins (e.g. street-map labels). */
  beneath?: ReactNode;
  /** The built-in sample-city labels; turned off when real place names are showing. */
  cityLabels?: boolean;
};

// From this zoom, people who only share their city fan out in a little crowd above the
// city's name, and hovering a pin shows the area they're in (or how far they travel).
export const FAN_ZOOM = DETAIL_ZOOM;
export const HOVER_ZOOM = DETAIL_ZOOM;
const FAN_ROW = 6; // pins per row
const FAN_STEP = 36; // px between pin centres
const FAN_MAX = 11; // beyond this the rest fold into a "+N" button until it's clicked
const PIN = 36; // a pin's footprint, for overlap checks

/** Cities whose name the pin layer draws itself (under a fan), so the map labels skip them. */
export const fanCityNames = (creatives: Creative[]) => new Set(creatives.filter((c) => !isExact(c) && c.city).map((c) => c.city));

type Box = [x0: number, y0: number, x1: number, y1: number];
/** One thing to place: a single pin, or everyone in a city who only shares their city. */
type Unit = { x: number; y: number; members: Creative[]; city?: string; box: Box };
type Group = { x: number; y: number; units: Unit[]; box: Box };

const inView = (x: number, y: number, size: { w: number; h: number }, pad: number) =>
  x > -pad && y > -pad && x < size.w + pad && y < size.h + pad;

const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Pin positions for a city crowd: rows of up to FAN_ROW, stacked upward from just above the name. */
function fanLayout(n: number, x: number, y: number) {
  const rows = Math.ceil(n / FAN_ROW);
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const count = Math.min(FAN_ROW, n - r * FAN_ROW);
    for (let col = 0; col < count; col++) {
      const off = col - (count - 1) / 2;
      // A gentle arch: the middle of each row sits slightly higher than its ends.
      out.push([x + off * FAN_STEP + (r % 2) * (FAN_STEP / 4), y - 30 - r * (FAN_STEP - 4) + off * off * 1.6]);
    }
  }
  return out;
}

/** What hovering someone shows: how far they travel, or the area they could be in. */
function hoverRadiusOf(c: Creative, skipTravel: boolean) {
  const area = !isExact(c);
  if (c.travelMiles && !skipTravel)
    return { miles: c.travelMiles, kind: 'travel', text: area ? `${c.city} · travels up to ${c.travelMiles} mi` : `Travels up to ${c.travelMiles} mi` } as const;
  if (area) return { miles: CITY_AREA_MILES, kind: 'area', text: `Somewhere in ${c.city}` } as const;
  return null;
}

const fanBox = (shown: number, x: number, y: number): Box => {
  const w = Math.min(shown, FAN_ROW) * FAN_STEP;
  const rows = Math.ceil(shown / FAN_ROW);
  return [x - w / 2, y - 30 - (rows - 1) * (FAN_STEP - 4) - PIN / 2, x + w / 2, y + 10];
};

export function PinLayer({ size, zoom, toScreen, creatives, me, selectedId, onSelect, onClusterClick, sky, here, beneath, cityLabels = true }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const fanning = zoom >= FAN_ZOOM;

  // Group pins that would overlap on screen. Zoomed in, each city's "city only" people
  // become one crowd above its name; crowds and pins only merge if they'd collide.
  const groups = useMemo(() => {
    const units: Unit[] = [];
    const crowds = new Map<string, Unit>();
    for (const c of creatives) {
      const p = toScreen(c.coords);
      if (!p) continue;
      const [x, y] = p;
      if (fanning && !isExact(c)) {
        const key = `${c.country}|${c.city}`;
        const crowd = crowds.get(key);
        if (crowd) crowd.members.push(c);
        else {
          const u: Unit = { x, y, members: [c], city: key, box: [0, 0, 0, 0] };
          crowds.set(key, u);
          units.push(u);
        }
      } else units.push({ x, y, members: [c], box: [x - PIN / 2, y - PIN / 2, x + PIN / 2, y + PIN / 2] });
    }
    for (const u of crowds.values()) {
      const shown = expanded === u.city ? u.members.length : Math.min(u.members.length, FAN_MAX + 1);
      u.box = fanBox(shown, u.x, u.y);
    }

    const out: Group[] = [];
    const add = (u: Unit) => {
      const hit = out.find((g) => !!g.units[0].city === !!u.city && overlaps(g.box, u.box));
      if (!hit) return out.push({ x: u.x, y: u.y, units: [u], box: u.box });
      hit.units.push(u);
      const n = hit.units.length;
      hit.x += (u.x - hit.x) / n;
      hit.y += (u.y - hit.y) / n;
      hit.box = [Math.min(hit.box[0], u.box[0]), Math.min(hit.box[1], u.box[1]), Math.max(hit.box[2], u.box[2]), Math.max(hit.box[3], u.box[3])];
    };
    // Crowds first. An exact pin that lands on a crowd (a studio downtown, seen from a
    // distance) joins it rather than covering the city's name; zoom in and it steps out.
    for (const u of units) if (u.city) add(u);
    for (const u of units) {
      if (u.city) continue;
      const crowd = out.find((g) => overlaps(g.box, u.box));
      if (crowd) crowd.units[0].members.push(...u.members);
      else add(u);
    }
    return out; // crowds come first, so single pins draw over them
  }, [creatives, toScreen, fanning, expanded]);

  // Hover: which pin, and whether it's fading out.
  const [hover, setHover] = useState<{ id: string; out: boolean } | null>(null);
  useEffect(() => {
    if (!hover?.out) return;
    const t = window.setTimeout(() => setHover((h) => (h?.out ? null : h)), 220);
    return () => window.clearTimeout(t);
  }, [hover]);
  const canHover = zoom >= HOVER_ZOOM;
  const hoverHandlers = (c: Creative) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && canHover && setHover({ id: c.id, out: false }),
    onPointerLeave: () => setHover((h) => (h?.id === c.id ? { ...h, out: true } : h)),
  });
  const hovered = canHover && hover ? creatives.find((c) => c.id === hover.id) : undefined;

  // Creatives per city, for the city-lights glow (placed at the city's centre, or the
  // average of its creatives for cities outside the sample list).
  const perCity = useMemo(() => {
    const groups = new Map<string, { n: number; lng: number; lat: number }>();
    for (const c of creatives) {
      if (!c.city) continue;
      const g = groups.get(c.city) ?? { n: 0, lng: 0, lat: 0 };
      groups.set(c.city, { n: g.n + 1, lng: g.lng + c.coords[0], lat: g.lat + c.coords[1] });
    }
    return [...groups].map(([city, g]) => ({
      city,
      n: g.n,
      coords: (CITY_NAMES.includes(city) ? cityCoords(city) : [g.lng / g.n, g.lat / g.n]) as [number, number],
    }));
  }, [creatives]);

  const fanned = useMemo(() => (fanning ? fanCityNames(creatives) : new Set<string>()), [fanning, creatives]);
  const showCities = cityLabels && zoom > 8;
  const showNames = zoom > 90;
  // Guests have no location until they share one, so no "you" dot.
  const { located } = useStore();
  const meXY = here || located ? toScreen(here ?? me.coords) : null;

  const spots = new Map<string, [number, number]>(); // where each pin ended up, for the hover label
  const pin = (c: Creative, x: number, y: number, fan?: { i: number; fx: number; fy: number }) => {
    spots.set(c.id, [x, y]);
    const selected = c.id === selectedId;
    // Studios with an address, and anyone who opted in, sit at an exact spot.
    const exact = isExact(c) && !fan;
    const isHovered = hovered?.id === c.id && !hover?.out;
    // The hover label carries the name when there's a radius to show.
    const nameInLabel = isHovered && !!hoverRadiusOf(c, c.id === selectedId);
    return (
      <button
        key={c.id}
        className={`pin${selected ? ' is-selected' : ''}${exact ? ' is-exact' : ''}${fan ? ' in-fan' : ''}${isHovered ? ' is-hovered' : ''}`}
        style={{
          transform: `translate(${x}px, ${y}px)`,
          ['--role' as string]: roleInfo(c.role).color,
          ...(fan && { ['--i' as string]: fan.i, ['--fx' as string]: `${fan.fx}px`, ['--fy' as string]: `${fan.fy}px` }),
        }}
        onClick={() => onSelect(selected ? null : c.id)}
        {...hoverHandlers(c)}
        aria-label={`${c.name}, ${rolesOf(c).map((r) => roleInfo(r).label).join(' and ')}`}
      >
        <span className="pin-head">
          <Avatar person={c} size={32} />
          <span className="pin-role">
            <RoleIcon role={c.role} size={11} />
          </span>
        </span>
        {/* In a crowd, names would overlap, so they only show for the pin you're on. */}
        {((showNames && !fan) || selected || (isHovered && !nameInLabel)) && <span className="pin-name">{c.name}</span>}
      </button>
    );
  };

  const pinsAndCrowds = groups.map((g) => {
    if (!overlaps(g.box, [-40, -40, size.w + 40, size.h + 40])) return null;
    const members = g.units.flatMap((u) => u.members);
    if (g.units.length > 1 || (!g.units[0].city && members.length > 1)) {
      const n = members.length;
      return (
        <button
          key={`cluster:${members[0].id}`}
          className="pin-cluster"
          style={{ transform: `translate(${g.x}px, ${g.y}px)`, ['--d' as string]: `${Math.min(56, 34 + Math.log2(n) * 5)}px` }}
          onClick={() => onClusterClick(members)}
          aria-label={`${n} creatives — zoom in`}
        >
          <span className="vinyl">
            <span className="vinyl-label">{n}</span>
          </span>
        </button>
      );
    }
    const u = g.units[0];
    if (!u.city) return pin(u.members[0], u.x, u.y);

    // A city crowd: the people, then the city's name underneath them.
    const open = expanded === u.city;
    const folded = !open && u.members.length > FAN_MAX + 1;
    const shown = folded ? u.members.slice(0, FAN_MAX) : u.members;
    const seats = fanLayout(shown.length + (folded ? 1 : 0), u.x, u.y);
    return (
      <Fragment key={`crowd:${u.city}`}>
        {shown.map((c, i) => pin(c, seats[i][0], seats[i][1], { i, fx: u.x - seats[i][0], fy: u.y - 30 - seats[i][1] }))}
        {folded && (
          <button
            className="crowd-more"
            style={{ transform: `translate(${seats[FAN_MAX][0]}px, ${seats[FAN_MAX][1]}px)` }}
            onClick={() => setExpanded(u.city!)}
            aria-label={`Show ${u.members.length - FAN_MAX} more in ${u.members[0].city}`}
          >
            +{u.members.length - FAN_MAX}
          </button>
        )}
        {open && u.members.length > FAN_MAX + 1 && (
          <button className="crowd-less" style={{ transform: `translate(${u.x}px, ${u.y + 18}px)` }} onClick={() => setExpanded(null)}>
            Show less
          </button>
        )}
        <span className="map-label is-city crowd-city" style={{ transform: `translate(${u.x}px, ${u.y}px)` }}>
          {u.members[0].city}
        </span>
      </Fragment>
    );
  });
  const hoverAt = hovered && spots.get(hovered.id);

  return (
    <div className="earth-overlay">
      {beneath}
      {sky &&
        zoom < 40 &&
        perCity.map(({ city, n, coords }) => {
          if (!isNight(sky, coords)) return null;
          const p = toScreen(coords);
          if (!p || !inView(p[0], p[1], size, 120)) return null;
          const s = Math.min(240, (80 + n * 16) * Math.max(0.9, Math.min(1.6, Math.sqrt(zoom) / 2)));
          return (
            <span
              key={`glow-${city}`}
              className="city-glow"
              style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, ['--s' as string]: `${s}px` }}
              aria-hidden
            />
          );
        })}
      {showCities &&
        CITY_NAMES.map((name) => {
          if (fanned.has(name)) return null; // the crowd draws its own name
          const p = toScreen(cityCoords(name));
          if (!p || !inView(p[0], p[1], size, 80)) return null;
          return (
            <span key={name} className="city-label" style={{ transform: `translate(${p[0]}px, ${p[1] - 40}px)` }}>
              {name}
            </span>
          );
        })}

      {sky && <SunMoon sky={sky} toScreen={toScreen} />}

      {hovered && hoverAt && (
        <HoverRadius
          key={hovered.id}
          person={hovered}
          pinAt={hoverAt}
          toScreen={toScreen}
          size={size}
          out={!!hover?.out}
          skipTravel={hovered.id === selectedId}
        />
      )}

      {meXY && <div className="me-dot" style={{ transform: `translate(${meXY[0]}px, ${meXY[1]}px)` }} title="You" />}

      {pinsAndCrowds}
    </div>
  );
}

/** The area someone could be in (city-only people) or how far they'll travel, drawn on hover. */
function HoverRadius({
  person: c,
  pinAt,
  toScreen,
  size,
  out,
  skipTravel,
}: {
  person: Creative;
  /** Where their pin is drawn (in a crowd that's not their map position). */
  pinAt: [number, number];
  toScreen: Props['toScreen'];
  size: Props['size'];
  out: boolean;
  /** The selected person's travel radius is already on the map. */
  skipTravel: boolean;
}) {
  const info = hoverRadiusOf(c, skipTravel);
  const miles = info?.miles ?? 0;
  const ring = useMemo(() => radiusCircle(c.coords, miles).coordinates[0] as [number, number][], [c.coords, miles]);
  if (!info) return null;

  // Project the circle; on the globe, points round the back are skipped.
  let d = '';
  let pen = false;
  let top: [number, number] | null = null; // the label sits on the circle's highest point on screen
  for (const pt of ring) {
    const p = toScreen(pt);
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
    if (!top || p[1] < top[1]) top = p;
  }
  const centre = toScreen(c.coords);
  if (!centre || !d) return null;

  // Above the circle, but never down among the pins.
  const labelY = Math.min(top?.[1] ?? Infinity, pinAt[1] - 28);

  return (
    <>
      <svg className={`hover-radius is-${info.kind}${out ? ' is-out' : ''}`} width={size.w} height={size.h} aria-hidden>
        <path d={d} style={{ transformOrigin: `${centre[0]}px ${centre[1]}px` }} />
      </svg>
      <span className={`hover-radius-label${out ? ' is-out' : ''}`} style={{ transform: `translate(${pinAt[0]}px, ${labelY}px)` }}>
        <strong>{c.name}</strong> · {info.text}
      </span>
    </>
  );
}

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

function SunMoon({ sky, toScreen }: { sky: Sky; toScreen: Props['toScreen'] }) {
  const sun = toScreen(sky.sun);
  const moon = toScreen(sky.moon);
  const phase = PHASES[Math.round(sky.moonElongation / 45) % 8];
  return (
    <>
      {moon && (
        <div className="moon-marker" style={{ transform: `translate(${moon[0]}px, ${moon[1]}px)` }} title={`Moon overhead · ${phase}`}>
          <MoonDisc elongation={sky.moonElongation} />
        </div>
      )}
      {sun && (
        <div className="sun-marker" style={{ transform: `translate(${sun[0]}px, ${sun[1]}px)` }} title="Sun directly overhead · it’s noon here">
          <span className="sun-core" />
          <span className="sun-label">Noon</span>
        </div>
      )}
    </>
  );
}

/** The moon with its current phase (as seen from the northern hemisphere). */
function MoonDisc({ elongation, r = 9 }: { elongation: number; r?: number }) {
  const k = Math.cos((elongation * Math.PI) / 180); // 1 = new, -1 = full
  const litRight = elongation < 180; // waxing
  const rx = Math.abs(k) * r;
  // Terminator bulges toward the lit side for a crescent, away from it when gibbous.
  const bulgeRight = k > 0 ? litRight : !litRight;
  const lit = `M0 ${-r} A${r} ${r} 0 0 ${litRight ? 1 : 0} 0 ${r} A${rx} ${r} 0 0 ${bulgeRight ? 0 : 1} 0 ${-r}Z`;
  return (
    <svg width={r * 2 + 4} height={r * 2 + 4} viewBox={`${-r - 2} ${-r - 2} ${r * 2 + 4} ${r * 2 + 4}`} aria-hidden>
      <circle r={r} fill="#2b2f33" />
      <path d={lit} fill="#ece8dc" />
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
    </svg>
  );
}
