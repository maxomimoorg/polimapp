export interface Category {
  id: string;
  name: string;
  color: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  bookmarks: Bookmark[];
  categories: Category[];
  tags: Tag[];
}

export function migrateBookmark(raw: Partial<Bookmark> & { id: string }): Bookmark {
  return {
    id: raw.id,
    name: raw.name ?? "",
    lat: Number(raw.lat ?? 0),
    lng: Number(raw.lng ?? 0),
    categoryId: raw.categoryId ?? null,
    notes: raw.notes ?? "",
    priority: typeof raw.priority === "number" ? raw.priority : 50,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    photoId: raw.photoId ?? null,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}