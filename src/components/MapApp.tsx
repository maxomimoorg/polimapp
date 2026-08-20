import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, Settings, Undo2, Redo2 } from "lucide-react";
import { Toaster } from "sonner";
import { useBookmarkStore } from "@/lib/bookmarks/store";
import { defaultFilter, matchesFilter, type FilterState } from "@/lib/bookmarks/filter";
import { uid, type Bookmark } from "@/lib/bookmarks/types";
import { reverseGeocode } from "@/lib/bookmarks/geocode";
import { BookmarkEditor } from "@/components/bookmark/BookmarkEditor";
import { SearchPanel } from "@/components/overlay/SearchPanel";
import { FilterPanel } from "@/components/overlay/FilterPanel";
import { OptionsPanel } from "@/components/overlay/OptionsPanel";
import type { MapApi } from "@/components/map/MapView";

const MapView = lazy(() => import("@/components/map/MapView"));

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/45 sm:items-center"
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

/** Suggerimento in basso a destra: sbiadisce dopo 8 s, torna visibile al tocco o al passaggio del mouse. */
function HintTip() {
  const [faded, setFaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    setFaded(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFaded(true), 8000);
  }, []);

  useEffect(() => {
    arm();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [arm]);

  return (
    <p
      className={`absolute bottom-3 right-3 z-[1200] hidden max-w-[16rem] rounded-md bg-black/60 px-2 py-1 text-right text-[11px] leading-tight text-white/80 transition-opacity duration-700 sm:block ${
        faded ? "opacity-10" : "opacity-100"
      }`}
      onPointerEnter={() => setFaded(false)}
      onPointerLeave={arm}
      onPointerDown={arm}
    >
      Clic destro o pressione di 1 secondo su uno spazio libero: nuovo segnalibro. Tocca un marker per
      modificarlo, tienilo premuto 1,2 secondi per spostarlo.
    </p>
  );
}

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
      let address = b.address;
      try {
        address = (await reverseGeocode(lat, lng)) ?? b.address;
      } catch {
        /* offline: mantiene l'indirizzo precedente */
      }
      await store.saveBookmark({ ...b, lat, lng, address });
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
            onClick={() => setPanel((p) => (p === kind ? null : kind))}
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
                setPanel(null);
              }}
            />
          ) : panel === "filter" ? (
            <FilterPanel store={store} filter={filter} setFilter={setFilter} />
          ) : (
            <OptionsPanel store={store} onClose={() => setPanel(null)} />
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

      <HintTip />
      <Toaster position="top-center" theme="dark" />
    </main>
  );
}
