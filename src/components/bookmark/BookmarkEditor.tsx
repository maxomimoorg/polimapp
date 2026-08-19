import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { PhotoEditor } from "./PhotoEditor";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import type { Bookmark } from "@/lib/bookmarks/types";
import { priorityStyle } from "@/lib/bookmarks/priority";

export function BookmarkEditor({
  bookmark,
  store,
  onClose,
}: {
  bookmark: Bookmark;
  store: BookmarkStore;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Bookmark>(bookmark);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#e2b714");
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { categories, tags } = store.data;
  const photoUrl = draft.photoId ? store.photoUrls[draft.photoId] : undefined;
  const ringColor = draft.categoryId ? (store.categoriesById[draft.categoryId]?.color ?? "#9ca3af") : "#9ca3af";
  const style = useMemo(() => priorityStyle(draft.priority), [draft.priority]);

  const selectedTags = draft.tags
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <div className="panel w-[min(92vw,22rem)] max-h-[80vh] overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide">Segnalibro</h2>
        <button type="button" aria-label="Chiudi" className="panel-icon-btn" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

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
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-[3px] bg-white"
              style={{ borderColor: ringColor, opacity: style.opacity }}
            >
              {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <button type="button" className="panel-btn-ghost" onClick={() => fileRef.current?.click()}>
                {draft.photoId ? "Cambia foto" : "Carica foto"}
              </button>
              {draft.photoId ? (
                <button
                  type="button"
                  className="panel-btn-ghost"
                  onClick={() => setDraft((d) => ({ ...d, photoId: null }))}
                >
                  Rimuovi foto
                </button>
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
          </div>

          <label className="panel-label">
            Nome
            <input
              className="panel-input"
              value={draft.name}
              placeholder="Nome del luogo"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>

          <label className="panel-label">
            Categoria
            <select
              className="panel-input"
              value={creatingCategory ? "__new" : (draft.categoryId ?? "")}
              onChange={(e) => {
                if (e.target.value === "__new") {
                  setCreatingCategory(true);
                } else {
                  setCreatingCategory(false);
                  setDraft((d) => ({ ...d, categoryId: e.target.value || null }));
                }
              }}
            >
              <option value="">Nessuna categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ Crea una categoria</option>
            </select>
          </label>

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
                className="h-9 w-10 rounded border border-white/25 bg-transparent"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
              />
              <button
                type="button"
                className="panel-btn"
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

          <label className="panel-label">
            Note
            <textarea
              className="panel-input min-h-16"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>

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
            <select
              className="panel-input"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "__new") {
                  setCreatingTag(true);
                  return;
                }
                setDraft((d) => (d.tags.includes(v) ? d : { ...d, tags: [...d.tags, v] }));
              }}
            >
              <option value="">Aggiungi tag…</option>
              {tags
                .filter((t) => !draft.tags.includes(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              <option value="__new">+ Crea un tag</option>
            </select>
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
                  className="panel-btn"
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

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="panel-btn flex-1"
              onClick={async () => {
                await store.saveBookmark(draft);
                onClose();
              }}
            >
              Salva
            </button>
            <button
              type="button"
              className="panel-btn-danger flex-1"
              onClick={async () => {
                await store.removeBookmark(draft.id);
                onClose();
              }}
            >
              Elimina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}