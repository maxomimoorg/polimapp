import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { getAllPhotos, replaceAll } from "./db";
import { migrateBookmark, type AppData } from "./types";

export async function exportBackup(data: AppData): Promise<Blob> {
  const files: Record<string, Uint8Array> = {
    "data.json": strToU8(JSON.stringify(data, null, 2)),
  };
  const photos = await getAllPhotos();
  for (const p of photos) {
    files[`photos/${p.id}.webp`] = new Uint8Array(await p.blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as unknown as BlobPart], { type: "application/zip" });
}

export async function importBackup(file: File): Promise<AppData> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const dataRaw = entries["data.json"];
  if (!dataRaw) throw new Error("File di backup non valido: manca data.json");
  const parsed = JSON.parse(strFromU8(dataRaw)) as Partial<AppData>;
  const data: AppData = {
    bookmarks: (parsed.bookmarks ?? []).map(migrateBookmark),
    categories: parsed.categories ?? [],
    tags: parsed.tags ?? [],
  };
  const photos: Array<{ id: string; blob: Blob }> = [];
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith("photos/")) continue;
    const id = name.slice("photos/".length).replace(/\.webp$/, "");
    if (!id) continue;
    photos.push({ id, blob: new Blob([bytes as unknown as BlobPart], { type: "image/webp" }) });
  }
  await replaceAll(data, photos);
  return data;
}