import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { exportXlsxBytes } from "@/lib/bookmarks/xlsx-export";
import { parseXlsxBackup } from "@/lib/bookmarks/xlsx-import";
import { parseZipBackup } from "@/lib/bookmarks/backup";
import { migrateBookmark, type AppData } from "@/lib/bookmarks/types";

/** Finto JPG riconoscibile: header JPEG + etichetta. */
const fakeJpg = (label: string) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...strToU8(`--${label}--`), 0xff, 0xd9]);
const labelOf = async (b: Blob | null) => {
  if (!b) return null;
  const s = strFromU8(new Uint8Array(await b.arrayBuffer()));
  return s.match(/--(.+?)--/)?.[1] ?? null;
};
const identity = async (b: Blob) => new Blob([b], { type: "image/jpeg" });

const data: AppData = {
  macros: [],
  categories: [{ id: "c1", name: "Cibo", color: "#ff0000", emoji: "🍕", macroId: null }],
  tags: [],
  bookmarks: [
    migrateBookmark({ id: "aaaaaaaaaa01", name: "Uno", lat: 1, lng: 1, categoryId: "c1", photoId: "p1" }),
    migrateBookmark({ id: "aaaaaaaaaa02", name: "Due", lat: 2, lng: 2, categoryId: "c1", photoId: null }),
    migrateBookmark({ id: "aaaaaaaaaa03", name: "Tre", lat: 3, lng: 3, categoryId: "c1", photoId: "p3" }),
  ],
};

async function exportSample() {
  return exportXlsxBytes(data, {
    getPhoto: async (id) => new Blob([id]),
    toJpeg: async (blob) => fakeJpg(await blob.text()),
  });
}

describe("XLSX: foto ancorate alle righe", () => {
  it("esporta le foto come immagini standard nel disegno del foglio", async () => {
    const files = unzipSync(await exportSample());
    const names = Object.keys(files);

    const drawingPaths = names.filter((name) =>
      /^xl\/drawings\/drawing\d+\.xml$/.test(name),
    );
    const mediaPaths = names.filter((name) =>
      /^xl\/media\/image\d+\.(jpeg|jpg)$/.test(name),
    );

    expect(drawingPaths.length).toBeGreaterThan(0);
    expect(mediaPaths.length).toBeGreaterThan(0);
    expect(names.some((name) => name.startsWith("xl/richData/"))).toBe(false);

    const drawings = drawingPaths
      .map((path) => strFromU8(files[path]!))
      .join("\n");

    expect(drawings).toContain("oneCellAnchor");

    const worksheetXml = names
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .map((path) => strFromU8(files[path]!))
      .join("\n");

    expect(worksheetXml).not.toContain("#VALUE!");
  });

  it("reimporta ogni foto associandola al segnalibro corretto", async () => {
    const bytes = await exportSample();
    const imported = await parseXlsxBackup(
      new Blob([bytes as BlobPart]),
      { toJpeg: identity },
    );

    const byName = Object.fromEntries(
      imported.bookmarks.map((bookmark) => [bookmark.name, bookmark]),
    );

    expect(await labelOf(byName["Uno"]!.photo)).toBe("p1");
    expect(await labelOf(byName["Tre"]!.photo)).toBe("p3");
    expect(byName["Due"]!.photo).toBeNull();
    expect(imported.summary.errors).toEqual([]);
  });
});


describe("Legenda con nomi duplicati", () => {
  it("non associa alla prima categoria omonima: segnalibro senza categoria e avviso", async () => {
    const dup: AppData = {
      ...data,
      categories: [
        { id: "c1", name: "Cibo", color: "#ff0000", emoji: "🍕", macroId: null },
        { id: "c2", name: "cibo", color: "#00ff00", emoji: "🍔", macroId: null },
        { id: "c3", name: "Arte", color: "#0000ff", emoji: "🎨", macroId: null },
      ],
      bookmarks: [
        migrateBookmark({ id: "aaaaaaaaaa01", name: "Uno", lat: 1, lng: 1, categoryId: "c1" }),
        migrateBookmark({ id: "aaaaaaaaaa02", name: "Due", lat: 2, lng: 2, categoryId: "c3" }),
      ],
    };
    const bytes = await exportXlsxBytes(dup, { getPhoto: async () => undefined });
    const inc = await parseXlsxBackup(new Blob([bytes as BlobPart]), { toJpeg: identity });
    const uno = inc.bookmarks.find((b) => b.name === "Uno")!;
    const due = inc.bookmarks.find((b) => b.name === "Due")!;
    expect(uno.categoryId).toBeNull();
    expect(inc.categories.find((c) => c.id === due.categoryId)?.name).toBe("Arte");
    expect(inc.categories.some((c) => c.name.toLowerCase() === "cibo")).toBe(false);
    expect(inc.summary.warnings.join(" ")).toMatch(/ambigu/);
  });
});

describe("ZIP legacy con foto WebP", () => {
  it("importa il backup legacy e converte le foto WebP in JPG", async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);
    const legacy = {
      bookmarks: [{ id: "legacyid0001", name: "Vecchio", lat: 4, lng: 5, photoFile: "ph1.webp" }],
      categories: [],
      tags: [],
    };
    const zip = zipSync({
      "data.json": strToU8(JSON.stringify(legacy)),
      "photos/ph1.webp": webp,
    });
    const seen: string[] = [];
    const inc = await parseZipBackup(new Blob([zip as BlobPart]), async (b) => {
      seen.push(b.type);
      return new Blob([fakeJpg("converted")], { type: "image/jpeg" });
    });
    expect(seen).toEqual(["image/webp"]);
    expect(inc.bookmarks[0]!.photo?.type).toBe("image/jpeg");
    expect(await labelOf(inc.bookmarks[0]!.photo)).toBe("converted");
  });

  it("foto illeggibile: segnalibro importato senza foto e conteggiato come mancante", async () => {
    const zip = zipSync({
      "data.json": strToU8(
        JSON.stringify({ bookmarks: [{ id: "legacyid0002", name: "R", lat: 1, lng: 1, photoId: "x" }] }),
      ),
      "photos/x.jpg": new Uint8Array([1, 2, 3]),
    });
    const inc = await parseZipBackup(new Blob([zip as BlobPart]), async () => null);
    expect(inc.bookmarks[0]!.photo).toBeNull();
    expect(inc.summary.photosMissing).toBe(1);
  });
});
