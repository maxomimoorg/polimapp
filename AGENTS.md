## Architecture rules
- Map: Leaflet stays the map engine; offline base = bundled Natural Earth GeoJSON in `public/geo`, online detail = OpenFreeMap via `@maplibre/maplibre-gl-leaflet` (see `src/components/map/basemap.ts`). Why: offline works with zero network, online needs no keys/server.
- No server-side map logic or Google short-link expansion; map caches are never force-cleared (browser HTTP cache persists). Why: static hosting, faster reloads.
- Public asset URLs must be built from `import.meta.env.BASE_URL` and the service worker uses scope-relative paths. Why: GitHub Pages serves under `/polimapp/`.
- Detect preview using the development environment or iframe embedding, never vendor-specific hostnames. Why: preview detection stays portable across hosts.
- All pasted location formats are parsed only in `src/lib/bookmarks/parse-location.ts` (`parseLocation`); `geocode.ts` adds network lookups on top. Why: one parser for search and bookmark editor, offline-first.
- Tests polyfill `Blob.arrayBuffer/text` in `src/test/setup.ts`. Why: jsdom lacks them.
- Map markers: viewport-based aggregation (>=25% overlap, leader = priority > newest > category order, +N badge, tap to spiderfy) is always on, with no settings toggle; markers are synced again right after the map is created. Why: smooth with hundreds of bookmarks and markers show while the basemap loads.

- Popups/panels register with `useBackLayer` from `src/lib/back-stack.ts`; never add own Esc/popstate listeners — one central stack makes Back/Esc close only the newest layer.
