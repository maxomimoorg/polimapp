import {
  isRecognizedId,
  uid,
  type AppData,
  type Bookmark,
  type Category,
  type Macro,
  type Tag,
} from "./types";

/** Segnalibro letto da un file di backup: riferimenti alla tassonomia del file, foto opzionale. */
export interface IncomingBookmark extends Omit<Bookmark, "photoId"> {
  /** Etichetta per i messaggi (es. "riga 5"). */
  label: string;
  photo: Blob | null;
}

export interface ImportSummary {
  imported: number;
  duplicatesInFile: number;
  conflicts: number;
  conflictsOverwritten: number;
  conflictsKept: number;
  conflictsDuplicated: number;
  partialRows: number;
  photosRestored: number;
  photosMissing: number;
  newCategories: number;
  newTags: number;
  newMacros: number;
  errors: string[];
  warnings: string[];
}

export function emptySummary(): ImportSummary {
  return {
    imported: 0,
    duplicatesInFile: 0,
    conflicts: 0,
    conflictsOverwritten: 0,
    conflictsKept: 0,
    conflictsDuplicated: 0,
    partialRows: 0,
    photosRestored: 0,
    photosMissing: 0,
    newCategories: 0,
    newTags: 0,
    newMacros: 0,
    errors: [],
    warnings: [],
  };
}

export interface IncomingBackup {
  bookmarks: IncomingBookmark[];
  categories: Category[];
  tags: Tag[];
  macros: Macro[];
  /** Conteggi raccolti durante la lettura del file. */
  summary: ImportSummary;
}

export interface Conflict {
  existing: Bookmark;
  incoming: Bookmark;
  photo: { id: string; blob: Blob } | null;
}

export interface MergePlan {
  data: AppData;
  photos: Array<{ id: string; blob: Blob }>;
  conflicts: Conflict[];
  summary: ImportSummary;
}

export type ConflictChoice = "overwrite" | "keep" | "duplicate";

export const normName = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase("it");

function indexByName<T extends { name: string }>(items: T[]) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = normName(it.name);
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return m;
}

/**
 * Integra un backup nei dati esistenti senza cancellare nulla.
 * Categorie, tag e macro vengono associati per nome solo se la corrispondenza è univoca;
 * quelli nuovi vengono aggiunti, quelli ambigui ignorati con un avviso.
 * I segnalibri con ID già presente vengono messi da parte come conflitti da far decidere all'utente.
 */
