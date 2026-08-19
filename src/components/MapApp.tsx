import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, Settings } from "lucide-react";
import { Toaster } from "sonner";
import { useBookmarkStore } from "@/lib/bookmarks/store";
import { defaultFilter, matchesFilter, type FilterState } from "@/lib/bookmarks/filter";
import { uid, type Bookmark } from "@/lib/bookmarks/types";
import { BookmarkEditor } from "@/components/bookmark/BookmarkEditor";
import { SearchPanel } from "@/components/overlay/SearchPanel";
import { FilterPanel } from "@/components/overlay/FilterPanel";
import { OptionsPanel } from "@/components/overlay/OptionsPanel";
import type { MapApi } from "@/components/map/MapView";

const MapView = lazy(() => import("@/components/map/MapView"));

type PanelKind = "search" | "filter" | "options" | null;

export default function MapApp() {
  const store = useBookmarkStore();
  const [filter, setFilter] = useState<FilterState>(defaultFilter);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const apiRef = useRef<MapApi | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const visible = useMemo(
    () => store.data.bookmarks.filter((b) => matchesFilter(b, filter)),
    [store.data.bookmarks, filter],
  );

  const colorOf = useCallback(
    (b: Bookmark) => (b.categoryId ? (store.categoriesById[b.categoryId]?.color ?? "#9ca3af") : "#9ca3af"),
    [store.categoriesById],
  );

  const handleCreate = useCallback(
    async (lat: number, lng: number) => {
      const b: Bookmark = {
        id: uid(),
        name: "",
        lat,
        lng,
        categoryId: null,
        notes: "",
        priority: 50,
        tags: [],
        photoId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const saved = await store.saveBookmark(b);
      setPanel(null);
      setEditing(saved);
    },
    [store],
  );

  const handleMove = useCallback(
    async (id: string, lat: number, lng: number) => {
      const b = store.data.bookmarks.find((x) => x.id === id);
      if (b) await store.saveBookmark({ ...b, lat, lng });
    },
    [store],
  );

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black">
      <h1 className="sr-only">Mappa Segnalibri</h1>
      <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-white/60">Caricamento mappa…</div>}>
        <MapView
          bookmarks={visible}
          photoUrls={store.photoUrls}
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

      <div className="pointer-events-none absolute bottom-4 left-4 z-[1200] flex flex-col gap-2">
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
            onClick={() => setPanel((p) => (p === kind ? null : kind))}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {panel ? (
        <div className="absolute bottom-4 left-20 z-[1300]">
          {panel === "search" ? (
            <SearchPanel
              store={store}
              onClose={() => setPanel(null)}
              onGoTo={(lat, lng) => {
                apiRef.current?.flyTo(lat, lng);
                setPanel(null);
              }}
            />
          ) : panel === "filter" ? (
            <FilterPanel store={store} filter={filter} setFilter={setFilter} onClose={() => setPanel(null)} />
          ) : (
            <OptionsPanel store={store} onClose={() => setPanel(null)} />
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="absolute inset-0 z-[2000] grid place-items-center bg-black/30 p-4">
          <BookmarkEditor bookmark={editing} store={store} onClose={() => setEditing(null)} />
        </div>
      ) : null}

      <p className="pointer-events-none absolute bottom-3 right-3 z-[1200] max-w-[16rem] rounded-md bg-black/60 px-2 py-1 text-right text-[11px] leading-tight text-white/80">
        Doppio clic, clic destro o pressione prolungata sulla mappa: nuovo segnalibro. Tocca un marker per
        modificarlo, tienilo premuto 2 secondi per spostarlo.
      </p>
      <Toaster position="top-center" theme="dark" />
    </main>
  );
}