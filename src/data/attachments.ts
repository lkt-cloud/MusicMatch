// Files in posts, messages and profiles. Messages/posts keep only the metadata; the bytes live
//  - in demo mode: this browser's IndexedDB (localStorage is far too small)
//  - in live mode: Supabase Storage. Those ids look like "sb:<bucket>/<path>".

import { useEffect, useState } from 'react';
import { supabase } from '../backend/client';
import type { Attachment, AttachmentKind } from './types';

export const MAX_FILE_MB = 100;
export const MAX_FILES = 10;

const KINDS: { kind: AttachmentKind; exts: string[]; mime: RegExp }[] = [
  { kind: 'image', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'], mime: /^image\// },
  { kind: 'audio', exts: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'aiff', 'aif'], mime: /^audio\// },
  { kind: 'video', exts: ['mp4', 'mov', 'm4v', 'webm'], mime: /^video\// },
  { kind: 'file', exts: ['pdf', 'zip'], mime: /^application\/(pdf|zip|x-zip-compressed)$/ },
];

/** `accept` strings for the two file pickers. */
export const ACCEPT_MEDIA = 'image/*,video/*';
export const ACCEPT_FILES = KINDS.flatMap((k) => k.exts.map((e) => `.${e}`)).join(',');

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export function kindOf(file: File): AttachmentKind | null {
  const e = ext(file.name);
  return KINDS.find((k) => k.exts.includes(e) || (file.type && k.mime.test(file.type)))?.kind ?? null;
}

/** Why a file can't be sent, or null if it's fine. */
export function rejectReason(file: File): string | null {
  if (!kindOf(file)) return `${file.name}: that file type isn’t supported.`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `${file.name} is over ${MAX_FILE_MB} MB.`;
  return null;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

const DB = 'music-match-files';
const STORE = 'files';
let dbPromise: Promise<IDBDatabase> | null = null;

function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putFile = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id));
export const getFile = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));

const REMOTE = 'sb:';
const isRemote = (id: string) => id.startsWith(REMOTE);
const splitRemote = (id: string) => {
  const rest = id.slice(REMOTE.length);
  const slash = rest.indexOf('/');
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
};
const randomName = (name: string) => `${crypto.randomUUID()}.${ext(name) || 'bin'}`;

/** Uploads to Supabase Storage. Paths start with the uploader's id, which the storage policies check. */
async function upload(blob: Blob, name: string, messageTo?: string): Promise<string> {
  const { data } = await supabase!.auth.getSession();
  const me = data.session?.user.id;
  if (!me) throw new Error('Not signed in');
  const bucket = messageTo ? 'message-files' : 'media';
  const path = messageTo ? `${me}/${messageTo}/${randomName(name)}` : `${me}/${randomName(name)}`;
  const { error } = await supabase!.storage.from(bucket).upload(path, blob, { contentType: blob.type || undefined });
  if (error) throw error;
  return `${REMOTE}${bucket}/${path}`;
}

/** URL to show a stored file: public for media, short-lived signed links for private message files. */
async function remoteUrl(id: string): Promise<string | null> {
  const { bucket, path } = splitRemote(id);
  if (bucket === 'media') return supabase!.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const { data } = await supabase!.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const deleteFile = (id: string) => {
  if (isRemote(id)) {
    const { bucket, path } = splitRemote(id);
    return supabase?.storage.from(bucket).remove([path]).then(() => undefined, () => undefined);
  }
  return tx('readwrite', (s) => s.delete(id)).catch(() => undefined);
};

/** Saves picked files and returns their metadata. `messageTo` keeps a DM's files private to the two people in it. */
export async function saveFiles(files: File[], opts: { messageTo?: string } = {}): Promise<Attachment[]> {
  return Promise.all(
    files.map(async (file) => {
      let id: string;
      if (supabase) id = await upload(file, file.name, opts.messageTo);
      else {
        id = Math.random().toString(36).slice(2, 12);
        await putFile(id, file);
      }
      return { id, name: file.name, type: file.type, size: file.size, kind: kindOf(file)! };
    }),
  );
}

/** Stores an already-processed image (profile picture, banner) and returns its id. */
export async function saveImage(blob: Blob) {
  if (supabase) return upload(blob, 'image.jpg');
  const id = Math.random().toString(36).slice(2, 12);
  await putFile(id, blob);
  return id;
}

/** A display URL for any stored file id, or null if it's gone. */
function resolveUrl(id: string): Promise<string | null> {
  if (isRemote(id)) return supabase ? remoteUrl(id) : Promise.resolve(null);
  return getFile(id).then((b) => (b ? URL.createObjectURL(b) : null));
}

// Profile pictures show up in many places at once, so their URLs are shared, not per-component.
const sharedUrls = new Map<string, Promise<string | null>>();

/** URL for an image shown in many places (profile pictures, banners). */
export function useSharedFileUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return setUrl(null);
    let live = true;
    let p = sharedUrls.get(id);
    if (!p) {
      p = resolveUrl(id).catch(() => null);
      sharedUrls.set(id, p);
    }
    p.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

/** URL for a stored file (null while loading, or if it's gone). */
export function useFileUrl(id: string) {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false });
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    resolveUrl(id)
      .then((u) => {
        if (!live) return;
        url = u;
        setState(u ? { url: u, missing: false } : { url: null, missing: true });
      })
      .catch(() => live && setState({ url: null, missing: true }));
    return () => {
      live = false;
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

/** Drops a stored image that's been replaced (profile picture, banner). */
export function releaseImage(id: string | undefined) {
  if (!id) return;
  sharedUrls.get(id)?.then((u) => u?.startsWith('blob:') && URL.revokeObjectURL(u));
  sharedUrls.delete(id);
  deleteFile(id);
}
