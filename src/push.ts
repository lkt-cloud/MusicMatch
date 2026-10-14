// Push notifications on this device: asking permission, signing the device up, and signing it
// out again. In the Music Match app the phone's own notifications are used (through the app
// shell, see mobile/App.tsx); in a browser, Web Push with a small service worker (public/sw.js).

import * as api from './backend/api';

// Public half of the Web Push key pair; the private half is an Edge Function secret.
const VAPID_PUBLIC_KEY = 'BJFfGC_wPMV24LnTQO8Xs1_k2tPePI5NgDy6mt-0V2MQDbtVkwSW6JpvaikNp0mD5L_IbXxvugCgeWRvTVncAkg';
const DEVICE_KEY = 'music-match:push-device';

/**
 * on: notifications are on for this device.  off: not yet (we can ask).
 * blocked: turned off in the phone's or browser's settings.  install: iPhone Safari, which only
 * allows them once Music Match is added to the Home Screen.  unsupported: this browser can't, or
 * the app build doesn't have push set up yet.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install' | 'unsupported';

type NativeBridge = { postMessage: (m: string) => void };
const nativeApp = () => (window as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView;

const remember = (endpoint: string | null) => {
  try {
    if (endpoint) localStorage.setItem(DEVICE_KEY, endpoint);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // storage blocked: we just can't tidy up this device on sign-out
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------ app (native)

function askApp(action: 'status' | 'register'): Promise<{ state: PushState; token?: string }> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const done = (r: { state: PushState; token?: string }) => {
      window.removeEventListener('mm-push', onReply);
      window.clearTimeout(timer);
      resolve(r);
    };
    const onReply = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; state: PushState; token?: string }>).detail;
      if (d?.id === id) done(d);
    };
    // An older app build that doesn't know about notifications never answers.
    const timer = window.setTimeout(() => done({ state: 'unsupported' }), action === 'register' ? 60_000 : 3_000);
    window.addEventListener('mm-push', onReply);
    nativeApp()!.postMessage(JSON.stringify({ type: 'push', action, id }));
  });
}

// ------------------------------------------------------------------ browser (web push)

const webSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Registers the service worker that shows notifications (safe to call more than once). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || nativeApp()) return Promise.resolve(undefined);
  return navigator.serviceWorker.register('/sw.js').catch((e) => {
    console.warn('service worker', e);
    return undefined;
  });
}

const keyBytes = (base64: string) => {
  const s = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function webSubscription(create: boolean) {
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.getRegistration());
  if (!reg) return null;
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || !create) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}

// ------------------------------------------------------------------ both

export async function pushState(): Promise<PushState> {
  if (nativeApp()) return (await askApp('status')).state;
  if (!webSupported()) return isIOS() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await webSubscription(false)) ? 'on' : 'off';
}

/** Asks for permission (only when the person taps a button) and signs this device up. */
export async function enablePush(): Promise<PushState> {
  if (nativeApp()) {
    const r = await askApp('register');
    if (r.state === 'on' && r.token) {
      await api.savePushSubscription('expo', r.token);
      remember(r.token);
    }
    return r.state;
  }
  if (!webSupported()) return isIOS() ? 'install' : 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const sub = await webSubscription(true);
  if (!sub) return 'unsupported';
  const json = sub.toJSON();
  await api.savePushSubscription('web', json.endpoint!, json.keys);
  remember(json.endpoint!);
  return 'on';
}

/** Stops notifications on this device. */
export async function disablePush(): Promise<PushState> {
  const endpoint = remembered();
  if (endpoint) await api.removePushSubscription(endpoint).catch(() => undefined);
  remember(null);
  if (!nativeApp() && webSupported()) await (await webSubscription(false))?.unsubscribe().catch(() => undefined);
  return 'off';
}

/**
 * After signing in: if this device already allows notifications, sign it up for this account
 * again (quietly, no prompt), so they keep arriving after a reinstall or on a shared device.
 */
export async function syncPush() {
  try {
    if (nativeApp()) {
      if ((await askApp('status')).state === 'on') await enablePush();
      return;
    }
    if (webSupported() && Notification.permission === 'granted') await enablePush();
  } catch (e) {
    console.warn('push sync', e);
  }
}

/** Before signing out: this device stops getting this account's notifications. */
export async function forgetDevice() {
  const endpoint = remembered();
  if (endpoint) await api.removePushSubscription(endpoint).catch(() => undefined);
  remember(null);
}

/** The number on the app icon (the app, and installed web apps that support it). */
export function setAppBadge(count: number) {
  const app = nativeApp();
  if (app) app.postMessage(JSON.stringify({ type: 'badge', count }));
  else if ('setAppBadge' in navigator) (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => undefined);
}
