import { useId } from 'react';

/**
 * Hand-sketched mark: a flat-earth disc (ice-wall rim, scribbled continents) with an
 * eighth note planted at the north pole like a flag. A turbulence filter makes every
 * line wobble like pencil on paper.
 */
export function LogoMark({ size = 48 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  const rough = `rough-${id}`;
  const rougher = `rougher-${id}`;
  const ink = '#f1e8d0';

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo-mark">
      <defs>
        <filter id={rough} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
        <filter id={rougher} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>

      <g filter={`url(#${rough})`} strokeLinecap="round" strokeLinejoin="round">
        {/* motion swooshes — the world is spinning like a record */}
        <path d="M5 33c-1.5-5 1-9 5-11.5" fill="none" stroke={ink} strokeWidth="1.2" opacity=".55" />
        <path d="M59 36c1.6-4.4.2-8.4-3.4-11" fill="none" stroke={ink} strokeWidth="1.2" opacity=".55" />

        {/* the disc's thickness, with pencil hatching */}
        <path d="M8.5 41.5c0 5.6 10.8 9.6 23.5 9.6s23.5-4 23.5-9.6" fill="#1b2619" stroke={ink} strokeWidth="1.5" />
        <g stroke={ink} strokeWidth=".8" opacity=".55">
          <path d="M13 46.5l2.5-3.4M18 48.4l2.5-3.6M23.5 49.6l2.4-3.7M29.5 50.2l2.3-3.8M35.5 50l2.3-3.8M41.5 49.2l2.4-3.6M47 47.6l2.3-3.4" />
        </g>

        {/* ocean top */}
        <ellipse cx="32" cy="41.5" rx="23.5" ry="8.6" fill="#55777b" stroke={ink} strokeWidth="1.6" />
        {/* second, offset outline: the classic sketchy double line */}
        <ellipse cx="32.4" cy="41.1" rx="23.9" ry="8.9" fill="none" stroke={ink} strokeWidth=".7" opacity=".45" />

        {/* ice wall around the rim */}
        <ellipse cx="32" cy="41.5" rx="21.6" ry="7.5" fill="none" stroke="#fbf7ec" strokeWidth="1.8" strokeDasharray="5 2.2 8 3 3 2" opacity=".9" />

        {/* scribbled continents */}
        <path d="M14.5 40.6c1.6-2.4 5.4-2.9 7.3-1.4 1.3 1.1-.4 2.6-2.4 3.3-1.8.7-1.5 2.4-3.4 2.1-1.9-.4-2.6-2.4-1.5-4z" fill="#cdb98a" stroke={ink} strokeWidth=".9" />
        <path d="M37.6 37.9c2.2-1.3 6.3-1.1 8.3.6 1.4 1.3-.2 2.6-2.4 2.6-1.4 0-1.3 1.7-3.3 1.6-2.3-.1-4.6-3.3-2.6-4.8z" fill="#b7bb8d" stroke={ink} strokeWidth=".9" />
        <path d="M28.4 44.6c1.3-.9 4.4-.8 5.2.5.7 1.2-.6 2.6-2.6 2.5-1.8-.1-3.5-2-2.6-3z" fill="#d6c193" stroke={ink} strokeWidth=".9" />
        {/* north pole */}
        <path d="M30.2 40.4c.8-.9 3.1-.9 3.8 0 .6.8-.6 1.6-1.9 1.6s-2.5-.8-1.9-1.6z" fill="#fbf7ec" stroke={ink} strokeWidth=".7" />
      </g>

      {/* the note, planted at the pole like a flag */}
      <g filter={`url(#${rougher})`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M33.6 40.2V9.5" stroke={ink} strokeWidth="2.4" />
        <path d="M33.9 9.5c4.9 1.3 9.3 4.5 9.2 9.6-.1 3.4-2 5.5-4 6.8 1.4-2.8 1.6-5.6-.6-7.8-1.3-1.4-3-2.2-4.6-2.6" fill="#d9a441" stroke={ink} strokeWidth="1.4" />
        <ellipse cx="29.3" cy="39.3" rx="5" ry="3.5" transform="rotate(-22 29.3 39.3)" fill="#d9a441" stroke={ink} strokeWidth="1.5" />
        {/* shading scratches on the note head */}
        <path d="M26.4 40.2l2.6-2.1M27.8 41.2l2.8-2.3" stroke="#7a5a1c" strokeWidth=".8" opacity=".7" />
      </g>

      {/* a couple of loose notes and sparkles drifting off */}
      <g filter={`url(#${rough})`} stroke={ink} strokeLinecap="round" fill="none">
        <path d="M47.5 15.5v-7l4.5-1.3v6.4" strokeWidth="1.1" />
        <ellipse cx="46.3" cy="15.8" rx="1.6" ry="1.1" fill={ink} />
        <ellipse cx="50.8" cy="13.9" rx="1.6" ry="1.1" fill={ink} />
        <path d="M17 18.5l.1 3.6M15.2 20.3l3.7-.1" strokeWidth="1" />
        <path d="M11.5 27.5l.1 2.2M10.4 28.6h2.3" strokeWidth=".8" opacity=".7" />
        <path d="M54 25.4l.1 2.4M52.8 26.6h2.5" strokeWidth=".8" opacity=".7" />
      </g>
    </svg>
  );
}
