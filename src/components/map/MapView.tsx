import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import type { Bookmark, Category } from "@/lib/bookmarks/types";
import { avatarInnerHtml, avatarKey, bookmarkAvatar } from "@/lib/bookmarks/avatar";
import { markerDiameter, priorityStyle } from "@/lib/bookmarks/priority";
import { createOnlineController, type MapMode } from "./basemap";

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
}

interface ScreenBookmark {
  bookmark: Bookmark;
  x: number;
  y: number;
  radius: number;
}

const SIGNIFICANT_OVERLAP_RATIO = 0.25;
const GRID_CELL_SIZE = 96;

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
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const pinMarkerRef = useRef<LType.Marker | null>(null);
  const markersRef = useRef<Map<string, LType.Marker>>(new Map());
  const sigRef = useRef<Map<string, string>>(new Map());
  const offsetRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const expandedRef = useRef<Map<string, [number, number]>>(new Map());
  const expandedGroupIdsRef = useRef<Set<string>>(new Set());
  const clusterMembersRef = useRef<Map<string, Bookmark[]>>(new Map());
  const dataRef = useRef<Bookmark[]>(bookmarks);
  const categoryOrderRef = useRef(categoryOrder);
  const fitAllRef = useRef<(() => void) | null>(null);
  const didFitRef = useRef(false);
  const layoutRafRef = useRef<number | null>(null);
  const cbRef = useRef({ onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById });
  const [mode, setMode] = useState<MapMode>("loading");
  const stopOnlineRef = useRef<(() => void) | null>(null);

  dataRef.current = bookmarks;
  categoryOrderRef.current = categoryOrder;
  cbRef.current = { onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById };

  function scheduleLayout() {
    if (layoutRafRef.current !== null) {
      cancelAnimationFrame(layoutRafRef.current);
    }

    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = null;
      layout();
    });
  }

  function resetExpandedGroup() {
    if (expandedRef.current.size === 0) return;

    for (const [id, original] of expandedRef.current) {
      markersRef.current.get(id)?.setLatLng(original);
      offsetRef.current.set(id, { dx: 0, dy: 0 });
    }

    expandedRef.current.clear();
    expandedGroupIdsRef.current.clear();
    scheduleLayout();
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
    const map = mapRef.current;
    const element = marker.getElement();

    if (!L || !map || !element || element.dataset["bound"] === "1") return;

    element.dataset["bound"] = "1";

    let timer: ReturnType<typeof setTimeout> | null = null;
    let moved = false;
    let dragMode = false;
    let start = { x: 0, y: 0 };

    const endHold = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const stopDrag = (commit: boolean) => {
      if (!dragMode) return;

      dragMode = false;
      element.classList.remove("bm-dragging");
      map.dragging.enable();

      if (commit) {
        const offset = offsetRef.current.get(id) ?? { dx: 0, dy: 0 };
        const point = map.latLngToLayerPoint(marker.getLatLng());
        const realPoint = L.point(
          point.x - offset.dx,
          point.y - offset.dy,
        );
        const realLatLng = map.layerPointToLatLng(realPoint);
        cbRef.current.onMove(id, realLatLng.lat, realLatLng.lng);
      }
    };

    element.addEventListener("pointerdown", (event: PointerEvent) => {
      event.stopPropagation();
      moved = false;
      start = { x: event.clientX, y: event.clientY };
      endHold();

      timer = setTimeout(() => {
        // Non consentire il trascinamento delle posizioni temporanee
        // mentre un gruppo è aperto.
        if (expandedGroupIdsRef.current.has(id)) return;

        const current = dataRef.current.find((b) => b.id === id);
        if (current?.locked) {
          if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
          return;
        }

        dragMode = true;
        element.classList.add("bm-dragging");
        map.dragging.disable();

        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // Alcuni browser possono rifiutare la cattura del puntatore.
        }

        if (navigator.vibrate) navigator.vibrate(30);
      }, 1200);
    });

    element.addEventListener("pointermove", (event: PointerEvent) => {
      if (dragMode) {
        event.preventDefault();
        event.stopPropagation();

        const rect = map.getContainer().getBoundingClientRect();
        const point = L.point(
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        marker.setLatLng(map.containerPointToLatLng(point));
        return;
      }

      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
        moved = true;
        endHold();
      }
    });

    element.addEventListener("pointerup", (event: PointerEvent) => {
      event.stopPropagation();

      // Evita il click sintetico che può seguire un tocco.
      if (event.pointerType !== "mouse") event.preventDefault();

      endHold();

      if (dragMode) {
        stopDrag(true);
        return;
      }

      if (moved) return;

      // Un tocco su un marker già separato apre quel segnalibro.
      if (expandedGroupIdsRef.current.has(id)) {
        cbRef.current.onOpen(id);
        return;
      }

      // Il primo tocco sul leader separa temporaneamente il gruppo.
      if (expandClusterGroup(id)) return;

      // I marker non aggregati si aprono al primo tocco.
      cbRef.current.onOpen(id);
    });

    element.addEventListener("pointercancel", () => {
      endHold();
      stopDrag(false);
    });

    element.addEventListener("dblclick", (event) => event.stopPropagation());

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function expandClusterGroup(leaderId: string): boolean {
    const L = LRef.current;
    const map = mapRef.current;
    const hiddenMembers = clusterMembersRef.current.get(leaderId);

    if (!L || !map || !hiddenMembers || hiddenMembers.length === 0) return false;

    // Chiude un eventuale gruppo precedente prima di aprirne un altro.
    if (expandedRef.current.size > 0) {
      resetExpandedGroup();
    }

    const leader = dataRef.current.find((b) => b.id === leaderId);
    if (!leader) return false;

    const members = [leader, ...hiddenMembers];
    const center = map.latLngToLayerPoint([leader.lat, leader.lng]);
    const maxDiameter = Math.max(...members.map((b) => markerDiameter(b.priority)));
    const radius = Math.max(52, maxDiameter * Math.max(1.5, members.length * 0.55));

    members.forEach((bookmark, index) => {
      const marker = markersRef.current.get(bookmark.id);
      if (!marker) return;

      expandedRef.current.set(bookmark.id, [bookmark.lat, bookmark.lng]);
      expandedGroupIdsRef.current.add(bookmark.id);

      if (!map.hasLayer(marker)) marker.addTo(map);

      const angle = (index / members.length) * Math.PI * 2 - Math.PI / 2;
      const point = L.point(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
      );

      marker.setLatLng(map.layerPointToLatLng(point));
      marker.setZIndexOffset(100000 + index);
      offsetRef.current.set(bookmark.id, { dx: 0, dy: 0 });
      attachMarkerEvents(bookmark.id, marker);
    });

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
    const parent = new Map<string, string>();
    const byId = new Map(items.map((item) => [item.bookmark.id, item]));
    const grid = new Map<string, ScreenBookmark[]>();

    const find = (id: string): string => {
      const current = parent.get(id);
      if (!current || current === id) return id;

      const root = find(current);
      parent.set(id, root);
      return root;
    };

    const union = (a: string, b: string) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    };

    for (const item of items) {
      const id = item.bookmark.id;
      parent.set(id, id);

      const cellX = Math.floor(item.x / GRID_CELL_SIZE);
      const cellY = Math.floor(item.y / GRID_CELL_SIZE);

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const nearby = grid.get(`${cellX + dx}:${cellY + dy}`) ?? [];

          for (const other of nearby) {
            if (overlapIsSignificant(item, other)) {
              union(id, other.bookmark.id);
            }
          }
        }
      }

      const key = `${cellX}:${cellY}`;
      const cell = grid.get(key) ?? [];
      cell.push(item);
      grid.set(key, cell);
    }

    const components = new Map<string, Bookmark[]>();

    for (const item of items) {
      const root = find(item.bookmark.id);
      const members = components.get(root) ?? [];
      members.push(item.bookmark);
      components.set(root, members);
    }

    // Il primo elemento secondo la gerarchia diventa il leader.
    const ranks = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
    const leaders = new Map<string, Bookmark[]>();

    for (const component of components.values()) {
      component.sort((a, b) => compareLeaderPriority(a, b, ranks));
      const [leader, ...hidden] = component;

      if (leader) leaders.set(leader.id, hidden);
    }

    return { leaders, byId };
  }

  function layout() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Durante l'apertura temporanea del gruppo non ricomputare il layout.
    if (expandedRef.current.size > 0) return;

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

    const ranks = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
    const stackOrder = [...currentBookmarks].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return categoryRank(b, ranks) - categoryRank(a, ranks);
    });
    const stackingRank = new Map(
      stackOrder.map((bookmark, index) => [bookmark.id, index]),
    );

    const visibleLeaderIds = new Set(leaders.keys());

    for (const bookmark of currentBookmarks) {
      const marker = markersRef.current.get(bookmark.id);
      if (!marker) continue;

      if (!visibleLeaderIds.has(bookmark.id)) {
        if (map.hasLayer(marker)) marker.remove();
        continue;
      }

      const hiddenCount = leaders.get(bookmark.id)?.length ?? 0;
      const signature = markerSignature(bookmark, hiddenCount);

      marker.setLatLng([bookmark.lat, bookmark.lng]);
      marker.setZIndexOffset(stackingRank.get(bookmark.id) ?? 0);

      if (sigRef.current.get(bookmark.id) !== signature) {
        marker.setIcon(makeIcon(L, bookmark, hiddenCount));
        sigRef.current.set(bookmark.id, signature);
      }

      if (!map.hasLayer(marker)) marker.addTo(map);
      attachMarkerEvents(bookmark.id, marker);
      offsetRef.current.set(bookmark.id, { dx: 0, dy: 0 });
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
      stopOnlineRef.current = createOnlineController(L, map, setMode);

      const fitAll = () => {
        const points = dataRef.current.map(
          (b) => [b.lat, b.lng] as [number, number],
        );
        if (points.length === 0) return;

        map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 15 });
      };

      fitAllRef.current = fitAll;

      const FitControl = L.Control.extend({
        onAdd() {
          const button = L.DomUtil.create(
            "a",
            "leaflet-bar leaflet-control fit-all-btn",
          );

          button.href = "#";
          button.title = "Inquadra tutti i segnalibri";
          button.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/></svg>';

          L.DomEvent.on(button, "click", (event) => {
            L.DomEvent.stop(event);
            fitAll();
          });

          return button;
        },
      });

      new FitControl({ position: "topright" }).addTo(map);

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

      map.on("movestart zoomstart", resetExpandedGroup);
      map.on("moveend zoomend", () => {
        resetExpandedGroup();
        scheduleLayout();
      });
      map.on("click", resetExpandedGroup);

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

      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current);
      }

      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      sigRef.current.clear();
      offsetRef.current.clear();
      expandedRef.current.clear();
      expandedGroupIdsRef.current.clear();
      clusterMembersRef.current.clear();
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
    };
    // L'inizializzazione della mappa deve avvenire una sola volta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizza i marker con i segnalibri e aggiorna l'ordinamento.
  function syncMarkers() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    resetExpandedGroup();

    const current = dataRef.current;
    const alive = new Set(current.map((b) => b.id));

    for (const [id, marker] of markersRef.current) {
      if (!alive.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        sigRef.current.delete(id);
        offsetRef.current.delete(id);
      }
    }

    const ranks = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
    const stackOrder = [...current].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return categoryRank(b, ranks) - categoryRank(a, ranks);
    });
    const stackingRank = new Map(
      stackOrder.map((bookmark, index) => [bookmark.id, index]),
    );

    for (const bookmark of current) {
      const signature = markerSignature(bookmark);
      let marker = markersRef.current.get(bookmark.id);

      if (!marker) {
        marker = L.marker(
          [bookmark.lat, bookmark.lng],
          { icon: makeIcon(L, bookmark), riseOnHover: false },
        );

        markersRef.current.set(bookmark.id, marker);
        sigRef.current.set(bookmark.id, signature);
      } else if (sigRef.current.get(bookmark.id) !== signature) {
        marker.setIcon(makeIcon(L, bookmark));
        sigRef.current.set(bookmark.id, signature);
      }

      marker.setZIndexOffset(stackingRank.get(bookmark.id) ?? 0);

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
