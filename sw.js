// GeoNEXA AI - Service Worker
// Network-first for HTML/JS so code changes are never served stale
// during active development — falls back to cache only if offline.
// Cache-first for genuinely static assets (images, manifest) for speed.
// Supabase API/Edge Function calls always go straight to the network.

const CACHE_NAME = 'geonexa-cache-v7';

const CORE_ASSETS = [
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_ASSETS).catch(() => Promise.resolve())
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache/interfere with Supabase (auth, database, storage, Edge Functions)
  // or any non-GET request — those must always hit the network fresh.
  if (url.hostname.endsWith('supabase.co') || req.method !== 'GET') {
    return;
  }

  const isCodeOrMarkup = url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/' || req.mode === 'navigate';

  if (isCodeOrMarkup) {
    // Network-first: always get the latest code. Only fall back to
    // whatever's cached if the network genuinely fails (offline).
    event.respondWith(
      fetch(req)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets (images, fonts, manifest) — these
  // rarely change, so instant-from-cache is worth it here.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
