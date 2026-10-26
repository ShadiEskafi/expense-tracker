/**
 * Service Worker for Expense Tracker App (مَصاريفي)
 * Implements offline App Shell caching and robust network strategies (F020).
 *
 * Strategies:
 * 1. Navigation requests: Network-first with cache fallback to /index.html (SPA).
 * 2. Static assets & fonts: Stale-While-Revalidate for instant render and background update.
 * 3. Cloud/API endpoints (e.g. Supabase): Bypass cache entirely.
 */

const CACHE_NAME = 'expense-tracker-shell-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/pwa-icon.svg'
];

// 1. Installation: pre-cache the application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] Pre-caching failed during install:', err);
      })
  );
});

// 2. Activation: purge stale cache versions and claim immediate client control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Fetch interception
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass non-HTTP(S) schemes (e.g. chrome-extension:, blob:, data:)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Bypass Supabase cloud sync & remote backend calls (always live network)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Strategy A: HTML navigation requests (SPA) -> Network-First with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Strategy B: Static assets (same-origin scripts/styles/media, or Google Fonts)
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  if (isSameOrigin || isGoogleFont) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Return cached version immediately if available, while updating in background
        return cachedResponse || fetchPromise;
      })
    );
  }
});

// 4. Client communication (e.g. skip waiting or cache management)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});
