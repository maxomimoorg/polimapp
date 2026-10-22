import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Bookmark, CategoryId } from '../../types';
import { renderAvatarHtml } from '../../lib/bookmarks/avatar';
import { getBasemapTileLayer } from './basemap';

export interface MapViewProps {
  bookmarks: Bookmark[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onMoveBookmark?: (id: string, lat: number, lng: number) => void;
  categoryColors?: Record<CategoryId, string>;
  categoryOrder?: CategoryId[];
  distanceLayoutEnabled?: boolean;
}

interface ExpandedGroupState {
  clusterKey: string;
  originalPositions: Map<string, L.LatLng>;
  markerIds: Set<string>;
}

// Confronto gerarchico: 1) Priorità (high > normal > low), 2) Novità (createdAt desc), 3) Posizione categoria
function compareBookmarks(
  a: Bookmark,
  b: Bookmark,
  categoryIndexMap: Map<CategoryId, number>
): number {
  const prioWeight = (p?: string) => (p === 'high' ? 3 : p === 'normal' ? 2 : 1);
  const diffPrio = prioWeight(b.priority) - prioWeight(a.priority);
  if (diffPrio !== 0) return diffPrio;

  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (timeB !== timeA) return timeB - timeA;

  const orderA = a.categoryId ? (categoryIndexMap.get(a.categoryId) ?? 9999) : 9999;
  const orderB = b.categoryId ? (categoryIndexMap.get(b.categoryId) ?? 9999) : 9999;
  return orderA - orderB;
}

export const MapView: React.FC<MapViewProps> = ({
  bookmarks,
  selectedId,
  onSelect,
  onOpen,
  onMoveBookmark,
  categoryColors,
  categoryOrder = [],
  distanceLayoutEnabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const dataRef = useRef<Bookmark[]>(bookmarks);
  dataRef.current = bookmarks;

  const categoryIndexMap = useMemo(() => {
    const map = new Map<CategoryId, number>();
    categoryOrder.forEach((id, idx) => map.set(id, idx));
    return map;
  }, [categoryOrder]);

  const expandedGroupRef = useRef<ExpandedGroupState | null>(null);
  const clusterHiddenMapRef = useRef<Map<string, Bookmark[]>>(new Map());

  const layoutRafRef = useRef<number | null>(null);

  // Ripristina un eventuale gruppo aperto a ventaglio
  const resetExpandedGroup = () => {
    const current = expandedGroupRef.current;
    if (!current) return;
    const map = mapRef.current;
    if (map) {
      current.originalPositions.forEach((latLng, id) => {
        const marker = markersRef.current.get(id);
        if (marker) {
          marker.setLatLng(latLng);
        }
      });
    }
    expandedGroupRef.current = null;
    scheduleLayout();
  };

  // Separazione temporanea a cerchio per un gruppo aggregato
  const expandClusterGroup = (leaderId: string, group: Bookmark[]) => {
    const map = mapRef.current;
    if (!map || group.length <= 1) return;

    resetExpandedGroup();

    const leaderBookmark = group.find((b) => b.id === leaderId) ?? group[0];
    const centerPoint = map.latLngToLayerPoint(L.latLng(leaderBookmark.lat, leaderBookmark.lng));
    const originalPositions = new Map<string, L.LatLng>();
    const markerIds = new Set<string>();

    const radius = Math.max(48, 26 + group.length * 7);
    const step = (Math.PI * 2) / group.length;

    group.forEach((b, idx) => {
      originalPositions.set(b.id, L.latLng(b.lat, b.lng));
      markerIds.add(b.id);

      const angle = idx * step - Math.PI / 2;
      const targetPoint = L.point(
        centerPoint.x + Math.cos(angle) * radius,
        centerPoint.y + Math.sin(angle) * radius
      );
      const targetLatLng = map.layerPointToLatLng(targetPoint);

      let marker = markersRef.current.get(b.id);
      if (!marker) {
        // Se il marker era nascosto nel cluster, crealo temporaneamente
        marker = createMarkerInstance(b);
        markersRef.current.set(b.id, marker);
        marker.addTo(map);
      }
      marker.setLatLng(targetLatLng);
      marker.setZIndexOffset(10000 + (group.length - idx));
    });

    expandedGroupRef.current = {
      clusterKey: leaderId,
      originalPositions,
      markerIds,
    };
  };

  // Creazione istanza Marker con avatar e badge
  const createMarkerInstance = (b: Bookmark, hiddenCount = 0): L.Marker => {
    const color = b.categoryId && categoryColors ? categoryColors[b.categoryId] : undefined;
    const isSelected = b.id === selectedId;

    let iconHtml = renderAvatarHtml(b, color, isSelected);
    if (hiddenCount > 0) {
      iconHtml = `
        <div class="marker-cluster-container relative">
          ${iconHtml}
          <span class="marker-cluster-badge">+${hiddenCount}</span>
        </div>
      `;
    }

    const icon = L.divIcon({
      className: 'custom-map-marker',
      html: iconHtml,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const marker = L.marker([b.lat, b.lng], {
      icon,
      riseOnHover: false,
      draggable: false,
    });

    attachMarkerEvents(marker, b.id);
    return marker;
  };

  // Gestione eventi tocco / click / drag per ogni marker
  const attachMarkerEvents = (marker: L.Marker, id: string) => {
    let startPos: L.Point | null = null;
    let didMove = false;

    marker.on('mousedown touchstart', (e: L.LeafletMouseEvent) => {
      const orig = e.originalEvent;
      if (orig) orig.stopPropagation();
      startPos = e.containerPoint ? L.point(e.containerPoint.x, e.containerPoint.y) : null;
      didMove = false;
    });

    marker.on('mousemove touchmove', (e: L.LeafletMouseEvent) => {
      if (!startPos || !e.containerPoint) return;
      if (startPos.distanceTo(e.containerPoint) > 5) {
        didMove = true;
      }
    });

    marker.on('click', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent) {
        e.originalEvent.stopPropagation();
      }
      if (didMove) return;

      onSelect(id);

      // Se fa parte di un gruppo già aperto a cerchio, aprilo direttamente
      if (expandedGroupRef.current?.markerIds.has(id)) {
        onOpen(id);
        return;
      }

      // Se è un cluster leader con segnalibri nascosti, aprilo a ventaglio
      const hiddenList = clusterHiddenMapRef.current.get(id);
      if (hiddenList && hiddenList.length > 0) {
        const fullGroup = [dataRef.current.find((b) => b.id === id)!, ...hiddenList].filter(Boolean);
        expandClusterGroup(id, fullGroup);
        return;
      }

      // Marker singolo non aggregato
      onOpen(id);
    });
  };

  // Inizializzazione della mappa
  useLayoutEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 19,
    }).setView([45.4642, 9.19], 13);

