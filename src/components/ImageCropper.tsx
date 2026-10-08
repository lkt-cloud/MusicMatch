import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Props = {
  file: File;
  /** Width ÷ height of the crop. */
  aspect: number;
  /** Show a circular guide (profile pictures). */
  round?: boolean;
  /** Width of the exported image, in pixels. */
  outputWidth: number;
  title: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
};

const MAX_ZOOM = 4;

/** Drag to position, slide/scroll/pinch to zoom, then export the framed area as a JPEG. */
export function ImageCropper({ file, aspect, round = false, outputWidth, title, onCancel, onDone }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const viewW = Math.min(360, window.innerWidth - 64);
  const viewH = viewW / aspect;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let live = true; // a cancelled load (e.g. its URL already revoked) must not report failure
    image.onload = () => live && setImg(image);
    image.onerror = () => live && setFailed(true);
    image.src = url;
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Smallest scale that still covers the frame; zoom multiplies it.
  const base = img ? Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight) : 1;
  const scale = base * zoom;
  const imgW = img ? img.naturalWidth * scale : 0;
  const imgH = img ? img.naturalHeight * scale : 0;

  /** Keep the image covering the frame. Offsets are relative to a centred image. */
  const clamp = (x: number, y: number, w = imgW, h = imgH) => ({
    x: Math.max(-(w - viewW) / 2, Math.min((w - viewW) / 2, x)),
    y: Math.max(-(h - viewH) / 2, Math.min((h - viewH) / 2, y)),
  });

  const setZoomClamped = (z: number) => {
    if (!img) return;
    const next = Math.max(1, Math.min(MAX_ZOOM, z));
    const ratio = next / zoom;
    const w = img.naturalWidth * base * next;
    const h = img.naturalHeight * base * next;
    setZoom(next);
    setOffset((o) => clamp(o.x * ratio, o.y * ratio, w, h));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      setZoomClamped((pinchStart.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart.current.dist);
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const save = () => {
    if (!img) return;
    setSaving(true);
    const outW = outputWidth;
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    // Frame's top-left, in image pixels.
    const left = (imgW - viewW) / 2 - offset.x;
    const top = (imgH - viewH) / 2 - offset.y;
    canvas
      .getContext('2d')!
      .drawImage(img, left / scale, top / scale, viewW / scale, viewH / scale, 0, 0, outW, outH);
    canvas.toBlob((b) => (b ? onDone(b) : setSaving(false)), 'image/jpeg', 0.9);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal cropper" role="dialog" aria-modal="true" aria-label={title}>
        <header className="cropper-head">
          <h2>{title}</h2>
          <button className="icon-btn ghost" onClick={onCancel} aria-label="Cancel">
            <Icon name="close" size={18} />
          </button>
        </header>

        {failed ? (
          <p className="empty">Couldn’t open that photo. Try a JPG or PNG.</p>
        ) : (
          <>
            <div
              className={`crop-frame${round ? ' is-round' : ''}`}
              style={{ width: viewW, height: viewH }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
              tabIndex={0}
              aria-label="Drag to reposition. Arrow keys move, plus and minus zoom."
              onKeyDown={(e) => {
                const step = 10;
                if (e.key === 'ArrowLeft') setOffset(clamp(offset.x + step, offset.y));
                else if (e.key === 'ArrowRight') setOffset(clamp(offset.x - step, offset.y));
                else if (e.key === 'ArrowUp') setOffset(clamp(offset.x, offset.y + step));
                else if (e.key === 'ArrowDown') setOffset(clamp(offset.x, offset.y - step));
                else if (e.key === '+' || e.key === '=') setZoomClamped(zoom * 1.1);
                else if (e.key === '-') setZoomClamped(zoom / 1.1);
                else return;
                e.preventDefault();
              }}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: imgW,
                    height: imgH,
                    transform: `translate(${(viewW - imgW) / 2 + offset.x}px, ${(viewH - imgH) / 2 + offset.y}px)`,
                  }}
                />
              )}
              <span className="crop-guide" aria-hidden />
            </div>

            <div className="crop-zoom">
              <Icon name="minus" size={16} />
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoomClamped(Number(e.target.value))}
                className="range-input"
                style={{ ['--pct' as string]: `${((zoom - 1) / (MAX_ZOOM - 1)) * 100}%` }}
                aria-label="Zoom"
              />
              <Icon name="plus" size={16} />
            </div>
          </>
        )}

        <footer className="cropper-foot">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!img || saving}>
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </footer>
      </div>
    </div>
  );
}
