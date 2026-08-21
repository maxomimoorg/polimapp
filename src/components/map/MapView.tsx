import { useEffect, useRef } from "react";
import type * as LType from "leaflet";
import type { Bookmark } from "@/lib/bookmarks/types";
import { markerDiameter, priorityStyle } from "@/lib/bookmarks/priority";
import { spreadOverlapping } from "./cluster";

export interface MapApi {
  flyTo: (lat: number, lng: number) => void;
  fitAll: () => void;
}

interface Props {
  bookmarks: Bookmark[];
  photoUrls: Record<string, string>;
  colorOf: (b: Bookmark) => string;
  onCreate: (lat: number, lng: number) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, lat: number, lng: number) => void;
  onReady: (api: MapApi) => void;
}

export default function MapView({ bookmarks, photoUrls, colorOf, onCreate, onOpen, onMove, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const markersRef = useRef<Map<string, LType.Marker>>(new Map());
  const sigRef = useRef<Map<string, string>>(new Map());
  const offsetRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const dataRef = useRef<Bookmark[]>(bookmarks);
  const fitAllRef = useRef<(() => void) | null>(null);
  const didFitRef = useRef(false);
  const cbRef = useRef({ onCreate, onOpen, onMove, colorOf, photoUrls });
  cbRef.current = { onCreate, onOpen, onMove, colorOf, photoUrls };
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

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
        // mantiene più tile attorno alla vista e non le scarta subito: nessun lampo tra gli zoom
        keepBuffer: 4,
        updateWhenZooming: false,
        updateWhenIdle: false,
      }).addTo(map);

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

      map.on("zoomend moveend", () => layout());


      onReady({
        flyTo: (lat, lng) => map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 }),
        fitAll,
      });
      if (!didFitRef.current && dataRef.current.length > 0) {
        didFitRef.current = true;
        fitAll();
      }
      layout();
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      sigRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function iconHtml(b: Bookmark) {
    const { opacity, scale } = priorityStyle(b.priority);
    const d = markerDiameter(b.priority);
    const color = cbRef.current.colorOf(b);
    const url = b.photoId ? cbRef.current.photoUrls[b.photoId] : undefined;
    const border = Math.max(2, Math.round(3 * Math.min(scale, 1.6)));
    return `<div class="bm-marker" style="width:${d}px;height:${d}px;opacity:${opacity};border:${border}px solid ${color}">${
      url ? `<img src="${url}" alt="" />` : ""
    }</div>`;
  }

  function layout() {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const items = dataRef.current.map((b) => {
      const p = map.latLngToLayerPoint([b.lat, b.lng]);
      return { id: b.id, x: p.x, y: p.y, diameter: markerDiameter(b.priority) };
    });
    const placed = spreadOverlapping(items);
    for (const item of items) {
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

    for (const b of bookmarks) {
      const d = markerDiameter(b.priority);
      const sig = `${b.priority}|${b.photoId ?? ""}|${cbRef.current.colorOf(b)}|${b.photoId ? (photoUrls[b.photoId] ?? "") : ""}`;
      let marker = markersRef.current.get(b.id);
      const icon = L.divIcon({
        className: "bm-marker-wrap",
        html: iconHtml(b),
        iconSize: [d, d],
        iconAnchor: [d / 2, d / 2],
      });
      if (!marker) {
        marker = L.marker([b.lat, b.lng], { icon, riseOnHover: true }).addTo(map);
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
    layout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, photoUrls]);

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
        marker.dragging?.enable();
        el.classList.add("bm-dragging");
        if (navigator.vibrate) navigator.vibrate(30);
      }, 1200);
    });
    el.addEventListener("pointermove", (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) {
        moved = true;
        if (!dragMode) endHold();
      }
    });
    el.addEventListener("pointerup", (ev: PointerEvent) => {
      ev.stopPropagation();
      // evita il "click fantasma" su touch: il click sintetico cadrebbe sul popup appena aperto
      if (ev.pointerType !== "mouse") ev.preventDefault();
      endHold();
      if (!dragMode && !moved) cbRef.current.onOpen(id);
    });
    el.addEventListener("pointercancel", endHold);
    el.addEventListener("dblclick", (ev) => ev.stopPropagation());
    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });

    marker.on("dragend", () => {
      const off = offsetRef.current.get(id) ?? { dx: 0, dy: 0 };
      const p = map.latLngToLayerPoint(marker.getLatLng());
      const real = map.layerPointToLatLng(L.point(p.x - off.dx, p.y - off.dy));
      dragMode = false;
      marker.dragging?.disable();
      el.classList.remove("bm-dragging");
      cbRef.current.onMove(id, real.lat, real.lng);
    });
  }

  return <div ref={containerRef} className="absolute inset-0" />;
}