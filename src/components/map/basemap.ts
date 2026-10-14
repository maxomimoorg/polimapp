import type * as LType from "leaflet";

/**
 * Architettura della mappa:
 * - base offline: Natural Earth 1:110m (public/geo), disegnata da Leaflet come vettori, sempre presente
 *   sotto a tutto. Nessuna richiesta remota: file inclusi nell'app e messi in cache dal service worker.
 * - dettaglio online: stile vettoriale OpenFreeMap caricato dal browser tramite MapLibre GL per Leaflet.
 *   Nessun download di aree, nessuna cache persistente dei tile.
 */

export type MapMode = "loading" | "online" | "offline";

export const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Dati da <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const NE_ATTRIBUTION =
  'Base offline: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>';

export const GEO_FILES = [
  "geo/ne_110m_land.geojson",
  "geo/ne_110m_lakes.geojson",
  "geo/ne_110m_admin_0_boundary_lines_land.geojson",
  "geo/ne_110m_populated_places_simple.geojson",
] as const;

const base = () => (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");

async function loadGeo(path: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(base() + path);
  if (!res.ok) throw new Error(`geo ${path}`);
  return (await res.json()) as GeoJSON.FeatureCollection;
}

/** Aggiunge la base Natural Earth in un pane sotto al dettaglio online. */
export async function addOfflineBase(L: typeof LType, map: LType.Map): Promise<void> {
  map.createPane("ne-base");
  const pane = map.getPane("ne-base");
  if (pane) pane.style.zIndex = "150";
  map.createPane("ne-labels");
  const lp = map.getPane("ne-labels");
  if (lp) {
    lp.style.zIndex = "160";
    lp.style.pointerEvents = "none";
  }
  const [land, lakes, borders, places] = (await Promise.all(GEO_FILES.map(loadGeo))) as [
    GeoJSON.FeatureCollection,
    GeoJSON.FeatureCollection,
    GeoJSON.FeatureCollection,
    GeoJSON.FeatureCollection,
  ];

  L.geoJSON(land, {
    pane: "ne-base",
    interactive: false,
    style: { stroke: true, color: "#3a4048", weight: 0.8, fillColor: "#1d2127", fillOpacity: 1 },
  }).addTo(map);
  L.geoJSON(lakes, {
    pane: "ne-base",
    interactive: false,
    style: { stroke: false, fillColor: "#0b0d10", fillOpacity: 1 },
  }).addTo(map);
  L.geoJSON(borders, {
    pane: "ne-base",
    interactive: false,
    style: { color: "#5b6470", weight: 0.8, dashArray: "3 3" },
  }).addTo(map);

  const labels = L.layerGroup().addTo(map);
  const placeFeatures = places.features as Array<
    GeoJSON.Feature<GeoJSON.Point, { name: string; rank: number; cap: number }>
  >;
  const drawLabels = () => {
    labels.clearLayers();
    const z = map.getZoom();
    const maxRank = z < 3 ? 0 : z < 4 ? 1 : z < 5 ? 3 : 10;
    for (const f of placeFeatures) {
      if (f.properties.rank > maxRank && !(f.properties.cap && z >= 4)) continue;
      const [lng = 0, lat = 0] = f.geometry.coordinates;
      L.marker([lat, lng], {
        pane: "ne-labels",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "ne-place",
          html: `<span class="ne-dot"></span><span class="ne-name">${escapeHtml(f.properties.name)}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(labels);
    }
  };
  map.on("zoomend", drawLabels);
  drawLabels();
  map.attributionControl.addAttribution(NE_ATTRIBUTION);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Gestisce il passaggio fra dettaglio online e base offline.
 * Non si fida solo di navigator.onLine: verifica lo stile del provider e gli errori di caricamento.
 */
export function createOnlineController(
  L: typeof LType,
  map: LType.Map,
  onMode: (m: MapMode) => void,
): () => void {
  let layer: LType.Layer | null = null;
  let disposed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let errorCount = 0;
  let loaded = false;

  const removeLayer = () => {
    if (layer) {
      map.removeLayer(layer);
      map.attributionControl.removeAttribution(OFM_ATTRIBUTION);
    }
    layer = null;
  };

  const goOffline = () => {
    removeLayer();
    onMode("offline");
    scheduleRetry();
  };

  const scheduleRetry = () => {
    if (retryTimer || disposed) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void tryOnline();
    }, 30_000);
  };

  const tryOnline = async () => {
    if (disposed || layer) return;
    const my = ++attempt;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      goOffline();
      return;
    }
    onMode("loading");
    let style: unknown;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(OPENFREEMAP_STYLE, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(String(res.status));
      style = await res.json();
    } catch {
      if (my === attempt) goOffline();
      return;
    }
    if (disposed || my !== attempt) return;
    try {
      const [{ maplibreGL }, maplibre, workerUrl] = await Promise.all([
        import("@maplibre/maplibre-gl-leaflet"),
        import("maplibre-gl"),
        import("maplibre-gl/dist/maplibre-gl-worker.mjs?url").then((m) => m.default as string),
      ]);
      // il worker viene servito come file dell'app: l'URL automatico si rompe con il bundling
      maplibre.setWorkerUrl(workerUrl);
      await import("maplibre-gl/dist/maplibre-gl.css");
      errorCount = 0;
      loaded = false;
      const gl = maplibreGL({ style: style as never, attributionControl: false } as never);
      layer = gl;
      gl.addTo(map);
      map.attributionControl.addAttribution(OFM_ATTRIBUTION);
      const ml = gl.getMaplibreMap();
      const loadTimeout = setTimeout(() => {
        if (!loaded && layer === gl) goOffline();
      }, 15_000);
      ml.on("load", () => {
        loaded = true;
        clearTimeout(loadTimeout);
        if (layer === gl) onMode("online");
      });
      ml.on("error", () => {
        errorCount++;
        // errori ripetuti (provider irraggiungibile): torna alla base locale
        if (layer === gl && (errorCount >= 6 || !loaded)) {
          clearTimeout(loadTimeout);
          goOffline();
        }
      });
    } catch {
      goOffline();
    }
  };

  const onOnline = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    void tryOnline();
  };
  const onOffline = () => goOffline();
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  void tryOnline();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    removeLayer();
  };
}
