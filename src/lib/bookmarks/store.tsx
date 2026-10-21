import { browserJpegNormalizer } from "./photo-format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as db from "./db";
import { uid, type AppData, type Bookmark, type Category, type Macro, type Tag } from "./types";

const EMPTY: AppData = { bookmarks: [], categories: [], tags: [], macros: [] };
const HISTORY_LIMIT = 50;

export function useBookmarkStore() {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [past, setPast] = useState<AppData[]>([]);
  const [future, setFuture] = useState<AppData[]>([]);
  const urlsRef = useRef<Record<string, string>>({});
  const dataRef = useRef<AppData>(EMPTY);
  const pastRef = useRef<AppData[]>([]);
  const futureRef = useRef<AppData[]>([]);

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

  const setAll = useCallback(
    (next: AppData) => {
      dataRef.current = next;
      setData(next);
      void syncPhotos(next.bookmarks);
    },
    [syncPhotos],
  );

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setPast([]);
    setFuture([]);
  }, []);

  /** Applica una nuova versione dei dati registrandola nella cronologia. */
  const commit = useCallback(
    async (next: AppData) => {
      pastRef.current = [...pastRef.current, dataRef.current].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      setPast(pastRef.current);
      setFuture([]);
      setAll(next);
      await db.replaceData(next);
    },
    [setAll],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await db.loadAll();
      if (!alive) return;
      setAll(loaded);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [setAll]);

  const undo = useCallback(async () => {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [dataRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT);
    setPast(pastRef.current);
    setFuture(futureRef.current);
    setAll(prev);
    await db.replaceData(prev);
  }, [setAll]);

  const redo = useCallback(async () => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, dataRef.current].slice(-HISTORY_LIMIT);
    setPast(pastRef.current);
    setFuture(futureRef.current);
    setAll(next);
    await db.replaceData(next);
  }, [setAll]);

  const saveBookmark = useCallback(
    async (b: Bookmark) => {
      const next = { ...b, updatedAt: Date.now() };
      const d = dataRef.current;
      await commit({
        ...d,
        bookmarks: d.bookmarks.some((x) => x.id === next.id)
          ? d.bookmarks.map((x) => (x.id === next.id ? next : x))
          : [...d.bookmarks, next],
      });
      return next;
    },
    [commit],
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      const d = dataRef.current;
      await commit({ ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) });
    },
    [commit],
  );

  const addCategory = useCallback(
    async (name: string, color: string, emoji = "", macroId: string | null = null) => {
      const c: Category = { id: uid(), name, color, emoji, macroId };
      const d = dataRef.current;
      await commit({ ...d, categories: [...d.categories, c] });
      return c;
    },
    [commit],
  );

  const addMacro = useCallback(
    async (name: string, emoji: string) => {
      const m: Macro = { id: uid(), name, emoji };
      const d = dataRef.current;
      await commit({ ...d, macros: [...d.macros, m] });
      return m;
    },
    [commit],
  );

  const updateMacro = useCallback(
    async (m: Macro) => {
      const d = dataRef.current;
      await commit({ ...d, macros: d.macros.map((x) => (x.id === m.id ? m : x)) });
      return m;
    },
    [commit],
  );

  /** Elimina la macro; le sue categorie restano, senza macro. */
  const removeMacro = useCallback(
    async (id: string) => {
      const d = dataRef.current;
      await commit({
        ...d,
        macros: d.macros.filter((m) => m.id !== id),
        categories: d.categories.map((c) => (c.macroId === id ? { ...c, macroId: null } : c)),
      });
    },
    [commit],
  );

  /** Importazione additiva: salva le foto nuove e applica i dati uniti (annullabile). */
  const applyImport = useCallback(
    async (next: AppData, photos: Array<{ id: string; blob: Blob }>) => {
      for (const p of photos) await db.putPhoto(p.id, p.blob);
      await commit(next);
    },
    [commit],
  );

  /** Sostituzione completa: da usare solo dopo conferma esplicita. */
  const replaceEverything = useCallback(
    async (next: AppData, photos: Array<{ id: string; blob: Blob }>) => {
      await db.replaceAll(next, photos);
      for (const u of Object.values(urlsRef.current)) URL.revokeObjectURL(u);
      urlsRef.current = {};
      setPhotoUrls({});
      const loaded = await db.loadAll();
      setAll(loaded);
      resetHistory();
    },
    [setAll, resetHistory],
  );

  const addTag = useCallback(
    async (name: string) => {
      const t: Tag = { id: uid(), name };
      const d = dataRef.current;
      await commit({ ...d, tags: [...d.tags, t] });
      return t;
    },
    [commit],
  );

  const updateCategory = useCallback(
    async (c: Category) => {
      const d = dataRef.current;
      await commit({ ...d, categories: d.categories.map((x) => (x.id === c.id ? c : x)) });
      return c;
    },
    [commit],
  );

  const updateTag = useCallback(
    async (t: Tag) => {
      const d = dataRef.current;
      await commit({ ...d, tags: d.tags.map((x) => (x.id === t.id ? t : x)) });
      return t;
    },
    [commit],
  );

  const removeCategory = useCallback(
    async (id: string) => {
      const d = dataRef.current;
      await commit({
        ...d,
        categories: d.categories.filter((c) => c.id !== id),
        bookmarks: d.bookmarks.map((b) => (b.categoryId === id ? { ...b, categoryId: null } : b)),
      });
    },
    [commit],
  );

  const removeTag = useCallback(
    async (id: string) => {
      const d = dataRef.current;
      await commit({
        ...d,
        tags: d.tags.filter((t) => t.id !== id),
        bookmarks: d.bookmarks.map((b) =>
          b.tags.includes(id) ? { ...b, tags: b.tags.filter((x) => x !== id) } : b,
        ),
      });
    },
    [commit],
  );

  const savePhoto = useCallback(async (input: Blob) => {
    // sempre JPG standard (nessun WebP salvato)
    const blob = await browserJpegNormalizer(input);
    if (!blob) throw new Error("Foto illeggibile");
    const id = uid();
    await db.putPhoto(id, blob);
    const url = URL.createObjectURL(blob);
    urlsRef.current = { ...urlsRef.current, [id]: url };
    setPhotoUrls(urlsRef.current);
    return id;
  }, []);

  const wipe = useCallback(async () => {
    await db.clearAll();
    setAll(EMPTY);
    resetHistory();
  }, [setAll, resetHistory]);

  const reload = useCallback(async () => {
    const loaded = await db.loadAll();
    setAll(loaded);
    resetHistory();
  }, [setAll, resetHistory]);

  const categoriesById = useMemo(
    () => Object.fromEntries(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  return {
    data,
    ready,
    photoUrls,
    categoriesById,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    saveBookmark,
    removeBookmark,
    addCategory,
    addMacro,
    updateMacro,
    removeMacro,
    applyImport,
    replaceEverything,
    addTag,
    updateCategory,
    updateTag,
    removeCategory,
    removeTag,
    savePhoto,
    wipe,
    reload,
  };
}

export type BookmarkStore = ReturnType<typeof useBookmarkStore>;
