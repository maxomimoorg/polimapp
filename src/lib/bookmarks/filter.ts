import type { Bookmark } from "./types";

export interface FilterState {
  excludedCategories: string[]; // category ids ("none" = senza categoria)
  excludedTags: string[]; // tag ids ("none" = senza tag)
  priority: number;
  priorityMode: "gt" | "lt";
}

export const defaultFilter: FilterState = {
  excludedCategories: [],
  excludedTags: [],
  priority: 0,
  priorityMode: "gt",
};

export function matchesFilter(b: Bookmark, f: FilterState): boolean {
  const catKey = b.categoryId ?? "none";
  if (f.excludedCategories.includes(catKey)) return false;

  if (b.tags.length === 0) {
    if (f.excludedTags.includes("none")) return false;
  } else if (b.tags.every((t) => f.excludedTags.includes(t))) {
    return false;
  }

  if (f.priorityMode === "gt" && b.priority < f.priority) return false;
  if (f.priorityMode === "lt" && b.priority > f.priority) return false;
  return true;
}