export const XLSX_FORMAT_VERSION = "1.0";
export const APP_VERSION = "2.1.0";

export const BOOKMARK_HEADERS = [
  "#ID",
  "Nome",
  "Foto",
  "Note",
  "Priorità",
  "Categoria",
  "Taglist",
  "Latitudine",
  "Longitudine",
  "Blocco",
  "Data Creazione",
  "Data Modifica",
] as const;

export const LEGEND_HEADERS = [
  "Macro",
  "Emoji Macro",
  "Categoria",
  "Emoji Categoria",
  "Colore Esadecimale Categoria",
] as const;

export const SHEET_BOOKMARKS = "Segnalibri";
export const SHEET_LEGEND = "Legenda";
export const SHEET_SETTINGS = "Impostazioni";

/** Lato in pixel delle foto JPG incorporate. */
export const PHOTO_PX = 96;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Note dell'app (HTML semplice) → testo leggibile in un foglio di calcolo. */
export function notesHtmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) =>
      text.replace(/<[^>]*>/g, "").trim() === href ? href : `${text} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? _m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Testo del foglio → note HTML dell'app (a capo preservati). */
export function notesTextToHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}
