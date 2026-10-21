import { useEffect, useRef, useState } from "react";
import type * as LType from "leaflet";
import type { Bookmark, Category } from "@/lib/bookmarks/types";
import { avatarInnerHtml, avatarKey, bookmarkAvatar } from "@/lib/bookmarks/avatar";
import { markerDiameter, priorityStyle } from "@/lib/bookmarks/priority";
import { spreadOverlapping } from "./cluster";
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
  distanceLayoutEnabled: boolean;
  categoryOrder: string[];
}

export default function MapView({
  bookmarks,
  photoUrls,
  categoriesById,
  colorOf,
  onCreate,
  onOpen,
  onMove,
  onReady,
  distanceLayoutEnabled,
  categoryOrder,
}: Props) {
  const expandedRef = useRef<Map<string, [number, number]>>(new Map());
  const categoryOrderRef = useRef(categoryOrder);
  categoryOrderRef.current = categoryOrder;
  const distanceLayoutEnabledRef = useRef(distanceLayoutEnabled);
  distanceLayoutEnabledRef.current = distanceLayoutEnabled;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const pinMarkerRef = useRef<LType.Marker | null>(null);
  const markersRef = useRef<Map<string, LType.Marker>>(new Map());
  const sigRef = useRef<Map<string, string>>(new Map());
  const offsetRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const dataRef = useRef<Bookmark[]>(bookmarks);
  const fitAllRef = useRef<(() => void) | null>(null);
  const didFitRef = useRef(false);
  const layoutRafRef = useRef<number | null>(null);
  const cbRef = useRef({ onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById });
  cbRef.current = { onCreate, onOpen, onMove, colorOf, photoUrls, categoriesById };
  const [mode, setMode] = useState<MapMode>("loading");
  const stopOnlineRef = useRef<(() => void) | null>(null);
  dataRef.current = bookmarks;

  // init map once
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

      // Gestisce il caricamento: controlla la linea e carica online se presente, o passa alla base offline se assente/errore
      stopOnlineRef.current = createOnlineController(L, map, setMode);

      const fitAll = () => {
        const pts = dataRef.current.map((b) => [b.lat, b.lng] as [number, number]);
        if (pts.length === 0) return;
        map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
      };
      fitAllRef.current = fitAll;

      const FitControl = L.Control.extend({
        onAdd() {
          const btn = L.DomUtil.create("a", "leaflet-bar leaflet-control fit-all-btn");
          btn.href = "#";
          btn.title = "Inquadra tutti i segnalibri";
          btn.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/></svg>';
          L.DomEvent.on(btn, "click", (e) => {
            L.DomEvent.stop(e);
            fitAll();
          });
          return btn;
        },
      });
      new FitControl({ position: "topright" }).addTo(map);

      // create bookmark interactions
      map.on("contextmenu", (e: LType.LeafletMouseEvent) => {
        cbRef.current.onCreate(e.latlng.lat, e.latlng.lng);
      });

      // long press on empty map
      let pressTimer: ReturnType<typeof setTimeout> | null = null;
      let start = { x: 0, y: 0 };
      const el = map.getContainer();
      const clear = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
      };
      el.addEventListener("pointerdown", (ev: PointerEvent) => {
        if ((ev.target as HTMLElement).closest(".bm-marker, .leaflet-control")) return;
        start = { x: ev.clientX, y: ev.clientY };
        clear();
        pressTimer = setTimeout(() => {
          const rect = el.getBoundingClientRect();
          const pt = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
          const ll = map.containerPointToLatLng(pt);
          cbRef.current.onCreate(ll.lat, ll.lng);
        }, 750);
      });
      el.addEventListener("pointermove", (ev: PointerEvent) => {
        if (pressTimer && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10) clear();
      });
      el.addEventListener("pointerup", clear);
      el.addEventListener("pointercancel", clear);

      map.on("movestart zoomstart", resetExpandedGroup);
      map.on("zoomend moveend", () => {
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
        if (!LRef.current || !mapRef.current) return;
        const L = LRef.current;
        const map = mapRef.current;

        // Rimuove l'eventuale puntino precedente prima di posizionare il nuovo
        clearPin();

        // Puntino fucsia con anello bianco e ombra
        const pin = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "search-coord-pin",
            html: '<div style="width:16px;height:16px;border-radius:50%;background:#ff0080;border:2.5px solid #ffffff;box-shadow:0 0 0 4px rgba(255,0,128,0.35),0 2px 6px rgba(0,0,0,0.6);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map);

        pinMarkerRef.current = pin;
      };

      onReady({
        flyTo: (lat, lng) => map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 }),
        showPin,
        clearPin,
        fitAll,
      });
      if (!didFitRef.current && dataRef.current.length > 0) {
        didFitRef.current = true;
        fitAll();
      }
      scheduleLayout();
    })();
    return () => {
      disposed = true;
      stopOnlineRef.current?.();
      stopOnlineRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      sigRef.current.clear();
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      if (layoutRafRef.current) cancelAnimationFrame(layoutRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function iconHtml(b: Bookmark) {
    const { opacity, scale } = priorityStyle(b.priority);
    const d = markerDiameter(b.priority);
    const color = cbRef.current.colorOf(b);
    const avatar = bookmarkAvatar(b, cbRef.current.categoriesById, cbRef.current.photoUrls);
    const border = Math.max(2, Math.round(3 * Math.min(scale, 1.6)));
    return `<div class="bm-marker" style="width:${d}px;height:${d}px;opacity:${opacity};border:${border}px solid ${color}">${avatarInnerHtml(avatar)}</div>`;
  }

  function scheduleLayout() {
    if (layoutRafRef.current) cancelAnimationFrame(layoutRafRef.current);
    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = null;
  function resetExpandedGroup() {
    for (const [id, original] of expandedRef.current) {
      markersRef.current.get(id)?.setLatLng(original);
    }
    expandedRef.current.clear();
  }

  function expandOverlappingGroup(clickedId: string): boolean {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || distanceLayoutEnabledRef.current) return false;

    const items = dataRef.current.map((bookmark) => {
      const point = map.latLngToLayerPoint([bookmark.lat, bookmark.lng]);
      return {
        bookmark,
        x: point.x,
        y: point.y,
        radius: markerDiameter(bookmark.priority) / 2,
      };
    });
    const seed = items.find((item) => item.bookmark.id === clickedId);
    if (!seed) return false;

    // Costruisce il gruppo transitivo: A può sovrapporsi a B e B a C.
    const group = new Set<string>([clickedId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const a of items) {
        if (!group.has(a.bookmark.id)) continue;
        for (const b of items) {
          if (group.has(b.bookmark.id)) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const minDistance = a.radius + b.radius;
          if (dx * dx + dy * dy < minDistance * minDistance) {
            group.add(b.bookmark.id);
            changed = true;
          }
        }
      }
    }
    if (group.size < 2) return false;

    const members = items.filter((item) => group.has(item.bookmark.id));
    const centerX = seed.x;
    const centerY = seed.y;
    const maxDiameter = Math.max(...members.map((item) => item.radius * 2));
    const ringRadius = Math.max(maxDiameter * members.length * 0.7, maxDiameter * 1.5);

    members.forEach((item, index) => {
      const original: [number, number] = [item.bookmark.lat, item.bookmark.lng];
      expandedRef.current.set(item.bookmark.id, original);
      const angle = (index / members.length) * Math.PI * 2 - Math.PI / 2;
      const destination = L.point(
        centerX + Math.cos(angle) * ringRadius,
        centerY + Math.sin(angle) * ringRadius,
      );
      markersRef.current.get(item.bookmark.id)?.setLatLng(map.layerPointToLatLng(destination));
    });
    return true;
  }
      layout();
    });
  }

  function layout() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    // Con il toggle spento, nessun calcolo di collisione: ripristina sempre le coordinate salvate.
    if (!distanceLayoutEnabledRef.current) {
      resetExpandedGroup();
      for (const bookmark of dataRef.current) {
        markersRef.current.get(bookmark.id)?.setLatLng([bookmark.lat, bookmark.lng]);
        offsetRef.current.set(bookmark.id, { dx: 0, dy: 0 });
      }
      return;
    }

    // Calcola le collisioni solo nell'area visibile (+25% di margine fuori schermo)
    const bounds = map.getBounds().pad(0.25);
    const visibleItems: import("./cluster").ClusterInput[] = [];

    for (const b of dataRef.current) {
      const marker = markersRef.current.get(b.id);
      const isVisible = bounds.contains([b.lat, b.lng]);

      // DOM Culling: nasconde gli elementi fuori schermo per alleggerire GPU e compositing
      const el = marker?.getElement();
      if (el) {
        if (!isVisible) {
          el.style.display = "none";
        } else {
          el.style.removeProperty("display");
        }
      }

      if (isVisible) {
        const p = map.latLngToLayerPoint([b.lat, b.lng]);
        visibleItems.push({ id: b.id, x: p.x, y: p.y, diameter: markerDiameter(b.priority) });
      } else {
        offsetRef.current.delete(b.id);
      }
    }

    const placed = spreadOverlapping(visibleItems);
    for (const item of visibleItems) {
      const marker = markersRef.current.get(item.id);
      const pos = placed[item.id];
      if (!marker || !pos) continue;
      offsetRef.current.set(item.id, { dx: pos.x - item.x, dy: pos.y - item.y });
      marker.setLatLng(map.layerPointToLatLng(L.point(pos.x, pos.y)));
    }
  }

  // sync markers with data
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const alive = new Set(bookmarks.map((b) => b.id));
    for (const [id, m] of markersRef.current) {
      if (!alive.has(id)) {
        m.remove();
        markersRef.current.delete(id);
        sigRef.current.delete(id);
      }
    }
    const categoryRank = new Map(categoryOrderRef.current.map((id, index) => [id, index]));
    const orderedForStacking = [...bookmarks].sort((a, b) => {
      // In ordine crescente: gli elementi che devono stare dietro vengono prima.
      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;
      const byNovelty = a.createdAt - b.createdAt;
      if (byNovelty !== 0) return byNovelty;
      const aCategory = categoryRank.get(a.categoryId ?? "") ?? -1;
      const bCategory = categoryRank.get(b.categoryId ?? "") ?? -1;
      // La categoria che appare prima nell'elenco del filtro finisce davanti.
      return bCategory - aCategory;
    });
    const stackingRank = new Map(orderedForStacking.map((bookmark, index) => [bookmark.id, index]));
    for (const b of bookmarks) {
      const d = markerDiameter(b.priority);
      const sig = `${b.priority}|${cbRef.current.colorOf(b)}|${avatarKey(bookmarkAvatar(b, categoriesById, photoUrls))}`;
      let marker = markersRef.current.get(b.id);
      marker?.setZIndexOffset((stackingRank.get(b.id) ?? 0) * 1000);
      const icon = L.divIcon({
        className: "bm-marker-wrap",
        html: iconHtml(b),
        iconSize: [d, d],
        iconAnchor: [d / 2, d / 2],
      });
      if (!marker) {
        marker = L.marker([b.lat, b.lng], { icon, riseOnHover: true }).addTo(map);
        marker.setZIndexOffset((stackingRank.get(b.id) ?? 0) * 1000);
        markersRef.current.set(b.id, marker);
        attachMarkerEvents(b.id, marker);
      } else if (sigRef.current.get(b.id) !== sig) {
        marker.setIcon(icon);
        attachMarkerEvents(b.id, marker);
      }
      sigRef.current.set(b.id, sig);
    }
    if (!didFitRef.current && bookmarks.length > 0 && fitAllRef.current) {
      didFitRef.current = true;
      fitAllRef.current();
    }
    scheduleLayout();
  }, [bookmarks, photoUrls, categoriesById, categoryOrder, distanceLayoutEnabled]);

  function attachMarkerEvents(id: string, marker: LType.Marker) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const el = marker.getElement();
    if (!el || el.dataset["bound"] === "1") {
      if (el) el.dataset["bound"] = "1";
    }
    if (!el) return;
    el.dataset["bound"] = "1";

    let timer: ReturnType<typeof setTimeout> | null = null;
    let moved = false;
    let dragMode = false;
    let start = { x: 0, y: 0 };

    const endHold = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const stopDrag = (commit: boolean) => {
      if (!dragMode) return;
      dragMode = false;
      el.classList.remove("bm-dragging");
      map.dragging.enable();
      if (commit) {
        const off = offsetRef.current.get(id) ?? { dx: 0, dy: 0 };
        const p = map.latLngToLayerPoint(marker.getLatLng());
        const real = map.layerPointToLatLng(L.point(p.x - off.dx, p.y - off.dy));
        cbRef.current.onMove(id, real.lat, real.lng);
      }
    };

    el.addEventListener("pointerdown", (ev: PointerEvent) => {
      ev.stopPropagation();
      moved = false;
      start = { x: ev.clientX, y: ev.clientY };
      endHold();
      timer = setTimeout(() => {
        const current = dataRef.current.find((b) => b.id === id);
        if (current?.locked) {
          if (navigator.vibrate) navigator.vibrate([15, 40, 15]);
          return;
        }
        dragMode = true;
        el.classList.add("bm-dragging");
        // il trascinamento è gestito a mano: la mappa non deve muoversi
        map.dragging.disable();
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* alcuni browser rifiutano la cattura: il drag funziona comunque */
        }
        if (navigator.vibrate) navigator.vibrate(30);
      }, 1200);
    });

    el.addEventListener("pointermove", (ev: PointerEvent) => {
      if (dragMode) {
        ev.preventDefault();
        ev.stopPropagation();
        const rect = map.getContainer().getBoundingClientRect();
        const pt = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
        marker.setLatLng(map.containerPointToLatLng(pt));
        return;
      }
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) {
        moved = true;
        endHold();
      }
    });

    el.addEventListener("pointerup", (ev: PointerEvent) => {
      ev.stopPropagation();
      // evita il "click fantasma" su touch: il click sintetico cadrebbe sul popup appena aperto
      if (ev.pointerType !== "mouse") ev.preventDefault();
      endHold();
      if (dragMode) {
        stopDrag(true);
        return;
      }
      if (!moved) {
        // Primo clic: separa il gruppo e non apre ancora un segnalibro.
        if (expandOverlappingGroup(id)) return;
        // Clic su un marker già separato (o non sovrapposto): apre il segnalibro.
        cbRef.current.onOpen(id);
      }
    });

    el.addEventListener("pointercancel", () => {
      endHold();
      stopDrag(false);
    });
    el.addEventListener("dblclick", (ev) => ev.stopPropagation());
    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

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
