import { bookmarkAvatar } from "@/lib/bookmarks/avatar";
import { BookmarkAvatarContent } from "@/components/bookmark/BookmarkAvatar";
import { useEffect, useState } from "react";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import { searchPlaces, LocationInputError, type PlaceResult } from "@/lib/bookmarks/geocode";

export function SearchPanel({
  store,
  onGoTo,
}: {
  store: BookmarkStore;
  onGoTo: (lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      return;
    }
    setOffline(false);
    setNotice(null);
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setLoading(true);
      // coordinate, Plus Code e URL completi sono riconosciuti localmente; le città richiedono la rete
      searchPlaces(q, ctrl.signal)
        .then(setPlaces)
        .catch((err: unknown) => {
          setPlaces([]);
          if (err instanceof LocationInputError) setNotice(err.message);
          else if (typeof navigator !== "undefined" && !navigator.onLine) setOffline(true);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  const matches = query.trim()
    ? store.data.bookmarks.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide">Cerca</h2>
      <input
        autoFocus
        className="panel-input"
        placeholder="Segnalibro, città o coordinate…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-white/50">Segnalibri</p>
          {matches.length === 0 ? (
            <p className="text-xs text-white/50">Nessun segnalibro corrispondente.</p>
          ) : (
            <ul className="space-y-1">
              {matches.map((b) => {
                const avatar = bookmarkAvatar(b, store.categoriesById, store.photoUrls);
                const color = b.categoryId
                  ? (store.categoriesById[b.categoryId]?.color ?? "#9ca3af")
                  : "#9ca3af";
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10"
                      onClick={() => onGoTo(b.lat, b.lng)}
                    >
                      <span
                        className="h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 bg-white"
                        style={{ borderColor: color }}
                      >
                        <BookmarkAvatarContent avatar={avatar} size="sm" />
                      </span>
                      <span className="truncate">{b.name || "Senza nome"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-white/50">Città e luoghi</p>
          {notice ? (
            <p className="text-xs text-amber-200/90">{notice}</p>
          ) : offline ? (
            <p className="text-xs text-white/50">
              La ricerca di città richiede la connessione. Offline funzionano coordinate e Plus
              Code.
            </p>
          ) : loading ? (
            <p className="text-xs text-white/50">Ricerca in corso…</p>
          ) : places.length === 0 ? (
            <p className="text-xs text-white/50">Digita almeno 2 caratteri.</p>
          ) : (
            <ul className="space-y-1">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
                    onClick={() => onGoTo(p.lat, p.lng)}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
