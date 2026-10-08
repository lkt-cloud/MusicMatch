import { createClient } from '@supabase/supabase-js';

// The URL and anon key are public by design: row-level security in the database
// decides what they can do. Secret keys live only in Supabase Edge Function secrets.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null until the Supabase keys are set in .env — the site then runs in demo mode. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

/** True when the site is connected to Supabase (real accounts, data and payments). */
export const LIVE = supabase !== null;
