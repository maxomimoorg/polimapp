import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { avatarInnerHtml, bookmarkAvatar } from "@/lib/bookmarks/avatar";
import { BookmarkAvatarContent } from "@/components/bookmark/BookmarkAvatar";
import { migrateBookmark, type Category } from "@/lib/bookmarks/types";
import { parseZipBackup } from "@/lib/bookmarks/backup";
import { strToU8, zipSync } from "fflate";

const cats: Record<string, Category> = {
  food: { id: "food", name: "Cibo", color: "#f00", emoji: "🍕", macroId: null },
  art: { id: "art", name: "Arte", color: "#0f0", emoji: "🎨", macroId: null },
  none: { id: "none", name: "Varie", color: "#00f", emoji: "", macroId: null },
};

describe("fallback emoji quando manca la foto", () => {
  it("segnalibro appena creato senza foto mostra l'emoji della categoria", () => {
    const b = migrateBookmark({ id: "a", categoryId: "food", photoId: null });
    expect(bookmarkAvatar(b, cats, {})).toEqual({ kind: "emoji", emoji: "🍕" });
    const { getByTestId } = render(<BookmarkAvatarContent avatar={bookmarkAvatar(b, cats, {})} />);
    expect(getByTestId("avatar-emoji").textContent).toBe("🍕");
  });

  it("categoria senza emoji o senza categoria: segnaposto neutro", () => {
    expect(bookmarkAvatar(migrateBookmark({ id: "a", categoryId: "none" }), cats, {}).kind).toBe(
      "placeholder",
    );
    expect(bookmarkAvatar(migrateBookmark({ id: "a", categoryId: null }), cats, {}).kind).toBe(
      "placeholder",
    );
  });

  it("cambio categoria aggiorna l'emoji", () => {
    const b = migrateBookmark({ id: "a", categoryId: "food" });
    expect(bookmarkAvatar({ ...b, categoryId: "art" }, cats, {})).toEqual({
      kind: "emoji",
      emoji: "🎨",
    });
    const edited = { ...cats, art: { ...cats["art"]!, emoji: "🖼️" } };
    expect(bookmarkAvatar({ ...b, categoryId: "art" }, edited, {})).toEqual({
      kind: "emoji",
      emoji: "🖼️",
    });
  });

  it("aggiungere una foto sostituisce l'emoji, rimuoverla la fa riapparire", () => {
    const b = migrateBookmark({ id: "a", categoryId: "food" });
    const withPhoto = { ...b, photoId: "p1" };
    expect(bookmarkAvatar(withPhoto, cats, { p1: "blob:x" })).toEqual({
      kind: "photo",
      url: "blob:x",
    });
    expect(bookmarkAvatar({ ...withPhoto, photoId: null }, cats, { p1: "blob:x" }).kind).toBe(
      "emoji",
    );
    // foto mancante/illeggibile (nessun URL disponibile) → emoji
    expect(bookmarkAvatar(withPhoto, cats, {}).kind).toBe("emoji");
  });

  it("l'emoji nel marker è testo escapato", () => {
    const html = avatarInnerHtml({ kind: "emoji", emoji: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("importazione ZIP senza foto: nessuna foto finta, si usa l'emoji", async () => {
    const data = {
      bookmarks: [{ id: "abcdefghij12", name: "X", lat: 1, lng: 2, categoryId: "food", photoId: null }],
      categories: [cats["food"]],
      tags: [],
      macros: [],
    };
    const zip = zipSync({ "data.json": strToU8(JSON.stringify(data)) });
    const inc = await parseZipBackup(new Blob([zip as BlobPart]), async (b) => b);
    expect(inc.bookmarks[0]!.photo).toBeNull();
    expect(bookmarkAvatar({ photoId: null, categoryId: "food" }, cats, {}).kind).toBe("emoji");
  });
});
