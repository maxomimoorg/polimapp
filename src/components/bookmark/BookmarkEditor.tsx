import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Lock, LockOpen, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PhotoEditor } from "./PhotoEditor";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import type { Bookmark } from "@/lib/bookmarks/types";
import { priorityStyle } from "@/lib/bookmarks/priority";
import { geocodeAddress, searchPlaces, type PlaceResult } from "@/lib/bookmarks/geocode";

function EditRow({
  name,
  color,
  onSave,
  onCancel,
}: {
  name: string;
  color?: string;
  onSave: (name: string, color?: string) => void;
  onCancel: () => void;
}) {
  const [n, setN] = useState(name);
  const [c, setC] = useState(color ?? "#e2b714");
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <input className="panel-input mt-0 flex-1" value={n} onChange={(e) => setN(e.target.value)} />
      {color !== undefined ? (
        <input
          type="color"
          className="h-10 w-11 shrink-0 rounded border border-white/25 bg-transparent"
          value={c}
          onChange={(e) => setC(e.target.value)}
        />
      ) : null}
      <button
        type="button"
        className="panel-btn shrink-0"
        onClick={() => {
          if (!n.trim()) return;
          onSave(n.trim(), color !== undefined ? c : undefined);
        }}
      >
        Salva
      </button>
      <button type="button" className="panel-icon-btn shrink-0" aria-label="Annulla" onClick={onCancel}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

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
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#e2b714");
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editTagId, setEditTagId] = useState<string | null>(null);
  const [confirmCatId, setConfirmCatId] = useState<string | null>(null);
  const [confirmTagId, setConfirmTagId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [addrFocused, setAddrFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { categories, tags } = store.data;
  const photoUrl = draft.photoId ? store.photoUrls[draft.photoId] : undefined;
  const ringColor = draft.categoryId ? (store.categoriesById[draft.categoryId]?.color ?? "#9ca3af") : "#9ca3af";
  const style = useMemo(() => priorityStyle(draft.priority), [draft.priority]);

  const selectedTags = draft.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  useEffect(() => {
    const q = draft.address.trim();
    if (draft.locked || !addrFocused || q.length < 2) {
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
  }, [draft.address, draft.locked, addrFocused]);

  async function handleSave() {
    setSaving(true);
    try {
      let next = draft;
      const addressChanged = draft.address.trim() !== bookmark.address.trim();
      if (!draft.locked && addressChanged && draft.address.trim()) {
        try {
          const place = await geocodeAddress(draft.address.trim());
          if (place) {
            next = { ...next, lat: place.lat, lng: place.lng };
          } else {
            toast.error("Indirizzo non trovato: posizione invariata");
          }
        } catch {
          toast.error("Ricerca indirizzo non disponibile: posizione invariata");
        }
      }
      await store.saveBookmark(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {photoFile ? (
        <PhotoEditor
          file={photoFile}
          onCancel={() => setPhotoFile(null)}
          onDone={async (blob) => {
            const id = await store.savePhoto(blob);
            setDraft((d) => ({ ...d, photoId: id }));
            setPhotoFile(null);
          }}
        />
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-x-4">
          <div className="min-w-0 space-y-2.5">
            <div className="flex items-start gap-3">
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
              <label className="panel-label flex-1">
                Nome
                <input
                  className="panel-input"
                  value={draft.name}
                  placeholder="Nome del luogo"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
            </div>

            <div className="panel-label">
              Indirizzo
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="panel-input mt-0 flex-1"
                  value={draft.address}
                  readOnly={draft.locked}
                  placeholder="Via, città…"
                  onFocus={() => setAddrFocused(true)}
                  onBlur={() => setTimeout(() => setAddrFocused(false), 150)}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                />
                <button
                  type="button"
                  aria-label={draft.locked ? "Sblocca posizione" : "Blocca posizione"}
                  aria-pressed={draft.locked}
                  className="panel-icon-btn shrink-0"
                  style={{ opacity: draft.locked ? 1 : 0.5 }}
                  onClick={() => setDraft((d) => ({ ...d, locked: !d.locked }))}
                >
                  {draft.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                </button>
              </div>
              {addrFocused && suggestions.length > 0 ? (
                <div className="panel-menu mt-1 max-h-56 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="panel-menu-item text-xs"
                      onClick={() => {
                        setDraft((d) => ({ ...d, address: s.label, lat: s.lat, lng: s.lng }));
                        setSuggestions([]);
                        setAddrFocused(false);
                      }}
                    >
                      <span className="truncate">{s.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-1 text-[11px] text-white/50">
                {draft.locked
                  ? "Posizione bloccata: il marker non può essere spostato."
                  : "Salvando, il marker si sposta all'indirizzo indicato."}
              </p>
            </div>

            <label className="panel-label">
              Note
              <textarea
                className="panel-input min-h-16"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </label>
          </div>

          <div className="min-w-0 space-y-2.5">
            <div className="panel-label">
              Categoria
              <button
                type="button"
                className="panel-input flex items-center gap-2 text-left"
                onClick={() => setCatOpen((v) => !v)}
              >
                {draft.categoryId ? (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: store.categoriesById[draft.categoryId]?.color ?? "#9ca3af" }}
                  />
                ) : null}
                <span className="flex-1 truncate">
                  {draft.categoryId ? (store.categoriesById[draft.categoryId]?.name ?? "—") : "Nessuna categoria"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </button>
              {catOpen ? (
                <div className="panel-menu mt-1 max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    className="panel-menu-item"
                    onClick={() => {
                      setDraft((d) => ({ ...d, categoryId: null }));
                      setCatOpen(false);
                    }}
                  >
                    Nessuna categoria
                  </button>
                  {categories.map((c) =>
                    editCatId === c.id ? (
                      <EditRow
                        key={c.id}
                        name={c.name}
                        color={c.color}
                        onCancel={() => setEditCatId(null)}
                        onSave={async (name, color) => {
                          await store.updateCategory({ ...c, name, color: color ?? c.color });
                          setEditCatId(null);
                        }}
                      />
                    ) : confirmCatId === c.id ? (
                      <div key={c.id} className="flex items-center gap-2 px-2 py-2 text-xs">
                        <span className="flex-1 truncate">Eliminare «{c.name}»?</span>
                        <button
                          type="button"
                          className="panel-btn-danger"
                          onClick={async () => {
                            await store.removeCategory(c.id);
                            setDraft((d) => (d.categoryId === c.id ? { ...d, categoryId: null } : d));
                            setConfirmCatId(null);
                          }}
                        >
                          Elimina
                        </button>
                        <button type="button" className="panel-btn-ghost" onClick={() => setConfirmCatId(null)}>
                          No
                        </button>
                      </div>
                    ) : (
                      <div key={c.id} className="flex items-center">
                        <button
                          type="button"
                          className="panel-menu-item flex-1"
                          onClick={() => {
                            setDraft((d) => ({ ...d, categoryId: c.id }));
                            setCatOpen(false);
                          }}
                        >
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="truncate">{c.name}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Modifica ${c.name}`}
                          className="px-3 py-3 text-white/70"
                          onClick={() => setEditCatId(c.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Elimina ${c.name}`}
                          className="px-3 py-3 text-white/70"
                          onClick={() => setConfirmCatId(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ),
                  )}
                  <button
                    type="button"
                    className="panel-menu-item border-t border-white/10"
                    onClick={() => {
                      setCreatingCategory(true);
                      setCatOpen(false);
                    }}
                  >
                    + Crea una categoria
                  </button>
                </div>
              ) : null}
            </div>

            {creatingCategory ? (
              <div className="flex items-end gap-2">
                <input
                  className="panel-input flex-1"
                  placeholder="Nome categoria"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <input
                  type="color"
                  className="h-11 w-12 shrink-0 rounded border border-white/25 bg-transparent"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                />
                <button
                  type="button"
                  className="panel-btn shrink-0"
                  onClick={async () => {
                    if (!newCatName.trim()) return;
                    const c = await store.addCategory(newCatName.trim(), newCatColor);
                    setDraft((d) => ({ ...d, categoryId: c.id }));
                    setNewCatName("");
                    setCreatingCategory(false);
                  }}
                >
                  Aggiungi
                </button>
              </div>
            ) : null}

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
              {selectedTags.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {selectedTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="chip"
                      onClick={() => setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t.id) }))}
                    >
                      {t.name} <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="panel-input flex items-center gap-2 text-left"
                onClick={() => setTagOpen((v) => !v)}
              >
                <span className="flex-1">Aggiungi tag…</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </button>
              {tagOpen ? (
                <div className="panel-menu mt-1 max-h-56 overflow-y-auto">
                  {tags.map((t) =>
                    editTagId === t.id ? (
                      <EditRow
                        key={t.id}
                        name={t.name}
                        onCancel={() => setEditTagId(null)}
                        onSave={async (name) => {
                          await store.updateTag({ ...t, name });
                          setEditTagId(null);
                        }}
                      />
                    ) : confirmTagId === t.id ? (
                      <div key={t.id} className="flex items-center gap-2 px-2 py-2 text-xs">
                        <span className="flex-1 truncate">Eliminare «{t.name}»?</span>
                        <button
                          type="button"
                          className="panel-btn-danger"
                          onClick={async () => {
                            await store.removeTag(t.id);
                            setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t.id) }));
                            setConfirmTagId(null);
                          }}
                        >
                          Elimina
                        </button>
                        <button type="button" className="panel-btn-ghost" onClick={() => setConfirmTagId(null)}>
                          No
                        </button>
                      </div>
                    ) : (
                      <div key={t.id} className="flex items-center">
                        <button
                          type="button"
                          className="panel-menu-item flex-1"
                          disabled={draft.tags.includes(t.id)}
                          onClick={() => {
                            setDraft((d) => (d.tags.includes(t.id) ? d : { ...d, tags: [...d.tags, t.id] }));
                            setTagOpen(false);
                          }}
                        >
                          <span className={draft.tags.includes(t.id) ? "truncate opacity-40" : "truncate"}>
                            {t.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Modifica ${t.name}`}
                          className="px-3 py-3 text-white/70"
                          onClick={() => setEditTagId(t.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Elimina ${t.name}`}
                          className="px-3 py-3 text-white/70"
                          onClick={() => setConfirmTagId(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ),
                  )}
                  <button
                    type="button"
                    className="panel-menu-item border-t border-white/10"
                    onClick={() => {
                      setCreatingTag(true);
                      setTagOpen(false);
                    }}
                  >
                    + Crea un tag
                  </button>
                </div>
              ) : null}
              {creatingTag ? (
                <div className="mt-2 flex gap-2">
                  <input
                    className="panel-input flex-1"
                    placeholder="Nome tag"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="panel-btn shrink-0"
                    onClick={async () => {
                      if (!newTagName.trim()) return;
                      const t = await store.addTag(newTagName.trim());
                      setDraft((d) => ({ ...d, tags: [...d.tags, t.id] }));
                      setNewTagName("");
                      setCreatingTag(false);
                    }}
                  >
                    Aggiungi
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-1 flex gap-2 bg-black/60 px-1 pb-1 pt-2 backdrop-blur sm:col-span-2 sm:static sm:bg-transparent sm:backdrop-blur-none">
            <button type="button" className="panel-btn flex-1" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Salvataggio…" : "Salva"}
            </button>
            <button
              type="button"
              className="panel-btn-danger flex-1"
              onClick={async () => {
                if (!isNew) await store.removeBookmark(draft.id);
                onClose();
              }}
            >
              {isNew ? "Annulla" : "Elimina"}
            </button>
          </div>

          {lightbox && photoUrl ? (
            <div
              className="fixed inset-0 z-[3000] grid place-items-center bg-black p-2"
              role="dialog"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setLightbox(false)}
            >
              <img
                src={photoUrl}
                alt={draft.name || "Foto segnalibro"}
                className="max-h-[92dvh] max-w-[92vw] object-contain"
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
