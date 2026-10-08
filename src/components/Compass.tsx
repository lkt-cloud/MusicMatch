import { useRef } from 'react';

/**
 * Shows which way north is on the flat map. Tap to turn north back up; drag around it to
 * spin the map (useful with a mouse; on a phone you can also twist with two fingers).
 */
export function Compass({ degrees, onRotate, onReset }: { degrees: number; onRotate: (radians: number) => void; onReset: () => void }) {
  const drag = useRef<{ cx: number; cy: number; last: number; moved: boolean } | null>(null);

  const angleAt = (e: React.PointerEvent) => Math.atan2(e.clientY - drag.current!.cy, e.clientX - drag.current!.cx);

  return (
    <button
      className="icon-btn compass"
      aria-label={Math.abs(degrees) > 1 ? 'Turn the map so north is up' : 'Compass: drag to rotate the map'}
      title="Drag to rotate · tap to face north"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, last: 0, moved: false };
        drag.current.last = angleAt(e);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const a = angleAt(e);
        const da = Math.atan2(Math.sin(a - d.last), Math.cos(a - d.last));
        if (!d.moved && Math.abs(da) < 0.05) return;
        d.moved = true;
        d.last = a;
        onRotate(da);
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) onReset();
        drag.current = null;
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden style={{ rotate: `${degrees}deg` }}>
        <path d="M0 -10 L4 0 L-4 0 Z" fill="var(--accent)" />
        <path d="M0 10 L4 0 L-4 0 Z" fill="currentColor" opacity="0.45" />
        <circle r="1.6" fill="var(--bg)" />
      </svg>
    </button>
  );
}
