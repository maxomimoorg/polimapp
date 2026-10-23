import type ExcelJS from "exceljs";
import {
  APP_VERSION,
  BOOKMARK_HEADERS,
  LEGEND_HEADERS,
  PHOTO_PX,
  SHEET_BOOKMARKS,
  SHEET_LEGEND,
  SHEET_SETTINGS,
  XLSX_FORMAT_VERSION,
  notesHtmlToText,
} from "./xlsx-common";
import type { AppData, Category } from "./types";


export type Progress = (done: number, total: number, label: string) => void;

export interface XlsxExportOptions {
  getPhoto: (id: string) => Promise<Blob | undefined>;
  /** Converte una foto in JPG quadrato con ritaglio circolare e angoli neri. */
  toJpeg?: (blob: Blob, size: number) => Promise<Uint8Array>;
  onProgress?: Progress;
  now?: Date;
}

/** Conversione via canvas: JPG quadrato, cerchio centrato, angoli #000000. L'originale non viene toccato. */
export async function circularJpeg(blob: Blob, size: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const side = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  ctx.restore();
  bmp.close?.();
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!out) throw new Error("Conversione JPG non riuscita");
  return new Uint8Array(await out.arrayBuffer());
}

async function loadExcel(): Promise<typeof ExcelJS> {
  const mod = (await import("exceljs")) as unknown as { default?: typeof ExcelJS } & typeof ExcelJS;
  return mod.default ?? mod;
}

/** Ordine Legenda: macro (in ordine) con le loro categorie consecutive, poi le categorie senza macro. */
export function legendRows(data: AppData) {
  const rows: Array<{ macroId: string | null; cat: Category }> = [];
  const known = new Set(data.macros.map((m) => m.id));
  for (const m of data.macros) {
    for (const c of data.categories) if (c.macroId === m.id) rows.push({ macroId: m.id, cat: c });
  }
  for (const c of data.categories)
    if (!c.macroId || !known.has(c.macroId)) rows.push({ macroId: null, cat: c });
  return rows;
}

function jpegDataUri(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:image/jpeg;base64,${btoa(binary)}`;
}





export async function buildXlsxWorkbook(
  data: AppData,
  opts: XlsxExportOptions,
): Promise<ExcelJS.Workbook> {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  wb.creator = "PoliMapP";
  wb.created = opts.now ?? new Date();
  const toJpeg = opts.toJpeg ?? circularJpeg;
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const tagById = new Map(data.tags.map((t) => [t.id, t]));

  // 1. Segnalibri
  const ws = wb.addWorksheet(SHEET_BOOKMARKS, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = BOOKMARK_HEADERS.map((h, i) => ({
    header: h,
    key: `c${i}`,
    width: [38, 28, 14, 48, 10, 22, 24, 13, 13, 9, 26, 26][i] ?? 14,
  }));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: "A1", to: "L1" };
  const total = data.bookmarks.length;
  let i = 0;
  for (const b of data.bookmarks) {
    const row = ws.addRow([
      b.id,
      b.name,
      null,
      notesHtmlToText(b.notes),
      b.priority,
      b.categoryId ? (catById.get(b.categoryId)?.name ?? "") : "",
      b.tags
        .map((t) => tagById.get(t)?.name)
        .filter(Boolean)
        .join("\n"),
      b.lat,
      b.lng,
      !!b.locked,
      new Date(b.createdAt).toISOString(),
      new Date(b.updatedAt).toISOString(),
    ]);
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.getCell(7).alignment = { wrapText: true, vertical: "top" };
    if (b.photoId) {
      try {
        const blob = await opts.getPhoto(b.photoId);
        if (blob) {
          const jpg = await toJpeg(blob, PHOTO_PX * 2);
const imageId = wb.addImage({
  base64: jpegDataUri(jpg),
  extension: "jpeg",
});

// C = indice colonna 2; ExcelJS numera le righe da 0 nelle coordinate dell'immagine.
ws.addImage(imageId, {
  tl: { col: 2, row: row.number - 1 },
  ext: { width: PHOTO_PX, height: PHOTO_PX },
  editAs: "oneCell",
});

row.height = PHOTO_PX * 0.75 + 4;
        }
      } catch {
        /* foto illeggibile: la riga resta senza immagine */
      }
    }
    i++;
    opts.onProgress?.(i, total, "Foto e segnalibri");
  }

  // 2. Legenda
  const lg = wb.addWorksheet(SHEET_LEGEND, { views: [{ state: "frozen", ySplit: 1 }] });
  lg.columns = LEGEND_HEADERS.map((h, idx) => ({
    header: h,
    key: `l${idx}`,
    width: [24, 12, 26, 15, 26][idx] ?? 14,
  }));
  lg.getRow(1).font = { bold: true };
  const macroById = new Map(data.macros.map((m) => [m.id, m]));
  const rows = legendRows(data);
  let r = 2;
  let idx = 0;
  while (idx < rows.length) {
    const { macroId } = rows[idx]!;
    let end = idx;
    while (macroId && end + 1 < rows.length && rows[end + 1]!.macroId === macroId) end++;
    const macro = macroId ? macroById.get(macroId) : undefined;
    for (let k = idx; k <= end; k++) {
      const c = rows[k]!.cat;
      lg.getRow(r + (k - idx)).values = [
        k === idx && macro ? macro.name : null,
        k === idx && macro ? macro.emoji : null,
        c.name,
        c.emoji,
        c.color,
      ];
    }
    if (macro && end > idx) {
      lg.mergeCells(r, 1, r + (end - idx), 1);
      lg.mergeCells(r, 2, r + (end - idx), 2);
    }
    if (macro) {
      lg.getCell(r, 1).alignment = { vertical: "middle" };
      lg.getCell(r, 2).alignment = { vertical: "middle", horizontal: "center" };
    }
    r += end - idx + 1;
    idx = end + 1;
  }

  // 3. Impostazioni
  const st = wb.addWorksheet(SHEET_SETTINGS);
  st.columns = [
    { header: "Chiave", key: "k", width: 22 },
    { header: "Valore", key: "v", width: 30 },
  ];
  st.getRow(1).font = { bold: true };
  st.addRow(["Versione formato", XLSX_FORMAT_VERSION]);
  st.addRow(["Data esportazione", (opts.now ?? new Date()).toISOString()]);
  st.addRow(["Versione app", APP_VERSION]);
  return wb;
}

export async function exportXlsx(data: AppData, opts: XlsxExportOptions): Promise<Blob> {
  const bytes = await exportXlsxBytes(data, opts);
  return new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Pacchetto XLSX con le foto come immagini standard ancorate al foglio. */
export async function exportXlsxBytes(
  data: AppData,
  opts: XlsxExportOptions,
): Promise<Uint8Array> {
  const wb = await buildXlsxWorkbook(data, opts);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
