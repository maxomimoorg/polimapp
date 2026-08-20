import { X } from "lucide-react";
import type { BookmarkStore } from "@/lib/bookmarks/store";
import type { FilterState } from "@/lib/bookmarks/filter";

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function FilterPanel({
  store,
  filter,
  setFilter,
  onClose,
}: {
  store: BookmarkStore;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  onClose: () => void;
}) {
  const catKeys = [...store.data.categories.map((c) => c.id), "none"];
  const tagKeys = [...store.data.tags.map((t) => t.id), "none"];
  const allCats = filter.excludedCategories.length === 0;
  const allTags = filter.excludedTags.length === 0;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide">Filtro</h2>

      <p className="mb-1 text-[11px] uppercase tracking-wide text-white/50">Categorie</p>
      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={allCats}
          onChange={() => setFilter({ ...filter, excludedCategories: allCats ? catKeys : [] })}
        />
        Tutte / nessuna
      </label>
      {store.data.categories.map((c) => (
        <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={!filter.excludedCategories.includes(c.id)}
            onChange={() => setFilter({ ...filter, excludedCategories: toggle(filter.excludedCategories, c.id) })}
          />
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
          {c.name}
        </label>
      ))}
      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={!filter.excludedCategories.includes("none")}
          onChange={() => setFilter({ ...filter, excludedCategories: toggle(filter.excludedCategories, "none") })}
        />
        Senza categoria
      </label>

      <p className="mb-1 mt-4 text-[11px] uppercase tracking-wide text-white/50">Priorità</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={filter.priorityMode === "gt" ? "panel-btn px-3" : "panel-btn-ghost px-3"}
          onClick={() => setFilter({ ...filter, priorityMode: "gt" })}
        >
          &gt;
        </button>
        <button
          type="button"
          className={filter.priorityMode === "lt" ? "panel-btn px-3" : "panel-btn-ghost px-3"}
          onClick={() => setFilter({ ...filter, priorityMode: "lt" })}
        >
          &lt;
        </button>
        <span className="ml-auto text-sm">{filter.priority}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={filter.priority}
        className="panel-range mt-2"
        onChange={(e) => setFilter({ ...filter, priority: Number(e.target.value) })}
      />

      <p className="mb-1 mt-4 text-[11px] uppercase tracking-wide text-white/50">Tag</p>
      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={allTags}
          onChange={() => setFilter({ ...filter, excludedTags: allTags ? tagKeys : [] })}
        />
        Tutti / nessuno
      </label>
      <div className="mt-1 flex flex-wrap gap-1">
        {store.data.tags.map((t) => {
          const active = !filter.excludedTags.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={active ? "chip chip-active" : "chip"}
              onClick={() => setFilter({ ...filter, excludedTags: toggle(filter.excludedTags, t.id) })}
            >
              {t.name}
            </button>
          );
        })}
        <button
          type="button"
          className={!filter.excludedTags.includes("none") ? "chip chip-active" : "chip"}
          onClick={() => setFilter({ ...filter, excludedTags: toggle(filter.excludedTags, "none") })}
        >
          Senza tag
        </button>
      </div>
    </div>
  );
}