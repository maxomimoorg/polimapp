import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, SubDialog } from "./SubDialog";
import type { BookmarkStore } from "@/lib/bookmarks/store";

export function CategoryDialog({
  store,
  selectedId,
  onSelect,
  onClose,
}: {
  store: BookmarkStore;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const { categories } = store.data;
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#e2b714");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const startEdit = (id: string, name: string, color: string) => {
    setEditId(id);
    setEditName(name);
    setEditColor(color);
    setCreating(false);
  };

  const target = categories.find((c) => c.id === confirmId);

  return (
    <SubDialog onClose={onClose} title="Categoria" width="32rem">
      <div className="max-h-[52dvh] space-y-1 overflow-y-auto pr-1">
        <button
          type="button"
          className="panel-menu-item w-full rounded-lg"
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          <span className="flex-1 text-left">Nessuna categoria</span>
          {selectedId === null ? <Check className="h-4 w-4" /> : null}
        </button>

        {categories.map((c) =>
          editId === c.id ? (
            <div key={c.id} className="flex items-center gap-2 py-1">
              <input className="panel-input mt-0 flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <input
                type="color"
                className="h-11 w-12 shrink-0 rounded border border-white/25 bg-transparent"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
              />
              <button
                type="button"
                className="panel-btn shrink-0"
                onClick={async () => {
                  if (!editName.trim()) return;
                  await store.updateCategory({ ...c, name: editName.trim(), color: editColor });
                  setEditId(null);
                }}
              >
                Salva
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                className="panel-menu-item flex-1 rounded-lg"
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="flex-1 truncate text-left">{c.name}</span>
                {selectedId === c.id ? <Check className="h-4 w-4" /> : null}
              </button>
              <button type="button" aria-label={`Modifica ${c.name}`} className="panel-icon-btn" onClick={() => startEdit(c.id, c.name, c.color)}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" aria-label={`Elimina ${c.name}`} className="panel-icon-btn" onClick={() => setConfirmId(c.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </div>

      {creating ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            className="panel-input mt-0 flex-1"
            autoFocus
            placeholder="Nome categoria"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <input
            type="color"
            className="h-11 w-12 shrink-0 rounded border border-white/25 bg-transparent"
            value={editColor}
            onChange={(e) => setEditColor(e.target.value)}
          />
          <button
            type="button"
            className="panel-btn shrink-0"
            onClick={async () => {
              if (!editName.trim()) return;
              const c = await store.addCategory(editName.trim(), editColor);
              onSelect(c.id);
              setCreating(false);
              onClose();
            }}
          >
            Aggiungi
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="panel-btn mt-3 w-full"
          onClick={() => {
            setEditId(null);
            setEditName("");
            setEditColor("#e2b714");
            setCreating(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nuova categoria
        </button>
      )}

      {target ? (
        <ConfirmDialog
          message={`Eliminare la categoria «${target.name}»?`}
          onCancel={() => setConfirmId(null)}
          onConfirm={async () => {
            await store.removeCategory(target.id);
            if (selectedId === target.id) onSelect(null);
            setConfirmId(null);
          }}
        />
      ) : null}
    </SubDialog>
  );
}
