import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, Settings, Undo2, Redo2 } from "lucide-react";
import { Toaster } from "sonner";
import { useBookmarkStore } from "@/lib/bookmarks/store";
import {
  defaultFilter,
  loadFilter,
  matchesFilter,
  saveFilter,
  type FilterState,
} from "@/lib/bookmarks/filter";
import { uid, type Bookmark } from "@/lib/bookmarks/types";
import { installBackStack, useBackLayer } from "@/lib/back-stack";

import { BookmarkEditor } from "@/components/bookmark/BookmarkEditor";
import { SearchPanel } from "@/components/overlay/SearchPanel";
import { FilterPanel } from "@/components/overlay/FilterPanel";
import { OptionsPanel } from "@/components/overlay/OptionsPanel";
import type { MapApi } from "@/components/map/MapView";
import type { MapTheme } from "@/components/map/basemap";

const MapView = lazy(() => import("@/components/map/MapView"));
const MAP_THEME_KEY = "polimapp:map_theme";

type PanelKind = "search" | "filter" | "options" | null;

/** Contenitore: foglio a scomparsa dal basso su mobile, riquadro flottante su desktop. */
function Overlay({
  onClose,
  align = "left",
  width = "20rem",
  children,
}: {
  onClose: () => void;
  align?: "left" | "center";
  width?: string;
  children: React.ReactNode;
}) {
  // livello di navigazione: Indietro/Esc chiudono solo il più recente
  useBackLayer(true, onClose);

  // breve periodo "cieco" all'apertura: evita che il tocco che ha aperto il pannello
  // colpisca subito un campo sottostante (click fantasma su touch)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/45 sm:items-center"
      style={{ pointerEvents: ready ? "auto" : "none" }}
      onPointerDown={onClose}
    >
      <div
        className={
          align === "center"
            ? "relative w-full sm:w-auto"
            : "relative w-full sm:absolute sm:bottom-4 sm:left-20 sm:w-auto"
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sheet p-4 sm:w-[var(--sheet-w)]" style={{ ["--sheet-w" as string]: width }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MapApp() {
  const store = useBookmarkStore();
  const [filter, setFilter] = useState<FilterState>(defaultFilter);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const apiRef = useRef<MapApi | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>("dark");

  useEffect(() => {
    installBackStack();
  }, []);

  // filtro persistente: caricato dopo l'idratazione, salvato a ogni modifica
  useEffect(() => {
    setFilter(loadFilter());
    try {
      const t = localStorage.getItem(MAP_THEME_KEY);
      if (t === "dark" || t === "bright") setMapTheme(t);
    } catch {
      /* storage non disponibile */
    }
  }, []);

  useEffect(() => {
    saveFilter(filter);
  }, [filter]);

  const changeMapTheme = useCallback((t: MapTheme) => {
    setMapTheme(t);
    try {
      localStorage.setItem(MAP_THEME_KEY, t);
    } catch {
      /* storage non disponibile */
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const isPreview = !import.meta.env.PROD || window.self !== window.top;
      const base = import.meta.env.BASE_URL;
      if (isPreview) {
        // nell'anteprima nessun service worker: evita versioni vecchie in cache
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          for (const r of regs) if (r.active?.scriptURL.endsWith("/sw.js")) void r.unregister();
        });
      } else {
        navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
      }
    }
  }, []);

  const visible = useMemo(
    () => store.data.bookmarks.filter((b) => matchesFilter(b, filter, store.categoriesById)),
    [store.data.bookmarks, filter, store.categoriesById],
  );

  const colorOf = useCallback(
    (b: Bookmark) =>
      b.categoryId ? (store.categoriesById[b.categoryId]?.color ?? "#9ca3af") : "#9ca3af",
    [store.categoriesById],
  );

  // il nuovo segnalibro esiste solo nel popup: senza "Salva" non viene creato
  const handleCreate = useCallback((lat: number, lng: number) => {
    setPanel(null);
    setEditing({
      id: uid(),
      name: "",
      lat,
      lng,
      categoryId: null,
      notes: "",
      priority: 50,
      tags: [],
      photoId: null,
      address: "",
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, []);

  const handleMove = useCallback(
    async (id: string, lat: number, lng: number) => {
      const b = store.data.bookmarks.find((x) => x.id === id);
      if (!b || b.locked) return;
      const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      await store.saveBookmark({ ...b, lat, lng, address });
    },
    [store],
  );

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black">
      <h1 className="sr-only">MapP</h1>
      <Suspense
        fallback={
          <div className="absolute inset-0 grid place-items-center text-white/60">
            Caricamento mappa…
          </div>
        }
      >
        <MapView
          mapTheme={mapTheme}
          bookmarks={visible}
          categoryOrder={store.data.categories.map((category) => category.id)}
          photoUrls={store.photoUrls}
          categoriesById={store.categoriesById}
          colorOf={colorOf}
          onCreate={handleCreate}
          onOpen={(id) => {
            const b = store.data.bookmarks.find((x) => x.id === id);
            if (b) {
              setPanel(null);
              setEditing(b);
            }
          }}
          onMove={handleMove}
          onReady={(api) => {
            apiRef.current = api;
          }}
        />
      </Suspense>

      <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[1200] flex flex-col gap-3">
        {(
          [
            ["search", Search, "Cerca"],
            ["filter", SlidersHorizontal, "Filtro"],
            ["options", Settings, "Opzioni"],
          ] as const
        ).map(([kind, Icon, label]) => (
          <button
            key={kind}
            type="button"
            aria-label={label}
            className="float-btn pointer-events-auto"
            onClick={() => {
              if (kind === "filter" || kind === "options") {
                apiRef.current?.clearPin();
              }
              setPanel((p) => (p === kind ? null : kind));
            }}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-[1200] flex gap-3">
        <button
          type="button"
          aria-label="Annulla"
          disabled={!store.canUndo}
          className="float-btn-sm pointer-events-auto"
          onClick={() => void store.undo()}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Ripeti"
          disabled={!store.canRedo}
          className="float-btn-sm pointer-events-auto"
          onClick={() => void store.redo()}
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {panel ? (
        <Overlay onClose={() => setPanel(null)} width="26rem">
          {panel === "search" ? (
            <SearchPanel
              store={store}
              onGoTo={(lat, lng) => {
                apiRef.current?.flyTo(lat, lng);
                apiRef.current?.showPin(lat, lng);
                setPanel(null);
              }}
            />
          ) : panel === "filter" ? (
            <FilterPanel store={store} filter={filter} setFilter={setFilter} />
          ) : (
            <OptionsPanel
              store={store}
              onClose={() => setPanel(null)}
              mapTheme={mapTheme}
              onMapThemeChange={changeMapTheme}
            />
          )}
        </Overlay>
      ) : null}

      {editing ? (
        <Overlay onClose={() => setEditing(null)} align="center" width="34rem">
          <BookmarkEditor
            bookmark={editing}
            isNew={!store.data.bookmarks.some((b) => b.id === editing.id)}
            store={store}
            onClose={() => setEditing(null)}
          />
        </Overlay>
      ) : null}

      <Toaster position="top-center" theme="dark" />
    </main>
  );
}
