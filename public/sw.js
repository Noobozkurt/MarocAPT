// Minimal service worker: offline shell for static assets + push notifications for chat/order updates.
const CACHE = 's3d-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/models/') || url.pathname.startsWith('/posters/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })));
  }
});
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Stuffin3D', body: 'You have a new notification' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon.svg', data: { link: d.link || '/' } }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data.link)); });
