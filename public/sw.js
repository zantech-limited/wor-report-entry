const CACHE = "zantech-shell-v064";
async function cacheEach(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch {
        /* A missing static file must not stop the offline shell from installing. */
      }
    }),
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/offline", { cache: "reload" });
      if (!response.ok) throw new Error("Offline shell unavailable");
      const html = await response.clone().text();
      await cache.put("/offline", response);
      const assets = [
        ...new Set(
          [
            ...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g),
          ].map((match) => match[1]),
        ),
      ];
      await cacheEach(cache, [...assets, "/icons/desk.svg", "/work-order-template.png"]);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("zantech-shell-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") || url.pathname === "/work-order-template.png"
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const saved = await cache.match(request);
        if (saved) return saved;
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          return new Response("", { status: 504 });
        }
      }),
    );
    return;
  }
  if (
    request.mode === "navigate" &&
    ["/field", "/offline"].includes(url.pathname)
  ) {
    event.respondWith(
      fetch(request).catch(async () => {
        const saved = await caches.match("/offline");
        return (
          saved ||
          new Response("Open the app online once to prepare offline drafts.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
  }
});
