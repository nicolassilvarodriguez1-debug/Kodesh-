const CACHE_NAME = 'kodesh-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/parashot.html',
  '/login.html',
  '/onboarding.html',
  '/auth.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('biblia-rvr'))); // Skip large JSON
    }).catch(err => console.log('Cache install error:', err))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and external requests (Supabase, Anthropic, CDN)
  if (event.request.method !== 'GET') return;
  if (!url.hostname.includes('vercel.app') && !url.hostname.includes('localhost') && url.hostname !== location.hostname) return;

  // Skip API calls — always need network
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
