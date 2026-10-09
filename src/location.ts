// The device's location, asked for politely:
//  - when the map opens ("auto"), we only ever prompt once; after that we use the location
//    only if permission is already granted, so people aren't asked again and again;
//  - when someone taps a button ("user"), we always try, since they asked for it.
// Inside the Music Match app, the native side answers with the phone's own location
// permission (asked once, remembered), instead of the web view's prompt.

export type Coords = [lng: number, lat: number];
export type LocationResult = { coords: Coords } | { error: 'denied' | 'unavailable' };

const ASKED = 'music-match:location-asked';

const remember = () => {
  try {
    localStorage.setItem(ASKED, '1');
  } catch {
    // storage blocked: we may ask again next time, which is fine
  }
};
const askedBefore = () => {
  try {
    return localStorage.getItem(ASKED) === '1';
  } catch {
    return false;
  }
};

type NativeBridge = { postMessage: (m: string) => void };
const nativeApp = () => (window as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView;

function fromNativeApp(bridge: NativeBridge, prompt: boolean): Promise<LocationResult> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const finish = (r: LocationResult) => {
      window.removeEventListener('mm-location', onReply);
      window.clearTimeout(timer);
      resolve(r);
    };
    const onReply = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; coords?: Coords; error?: 'denied' | 'unavailable' }>).detail;
      if (d?.id !== id) return;
      finish(d.coords ? { coords: d.coords } : { error: d.error ?? 'unavailable' });
    };
    const timer = window.setTimeout(() => finish({ error: 'unavailable' }), 15_000);
    window.addEventListener('mm-location', onReply);
    bridge.postMessage(JSON.stringify({ type: 'location', id, prompt }));
  });
}

async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'unknown'; // older browsers can't say
  }
}

export async function getDeviceLocation(mode: 'auto' | 'user'): Promise<LocationResult> {
  const bridge = nativeApp();
  if (bridge) {
    const prompt = mode === 'user' || !askedBefore();
    remember();
    return fromNativeApp(bridge, prompt);
  }
  if (!navigator.geolocation) return { error: 'unavailable' };

  if (mode === 'auto') {
    const state = await permissionState();
    if (state === 'denied') return { error: 'denied' };
    // Not granted yet and we've asked before: don't pop the question up again.
    if (state !== 'granted' && askedBefore()) return { error: 'denied' };
  }
  remember();
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: [pos.coords.longitude, pos.coords.latitude] }),
      (err) => resolve({ error: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { timeout: 10_000, maximumAge: 5 * 60_000, enableHighAccuracy: mode === 'user' },
    ),
  );
}
