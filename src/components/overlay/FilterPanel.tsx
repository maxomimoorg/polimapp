import type { BookmarkStore } from "@/lib/bookmarks/store";
import { toggleMacro, type FilterState } from "@/lib/bookmarks/filter";
import type { Category } from "@/lib/bookmarks/types";

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function FilterPanel({
  store,
  filter,
  setFilter,
}: {
  store: BookmarkStore;
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}) {
  const { categories, macros } = store.data;
  const catKeys = [...categories.map((c) => c.id), "none"];
  const tagKeys = [...store.data.tags.map((t) => t.id), "none"];
  const allCats = filter.excludedCategories.length === 0;
  const allTags = filter.excludedTags.length === 0;
  const excludedMacros = filter.excludedMacros ?? [];
  const macroIds = new Set(macros.map((m) => m.id));
  const loose = categories.filter((c) => !c.macroId || !macroIds.has(c.macroId));

  const catRow = (c: Category, dimmed = false) => (
    <label
      key={c.id}
      className={`flex items-center gap-2 py-1 text-sm ${dimmed ? "opacity-40" : ""}`}
    >
      <input
        type="checkbox"
        checked={!filter.excludedCategories.includes(c.id)}
        onChange={() =>
          setFilter({ ...filter, excludedCategories: toggle(filter.excludedCategories, c.id) })
        }
      />
      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
      {c.emoji ? <span>{c.emoji}</span> : null}
      {c.name}
    </label>
  );

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

      {macros.map((m) => {
        const off = excludedMacros.includes(m.id);
        const inMacro = categories.filter((c) => c.macroId === m.id);
        return (
          <div key={m.id} className="mt-1 rounded-md border border-white/15 px-2 py-1">
            <label className="flex items-center gap-2 py-1 text-sm font-semibold">
              <input
                type="checkbox"
                aria-label={`Mostra macro ${m.name}`}
                checked={!off}
                onChange={() => setFilter(toggleMacro(filter, m.id))}
              />
              {m.emoji ? <span>{m.emoji}</span> : null}
              {m.name}
            </label>
            <div className="pl-5">
              {inMacro.length === 0 ? (
                <p className="py-1 text-xs text-white/40">Nessuna categoria</p>
              ) : (
                inMacro.map((c) => catRow(c, off))
              )}
            </div>
          </div>
        );
      })}

      {loose.map((c) => catRow(c))}
      <label className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={!filter.excludedCategories.includes("none")}
          onChange={() =>
            setFilter({ ...filter, excludedCategories: toggle(filter.excludedCategories, "none") })
          }
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
              onClick={() =>
                setFilter({ ...filter, excludedTags: toggle(filter.excludedTags, t.id) })
              }
            >
              {t.name}
            </button>
          );
        })}
        <button
          type="button"
          className={!filter.excludedTags.includes("none") ? "chip chip-active" : "chip"}
          onClick={() =>
            setFilter({ ...filter, excludedTags: toggle(filter.excludedTags, "none") })
          }
        >
          Senza tag
        </button>
      </div>
    </div>
  );
}
