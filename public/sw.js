// v3: precaching full page HTML at install time (previous versions) meant a user's
// browser could end up combining an OLD cached HTML shell with a NEW deploy's JS
// bundle (hashed filenames change every deploy) — a version-skew mismatch that made
// React hydration fail catastrophically (duplicate <html> in the DOM, blank white
// screen). The runtime fetch handler below already does network-first + cache-on-success
// for page navigations, which safely builds up the same offline fallback over time
// without ever locking in a stale page shell at install. Bumping CACHE_NAME also forces
// every existing cache from earlier versions to be purged via the activate handler.
const CACHE_NAME = 'fitlog-cache-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/manifest.json')).catch(() => {})
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
