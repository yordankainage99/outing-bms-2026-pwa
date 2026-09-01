const CACHE_NAME = "outing-bms-fast-shell-v3-1";
const PRECACHE = [
  "/",
  "/styles-v3.css",
  "/app-v3.js",
  "/manifest-v3.webmanifest",
  "/brand-logo-v3.png",
  "/apple-touch-icon-v3.png",
  "/icon-192-v3.png",
  "/icon-512-v3.png",
  "/icon-maskable-512-v3.png",
  "/favicon-48-v3.png",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Jangan sentuh request lintas origin, terutama Apps Script.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
