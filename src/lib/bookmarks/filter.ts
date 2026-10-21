import type { Bookmark, Category } from "./types";

export interface FilterState {
  excludedCategories: string[]; // category ids ("none" = senza categoria)
  excludedTags: string[]; // tag ids ("none" = senza tag)
  /** Macro disattivate: nascondono le loro categorie senza toccare excludedCategories. */
  excludedMacros: string[];
  priority: number;
  priorityMode: "gt" | "lt";
}

export const defaultFilter: FilterState = {
  excludedCategories: [],
  excludedTags: [],
  excludedMacros: [],
  priority: 0,
  priorityMode: "gt",
};

const STORAGE_KEY = "mapp.filter.v1";

/** Ultimo filtro usato, salvato sul dispositivo. */
export function loadFilter(): FilterState {
  if (typeof window === "undefined") return defaultFilter;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultFilter;
    const p = JSON.parse(raw) as Partial<FilterState>;
    return {
      excludedCategories: Array.isArray(p.excludedCategories) ? p.excludedCategories.map(String) : [],
      excludedTags: Array.isArray(p.excludedTags) ? p.excludedTags.map(String) : [],
      excludedMacros: Array.isArray(p.excludedMacros) ? p.excludedMacros.map(String) : [],
      priority: typeof p.priority === "number" ? p.priority : defaultFilter.priority,
      priorityMode: p.priorityMode === "lt" ? "lt" : "gt",
    };
  } catch {
    return defaultFilter;
  }
}

export function saveFilter(f: FilterState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* storage non disponibile */
  }
}

export function matchesFilter(
  b: Bookmark,
  f: FilterState,
  categoriesById: Record<string, Category | undefined> = {},
): boolean {
  const catKey = b.categoryId ?? "none";
  if (f.excludedCategories.includes(catKey)) return false;
  const macroId = b.categoryId ? categoriesById[b.categoryId]?.macroId : null;
  if (macroId && (f.excludedMacros ?? []).includes(macroId)) return false;

  if (b.tags.length === 0) {
    if (f.excludedTags.includes("none")) return false;
  } else if (b.tags.every((t) => f.excludedTags.includes(t))) {
    return false;
  }

  if (f.priorityMode === "gt" && b.priority < f.priority) return false;
  if (f.priorityMode === "lt" && b.priority > f.priority) return false;
  return true;
}