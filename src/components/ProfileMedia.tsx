import { useRef, useState, type ReactNode } from 'react';
import { releaseImage, saveImage, useSharedFileUrl } from '../data/attachments';
import type { Creative } from '../data/types';
import { useStore } from '../store';
import { Icon } from './Icon';
import { ImageCropper } from './ImageCropper';

type CropShape = { aspect: number; round?: boolean; outputWidth: number; title: string };

/** Hidden file input + crop step + the logic to swap in a new profile picture or banner. */
function useImageUpload(field: 'avatarId' | 'bannerId', crop: CropShape) {
  const { me, updateMe } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Pick a photo (JPG, PNG, WebP or GIF).');
    setError(null);
    setCropping(file);
  };

  const onCropped = async (blob: Blob) => {
    setCropping(null);
    setBusy(true);
    try {
      const id = await saveImage(blob);
      releaseImage(me[field]);
      updateMe({ [field]: id });
    } catch {
      setError('Couldn’t save that photo. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    releaseImage(me[field]);
    updateMe({ [field]: undefined });
  };

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {cropping && <ImageCropper file={cropping} {...crop} onCancel={() => setCropping(null)} onDone={onCropped} />}
    </>
  );

  return { open: () => input.current?.click(), remove, busy, error, picker, has: !!me[field] };
}

/** Profile banner: the uploaded photo, or a generated cover. Editable on your own profile. */
export function ProfileCover({ person, editable, children }: { person: Creative; editable: boolean; children?: ReactNode }) {
  const photo = useSharedFileUrl(person.bannerId);
  const upload = useImageUpload('bannerId', { aspect: 18 / 7, outputWidth: 1800, title: 'Crop banner' });
  return (
    <div className={`profile-cover${photo ? ' has-photo' : ''}`}>
      {photo ? <img className="cover-img" src={photo} alt="" /> : children}
      {editable && (
        <div className="cover-edit">
          {upload.picker}
          <button type="button" className="media-btn" onClick={upload.open} disabled={upload.busy}>
            <Icon name="image" size={16} /> {upload.busy ? 'Uploading…' : upload.has ? 'Change banner' : 'Add banner'}
          </button>
          {upload.has && (
            <button type="button" className="media-btn" onClick={upload.remove} aria-label="Remove banner">
              <Icon name="trash" size={15} />
            </button>
          )}
          {upload.error && <span className="media-error">{upload.error}</span>}
        </div>
      )}
    </div>
  );
}

/** Wraps your avatar with a "change photo" button. */
export function AvatarEditor({ children }: { children: ReactNode }) {
  const upload = useImageUpload('avatarId', { aspect: 1, round: true, outputWidth: 512, title: 'Crop profile picture' });
  return (
    <div className="avatar-editor">
      {children}
      {upload.picker}
      <button type="button" className="avatar-change" onClick={upload.open} disabled={upload.busy} aria-label="Change profile picture">
        <Icon name="image" size={18} />
        <span>{upload.busy ? '…' : upload.has ? 'Change' : 'Add photo'}</span>
      </button>
      {upload.has && (
        <button type="button" className="avatar-remove" onClick={upload.remove}>
          Remove photo
        </button>
      )}
      {upload.error && <span className="media-error">{upload.error}</span>}
    </div>
  );
}
