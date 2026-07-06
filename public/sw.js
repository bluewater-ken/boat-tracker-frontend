// B.O.S.S service worker — makes the app installable and gives a basic offline shell.
// It ONLY touches same-origin GETs (the app files). API calls go to a different origin
// (tracker.bluewatersportfishingboats.com), so they pass straight through, untouched —
// the tracker's data is never cached or served stale.
const CACHE = 'boss-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.add('/')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Drop old caches on version bumps.
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept the API / cross-origin

  // Page loads: try the network first (so new deploys show up), fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  // Static assets (hashed by Vite): serve from cache if present, otherwise fetch and cache.
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
