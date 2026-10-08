// OmpathStudy Service Worker - v9.
//  - Pages: network-first, so a deploy is picked up at once; the cached copy is only for offline.
//  - Built files in /assets/: cache-first. Their names contain a fingerprint of their content, so a cached file is never out of date,
//    and a returning student gets the whole app from their phone instead of downloading it again.
//  - Database reads: network-first, but if the network is slow (over 3 seconds) and there is a saved copy, the saved copy is shown at once.
//    An empty answer is never saved, so a database migration cannot blank the site.
const CACHE_NAME = "ompath-v9";
const API_CACHE = "ompath-api-v5";
const SLOW_MS = 3000;
const STATIC_ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

const keep = (cacheName, request, response) => { if (response && response.ok) { const copy = response.clone(); caches.open(cacheName).then((c) => c.put(request, copy)); } return response; };

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/~oauth")) return;

  // Database reads
  if (url.hostname.includes("supabase") && url.pathname.includes("/rest/")) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then(async (response) => {
        if (response.ok) {
          const text = await response.clone().text();
          if (text && text !== "[]" && text !== "null") await cache.put(event.request, response.clone()); // never keep an empty answer
        }
        return response;
      });
      if (!cached) return network.catch(() => new Response("[]", { headers: { "Content-Type": "application/json" } }));
      const slow = new Promise((resolve) => setTimeout(() => resolve(cached.clone()), SLOW_MS));
      return Promise.race([network, slow]).catch(() => cached);
    })());
    return;
  }
  if (url.hostname.includes("supabase")) return; // auth and functions go straight to the network

  // Pages
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => keep(CACHE_NAME, event.request, response))
        .catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Fingerprinted app files: cache-first
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => keep(CACHE_NAME, event.request, response)).catch(() => new Response("", { status: 503 })))
    );
    return;
  }

  // Other scripts and styles: network-first
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then((response) => keep(CACHE_NAME, event.request, response)).catch(() => caches.match(event.request).then((r) => r || new Response("", { status: 503 }))));
    return;
  }

  // Images and fonts: cache-first
  if (/\.(png|jpg|jpeg|svg|ico|woff2?|webp|gif|avif)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => keep(CACHE_NAME, event.request, response)).catch(() => new Response("", { status: 503 })))
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(fetch(event.request).then((response) => keep(CACHE_NAME, event.request, response)).catch(() => caches.match(event.request)));
});
