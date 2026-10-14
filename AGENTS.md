## Architecture rules
- Map: Leaflet stays the map engine; offline base = bundled Natural Earth GeoJSON in `public/geo`, online detail = OpenFreeMap via `@maplibre/maplibre-gl-leaflet` (see `src/components/map/basemap.ts`). Why: offline works with zero network, online needs no keys/server.
- No server-side map logic or Google short-link expansion; map caches are never force-cleared (browser HTTP cache persists). Why: static hosting, faster reloads.
- Public asset URLs must be built from `import.meta.env.BASE_URL` and the service worker uses scope-relative paths. Why: GitHub Pages serves under `/polimapp/`.
- Detect preview using the development environment or iframe embedding, never vendor-specific hostnames. Why: preview detection stays portable across hosts.
