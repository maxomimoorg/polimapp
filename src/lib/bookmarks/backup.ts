import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { getAllPhotos } from "./db";
import { emptySummary, type IncomingBackup } from "./merge";
import {
  browserJpegNormalizer,
  mimeForExtension,
  sniffImageMime,
  type JpegNormalizer,
} from "./photo-format";
import { migrateBookmark, migrateCategory, migrateMacro, type AppData } from "./types";

/** Backup ZIP: data.json + photos/<id>.jpg (sempre JPG standard; gli originali locali non vengono toccati). */
export async function exportBackup(
  data: AppData,
  photos?: Array<{ id: string; blob: Blob }>,
  toJpeg: JpegNormalizer = browserJpegNormalizer,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {
    "data.json": strToU8(JSON.stringify(data, null, 2)),
  };
  const all = photos ?? (await getAllPhotos());
  for (const p of all) {
    const jpg = await toJpeg(p.blob);
    if (!jpg) continue; // foto illeggibile: il segnalibro mostrerà l'emoji della categoria
    files[`photos/${p.id}.jpg`] = new Uint8Array(await jpg.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
}

/**
 * Legge un backup ZIP (nuovo o legacy con foto .webp) senza modificare i dati salvati.
 * Ogni foto viene convertita in JPG standard; quelle illeggibili sono contate come mancanti.
 */
export async function parseZipBackup(
  file: Blob,
  toJpeg: JpegNormalizer = browserJpegNormalizer,
): Promise<IncomingBackup> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf);
  } catch {
    throw new Error("Il file non è un archivio ZIP valido.");
  }
  const dataRaw = entries["data.json"];
  if (!dataRaw) throw new Error("File di backup non valido: manca data.json");
  let parsed: Partial<AppData>;
  try {
    parsed = JSON.parse(strFromU8(dataRaw)) as Partial<AppData>;
  } catch {
    throw new Error("File di backup non valido: data.json è illeggibile.");
  }
  const summary = emptySummary();

  const photoById = new Map<string, Blob>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith("photos/") || name.endsWith("/")) continue;
    const file = name.slice("photos/".length);
    const id = file.replace(/\.[a-z0-9]+$/i, "");
    if (!id) continue;
    const mime = sniffImageMime(bytes) ?? mimeForExtension(file);
    photoById.set(id, new Blob([bytes as unknown as BlobPart], mime ? { type: mime } : {}));
  }

  const rawBookmarks = (parsed.bookmarks ?? []) as Array<
    Partial<AppData["bookmarks"][number]> & { id: string; photoFile?: string | null }
  >;
  const bookmarks: IncomingBackup["bookmarks"] = [];
  const valid = rawBookmarks.filter((b) => b && typeof b === "object");
  for (let i = 0; i < valid.length; i++) {
    const raw = valid[i]!;
    const b = migrateBookmark({ ...raw, id: String(raw.id ?? "") });
    let photo: Blob | null = null;
    if (b.photoId) {
      const src = photoById.get(b.photoId);
      if (!src) {
        summary.photosMissing++;
        summary.warnings.push(`Segnalibro «${b.name || i + 1}»: foto mancante nell'archivio.`);
      } else {
        photo = await toJpeg(src).catch(() => null);
        if (!photo) {
          summary.photosMissing++;
          summary.warnings.push(`Segnalibro «${b.name || i + 1}»: foto illeggibile, non importata.`);
        }
      }
    }
    const { photoId: _p, ...rest } = b;
    bookmarks.push({ ...rest, label: `Segnalibro «${b.name || i + 1}»`, photo });
  }

  return {
    bookmarks,
    categories: (parsed.categories ?? []).filter((c) => c?.id).map(migrateCategory),
    tags: (parsed.tags ?? []).filter((t) => t?.id).map((t) => ({ id: t.id, name: t.name ?? "" })),
    macros: (parsed.macros ?? []).filter((m) => m?.id).map(migrateMacro),
    summary,
  };
}
