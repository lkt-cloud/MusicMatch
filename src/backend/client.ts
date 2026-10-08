import { createClient, type SupportedStorage } from '@supabase/supabase-js';

// The URL and anon key are public by design: row-level security in the database
// decides what they can do. Secret keys live only in Supabase Edge Function secrets.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// "Keep me signed in": on (the default), the sign-in is kept on this device until you sign
// out; off, it's kept only until the browser (or app) is closed.
const REMEMBER = 'music-match:remember';

const safe = <T,>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback; // storage blocked (private mode): fall back quietly
  }
};

export const keepSignedIn = () => safe(() => localStorage.getItem(REMEMBER) !== 'no', true);

/** Changes where the sign-in is kept, moving the current one across so nobody is signed out. */
export function setKeepSignedIn(on: boolean) {
  safe(() => {
    localStorage.setItem(REMEMBER, on ? 'yes' : 'no');
    const [from, to] = on ? [sessionStorage, localStorage] : [localStorage, sessionStorage];
    for (const key of Object.keys(from).filter((k) => k.startsWith('sb-'))) {
      to.setItem(key, from.getItem(key)!);
      from.removeItem(key);
    }
  }, undefined);
}

const authStorage: SupportedStorage = {
  getItem: (key) => safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null),
  setItem: (key, value) =>
    safe(() => {
      const [keep, drop] = keepSignedIn() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(key, value);
      drop.removeItem(key);
    }, undefined),
  removeItem: (key) =>
    safe(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }, undefined),
};

/** Null until the Supabase keys are set in .env — the site then runs in demo mode. */
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

/** True when the site is connected to Supabase (real accounts, data and payments). */
export const LIVE = supabase !== null;
