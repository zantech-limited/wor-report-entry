const CACHE = "zantech-shell-v051";
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
      await cache.addAll([...assets, "/icons/desk.svg"]);
    })(),
  );
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
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const saved = await cache.match(request);
        if (saved) return saved;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
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

