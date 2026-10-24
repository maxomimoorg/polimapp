import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import { toast } from "sonner";
import type { Bookmark, Category } from "@/lib/bookmarks/types";
import { avatarInnerHtml, avatarKey, bookmarkAvatar } from "@/lib/bookmarks/avatar";
import { markerDiameter, priorityStyle } from "@/lib/bookmarks/priority";
import { createOnlineController, type MapMode, type MapTheme } from "./basemap";

export interface MapApi {
  flyTo: (lat: number, lng: number) => void;
  showPin: (lat: number, lng: number) => void;
  clearPin: () => void;
  fitAll: () => void;
}

interface Props {
  bookmarks: Bookmark[];
  photoUrls: Record<string, string>;
  categoriesById: Record<string, Category | undefined>;
  colorOf: (b: Bookmark) => string;
  onCreate: (lat: number, lng: number) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, lat: number, lng: number) => void;
  onReady: (api: MapApi) => void;
  categoryOrder: string[];
  mapTheme?: MapTheme;
}

interface ScreenBookmark {
  bookmark: Bookmark;
  x: number;
  y: number;
  radius: number;
}

// Due marker devono sovrapporsi almeno per questa frazione dell'area
// del marker più piccolo per essere candidati al raggruppamento.
const SIGNIFICANT_OVERLAP_RATIO = 0.18;

// Distanza massima tra un segnalibro e il leader a cui può unirsi.
// È moltiplicata per la somma dei loro raggi: 0.5 significa che
// i centri devono essere a non più di metà della somma dei raggi.
const MAX_CLUSTER_DISTANCE_RATIO = 0.7;

// Griglia usata solo per cercare rapidamente i leader vicini.
// Con le dimensioni attuali dei marker, la distanza massima di cluster
// è inferiore a 96 px, quindi basta controllare le celle adiacenti.
const GRID_CELL_SIZE = 120;