export function planMerge(existing: AppData, incoming: IncomingBackup): MergePlan {
  const summary: ImportSummary = {
    ...incoming.summary,
    errors: [...incoming.summary.errors],
    warnings: [...incoming.summary.warnings],
  };
  const macros = [...existing.macros];
  const categories = [...existing.categories];
  const tags = [...existing.tags];
  const usedIds = new Set<string>([...macros, ...categories, ...tags].map((x) => x.id));
  const freshId = (id: string) => {
    const out = isRecognizedId(id) && !usedIds.has(id) ? id : uid();
    usedIds.add(out);
    return out;
  };

  // Macro
  const macroByName = indexByName(existing.macros);
  const macroMap = new Map<string, string | null>();
  for (const m of incoming.macros) {
    const hits = macroByName.get(normName(m.name)) ?? [];
    if (hits.length === 1) macroMap.set(m.id, hits[0]!.id);
    else if (hits.length > 1) {
      macroMap.set(m.id, null);
      summary.warnings.push(
        `Macro «${m.name}» ambigua: esistono più macro con questo nome, non assegnata.`,
      );
    } else if (!normName(m.name)) macroMap.set(m.id, null);
    else {
      const nm: Macro = { id: freshId(m.id), name: m.name.trim(), emoji: m.emoji };
      macros.push(nm);
      macroByName.set(normName(nm.name), [nm]);
      macroMap.set(m.id, nm.id);
      summary.newMacros++;
    }
  }

  // Categorie
  const catByName = indexByName(existing.categories);
  const catMap = new Map<string, string | null>();
  for (const c of incoming.categories) {
    const hits = catByName.get(normName(c.name)) ?? [];
    if (hits.length === 1) catMap.set(c.id, hits[0]!.id);
    else if (hits.length > 1) {
      catMap.set(c.id, null);
      summary.warnings.push(
        `Categoria «${c.name}» ambigua: più categorie hanno questo nome, segnalibri importati senza categoria.`,
      );
    } else if (!normName(c.name)) catMap.set(c.id, null);
    else {
      const nc: Category = {
        id: freshId(c.id),
        name: c.name.trim(),
        color: c.color,
        emoji: c.emoji,
        macroId: c.macroId ? (macroMap.get(c.macroId) ?? null) : null,
      };
      categories.push(nc);
      catByName.set(normName(nc.name), [nc]);
      catMap.set(c.id, nc.id);
      summary.newCategories++;
    }
  }

  // Tag
  const tagByName = indexByName(existing.tags);
  const tagMap = new Map<string, string | null>();
  for (const t of incoming.tags) {
    const hits = tagByName.get(normName(t.name)) ?? [];
    if (hits.length === 1) tagMap.set(t.id, hits[0]!.id);
    else if (hits.length > 1) {
      tagMap.set(t.id, null);
      summary.warnings.push(`Tag «${t.name}» ambiguo: più tag hanno questo nome, non assegnato.`);
    } else if (!normName(t.name)) tagMap.set(t.id, null);
    else {
      const nt: Tag = { id: freshId(t.id), name: t.name.trim() };
      tags.push(nt);
      tagByName.set(normName(nt.name), [nt]);
      tagMap.set(t.id, nt.id);
      summary.newTags++;
    }
  }

  // Segnalibri
  const existingById = new Map(existing.bookmarks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const added: Bookmark[] = [];
  const photos: Array<{ id: string; blob: Blob }> = [];
  const conflicts: Conflict[] = [];
  for (const ib of incoming.bookmarks) {
    const rawId = (ib.id ?? "").trim();
    let id = rawId;
    if (!isRecognizedId(rawId)) {
      id = uid();
      if (rawId)
        summary.warnings.push(
          `${ib.label}: ID «${rawId}» non riconosciuto, assegnato un nuovo ID.`,
        );
    } else if (seen.has(rawId)) {
      summary.duplicatesInFile++;
      summary.warnings.push(`${ib.label}: ID «${rawId}» ripetuto nel file, riga saltata.`);
      continue;
    }
    seen.add(id);
    const photo = ib.photo ? { id: uid(), blob: ib.photo } : null;
    const bTags = [
      ...new Set(ib.tags.map((t) => tagMap.get(t) ?? null).filter((t): t is string => !!t)),
    ];
    const b: Bookmark = {
      id,
      name: ib.name,
      lat: ib.lat,
      lng: ib.lng,
      categoryId: ib.categoryId ? (catMap.get(ib.categoryId) ?? null) : null,
      notes: ib.notes,
      priority: ib.priority,
      tags: bTags,
      photoId: photo?.id ?? null,
      address: ib.address,
      locked: ib.locked,
      createdAt: ib.createdAt,
      updatedAt: ib.updatedAt,
    };
    const prev = existingById.get(id);
    if (prev) {
      conflicts.push({ existing: prev, incoming: b, photo });
      continue;
    }
    added.push(b);
    if (photo) photos.push(photo);
  }
  summary.imported += added.length;
  summary.photosRestored += photos.length;
  summary.conflicts = conflicts.length;

  return {
    data: { bookmarks: [...existing.bookmarks, ...added], categories, tags, macros },
    photos,
    conflicts,
    summary,
  };
}

/** Applica la scelta dell'utente ai segnalibri in conflitto. */
export function resolveConflicts(plan: MergePlan, choice: ConflictChoice): MergePlan {
  if (plan.conflicts.length === 0) return plan;
  const summary = { ...plan.summary };
  let bookmarks = plan.data.bookmarks;
  const photos = [...plan.photos];
  if (choice === "keep") {
    summary.conflictsKept += plan.conflicts.length;
  } else if (choice === "overwrite") {
    const byId = new Map(plan.conflicts.map((c) => [c.incoming.id, c]));
    bookmarks = bookmarks.map((b) => {
      const c = byId.get(b.id);
      if (!c) return b;
      return {
        ...c.incoming,
        address: c.incoming.address || b.address,
        photoId: c.incoming.photoId ?? b.photoId,
      };
    });
    for (const c of plan.conflicts) if (c.photo) photos.push(c.photo);
    summary.conflictsOverwritten += plan.conflicts.length;
    summary.imported += plan.conflicts.length;
  } else {
    bookmarks = [...bookmarks, ...plan.conflicts.map((c) => ({ ...c.incoming, id: uid() }))];
    for (const c of plan.conflicts) if (c.photo) photos.push(c.photo);
    summary.conflictsDuplicated += plan.conflicts.length;
    summary.imported += plan.conflicts.length;
  }
  summary.photosRestored = photos.length;
  return { data: { ...plan.data, bookmarks }, photos, conflicts: [], summary };
}

export const EMPTY_DATA: AppData = { bookmarks: [], categories: [], tags: [], macros: [] };
