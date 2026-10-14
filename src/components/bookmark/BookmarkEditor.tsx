import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PhotoEditor } from "./PhotoEditor";
import { NotesDialog } from "./NotesDialog";
import { CategoryDialog } from "./CategoryDialog";
import { TagDialog } from "./TagDialog";
import { ConfirmDialog } from "./SubDialog";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import type { Bookmark } from "@/lib/bookmarks/types";
import { priorityStyle } from "@/lib/bookmarks/priority";
import { notesPreview } from "@/lib/bookmarks/rich-text";
import { geocodeAddress, searchPlaces, UnsupportedLinkError, type PlaceResult } from "@/lib/bookmarks/geocode";

export function BookmarkEditor({
  bookmark,
  store,
  onClose,
  isNew = false,
}: {
  bookmark: Bookmark;
  store: BookmarkStore;
  onClose: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState<Bookmark>(bookmark);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [dialog, setDialog] = useState<"notes" | "category" | "tags" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { tags } = store.data;
  const photoUrl = draft.photoId ? store.photoUrls[draft.photoId] : undefined;
  const category = draft.categoryId ? store.categoriesById[draft.categoryId] : undefined;
  const ringColor = category?.color ?? "#9ca3af";
  const style = useMemo(() => priorityStyle(draft.priority), [draft.priority]);
  const selectedTags = draft.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const preview = notesPreview(draft.notes ?? "");

  useEffect(() => {
    const q = draft.address.trim();
    if (draft.locked || !editingAddress || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [draft.address, draft.locked, editingAddress]);

  // Esc chiude prima la foto ingrandita
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setLightbox(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox]);

  async function handleSave() {
    setSaving(true);
    try {
      let next = draft;
      const addressChanged = draft.address.trim() !== bookmark.address.trim();
      if (!draft.locked && addressChanged && draft.address.trim()) {
        try {
          const place = await geocodeAddress(draft.address.trim());
          if (place) next = { ...next, lat: place.lat, lng: place.lng };
          else toast.error("Indirizzo non trovato: posizione invariata");
        } catch (err) {
          toast.error(
            err instanceof UnsupportedLinkError
              ? err.message
              : "Ricerca indirizzo non disponibile: posizione invariata",
          );
        }
      }
      await store.saveBookmark(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (photoFile) {
    return (
      <PhotoEditor
        file={photoFile}
        onCancel={() => setPhotoFile(null)}
        onDone={async (blob) => {
          const id = await store.savePhoto(blob);
          setDraft((d) => ({ ...d, photoId: id }));
          setPhotoFile(null);
        }}
      />
    );
  }

  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-x-4">
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={photoUrl ? "Ingrandisci foto" : "Aggiungi foto"}
              className="block h-16 w-16 overflow-hidden rounded-full border-[3px] bg-white"
              style={{ borderColor: ringColor, opacity: style.opacity }}
              onClick={() => (photoUrl ? setLightbox(true) : fileRef.current?.click())}
            >
              {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : null}
            </button>
            <button
              type="button"
              aria-label="Modifica foto"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-black/80 text-white shadow"
              onClick={() => (draft.photoId ? setPhotoMenu((v) => !v) : fileRef.current?.click())}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {photoMenu ? (
              <div className="panel-menu absolute left-0 top-full z-20 mt-2 w-40">
                <button
                  type="button"
                  className="panel-menu-item"
                  onClick={() => {
                    setPhotoMenu(false);
                    fileRef.current?.click();
                  }}
                >
                  Cambia foto
                </button>
                <button
                  type="button"
                  className="panel-menu-item"
                  onClick={() => {
                    setDraft((d) => ({ ...d, photoId: null }));
                    setPhotoMenu(false);
                  }}
                >
                  Rimuovi foto
                </button>
              </div>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhotoFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                className="panel-input mt-0"
                autoFocus
                value={draft.name}
                placeholder="Nome del luogo"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditingName(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="w-full truncate rounded-lg px-1 py-2 text-left text-lg font-semibold text-white/90"
                onClick={() => setEditingName(true)}
              >
                {draft.name.trim() || <span className="text-white/50">Nome</span>}
              </button>
            )}
          </div>
        </div>

        <div className="panel-label">
          <span>Indirizzo</span>
          <div className="mt-1 flex items-center gap-2">
            {editingAddress && !draft.locked ? (
              <input
                className="panel-input mt-0 flex-1"
                autoFocus
                value={draft.address}
                placeholder="Via, città, coordinate o link Maps…"
                onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                onBlur={() => setTimeout(() => setEditingAddress(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditingAddress(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate rounded-lg px-1 py-2 text-left text-sm text-white/85"
                onClick={() => {
                  if (!draft.locked) setEditingAddress(true);
                }}
              >
                {draft.address.trim() || <span className="text-white/50">Posizione scelta sulla mappa</span>}
              </button>
            )}
            <button
              type="button"
              aria-label={draft.locked ? "Sblocca posizione" : "Blocca posizione"}
              aria-pressed={draft.locked}
              className="panel-icon-btn shrink-0"
              style={{ opacity: draft.locked ? 1 : 0.5 }}
              onClick={() => {
                setEditingAddress(false);
                setDraft((d) => ({ ...d, locked: !d.locked }));
              }}
            >
              {draft.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </button>
          </div>
          {editingAddress && suggestions.length > 0 ? (
            <div className="panel-menu mt-1 max-h-56 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="panel-menu-item text-xs"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDraft((d) => ({ ...d, address: s.label, lat: s.lat, lng: s.lng }));
                    setSuggestions([]);
                    setEditingAddress(false);
                  }}
                >
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="panel-label">
          <span>Note</span>
          <button type="button" className="panel-input mt-1 text-left" onClick={() => setDialog("notes")}>
            {preview ? "Modifica note" : "Aggiungi note"}
          </button>
          {preview ? <p className="mt-1 truncate px-1 text-xs text-white/70">{preview}</p> : null}
        </div>
      </div>

      <div className="min-w-0 space-y-2.5">
        <div className="panel-label">
          <span>Categoria</span>
          <button type="button" className="panel-input mt-1 flex items-center gap-2 text-left" onClick={() => setDialog("category")}>
            {category ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /> : null}
            <span className="flex-1 truncate">{category?.name ?? "Nessuna categoria"}</span>
          </button>
        </div>

        <div className="panel-label">
          <span>Priorità</span>
          <div className="relative pt-5">
            <span
              className="pointer-events-none absolute top-0 -translate-x-1/2 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-medium"
              style={{ left: `calc(${draft.priority}% + ${8 - draft.priority * 0.16}px)` }}
            >
              {draft.priority}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.priority}
              className="panel-range"
              onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="panel-label">
          <span>Tag</span>
          <button
            type="button"
            className="panel-input mt-1 flex min-h-11 flex-wrap items-center gap-1 text-left"
            onClick={() => setDialog("tags")}
          >
            {selectedTags.length > 0 ? (
              selectedTags.map((t) => (
                <span key={t.id} className="chip chip-active">
                  {t.name}
                </span>
              ))
            ) : (
              <span className="text-white/60">Nessun tag</span>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-2 sm:col-span-2">
        <button type="button" className="panel-btn flex-1" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        <button
          type="button"
          className="panel-btn-danger flex-1"
          onClick={() => {
            if (isNew) onClose();
            else setConfirmDelete(true);
          }}
        >
          {isNew ? "Annulla" : "Elimina"}
        </button>
      </div>

      {dialog === "notes" ? (
        <NotesDialog
          value={draft.notes ?? ""}
          onClose={() => setDialog(null)}
          onSave={(html) => setDraft((d) => ({ ...d, notes: html }))}
        />
      ) : null}

      {dialog === "category" ? (
        <CategoryDialog
          store={store}
          selectedId={draft.categoryId}
          onSelect={(id) => setDraft((d) => ({ ...d, categoryId: id }))}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "tags" ? (
        <TagDialog
          store={store}
          selected={draft.tags}
          onChange={(ids) => setDraft((d) => ({ ...d, tags: ids }))}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          message={`Eliminare il segnalibro${draft.name.trim() ? ` «${draft.name.trim()}»` : ""}?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await store.removeBookmark(draft.id);
            setConfirmDelete(false);
            onClose();
          }}
        />
      ) : null}

      {lightbox && photoUrl ? (
        <div
          className="fixed inset-0 z-[3000] grid place-items-center bg-black p-2"
          role="dialog"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setLightbox(false)}
        >
          <img src={photoUrl} alt={draft.name || "Foto segnalibro"} className="max-h-[92dvh] max-w-[92vw] object-contain" />
        </div>
      ) : null}
    </div>
  );
}
