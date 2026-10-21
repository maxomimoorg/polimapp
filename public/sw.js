// Service worker di MapP: cache della shell e della base offline Natural Earth.
// Le risorse del provider online (OpenFreeMap) usano la normale cache HTTP del browser.
// I percorsi sono relativi allo scope, così funziona anche sotto /polimapp/.
const VERSION = "v3";
const SHELL_CACHE = `mapp-shell-${VERSION}`;
const SCOPE = self.registration.scope; // es. https://host/polimapp/
const PRECACHE = [
  "",
  "manifest.webmanifest",
  "geo/ne_110m_land.geojson",
  "geo/ne_110m_lakes.geojson",
  "geo/ne_110m_admin_0_boundary_lines_land.geojson",
  "geo/ne_110m_populated_places_simple.geojson",
].map((p) => new URL(p, SCOPE).toString());

// solo le cache create da questo service worker; segnalibri, foto e impostazioni stanno in IndexedDB/localStorage
const OWN_CACHE = /^(mapp-shell-|shell-v\d+$)/; // le cache della mappa non vengono mai cancellate

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => OWN_CACHE.test(k) && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // provider esterni: rete normale del browser

  const isGeo = url.pathname.includes("/geo/ne_110m_");
  if (isGeo) {
    // base offline: prima la cache, poi la rete
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (
          res.ok &&
          (req.mode === "navigate" ||
            req.destination === "document" ||
            req.destination === "script" ||
            req.destination === "style")
        ) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match(SCOPE);
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
