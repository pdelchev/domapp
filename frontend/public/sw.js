const CACHE_NAME = 'domapp-v8';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/manifest.json']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls, page navigations, and Next.js RSC requests
  const isRSC = request.headers.get('RSC') === '1' || request.headers.get('Next-Router-State-Tree');
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate' || isRSC) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for Next.js chunks (/_next/)
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first only for truly static assets (icons, manifest)
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
