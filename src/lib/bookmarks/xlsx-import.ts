import type ExcelJS from "exceljs";
import { readCellImages } from "./xlsx-cell-images";
import { emptySummary, normName, type IncomingBackup, type IncomingBookmark } from "./merge";
import { browserJpegNormalizer, type JpegNormalizer } from "./photo-format";
import type { Category, Macro, Tag } from "./types";
import { SHEET_BOOKMARKS, SHEET_LEGEND, notesTextToHtml } from "./xlsx-common";
import type { Progress } from "./xlsx-export";

type Cell = ExcelJS.CellValue | undefined;

/** Valore testuale di una cella, qualunque sia il suo tipo (rich text, link, formula…). */
export function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o["richText"]))
      return (o["richText"] as Array<{ text: string }>).map((t) => t.text).join("");
    if ("result" in o) return cellText(o["result"] as Cell);
    if ("text" in o) return cellText(o["text"] as Cell);
    if ("error" in o) return "";
  }
  return "";
}

function cellPrimitive(v: Cell): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return cellPrimitive(o["result"] as Cell);
    return cellText(v);
  }
  return v;
}

export function parseNumber(v: Cell): number | null {
  const p = cellPrimitive(v);
  if (typeof p === "number") return Number.isFinite(p) ? p : null;
  if (typeof p === "string") {
    const s = p.trim().replace(/\s/g, "");
    if (!s) return null;
    const norm = /^-?\d+,\d+$/.test(s) ? s.replace(",", ".") : s;
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseBool(v: Cell): boolean | null {
  const p = cellPrimitive(v);
  if (typeof p === "boolean") return p;
  if (typeof p === "number") return p === 1 ? true : p === 0 ? false : null;
  if (typeof p === "string") {
    const s = p.trim().toUpperCase();
    if (["TRUE", "VERO", "1", "SI", "SÌ"].includes(s)) return true;
    if (["FALSE", "FALSO", "0", "NO"].includes(s)) return false;
  }
  return null;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Date ISO 8601, seriali Excel e italiane gg.mm.aaaa (anche gg/mm/aaaa, con ora facoltativa). */
export function parseDate(v: Cell): number | null {
  const p = cellPrimitive(v);
  if (p instanceof Date) return Number.isNaN(p.getTime()) ? null : p.getTime();
  if (typeof p === "number") {
    if (p > 1 && p < 2958466) return Math.round(EXCEL_EPOCH + p * 86400000);
    return null;
  }
  if (typeof p !== "string") return null;
  const s = p.trim();
  if (!s) return null;
  const it = s.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ ,T]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/,
  );
  if (it) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = it;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    if (dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return null;
    return dt.getTime();
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Tag: uno per riga nella cella (le virgole fanno parte del nome). */
export function splitTags(s: string): string[] {
  return s
    .split(/\r\n|\r|\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const HEADER_KEYS: Record<string, string> = {
  "#id": "id",
  id: "id",
  nome: "name",
  foto: "photo",
  note: "notes",
  priorità: "priority",
  priorita: "priority",
  categoria: "category",
  taglist: "tags",
  tag: "tags",
  latitudine: "lat",
  longitudine: "lng",
  blocco: "locked",
  "data creazione": "createdAt",
  "data modifica": "updatedAt",
};

function findSheet(wb: ExcelJS.Workbook, name: string) {
  return wb.worksheets.find((w) => normName(w.name) === normName(name));
}

export interface XlsxParseOptions {
  onProgress?: Progress;
  /** Conversione in JPG standard (iniettabile nei test). */
  toJpeg?: JpegNormalizer;
}

/** Legge un file XLSX di PoliMapP (anche modificato in Google Sheets) senza toccare i dati salvati. */
export async function parseXlsxBackup(
  file: Blob,
  opts: XlsxParseOptions = {},
): Promise<IncomingBackup> {
  const mod = (await import("exceljs")) as unknown as { default?: typeof ExcelJS } & typeof ExcelJS;
  const Excel = mod.default ?? mod;
  const raw = new Uint8Array(await file.arrayBuffer());
  const wb = new Excel.Workbook();
  try {
    await wb.xlsx.load(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    );
  } catch {
    throw new Error("Il file non è un foglio XLSX valido.");
  }
  const summary = emptySummary();
  const ws = findSheet(wb, SHEET_BOOKMARKS) ?? wb.worksheets[0];
  if (!ws) throw new Error("Il file non contiene la scheda «Segnalibri».");

  // Intestazioni (tolleranti a colonne riordinate)
  const col: Record<string, number> = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, n) => {
    const key = HEADER_KEYS[normName(cellText(cell.value))];
    if (key && !col[key]) col[key] = n;
  });
  if (!col["lat"] || !col["lng"]) {
    throw new Error(
      "Scheda «Segnalibri» non riconosciuta: mancano le colonne Latitudine e Longitudine.",
    );
  }

  // Legenda → macro e categorie del file
  const macros: Macro[] = [];
  const categories: Category[] = [];
  const catByName = new Map<string, Category>();
  /** Nomi presenti più volte in Legenda: non risolvibili, mai associati alla prima occorrenza. */
  const ambiguousCats = new Set<string>();
  const macroByName = new Map<string, Macro>();
  const lg = findSheet(wb, SHEET_LEGEND);
  if (lg) {
    const lcol: Record<string, number> = {};
    lg.getRow(1).eachCell({ includeEmpty: false }, (cell, n) => {
      const h = normName(cellText(cell.value));
      const k =
        h === "macro"
          ? "macro"
          : h === "emoji macro"
            ? "macroEmoji"
            : h === "categoria"
              ? "cat"
              : h === "emoji categoria"
                ? "catEmoji"
                : h.startsWith("colore")
                  ? "color"
                  : null;
      if (k && !lcol[k]) lcol[k] = n;
    });
    if (lcol["cat"]) {
      type LRow = {
        macro: string;
        macroEmoji: string;
        cat: string;
        catEmoji: string;
        color: string;
      };
      const lrows: LRow[] = [];
      for (let r = 2; r <= lg.rowCount; r++) {
        const row = lg.getRow(r);
        // le celle unite restituiscono il valore della cella principale
        const get = (k: string) => (lcol[k] ? cellText(row.getCell(lcol[k]).value).trim() : "");
        const cat = get("cat");
        if (!cat) continue;
        lrows.push({
          macro: get("macro"),
          macroEmoji: get("macroEmoji"),
          cat,
          catEmoji: get("catEmoji"),
          color: get("color"),
        });
      }
      // Celle separate (es. Google Sheets): il valore resta solo nella prima riga del gruppo.
      // Una riga vuota eredita la macro precedente solo se più avanti compare un'altra macro;
      // le righe vuote finali sono categorie senza macro (come in esportazione).
      const lastMacroIdx = lrows.reduce((acc, r, i) => (r.macro ? i : acc), -1);
      const nameCount = new Map<string, number>();
      for (const r of lrows) nameCount.set(normName(r.cat), (nameCount.get(normName(r.cat)) ?? 0) + 1);
      for (const [k, n] of nameCount) if (n > 1) ambiguousCats.add(k);
      const warned = new Set<string>();
      let carry: { name: string; emoji: string } | null = null;
      lrows.forEach((r, i) => {
        if (r.macro) carry = { name: r.macro, emoji: r.macroEmoji };
        else if (i > lastMacroIdx) carry = null;
        let macroId: string | null = null;
        if (carry) {
          const key = normName(carry.name);
          let m = macroByName.get(key);
          if (!m) {
            m = { id: `x-macro-${macros.length + 1}`, name: carry.name, emoji: carry.emoji };
            macros.push(m);
            macroByName.set(key, m);
          } else if (!m.emoji && carry.emoji) m.emoji = carry.emoji;
          macroId = m.id;
        }
        const key = normName(r.cat);
        if (ambiguousCats.has(key)) {
          if (!warned.has(key)) {
            warned.add(key);
            summary.warnings.push(
              `Legenda: categoria «${r.cat}» presente più volte, nome ambiguo: i segnalibri con questa categoria sono importati senza categoria.`,
            );
          }
          return;
        }
        const color = /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : "#9ca3af";
        const c: Category = {
          id: `x-cat-${categories.length + 1}`,
          name: r.cat,
          color,
          emoji: r.catEmoji,
          macroId,
        };
        categories.push(c);
        catByName.set(key, c);
      });
    }
  }

  // Foto: prima le immagini NELLA cella Foto (seguono la riga anche dopo riordino),
  // poi, solo per file vecchi, le immagini flottanti ancorate a quella cella.
  const imgByRow = new Map<number, Uint8Array>();
  const photoColNum = col["photo"];
  if (photoColNum) {
    for (const [r, bytes] of readCellImages(raw, ws.name, photoColNum)) imgByRow.set(r, bytes);
    for (const img of ws.getImages()) {
      const tl = img.range?.tl as unknown as {
        nativeRow?: number;
        nativeCol?: number;
        row?: number;
        col?: number;
      };
      const r0 = tl?.nativeRow ?? Math.floor(tl?.row ?? -1);
      const c0 = tl?.nativeCol ?? Math.floor(tl?.col ?? -1);
      if (r0 < 0 || c0 !== photoColNum - 1 || imgByRow.has(r0 + 1)) continue;
      const media = wb.getImage(Number(img.imageId)) as unknown as {
        buffer?: ArrayBuffer | Uint8Array;
      };
      if (media?.buffer) imgByRow.set(r0 + 1, new Uint8Array(media.buffer));
    }
  }
  const toJpeg = opts.toJpeg ?? browserJpegNormalizer;

  const tags: Tag[] = [];
  const tagByName = new Map<string, Tag>();
  const bookmarks: IncomingBookmark[] = [];
  const total = Math.max(ws.rowCount - 1, 0);
  for (let r = 2; r <= ws.rowCount; r++) {
    opts.onProgress?.(r - 1, total, "Lettura righe e foto");
    const row = ws.getRow(r);
    const v = (k: string): Cell => (col[k] ? row.getCell(col[k]).value : undefined);
    const label = `Riga ${r}`;
    const id = cellText(v("id")).trim();
    const name = cellText(v("name")).trim();
    const latRaw = v("lat");
    const lngRaw = v("lng");
    if (!id && !name && cellText(latRaw) === "" && cellText(lngRaw) === "" && !imgByRow.has(r))
      continue;

    const lat = parseNumber(latRaw);
    const lng = parseNumber(lngRaw);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      summary.errors.push(
        `${label}${name ? ` («${name}»)` : ""}: coordinate mancanti o non valide, riga non importata.`,
      );
      continue;
    }
    const problems: string[] = [];
    if (!name) problems.push("nome mancante");

    let priority = 50;
    const pr = parseNumber(v("priority"));
    if (cellText(v("priority")).trim() !== "") {
      if (pr === null || pr < 0 || pr > 100) problems.push("priorità non valida (usato 50)");
      else priority = Math.round(pr);
    }
    let locked = false;
    if (cellText(v("locked")).trim() !== "") {
      const lk = parseBool(v("locked"));
      if (lk === null) problems.push("blocco non valido");
      else locked = lk;
    }
    const now = Date.now();
    let createdAt = parseDate(v("createdAt"));
    if (createdAt === null) {
      if (cellText(v("createdAt")).trim()) problems.push("data creazione non valida");
      createdAt = now;
    }
    let updatedAt = parseDate(v("updatedAt"));
    if (updatedAt === null) {
      if (cellText(v("updatedAt")).trim()) problems.push("data modifica non valida");
      updatedAt = createdAt;
    }

    let categoryId: string | null = null;
    const catName = cellText(v("category")).trim();
    if (catName) {
      const key = normName(catName);
      let c = catByName.get(key);
      if (ambiguousCats.has(key)) {
        problems.push(`categoria «${catName}» ambigua in Legenda, lasciato senza categoria`);
      } else if (!c) {
        c = {
          id: `x-cat-${categories.length + 1}`,
          name: catName,
          color: "#9ca3af",
          emoji: "",
          macroId: null,
        };
        categories.push(c);
        catByName.set(key, c);
      }
      if (c && !ambiguousCats.has(key)) categoryId = c.id;
    }
    const tagIds: string[] = [];
    for (const tn of splitTags(cellText(v("tags")))) {
      const key = normName(tn);
      let t = tagByName.get(key);
      if (!t) {
        t = { id: `x-tag-${tags.length + 1}`, name: tn };
        tags.push(t);
        tagByName.set(key, t);
      }
      tagIds.push(t.id);
    }

    let photo: Blob | null = null;
    const bytes = imgByRow.get(r);
    if (bytes) {
      photo = await toJpeg(new Blob([bytes as unknown as BlobPart])).catch(() => null);
      if (!photo) {
        summary.photosMissing++;
        problems.push("foto illeggibile");
      }
    }

    const notesRaw = cellText(v("notes"));
    if (problems.length) {
      summary.partialRows++;
      summary.warnings.push(`${label}${name ? ` («${name}»)` : ""}: ${problems.join(", ")}.`);
    }
    bookmarks.push({
      id,
      name,
      lat,
      lng,
      categoryId,
      notes: /<\/?[a-z][^>]*>/i.test(notesRaw) ? notesRaw : notesTextToHtml(notesRaw),
      priority,
      tags: tagIds,
      address: "",
      locked,
      createdAt,
      updatedAt,
      label,
      photo,
    });
  }

  return { bookmarks, categories, tags, macros, summary };
}
