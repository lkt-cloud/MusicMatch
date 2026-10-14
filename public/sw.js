// Music Match service worker: shows push notifications and opens the right page when one is
// tapped. It doesn't cache anything; the site always loads fresh.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Music Match', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) self.navigator.setAppBadge(data.badge).catch(() => {});
      // If Music Match is open and in front, it shows its own banner instead.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.focused && w.visibilityState === 'visible')) return;
      await self.registration.showNotification(data.title || 'Music Match', {
        body: data.body || '',
        tag: data.tag,
        renotify: !!data.tag,
        icon: '/icons/icon-192.png',
        data: { url: data.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', url: path });
        return;
      }
      await self.clients.openWindow(new URL(path, self.location.origin).href);
    })(),
  );
});