    const basemap = getBasemapTileLayer();
    basemap.addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('movestart zoomstart', () => {
      if (expandedGroupRef.current) resetExpandedGroup();
    });

    map.on('moveend zoomend', () => {
      scheduleLayout();
    });

    map.on('click', () => {
      if (expandedGroupRef.current) {
        resetExpandedGroup();
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Calcolo aggregazione viewport e culling
  const layout = () => {
    const map = mapRef.current;
    if (!map) return;

    // Se un gruppo è attualmente separato, non ricomputare il layout per non richiuderlo all'istante
    if (expandedGroupRef.current) return;

    const currentData = [...dataRef.current];
    const bounds = map.getBounds();
    clusterHiddenMapRef.current.clear();

    // Se la funzione di layout/aggregazione è disattivata nelle opzioni
    if (!distanceLayoutEnabled) {
      const activeIds = new Set<string>();

      currentData.forEach((b) => {
        activeIds.add(b.id);
        let marker = markersRef.current.get(b.id);
        if (!marker) {
          marker = createMarkerInstance(b);
          markersRef.current.set(b.id, marker);
          marker.addTo(map);
        } else {
          marker.setLatLng([b.lat, b.lng]);
        }
      });

      // Rimuovi eventuali marker non più presenti
      markersRef.current.forEach((marker, id) => {
        if (!activeIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
          elementsRef.current.delete(id);
        }
      });
      return;
    }

    // Filtra per viewport reale a schermo
    const inViewBookmarks = currentData.filter((b) => bounds.contains([b.lat, b.lng]));

    // Ordina tutti i visibili per gerarchia: il primo ha priorità su tutti
    inViewBookmarks.sort((a, b) => compareBookmarks(a, b, categoryIndexMap));

    // Converti in punti pixel schermo per verificare sovrapposizioni reali (casi A, B, C)
    const MARKER_DIAMETER = 36;
    const R_SUM = MARKER_DIAMETER; // somma dei due raggi (18 + 18)
    // Soglia di compenetrazione:
    // Se la distanza dei centri è inferiore a R_SUM * 0.82 (intersezione importante: casi A e B), aggrega.
    // Se sono tangenti o si toccano solo sui bordi (distanza vicina a R_SUM: caso C), restano separati.
    const CLUSTER_THRESHOLD_PX = R_SUM * 0.82;

    const assignedCluster = new Map<string, string>(); // bookmarkId -> leaderId
    const clusterMembers = new Map<string, Bookmark[]>(); // leaderId -> Bookmark[] nascosti

    for (let i = 0; i < inViewBookmarks.length; i++) {
      const bA = inViewBookmarks[i];
      if (assignedCluster.has(bA.id)) continue;

      const ptA = map.latLngToContainerPoint([bA.lat, bA.lng]);
      const hiddenBehindThis: Bookmark[] = [];

      for (let j = i + 1; j < inViewBookmarks.length; j++) {
        const bB = inViewBookmarks[j];
        if (assignedCluster.has(bB.id)) continue;

        const ptB = map.latLngToContainerPoint([bB.lat, bB.lng]);
        const dist = ptA.distanceTo(ptB);

        if (dist < CLUSTER_THRESHOLD_PX) {
          assignedCluster.set(bB.id, bA.id);
          hiddenBehindThis.push(bB);
        }
      }

      if (hiddenBehindThis.length > 0) {
        clusterMembers.set(bA.id, hiddenBehindThis);
        clusterHiddenMapRef.current.set(bA.id, hiddenBehindThis);
      }
    }

    // Identifica quali marker devono essere fisicamente visibili nel DOM
    const visibleLeaderIds = new Set<string>();

    inViewBookmarks.forEach((b) => {
      if (!assignedCluster.has(b.id)) {
        visibleLeaderIds.add(b.id);
        const hiddenList = clusterMembers.get(b.id) || [];
        const hiddenCount = hiddenList.length;

        let marker = markersRef.current.get(b.id);
        if (marker) {
          marker.remove();
          markersRef.current.delete(b.id);
        }

        marker = createMarkerInstance(b, hiddenCount);
        markersRef.current.set(b.id, marker);
        marker.addTo(map);
        marker.setLatLng([b.lat, b.lng]);
      }
    });

    // Rimuovi dal DOM tutti i marker fuori schermo o nascosti dietro al leader
    markersRef.current.forEach((marker, id) => {
      if (!visibleLeaderIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        elementsRef.current.delete(id);
      }
    });
  };

  const scheduleLayout = () => {
    if (layoutRafRef.current) cancelAnimationFrame(layoutRafRef.current);
    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = null;
      layout();
    });
  };

  // Re-layout quando cambiano i dati o le opzioni
  useEffect(() => {
    scheduleLayout();
  }, [bookmarks, distanceLayoutEnabled, categoryIndexMap]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
