import { useEffect, useRef, useState } from 'react';
import { ACCEPT_FILES, ACCEPT_MEDIA, MAX_FILES, formatBytes, kindOf, rejectReason } from '../data/attachments';
import type { AttachmentKind } from '../data/types';
import { Icon, type IconName } from './Icon';

export const KIND_ICON: Record<AttachmentKind, IconName> = { image: 'image', video: 'camera', audio: 'note', file: 'file' };

type Pending = { file: File; preview: string | null };

/** Files picked but not sent yet, with validation and image previews. */
export function usePendingFiles() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free image previews when the component goes away.
  const ref = useRef(pending);
  ref.current = pending;
  useEffect(() => () => ref.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), []);

  const add = (list: FileList | File[]) => {
    const files = [...list];
    const bad = files.map(rejectReason).filter((r): r is string => !!r);
    const ok = files.filter((f) => !rejectReason(f));
    const room = MAX_FILES - pending.length;
    if (ok.length > room) bad.push(`You can attach up to ${MAX_FILES} files at once.`);
    setErrors(bad);
    setPending((p) => [
      ...p,
      ...ok.slice(0, Math.max(0, room)).map((file) => ({
        file,
        preview: kindOf(file) === 'image' ? URL.createObjectURL(file) : null,
      })),
    ]);
  };

  const remove = (i: number) =>
    setPending((p) => {
      if (p[i]?.preview) URL.revokeObjectURL(p[i].preview!);
      return p.filter((_, j) => j !== i);
    });

  const clear = () => {
    pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    setPending([]);
    setErrors([]);
  };

  const inputs = (
    <>
      <input ref={mediaInput} type="file" accept={ACCEPT_MEDIA} multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
      <input ref={fileInput} type="file" accept={ACCEPT_FILES} multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
    </>
  );

  return {
    files: pending.map((p) => p.file),
    pending,
    errors,
    setErrors,
    add,
    remove,
    clear,
    inputs,
    pickMedia: () => mediaInput.current?.click(),
    pickFiles: () => fileInput.current?.click(),
  };
}

export function PendingTray({ picker }: { picker: ReturnType<typeof usePendingFiles> }) {
  if (!picker.pending.length && !picker.errors.length) return null;
  return (
    <div className="tray">
      {picker.errors.map((e) => (
        <p key={e} className="field-note is-bad">{e}</p>
      ))}
      {picker.pending.length > 0 && (
        <div className="tray-items">
          {picker.pending.map((p, i) => {
            const kind = kindOf(p.file)!;
            return (
              <div key={i} className="tray-item">
                {p.preview ? (
                  <img src={p.preview} alt="" />
                ) : (
                  <span className={`tray-icon tray-${kind}`}><Icon name={KIND_ICON[kind]} size={18} /></span>
                )}
                <span className="tray-meta">
                  <strong>{p.file.name}</strong>
                  <span>{formatBytes(p.file.size)}</span>
                </span>
                <button className="icon-btn ghost" onClick={() => picker.remove(i)} aria-label={`Remove ${p.file.name}`}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
