export interface Macro {
  id: string;
  name: string;
  emoji: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  emoji: string;
  macroId: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Bookmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  categoryId: string | null;
  notes: string;
  priority: number; // 0..100
  tags: string[];
  photoId: string | null;
  address: string;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  bookmarks: Bookmark[];
  categories: Category[];
  tags: Tag[];
  macros: Macro[];
}

export function migrateBookmark(
  raw: Partial<Bookmark> & { id: string; photoFile?: string | null },
): Bookmark {
  const fromFile = raw.photoFile ? raw.photoFile.replace(/\.[a-z0-9]+$/i, "") : null;
  const createdAt = raw.createdAt ?? Date.now();
  return {
    id: raw.id,
    name: raw.name ?? "",
    lat: Number(raw.lat ?? 0),
    lng: Number(raw.lng ?? 0),
    categoryId: raw.categoryId ?? null,
    notes: raw.notes ?? "",
    priority: typeof raw.priority === "number" ? raw.priority : 50,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    photoId: raw.photoId ?? fromFile,
    address: raw.address ?? "",
    locked: raw.locked ?? false,
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
  };
}

export function migrateCategory(raw: Partial<Category> & { id: string }): Category {
  return {
    id: raw.id,
    name: raw.name ?? "",
    color: raw.color ?? "#9ca3af",
    emoji: typeof raw.emoji === "string" ? raw.emoji : "",
    macroId: raw.macroId ?? null,
  };
}

export function migrateMacro(raw: Partial<Macro> & { id: string }): Macro {
  return {
    id: raw.id,
    name: raw.name ?? "",
    emoji: typeof raw.emoji === "string" ? raw.emoji : "",
  };
}

/** Nuovi ID: UUID v4 crittograficamente sicuri. Gli ID legacy esistenti non vengono mai rigenerati. */
export function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Formato degli ID generati dalle versioni precedenti di MapP (base36, senza trattini). */
const LEGACY_ID_RE = /^[0-9a-z]{10,24}$/;

export function isRecognizedId(id: string): boolean {
  return UUID_RE.test(id) || LEGACY_ID_RE.test(id);
}
