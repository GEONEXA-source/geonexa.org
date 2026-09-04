// GeoNEXA AI - Service Worker
// Minimal service worker to satisfy PWA installability requirements
// and provide basic offline fallback for cached pages.

const CACHE_NAME = 'geonexa-cache-v1';

// Add core pages/assets you want available offline.
// Keep this list small at first — you can expand it later.
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {
        // If any asset fails to cache (e.g. wrong path), don't block install
        return Promise.resolve();
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first, fall back to cache if offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh copy in the background
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
