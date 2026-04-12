/*
 * Service worker for "all time".
 *
 * Strategy:
 *  - Stale-while-revalidate for app shell and static assets: serve from
 *    cache immediately for fast loads, then fetch fresh copies in the
 *    background and update the cache for next time.
 *  - Network-first for navigation requests (HTML pages) so users get
 *    the latest version when online.
 *  - Skip caching for Firebase / Google APIs (auth + Firestore must always
 *    talk to the network).
 *  - Bump CACHE_VERSION to force clients to fetch a fresh shell after a
 *    deploy. The activate handler purges old caches automatically.
 */

const CACHE_VERSION = "alltime-v2";
const PRECACHE_URLS = [
  "./",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./styles.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function shouldBypass(url) {
  return (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com")
  );
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (shouldBypass(url)) return;

  // Network-first for navigation (HTML pages)
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./")))
    );
    return;
  }

  // Stale-while-revalidate for all other assets (CSS, JS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);

      // Return cached immediately if available, otherwise wait for network
      return cached || fetchPromise;
    })
  );
});