export default function MapView({
  bookmarks,
  photoUrls,
  categoriesById,
  colorOf,
  onCreate,
  onOpen,
  onMove,
  onReady,
  categoryOrder,
  mapTheme = "dark",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const pinMarkerRef = useRef<LType.Marker | null>(null);
  const markersRef = useRef<Map<string, LType.Marker>>(new Map());
  const sigRef = useRef<Map<string, string>>(new Map());
  const offsetRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const suppressClickRef = useRef(false);
  const clusterMembersRef = useRef<Map<string, Bookmark[]>>(new Map());
  const shownRef = useRef<Set<string>>(new Set());
  const stackingRankRef = useRef<Map<string, number>>(new Map());
  const dataRef = useRef<Bookmark[]>(bookmarks);
  const categoryOrderRef = useRef(categoryOrder);
  const fitAllRef = useRef<(() => void) | null>(null);
  const didFitRef = useRef(false);
  const layoutRafRef = useRef<number | null>(null);
  const cbRef = useRef({ onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById });
  const [mode, setMode] = useState<MapMode>("loading");
  const stopOnlineRef = useRef<(() => void) | null>(null);
  const setThemeRef = useRef<((theme: MapTheme) => void) | null>(null);
  const mapThemeRef = useRef<MapTheme>(mapTheme);
  const gpsMarkerRef = useRef<LType.Marker | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const gpsBtnRef = useRef<HTMLAnchorElement | null>(null);

  dataRef.current = bookmarks;
  categoryOrderRef.current = categoryOrder;
  cbRef.current = { onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById };
  mapThemeRef.current = mapTheme;

  function scheduleLayout() {
    if (layoutRafRef.current !== null) {
      cancelAnimationFrame(layoutRafRef.current);
    }

    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = null;
      layout();
    });
  }

  function iconHtml(b: Bookmark, hiddenCount = 0) {
    const { opacity, scale } = priorityStyle(b.priority);
    const diameter = markerDiameter(b.priority);
    const color = cbRef.current.colorOf(b);
    const avatar = bookmarkAvatar(
      b,
      cbRef.current.categoriesById,
      cbRef.current.photoUrls,
    );
    const border = Math.max(2, Math.round(3 * Math.min(scale, 1.6)));
    const markerHtml = `<div class="bm-marker" style="width:${diameter}px;height:${diameter}px;opacity:${opacity};border:${border}px solid ${color}">${avatarInnerHtml(avatar)}</div>`;

    if (hiddenCount === 0) return markerHtml;

    return `<div class="bm-marker-cluster" style="width:${diameter}px;height:${diameter}px">${markerHtml}<span class="bm-cluster-badge" aria-label="${hiddenCount} segnalibri nascosti">+${hiddenCount}</span></div>`;
  }

  function markerSignature(b: Bookmark, hiddenCount = 0) {
    const avatar = bookmarkAvatar(
      b,
      cbRef.current.categoriesById,
      cbRef.current.photoUrls,
    );

    return [
      b.priority,
      cbRef.current.colorOf(b),
      avatarKey(avatar),
      hiddenCount,
    ].join("|");
  }

  function makeIcon(
    L: typeof LType,
    b: Bookmark,
    hiddenCount = 0,
  ): LType.DivIcon {
    const diameter = markerDiameter(b.priority);

    return L.divIcon({
      className: "bm-marker-wrap",
      html: iconHtml(b, hiddenCount),
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2],
    });
  }

  function attachMarkerEvents(id: string, marker: LType.Marker) {
    const L = LRef.current;
    if (!L) return;
    // Listener Leaflet sul marker: sopravvivono ai setIcon (l'elemento DOM viene ricreato).
    const m = marker as unknown as { _bmBound?: boolean };
    if (m._bmBound) return;
    m._bmBound = true;

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let moved = false;
    let pointerId: number | null = null;

    const clear = () => {
      if (pressTimer !== null) clearTimeout(pressTimer);
      pressTimer = null;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const map = mapRef.current;
      if (!map || !start || ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10) {
          moved = true;
          clear();
        }
        return;
      }
      ev.preventDefault();
      const rect = map.getContainer().getBoundingClientRect();
      const ll = map.containerPointToLatLng(
        L.point(ev.clientX - rect.left, ev.clientY - rect.top),
      );
      marker.setLatLng(ll);
    };

    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      clear();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const map = mapRef.current;
      if (dragging && map) {
        dragging = false;
        suppressClickRef.current = true;
        setTimeout(() => (suppressClickRef.current = false), 50);
        map.dragging.enable();
        marker.getElement()?.classList.remove("bm-dragging");
        const ll = marker.getLatLng();
        if (ev.type === "pointerup") cbRef.current.onMove(id, ll.lat, ll.lng);
        else {
          const b = dataRef.current.find((x) => x.id === id);
          if (b) marker.setLatLng([b.lat, b.lng]);
        }
      }
      start = null;
      pointerId = null;
    };

    marker.on("add", () => {
      const el = marker.getElement();
      if (!el || (el as unknown as { _bmPtr?: boolean })._bmPtr) return;
      (el as unknown as { _bmPtr?: boolean })._bmPtr = true;
      el.addEventListener("pointerdown", (ev: PointerEvent) => {
        const b = dataRef.current.find((x) => x.id === id);
        start = { x: ev.clientX, y: ev.clientY };
        pointerId = ev.pointerId;
        moved = false;
        clear();
        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
        if (!b || b.locked) return;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          const map = mapRef.current;
          if (!map || moved) return;
          dragging = true;
          map.dragging.disable();
          marker.getElement()?.classList.add("bm-dragging");
          navigator.vibrate?.(40);
        }, 1200);
      });
    });
    if (marker.getElement()) marker.fire("add");

    marker.on("click", (event: LType.LeafletMouseEvent) => {
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      if (suppressClickRef.current || dragging) return;
      if (zoomToCluster(id)) return;
      cbRef.current.onOpen(id);
    });
  }

  function zoomToCluster(leaderId: string): boolean {
    const L = LRef.current;
    const map = mapRef.current;
    const hidden = clusterMembersRef.current.get(leaderId);
    if (!L || !map || !hidden || hidden.length === 0) return false;
    const leader = dataRef.current.find((b) => b.id === leaderId);
    if (!leader) return false;
    const points = [leader, ...hidden].map((b) => [b.lat, b.lng] as [number, number]);
    map.fitBounds(L.latLngBounds(points), { padding: [15, 15], maxZoom: 25 });
    return true;
  }

  function overlapIsSignificant(a: ScreenBookmark, b: ScreenBookmark) {
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const radiusA = a.radius;
    const radiusB = b.radius;

    // Il contatto tra i bordi non è un'intersezione significativa.
    if (distance >= radiusA + radiusB) return false;
    if (distance <= Math.abs(radiusA - radiusB)) return true;

    const radiusASquared = radiusA * radiusA;
    const radiusBSquared = radiusB * radiusB;
    const distanceSquared = distance * distance;

    const angleA = Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          (distanceSquared + radiusASquared - radiusBSquared) /
            (2 * distance * radiusA),
        ),
      ),
    );
    const angleB = Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          (distanceSquared + radiusBSquared - radiusASquared) /
            (2 * distance * radiusB),
        ),
      ),
    );

    const intersectionArea =
      radiusASquared * angleA +
      radiusBSquared * angleB -
      distance * radiusA * Math.sin(angleA);

    const smallerCircleArea = Math.PI * Math.min(radiusASquared, radiusBSquared);

    return intersectionArea / smallerCircleArea >= SIGNIFICANT_OVERLAP_RATIO;
  }

  function categoryRank(bookmark: Bookmark, ranks: Map<string, number>) {
    if (!bookmark.categoryId) return Number.MAX_SAFE_INTEGER;
    return ranks.get(bookmark.categoryId) ?? Number.MAX_SAFE_INTEGER;
  }

  function compareLeaderPriority(
    a: Bookmark,
    b: Bookmark,
    ranks: Map<string, number>,
  ) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return categoryRank(a, ranks) - categoryRank(b, ranks);
  }

