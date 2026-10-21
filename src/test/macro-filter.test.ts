import { describe, expect, it } from "vitest";
import { defaultFilter, matchesFilter, toggleMacro } from "@/lib/bookmarks/filter";
import { migrateBookmark, type Category } from "@/lib/bookmarks/types";

const cats: Record<string, Category> = {
  a: { id: "a", name: "A", color: "#000", emoji: "", macroId: "m1" },
  b: { id: "b", name: "B", color: "#000", emoji: "", macroId: "m1" },
  c: { id: "c", name: "C", color: "#000", emoji: "", macroId: null },
};
const bm = (categoryId: string) => migrateBookmark({ id: `x${categoryId}`, categoryId });

describe("visibilità gerarchica macro", () => {
  it("disattivare e riattivare una macro preserva le scelte per categoria", () => {
    const start = { ...defaultFilter, excludedCategories: ["b"] };
    const off = toggleMacro(start, "m1");
    expect(matchesFilter(bm("a"), off, cats)).toBe(false);
    expect(matchesFilter(bm("c"), off, cats)).toBe(true);
    expect(off.excludedCategories).toEqual(["b"]);
    const on = toggleMacro(off, "m1");
    expect(on.excludedCategories).toEqual(["b"]);
    expect(matchesFilter(bm("a"), on, cats)).toBe(true);
    expect(matchesFilter(bm("b"), on, cats)).toBe(false);
  });
});
