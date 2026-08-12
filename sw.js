const CACHE = "flouzeo-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./flouzeo.webmanifest",
  "./icons/piggy.svg",
  "./icons/piggy-192.png",
  "./icons/piggy-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* ignore individual cache failures */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      try {
        const response = await fetch(req);
        if (response && response.ok && req.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE);
          cache.put(req, response.clone());
        }
        return response;
      } catch {
        if (cached) return cached;
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw new Error("offline");
      }
    })()
  );
});
