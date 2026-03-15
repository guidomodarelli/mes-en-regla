const CACHE_NAME = "mis-finanzas-static-v1";

const PRECACHE_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SKIP_WAITING") {
    return;
  }

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.startsWith("/auth/") ||
    requestUrl.pathname.startsWith("/api/auth/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((offlineResponse) => {
          if (offlineResponse) {
            return offlineResponse;
          }

          return caches.match("/").then((homeResponse) => {
            if (homeResponse) {
              return homeResponse;
            }

            return Response.error();
          });
        }),
      ),
    );

    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          const canCacheRequest =
            request.destination === "style" ||
            request.destination === "script" ||
            request.destination === "image" ||
            request.destination === "font" ||
            request.destination === "manifest" ||
            requestUrl.pathname.startsWith("/_next/static/");

          if (canCacheRequest) {
            const responseToCache = networkResponse.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseToCache))
              .catch(() => undefined);
          }

          return networkResponse;
        })
        .catch(() => Response.error());
    }),
  );
});
