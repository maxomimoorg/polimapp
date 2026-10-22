import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, SubDialog } from "./SubDialog";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import type { Category } from "@/lib/bookmarks/types";

interface Draft {
  name: string;
  color: string;
  emoji: string;
  macroId: string | null;
}

const blank: Draft = { name: "", color: "#e2b714", emoji: "", macroId: null };

function CategoryForm({
  store,
  draft,
  setDraft,
  action,
  onSubmit,
}: {
  store: BookmarkStore;
  draft: Draft;
  setDraft: (d: Draft) => void;
  action: string;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/20 p-2">
      <div className="flex items-center gap-2">
        <input
          className="panel-input mt-0 w-14 shrink-0 text-center"
          aria-label="Emoji categoria"
          placeholder="🙂"
          value={draft.emoji}
          onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
        />
        <input
          className="panel-input mt-0 flex-1"
          autoFocus
          placeholder="Nome categoria"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          type="color"
          aria-label="Colore categoria"
          className="h-11 w-12 shrink-0 rounded border border-white/25 bg-transparent"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          className="panel-input mt-0 flex-1"
          aria-label="Macro della categoria"
          value={draft.macroId ?? ""}
          onChange={(e) => setDraft({ ...draft, macroId: e.target.value || null })}
        >
          <option value="">Nessuna macro</option>
          {store.data.macros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.emoji ? `${m.emoji} ` : ""}
              {m.name}
            </option>
          ))}
        </select>
        <button type="button" className="panel-btn shrink-0" onClick={onSubmit}>
          {action}
        </button>
      </div>
    </div>
  );
}

function MacroManager({ store }: { store: BookmarkStore }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const target = store.data.macros.find((m) => m.id === confirmId);
  const linked = store.data.categories.filter((c) => c.macroId === confirmId).length;

  const save = async () => {
    if (!name.trim()) return;
    if (editId === "new") await store.addMacro(name.trim(), emoji.trim());
    else {
      const m = store.data.macros.find((x) => x.id === editId);
      if (m) await store.updateMacro({ ...m, name: name.trim(), emoji: emoji.trim() });
    }
    setEditId(null);
  };

  const form = (
    <div className="flex items-center gap-2 py-1">
      <input
        className="panel-input mt-0 w-14 shrink-0 text-center"
        aria-label="Emoji macro"
        placeholder="📁"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        className="panel-input mt-0 flex-1"
        autoFocus
        placeholder="Nome macro"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="button" className="panel-btn shrink-0" onClick={save}>
        Salva
      </button>
    </div>
  );

  return (
    <div className="mt-4 border-t border-white/15 pt-3">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-white/50">Macro</p>
      {store.data.macros.map((m) =>
        editId === m.id ? (
          <div key={m.id}>{form}</div>
        ) : (
          <div key={m.id} className="flex items-center gap-1">
            <span className="flex-1 truncate py-2 text-sm">
              {m.emoji ? `${m.emoji} ` : ""}
              {m.name}
            </span>
            <button
              type="button"
              aria-label={`Modifica macro ${m.name}`}
              className="panel-icon-btn"
              onClick={() => {
                setEditId(m.id);
                setName(m.name);
                setEmoji(m.emoji);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Elimina macro ${m.name}`}
              className="panel-icon-btn"
              onClick={() => setConfirmId(m.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      )}
      {editId === "new" ? (
        form
      ) : (
        <button
          type="button"
          className="panel-btn-ghost mt-1 w-full"
          onClick={() => {
            setEditId("new");
            setName("");
            setEmoji("");
          }}
        >
          <Plus className="h-4 w-4" /> Nuova macro
        </button>
      )}
      {target ? (
        <ConfirmDialog
          message={`Eliminare la macro «${target.name}»? ${linked ? `Le sue ${linked} categorie restano, senza macro.` : ""}`}
          onCancel={() => setConfirmId(null)}
          onConfirm={async () => {
            await store.removeMacro(target.id);
            setConfirmId(null);
          }}
        />
      ) : null}
    </div>
  );
}

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
  const { categories, macros } = store.data;
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const target = categories.find((c) => c.id === confirmId);
  const macroName = (id: string | null) => macros.find((m) => m.id === id);

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setDraft({ name: c.name, color: c.color, emoji: c.emoji, macroId: c.macroId });
    setCreating(false);
  };

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

        {categories.map((c) => {
          const m = macroName(c.macroId);
          return editId === c.id ? (
            <CategoryForm
              key={c.id}
              store={store}
              draft={draft}
              setDraft={setDraft}
              action="Salva"
              onSubmit={async () => {
                if (!draft.name.trim()) return;
                await store.updateCategory({
                  ...c,
                  ...draft,
                  name: draft.name.trim(),
                  emoji: draft.emoji.trim(),
                });
                setEditId(null);
              }}
            />
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
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.emoji ? <span>{c.emoji}</span> : null}
                <span className="flex-1 truncate text-left">
                  {c.name}
                  {m ? (
                    <span className="ml-2 text-xs text-white/50">
                      {m.emoji} {m.name}
                    </span>
                  ) : null}
                </span>
                {selectedId === c.id ? <Check className="h-4 w-4" /> : null}
              </button>
              <button
                type="button"
                aria-label={`Modifica ${c.name}`}
                className="panel-icon-btn"
                onClick={() => startEdit(c)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Elimina ${c.name}`}
                className="panel-icon-btn"
                onClick={() => setConfirmId(c.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        <MacroManager store={store} />
      </div>

      {creating ? (
        <div className="mt-3">
          <CategoryForm
            store={store}
            draft={draft}
            setDraft={setDraft}
            action="Aggiungi"
            onSubmit={async () => {
              if (!draft.name.trim()) return;
              const c = await store.addCategory(
                draft.name.trim(),
                draft.color,
                draft.emoji.trim(),
                draft.macroId,
              );
              onSelect(c.id);
              setCreating(false);
              onClose();
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className="panel-btn mt-3 w-full"
          onClick={() => {
            setEditId(null);
            setDraft(blank);
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
