import { openDB, type IDBPDatabase } from "idb";
import { migrateBookmark, type AppData, type Bookmark, type Category, type Tag } from "./types";

const DB_NAME = "mappa-segnalibri";
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("bookmarks")) d.createObjectStore("bookmarks", { keyPath: "id" });
        if (!d.objectStoreNames.contains("categories")) d.createObjectStore("categories", { keyPath: "id" });
        if (!d.objectStoreNames.contains("tags")) d.createObjectStore("tags", { keyPath: "id" });
        if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos");
      },
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<AppData> {
  const d = await db();
  const [bookmarks, categories, tags] = await Promise.all([
    d.getAll("bookmarks"),
    d.getAll("categories"),
    d.getAll("tags"),
  ]);
  return {
    bookmarks: (bookmarks as Bookmark[]).map(migrateBookmark),
    categories: categories as Category[],
    tags: tags as Tag[],
  };
}

export async function putBookmark(b: Bookmark) {
  (await db()).put("bookmarks", b);
}

export async function deleteBookmark(id: string) {
  const d = await db();
  await d.delete("bookmarks", id);
}

export async function putCategory(c: Category) {
  (await db()).put("categories", c);
}

export async function putTag(t: Tag) {
  (await db()).put("tags", t);
}

export async function putPhoto(id: string, blob: Blob) {
  (await db()).put("photos", blob, id);
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await db()).get("photos", id) as Promise<Blob | undefined>;
}

export async function getAllPhotos(): Promise<Array<{ id: string; blob: Blob }>> {
  const d = await db();
  const keys = await d.getAllKeys("photos");
  const out: Array<{ id: string; blob: Blob }> = [];
  for (const k of keys) {
    const blob = (await d.get("photos", k)) as Blob | undefined;
    if (blob) out.push({ id: String(k), blob });
  }
  return out;
}

export async function deletePhoto(id: string) {
  (await db()).delete("photos", id);
}

export async function clearAll() {
  const d = await db();
  await Promise.all([
    d.clear("bookmarks"),
    d.clear("categories"),
    d.clear("tags"),
    d.clear("photos"),
  ]);
}

export async function replaceAll(data: AppData, photos: Array<{ id: string; blob: Blob }>) {
  await clearAll();
  const d = await db();
  for (const b of data.bookmarks) await d.put("bookmarks", b);
  for (const c of data.categories) await d.put("categories", c);
  for (const t of data.tags) await d.put("tags", t);
  for (const p of photos) await d.put("photos", p.blob, p.id);
}

/** Sostituisce segnalibri, categorie e tag mantenendo le foto. */
export async function replaceData(data: AppData) {
  const d = await db();
  await Promise.all([d.clear("bookmarks"), d.clear("categories"), d.clear("tags")]);
  for (const b of data.bookmarks) await d.put("bookmarks", b);
  for (const c of data.categories) await d.put("categories", c);
  for (const t of data.tags) await d.put("tags", t);
}