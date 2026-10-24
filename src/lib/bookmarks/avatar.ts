import type { Bookmark, Category } from "./types";

/** Contenuto visivo del cerchio di un segnalibro: foto, emoji della categoria o segnaposto neutro. */
export type BookmarkAvatar =
  | { kind: "photo"; url: string }
  | { kind: "emoji"; emoji: string }
  | { kind: "placeholder" };

/**
 * Il fallback è solo visivo: non crea né salva foto.
 * Si ricalcola a ogni render, quindi segue subito i cambi di foto, categoria o emoji.
 */
export function bookmarkAvatar(
  b: Pick<Bookmark, "photoId" | "categoryId">,
  categoriesById: Record<string, Category | undefined>,
  photoUrls: Record<string, string | undefined>,
): BookmarkAvatar {
  const url = b.photoId ? photoUrls[b.photoId] : undefined;
  if (url) return { kind: "photo", url };
  const emoji = b.categoryId ? categoriesById[b.categoryId]?.emoji?.trim() : "";
  if (emoji) return { kind: "emoji", emoji };
  return { kind: "placeholder" };
}

/** Testo sicuro da inserire in HTML (marker Leaflet). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HTML interno del cerchio per i marker (valori sempre escapati). */
export function avatarInnerHtml(a: BookmarkAvatar): string {
  if (a.kind === "photo") return `<img src="${escapeHtml(a.url)}" alt="" />`;
  if (a.kind === "emoji") return `<span class="bm-emoji" aria-hidden="true">${escapeHtml(a.emoji)}</span>`;
  return `<span class="bm-placeholder" aria-hidden="true"></span>`;
}

/** Chiave per capire quando ridisegnare il marker. */
export function avatarKey(a: BookmarkAvatar): string {
  return a.kind === "photo" ? `p:${a.url}` : a.kind === "emoji" ? `e:${a.emoji}` : "n";
}
