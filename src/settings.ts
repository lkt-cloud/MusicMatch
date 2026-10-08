// Personal settings that belong to this device (theme, units…), saved in the browser.
// Account things (email, password, profile) live with the account instead.

import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type Units = 'mi' | 'km';

export type Settings = {
  /** Dark is the default look; "system" follows the phone or computer. */
  theme: ThemeChoice;
  units: Units;
  /** Ask for your location and zoom to you when the map opens. */
  locateOnOpen: boolean;
  /** Fewer animations: no glide after flicking the map, no fly-overs. */
  reduceMotion: boolean;
};

const KEY = 'music-match:settings';
const DEFAULTS: Settings = { theme: 'dark', units: 'mi', locateOnOpen: true, reduceMotion: false };

const read = (): Settings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
};

let current = read();
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // private mode: the change still applies until the page is closed
  }
  applyAppearance();
  listeners.forEach((l) => l());
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

// ------------------------------------------------------------------ appearance

const lightQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

/** The theme actually showing: "system" resolves to the device's light or dark mode. */
export const resolvedTheme = (s: Settings = current): 'dark' | 'light' =>
  s.theme === 'system' ? (lightQuery?.matches ? 'light' : 'dark') : s.theme;

const BAR = { dark: '#0d0e0c', light: '#f6f4ef' };

export function applyAppearance() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.motion = current.reduceMotion ? 'reduced' : 'full';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
  // Inside the Music Match app, let the native shell match (status bar, edges).
  (window as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView?.postMessage(
    JSON.stringify({ type: 'theme', theme, background: BAR[theme] }),
  );
}

// Follow the device when it switches between light and dark (only matters for "system").
lightQuery?.addEventListener('change', () => {
  if (current.theme === 'system') {
    applyAppearance();
    listeners.forEach((l) => l());
  }
});

// Another tab changed a setting.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    current = read();
    applyAppearance();
    listeners.forEach((l) => l());
  });
