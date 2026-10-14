const CACHE_NAME = "sunoto-assets-v2";
const SHELL_URLS = ["/", "/index.html"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME && /^(sunoto-shell-|sunoto-assets-)/.test(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Sessions, auth callbacks and release evidence must always reach the server.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || ["/release.json", "/sw.js"].includes(url.pathname)) return;
  const navigation = request.mode === "navigate";
  if (!navigation && !url.pathname.startsWith("/assets/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (!navigation) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || (navigation ? await cache.match("/") : null) || Response.error();
    }
  })());
});