function buildClusters(items: ScreenBookmark[]) {
  // I segnalibri più prioritari vengono esaminati per primi e hanno
  // quindi precedenza nel diventare leader.
  const ranks = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
  const orderedItems = [...items].sort((a, b) =>
    compareLeaderPriority(a.bookmark, b.bookmark, ranks),
  );

  // La griglia contiene SOLO i leader, mai i segnalibri già nascosti
  // dentro un gruppo. Questo impedisce le concatenazioni A→B→C:
  // ogni segnalibro deve essere vicino direttamente al leader.
  const leaderGrid = new Map<string, ScreenBookmark[]>();

  // Per ogni leader conserva i segnalibri nascosti che gli appartengono.
  // Un array vuoto indica che quel leader, per ora, non nasconde altri punti.
  const leaders = new Map<string, Bookmark[]>();

  for (const item of orderedItems) {
    const cellX = Math.floor(item.x / GRID_CELL_SIZE);
    const cellY = Math.floor(item.y / GRID_CELL_SIZE);

    let bestLeader: ScreenBookmark | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    // Cerca leader solo nella cella del segnalibro e nelle otto adiacenti.
    // Il limite massimo attuale è inferiore a GRID_CELL_SIZE, quindi
    // questa ricerca trova tutti i leader che potrebbero essere candidati.
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const nearbyLeaders = leaderGrid.get(`${cellX + dx}:${cellY + dy}`) ?? [];

        for (const candidate of nearbyLeaders) {
          const distance = Math.hypot(item.x - candidate.x, item.y - candidate.y);
          const maxDistance =
            (item.radius + candidate.radius) * MAX_CLUSTER_DISTANCE_RATIO;

          // Per unirsi a un gruppo il segnalibro deve:
          // 1. essere abbastanza vicino al leader;
          // 2. sovrapporsi visibilmente al leader secondo la regola esistente.
          if (
            distance > maxDistance ||
            !overlapIsSignificant(item, candidate)
          ) {
            continue;
          }

          // Se più leader sono idonei, scegli quello più vicino.
          if (distance < bestDistance) {
            bestLeader = candidate;
            bestDistance = distance;
          }
        }
      }
    }

    if (bestLeader) {
      // Il membro viene associato direttamente al leader scelto.
      // Non potrà a sua volta attirare altri segnalibri nel gruppo.
      leaders.get(bestLeader.bookmark.id)!.push(item.bookmark);
      continue;
    }

    // Nessun leader vicino e idoneo: questo segnalibro diventa
    // un nuovo leader visibile sulla mappa.
    leaders.set(item.bookmark.id, []);

    const cellKey = `${cellX}:${cellY}`;
    const cellLeaders = leaderGrid.get(cellKey) ?? [];
    cellLeaders.push(item);
    leaderGrid.set(cellKey, cellLeaders);
  }

  return { leaders };
}


  function layout() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;


    const currentBookmarks = dataRef.current;
    const alive = new Set(currentBookmarks.map((b) => b.id));

    for (const [id, marker] of markersRef.current) {
      if (!alive.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        sigRef.current.delete(id);
        offsetRef.current.delete(id);
      }
    }

    const bounds = map.getBounds();
    const visibleItems: ScreenBookmark[] = [];

    for (const bookmark of currentBookmarks) {
      if (!bounds.contains([bookmark.lat, bookmark.lng])) continue;

      const point = map.latLngToContainerPoint([bookmark.lat, bookmark.lng]);

      visibleItems.push({
        bookmark,
        x: point.x,
        y: point.y,
        radius: markerDiameter(bookmark.priority) / 2,
      });
    }

    const { leaders } = buildClusters(visibleItems);
    clusterMembersRef.current = leaders;

    const stackingRank = stackingRankRef.current;
    const byId = new Map(currentBookmarks.map((b) => [b.id, b]));

    // Rimuove solo i marker che erano a schermo e non sono più leader visibili.
    for (const id of shownRef.current) {
      if (leaders.has(id)) continue;
      const marker = markersRef.current.get(id);
      if (marker && map.hasLayer(marker)) marker.remove();
      shownRef.current.delete(id);
    }

    // Aggiorna esclusivamente i leader visibili.
    for (const [id, hidden] of leaders) {
      const bookmark = byId.get(id);
      if (!bookmark) continue;

      let marker = markersRef.current.get(id);
      if (!marker) {
        marker = L.marker([bookmark.lat, bookmark.lng], {
          icon: makeIcon(L, bookmark, hidden.length),
          riseOnHover: false,
        });
        markersRef.current.set(id, marker);
        sigRef.current.set(id, markerSignature(bookmark, hidden.length));
      }

      const signature = markerSignature(bookmark, hidden.length);
      marker.setLatLng([bookmark.lat, bookmark.lng]);
      marker.setZIndexOffset(stackingRank.get(id) ?? 0);

      if (sigRef.current.get(id) !== signature) {
        marker.setIcon(makeIcon(L, bookmark, hidden.length));
        sigRef.current.set(id, signature);
      }

      if (!map.hasLayer(marker)) marker.addTo(map);
      shownRef.current.add(id);
      attachMarkerEvents(id, marker);
    }
  }

  // Inizializzazione mappa e controlli.
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (disposed || !containerRef.current || mapRef.current) return;

      LRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        doubleClickZoom: false,
        worldCopyJump: true,
        minZoom: 2,
      }).setView([42.6, 12.5], 3);

      mapRef.current = map;
      const onlineCtrl = createOnlineController(L, map, setMode, mapThemeRef.current);
      stopOnlineRef.current = onlineCtrl.dispose;
      setThemeRef.current = onlineCtrl.setTheme;

      const fitAll = () => {
        const points = dataRef.current.map(
          (b) => [b.lat, b.lng] as [number, number],
        );
        if (points.length === 0) return;

        map.fitBounds(L.latLngBounds(points).pad(0.10), { maxZoom: 20 });
      };

      fitAllRef.current = fitAll;

      const GPS_MAX_ACCURACY_METERS = 50;
      const GPS_STABLE_DISTANCE_METERS = 30;
      const GPS_STABLE_FIXES_REQUIRED = 2;

      let gpsCenteredThisActivation = false;
      let gpsStableFixCount = 0;
      let previousGpsCandidate: LType.LatLng | null = null;

      const resetGpsAutoCenter = () => {
        gpsCenteredThisActivation = false;
        gpsStableFixCount = 0;
        previousGpsCandidate = null;
      };

      const setGpsActive = (active: boolean) => {
        gpsBtnRef.current?.classList.toggle("is-active", active);
      };

      const stopGpsWatch = () => {
        if (gpsWatchRef.current !== null) {
          navigator.geolocation.clearWatch(gpsWatchRef.current);
          gpsWatchRef.current = null;
        }
        resetGpsAutoCenter();
        setGpsActive(false);
      };

      const removeGpsMarker = () => {
        gpsMarkerRef.current?.remove();
        gpsMarkerRef.current = null;
      };

      const startGpsWatch = () => {
        if (!("geolocation" in navigator)) {
          toast.error("Geolocalizzazione non supportata da questo dispositivo");
          return;
        }

        resetGpsAutoCenter();
        setGpsActive(true);
        gpsWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            const latLng: [number, number] = [latitude, longitude];

            if (!gpsMarkerRef.current) {
              gpsMarkerRef.current = L.marker(latLng, {
                icon: L.divIcon({
                  className: "gps-marker",
                  html: '<div class="gps-pulse"></div><div class="gps-pointer"></div>',
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                }),
                interactive: false,
                keyboard: false,
                zIndexOffset: 2000,
              }).addTo(map);
            } else {
              gpsMarkerRef.current.setLatLng(latLng);
            }

            // Dopo il primo centraggio, aggiorna solo il puntatore:
            // non modificare più centro o zoom della mappa.
            if (gpsCenteredThisActivation) return;

            // Considera solo rilevazioni abbastanza precise.
            if (
              !Number.isFinite(accuracy) ||
              accuracy > GPS_MAX_ACCURACY_METERS
            ) {
              gpsStableFixCount = 0;
              previousGpsCandidate = null;
              return;
            }

            const currentFix = L.latLng(latLng);

            // Richiede due rilevazioni precise e vicine tra loro.
            if (
              previousGpsCandidate &&
              map.distance(previousGpsCandidate, currentFix) <=
                GPS_STABLE_DISTANCE_METERS
            ) {
              gpsStableFixCount += 1;
            } else {
              gpsStableFixCount = 1;
            }

            previousGpsCandidate = currentFix;

            if (gpsStableFixCount >= GPS_STABLE_FIXES_REQUIRED) {
              gpsCenteredThisActivation = true;
              map.setView(latLng, Math.max(map.getZoom(), 16));
            }
          },
          (err) => {
            stopGpsWatch();
            if (err.code === err.PERMISSION_DENIED) {
              toast.error("Permesso di localizzazione negato");
            } else if (err.code === err.POSITION_UNAVAILABLE) {
              toast.error("Posizione non disponibile");
            } else {
              toast.error("Tempo scaduto durante la ricerca della posizione");
            }
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        );
      };

      const MapControls = L.Control.extend({
        onAdd() {
          const container = L.DomUtil.create(
            "div",
            "leaflet-control map-topright-controls",
          );

          const gpsButton = L.DomUtil.create("a", "fit-all-btn gps-btn", container);
          gpsButton.href = "#";
          gpsButton.title = "Mostra la mia posizione";
          gpsButton.setAttribute("aria-label", "Mostra la mia posizione");
          gpsButton.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
          gpsBtnRef.current = gpsButton;

          L.DomEvent.on(gpsButton, "click", (event) => {
            L.DomEvent.stop(event);
            if (gpsWatchRef.current !== null) {
              stopGpsWatch();
              removeGpsMarker();
              toast("Localizzazione disattivata");
            } else {
              startGpsWatch();
            }
          });

          const fitButton = L.DomUtil.create("a", "fit-all-btn", container);
          fitButton.href = "#";
          fitButton.title = "Inquadra tutti i segnalibri";
          fitButton.setAttribute("aria-label", "Inquadra tutti i segnalibri");
          fitButton.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/></svg>';

          L.DomEvent.on(fitButton, "click", (event) => {
            L.DomEvent.stop(event);
            fitAll();
          });

          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);

          return container;
        },
      });

      new MapControls({ position: "topright" }).addTo(map);

      map.on("contextmenu", (event: LType.LeafletMouseEvent) => {
        cbRef.current.onCreate(event.latlng.lat, event.latlng.lng);
      });

      // Press prolungato su una zona vuota per creare un segnalibro.
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      let start = { x: 0, y: 0 };
      const element = map.getContainer();

      const clearPress = () => {
        if (pressTimer !== null) clearTimeout(pressTimer);
        pressTimer = null;
      };

      element.addEventListener("pointerdown", (event: PointerEvent) => {
        if ((event.target as HTMLElement).closest(".bm-marker, .leaflet-control")) {
          return;
        }

        start = { x: event.clientX, y: event.clientY };
        clearPress();

        pressTimer = setTimeout(() => {
          const rect = element.getBoundingClientRect();
          const point = L.point(
            event.clientX - rect.left,
            event.clientY - rect.top,
          );
          const latLng = map.containerPointToLatLng(point);
          cbRef.current.onCreate(latLng.lat, latLng.lng);
        }, 750);
      });

      element.addEventListener("pointermove", (event: PointerEvent) => {
        if (
          pressTimer !== null &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
        ) {
          clearPress();
        }
      });

      element.addEventListener("pointerup", clearPress);
      element.addEventListener("pointercancel", clearPress);

      map.on("moveend zoomend", scheduleLayout);

      const clearPin = () => {
        if (pinMarkerRef.current) {
          pinMarkerRef.current.remove();
          pinMarkerRef.current = null;
        }
      };

      const showPin = (lat: number, lng: number) => {
        const currentL = LRef.current;
        const currentMap = mapRef.current;
        if (!currentL || !currentMap) return;

        clearPin();

        pinMarkerRef.current = currentL
          .marker([lat, lng], {
            icon: currentL.divIcon({
              className: "search-coord-pin",
              html: '<div style="width:16px;height:16px;border-radius:50%;background:#ff0080;border:2.5px solid #ffffff;box-shadow:0 0 0 4px rgba(255,0,128,0.35),0 2px 6px rgba(0,0,0,0.6);"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            interactive: false,
            zIndexOffset: 1000,
          })
          .addTo(currentMap);
      };

      onReady({
        flyTo: (lat, lng) =>
          map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 }),
        showPin,
        clearPin,
        fitAll,
      });

      // I segnalibri caricati prima che la mappa fosse pronta vengono creati ora,
      // senza attendere il caricamento della mappa online/offline.
      syncMarkers();
    })();

    return () => {
      disposed = true;
      stopOnlineRef.current?.();
      stopOnlineRef.current = null;
      setThemeRef.current = null;

      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      gpsBtnRef.current = null;

      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current);
      }

      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      sigRef.current.clear();
      offsetRef.current.clear();
      clusterMembersRef.current.clear();
      shownRef.current.clear();
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
    };
    // L'inizializzazione della mappa deve avvenire una sola volta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Applica il tema della mappa online quando cambia.
  useEffect(() => {
    setThemeRef.current?.(mapTheme);
  }, [mapTheme]);

  // Sincronizza i marker con i segnalibri e aggiorna l'ordinamento.
  function syncMarkers() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;


    const current = dataRef.current;
    const alive = new Set(current.map((b) => b.id));

    for (const [id, marker] of markersRef.current) {
      if (!alive.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        sigRef.current.delete(id);
        offsetRef.current.delete(id);
        shownRef.current.delete(id);
      }
    }

    // Ordine di sovrapposizione: calcolato solo quando cambiano i dati.
    const ranks = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
    const stackOrder = [...current].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return categoryRank(b, ranks) - categoryRank(a, ranks);
    });
    stackingRankRef.current = new Map(
      stackOrder.map((bookmark, index) => [bookmark.id, index]),
    );

    // Istanze solo in memoria: sarà layout() ad aggiungere i leader visibili.
    for (const bookmark of current) {
      const signature = markerSignature(bookmark);
      const marker = markersRef.current.get(bookmark.id);

      if (!marker) {
        markersRef.current.set(
          bookmark.id,
          L.marker([bookmark.lat, bookmark.lng], {
            icon: makeIcon(L, bookmark),
            riseOnHover: false,
          }),
        );
        sigRef.current.set(bookmark.id, signature);
      }
    }

    if (!didFitRef.current && current.length > 0 && fitAllRef.current) {
      didFitRef.current = true;
      fitAllRef.current();
    }

    scheduleLayout();
  }

  // Sincronizza a ogni cambio dei dati (anche se arrivano prima che la mappa sia pronta).
  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, photoUrls, categoriesById, categoryOrder]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div className={`map-mode-badge map-mode-${mode}`} role="status" aria-live="polite">
        {mode === "loading"
          ? "Caricamento mappa dettagliata…"
          : mode === "online"
            ? "Mappa dettagliata online"
            : "Mappa base offline · lo zoom non aggiunge strade"}
      </div>
    </>
  );
}
