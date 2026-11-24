const CACHE = 'waslni-shell-v2';
const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];
const API_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/', '/functions/v1/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || API_PATHS.some((path) => url.pathname.startsWith(path))) return;
  if (req.headers.has('authorization') || req.headers.has('x-supabase-api')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
        }
        return res;
      }).catch(() => caches.match('/index.html')),
    );
    return;
  }

  const isAsset = url.pathname.startsWith('/assets/') || /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname);
  if (!isAsset) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});
