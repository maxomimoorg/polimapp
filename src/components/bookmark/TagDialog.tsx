import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, SubDialog } from "./SubDialog";
import type { BookmarkStore } from "@/lib/bookmarks/store";

/** Nuvola di tag: selezione, creazione, modalità eliminazione, rinomina con pressione lunga. */
export function TagDialog({
  store,
  selected,
  onChange,
  onClose,
}: {
  store: BookmarkStore;
  selected: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { tags } = store.data;
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const pressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longRef = useRef(false);

  const ordered = [...tags].sort((a, b) => {
    const sa = selected.includes(a.id) ? 0 : 1;
    const sb = selected.includes(b.id) ? 0 : 1;
    return sa - sb || a.name.localeCompare(b.name);
  });

  const startRef = useRef({ x: 0, y: 0 });

  const startPress = (id: string, name: string, e: React.PointerEvent) => {
    longRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    // su Android il tocco lungo attiva selezione testo/menu di sistema: lo blocchiamo
    if (e.pointerType !== "mouse") {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* cattura non disponibile: la pressione lunga funziona comunque */
      }
    }
    if (pressRef.current) clearTimeout(pressRef.current);
    pressRef.current = setTimeout(() => {
      longRef.current = true;
      if (navigator.vibrate) navigator.vibrate(25);
      setRenameId(id);
      setRenameValue(name);
    }, 700);
  };
  const movePress = (e: React.PointerEvent) => {
    if (!pressRef.current) return;
    if (Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > 12) endPress();
  };
  const endPress = () => {
    if (pressRef.current) clearTimeout(pressRef.current);
    pressRef.current = null;
  };


  const target = tags.find((t) => t.id === confirmId);
  const renaming = tags.find((t) => t.id === renameId);

  return (
    <SubDialog onClose={onClose} title="Tag" width="34rem">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          aria-label="Nuovo tag"
          className="panel-icon-btn"
          onClick={() => {
            setDeleteMode(false);
            setCreating((v) => !v);
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Elimina tag"
          aria-pressed={deleteMode}
          className="panel-icon-btn"
          style={{ opacity: deleteMode ? 1 : 0.5 }}
          onClick={() => {
            setCreating(false);
            setDeleteMode((v) => !v);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {deleteMode ? <span className="self-center text-xs text-white/70">Tocca un tag per eliminarlo</span> : null}
      </div>

      {creating ? (
        <div className="mb-3 flex gap-2">
          <input
            className="panel-input mt-0 flex-1"
            autoFocus
            placeholder="Nome tag"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="button"
            className="panel-btn shrink-0"
            onClick={async () => {
              if (!newName.trim()) return;
              const t = await store.addTag(newName.trim());
              onChange([...selected, t.id]);
              setNewName("");
              setCreating(false);
            }}
          >
            Aggiungi
          </button>
        </div>
      ) : null}

      <div className="flex max-h-[46dvh] flex-wrap gap-2 overflow-y-auto">
        {ordered.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={on ? "chip chip-active" : "chip"}
              style={{ opacity: on ? 1 : 0.75, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => startPress(t.id, t.name, e)}
              onPointerMove={movePress}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onClick={() => {
                if (longRef.current) return;
                if (deleteMode) {
                  setConfirmId(t.id);
                  return;
                }
                onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id]);
              }}
            >
              {t.name}
            </button>
          );
        })}
        {ordered.length === 0 ? <p className="text-sm text-white/60">Nessun tag: creane uno con +.</p> : null}
      </div>

      <button type="button" className="panel-btn mt-4 w-full" onClick={onClose}>
        Fatto
      </button>

      {renaming ? (
        <SubDialog onClose={() => setRenameId(null)} title="Rinomina tag" width="22rem">
          <input className="panel-input mt-0" autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="panel-btn flex-1"
              onClick={async () => {
                if (!renameValue.trim()) return;
                await store.updateTag({ ...renaming, name: renameValue.trim() });
                setRenameId(null);
              }}
            >
              Salva
            </button>
            <button type="button" className="panel-btn-ghost flex-1" onClick={() => setRenameId(null)}>
              Annulla
            </button>
          </div>
        </SubDialog>
      ) : null}

      {target ? (
        <ConfirmDialog
          message={`Eliminare il tag «${target.name}»?`}
          onCancel={() => setConfirmId(null)}
          onConfirm={async () => {
            await store.removeTag(target.id);
            onChange(selected.filter((x) => x !== target.id));
            setConfirmId(null);
          }}
        />
      ) : null}
    </SubDialog>
  );
}
