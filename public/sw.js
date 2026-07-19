const CACHE_NAME = 'fitlog-cache-v2'
const OFFLINE_URLS = ['/log', '/history', '/stats', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

// Hashed build output (/_next/static/...) and app icons never change content for a given
// URL — the filename itself changes on every deploy — so there's nothing to revalidate.
// Serving these from cache first (network only on a cache miss) skips a round trip on
// every single page load instead of always waiting on the network like everything else.
function isImmutableStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Cross-origin requests (Supabase REST/auth calls, Sentry, etc.) were previously being
  // cloned and written into this cache on every single call — pure overhead, since a
  // shared cache can't safely stand in for a specific user's live workout data, and the
  // offline fallback below only ever needs the app shell, not API responses. Let the
  // browser handle these natively.
  if (url.origin !== self.location.origin) return

  if (isImmutableStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
          return response
        })
      })
    )
    return
  }

  // Everything else same-origin (page navigations, manifest.json): network-first,
  // falling back to cache when offline — this is the app-shell offline behavior.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/log')))
  )
})
