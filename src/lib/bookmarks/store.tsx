import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as db from "./db";
import { uid, type AppData, type Bookmark, type Category, type Tag } from "./types";

export function useBookmarkStore() {
  const [data, setData] = useState<AppData>({ bookmarks: [], categories: [], tags: [] });
  const [ready, setReady] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});

  const syncPhotos = useCallback(async (bookmarks: Bookmark[]) => {
    const next = { ...urlsRef.current };
    let changed = false;
    for (const b of bookmarks) {
      if (b.photoId && !next[b.photoId]) {
        const blob = await db.getPhoto(b.photoId);
        if (blob) {
          next[b.photoId] = URL.createObjectURL(blob);
          changed = true;
        }
      }
    }
    if (changed) {
      urlsRef.current = next;
      setPhotoUrls(next);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await db.loadAll();
      if (!alive) return;
      setData(loaded);
      setReady(true);
      void syncPhotos(loaded.bookmarks);
    })();
    return () => {
      alive = false;
    };
  }, [syncPhotos]);

  const saveBookmark = useCallback(
    async (b: Bookmark) => {
      const next = { ...b, updatedAt: Date.now() };
      await db.putBookmark(next);
      setData((d) => ({
        ...d,
        bookmarks: d.bookmarks.some((x) => x.id === next.id)
          ? d.bookmarks.map((x) => (x.id === next.id ? next : x))
          : [...d.bookmarks, next],
      }));
      void syncPhotos([next]);
      return next;
    },
    [syncPhotos],
  );

  const removeBookmark = useCallback(async (id: string) => {
    await db.deleteBookmark(id);
    setData((d) => ({ ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) }));
  }, []);

  const addCategory = useCallback(async (name: string, color: string) => {
    const c: Category = { id: uid(), name, color };
    await db.putCategory(c);
    setData((d) => ({ ...d, categories: [...d.categories, c] }));
    return c;
  }, []);

  const addTag = useCallback(async (name: string) => {
    const t: Tag = { id: uid(), name };
    await db.putTag(t);
    setData((d) => ({ ...d, tags: [...d.tags, t] }));
    return t;
  }, []);

  const updateCategory = useCallback(async (c: Category) => {
    await db.putCategory(c);
    setData((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? c : x)) }));
    return c;
  }, []);

  const updateTag = useCallback(async (t: Tag) => {
    await db.putTag(t);
    setData((d) => ({ ...d, tags: d.tags.map((x) => (x.id === t.id ? t : x)) }));
    return t;
  }, []);

  const savePhoto = useCallback(async (blob: Blob) => {
    const id = uid();
    await db.putPhoto(id, blob);
    const url = URL.createObjectURL(blob);
    urlsRef.current = { ...urlsRef.current, [id]: url };
    setPhotoUrls(urlsRef.current);
    return id;
  }, []);

  const wipe = useCallback(async () => {
    await db.clearAll();
    setData({ bookmarks: [], categories: [], tags: [] });
  }, []);

  const reload = useCallback(async () => {
    const loaded = await db.loadAll();
    setData(loaded);
    void syncPhotos(loaded.bookmarks);
  }, [syncPhotos]);

  const categoriesById = useMemo(
    () => Object.fromEntries(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  return {
    data,
    ready,
    photoUrls,
    categoriesById,
    saveBookmark,
    removeBookmark,
    addCategory,
    addTag,
    updateCategory,
    updateTag,
    savePhoto,
    wipe,
    reload,
  };
}

export type BookmarkStore = ReturnType<typeof useBookmarkStore>;