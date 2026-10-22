/**
 * Immagini realmente "nella cella" (formato Excel "Inserisci immagine nella cella",
 * rich value _localImage). ExcelJS non lo supporta: il pacchetto viene post-elaborato.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const RD_NS = "http://schemas.microsoft.com/office/spreadsheetml/2017/richdata";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface CellImage {
  /** Riferimento cella, es. "C2". */
  ref: string;
  jpg: Uint8Array;
}

function sheetPathByName(files: Record<string, Uint8Array>, sheetName: string): string | null {
  const wbXml = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  const wbRels = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const norm = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase("it");
  const tag = [...wbXml.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => norm(t.match(/name="([^"]*)"/)?.[1] ?? "") === norm(sheetName));
  const rid = tag?.match(/r:id="([^"]*)"/)?.[1];
  if (!rid) return null;
  const rel = [...wbRels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.match(/Id="([^"]*)"/)?.[1] === rid);
  const target = rel?.match(/Target="([^"]*)"/)?.[1];
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/** Inserisce le immagini nelle celle indicate (le celle devono già esistere nel foglio). */
export function embedCellImages(
  xlsx: Uint8Array,
  sheetName: string,
  images: CellImage[],
): Uint8Array {
  if (images.length === 0) return xlsx;
  const files = unzipSync(xlsx);
  const sheetPath = sheetPathByName(files, sheetName);
  if (!sheetPath || !files[sheetPath]) throw new Error("Foglio per le foto non trovato");
  let sheet = strFromU8(files[sheetPath]);

  const n = images.length;
  images.forEach((img, i) => {
    const media = `xl/media/polimapp-photo-${i + 1}.jpeg`;
    files[media] = new Uint8Array(img.jpg);
    const re = new RegExp(`<c r="${img.ref}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
    const m = sheet.match(re);
    if (!m) throw new Error(`Cella ${img.ref} non trovata`);
    const s = (m[1] ?? "").match(/\ss="\d+"/)?.[0] ?? "";
    sheet = sheet.replace(re, `<c r="${img.ref}"${s} t="e" vm="${i + 1}"><v>#VALUE!</v></c>`);
  });
  files[sheetPath] = strToU8(sheet);

  const bk = (k: number) =>
    `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${k}"/></ext></extLst></bk>`;
  const idx = [...Array(n).keys()];
  files["xl/metadata.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="${RD_NS}"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${n}">${idx.map(bk).join("")}</futureMetadata><valueMetadata count="${n}">${idx.map((k) => `<bk><rc t="1" v="${k}"/></bk>`).join("")}</valueMetadata></metadata>`,
  );
  files["xl/richData/rdrichvalue.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<rvData xmlns="${RD_NS}" count="${n}">${idx.map((k) => `<rv s="0"><v>${k}</v><v>5</v></rv>`).join("")}</rvData>`,
  );
  files["xl/richData/rdrichvaluestructure.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<rvStructures xmlns="${RD_NS}" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>`,
  );
  files["xl/richData/richValueRel.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="${REL}">${idx.map((k) => `<rel r:id="rId${k + 1}"/>`).join("")}</richValueRels>`,
  );
  files["xl/richData/_rels/richValueRel.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${idx.map((k) => `<Relationship Id="rId${k + 1}" Type="${REL}/image" Target="../media/polimapp-photo-${k + 1}.jpeg"/>`).join("")}</Relationships>`,
  );

  let rels = strFromU8(files["xl/_rels/workbook.xml.rels"]!);
  const add = (id: string, type: string, target: string) => {
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`,
    );
  };
  add("rIdPmMeta", `${REL}/sheetMetadata`, "metadata.xml");
  add("rIdPmRv", "http://schemas.microsoft.com/office/2017/06/relationships/rdRichValue", "richData/rdrichvalue.xml");
  add(
    "rIdPmRvs",
    "http://schemas.microsoft.com/office/2017/06/relationships/rdRichValueStructure",
    "richData/rdrichvaluestructure.xml",
  );
  add(
    "rIdPmRvr",
    "http://schemas.microsoft.com/office/2022/10/relationships/richValueRel",
    "richData/richValueRel.xml",
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(rels);

  let ct = strFromU8(files["[Content_Types].xml"]!);
  if (!/Extension="jpeg"/i.test(ct))
    ct = ct.replace("<Default ", '<Default Extension="jpeg" ContentType="image/jpeg"/><Default ');
  const ov = (part: string, type: string) =>
    `<Override PartName="${part}" ContentType="${type}"/>`;
  ct = ct.replace(
    "</Types>",
    ov("/xl/metadata.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml") +
      ov("/xl/richData/rdrichvalue.xml", "application/vnd.ms-excel.rdrichvalue+xml") +
      ov("/xl/richData/rdrichvaluestructure.xml", "application/vnd.ms-excel.rdrichvaluestructure+xml") +
      ov("/xl/richData/richValueRel.xml", "application/vnd.ms-excel.richvaluerel+xml") +
      "</Types>",
  );
  files["[Content_Types].xml"] = strToU8(ct);
  return zipSync(files);
}

function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Legge le immagini nella cella del foglio indicato.
 * Ritorna riga → byte, limitato alla colonna `col` (1-based) se indicata.
 * Segue la catena vm → metadata → rich value → relazione → media, quindi
 * l'associazione resta corretta anche dopo riordino delle righe.
 */
export function readCellImages(
  raw: Uint8Array,
  sheetName: string,
  col?: number,
): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(raw, {
      filter: (f) => f.name.startsWith("xl/") && !/^xl\/(printerSettings|theme)\//.test(f.name),
    });
  } catch {
    return out;
  }
  const rdv = files["xl/richData/rdrichvalue.xml"];
  const relXml = files["xl/richData/richValueRel.xml"];
  const relRels = files["xl/richData/_rels/richValueRel.xml.rels"];
  if (!rdv || !relXml || !relRels) return out;
  const sheetPath = sheetPathByName(files, sheetName);
  const sheet = sheetPath ? files[sheetPath] : undefined;
  if (!sheet) return out;

  // vm (1-based) → indice rich value, tramite metadata.xml se presente
  let vmToRv: number[] | null = null;
  const meta = files["xl/metadata.xml"];
  if (meta) {
    const xml = strFromU8(meta);
    const fut = xml.match(/<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/);
    const rvb = fut ? [...(fut[1] ?? "").matchAll(/<xlrd:rvb\b[^>]*\bi="(\d+)"/g)].map((m) => Number(m[1])) : [];
    const vmBlock = xml.match(/<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/)?.[1] ?? "";
    vmToRv = [...vmBlock.matchAll(/<bk>[\s\S]*?<rc\b[^>]*\bv="(\d+)"[^>]*\/>[\s\S]*?<\/bk>/g)].map(
      (m) => rvb[Number(m[1])] ?? NaN,
    );
  }
  // struttura: posizione della chiave LocalImageIdentifier
  const structs = files["xl/richData/rdrichvaluestructure.xml"];
  const keyPos: number[] = structs
    ? [...strFromU8(structs).matchAll(/<s\b[^>]*>([\s\S]*?)<\/s>/g)].map((m) =>
        Math.max(
          0,
          [...(m[1] ?? "").matchAll(/<k\b[^>]*n="([^"]*)"/g)].findIndex((k) =>
            /LocalImageIdentifier/.test(k[1] ?? ""),
          ),
        ),
      )
    : [];
  const rvs = [...strFromU8(rdv).matchAll(/<rv\b([^>]*)>([\s\S]*?)<\/rv>/g)].map((m) => {
    const s = Number((m[1] ?? "").match(/\bs="(\d+)"/)?.[1] ?? 0);
    const vals = [...(m[2] ?? "").matchAll(/<v[^>]*>([^<]*)<\/v>/g)].map((v) => v[1]);
    return Number(vals[keyPos[s] ?? 0]);
  });
  const rels = [...strFromU8(relXml).matchAll(/<rel\b[^>]*r:id="([^"]*)"/g)].map((m) => m[1]);
  const relTargets = new Map(
    [...strFromU8(relRels).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      m[0].match(/Id="([^"]*)"/)?.[1] ?? "",
      m[0].match(/Target="([^"]*)"/)?.[1] ?? "",
    ]),
  );
  for (const m of strFromU8(sheet).matchAll(/<c\b([^>]*)>/g)) {
    const attrs = m[1] ?? "";
    const vm = attrs.match(/\bvm="(\d+)"/)?.[1];
    const ref = attrs.match(/\br="([A-Z]+)(\d+)"/);
    if (!vm || !ref) continue;
    if (col && colNumber(ref[1] ?? "") !== col) continue;
    const rvIdx = vmToRv ? (vmToRv[Number(vm) - 1] ?? NaN) : Number(vm) - 1;
    const relIdx = rvs[rvIdx] ?? NaN;
    const rId = Number.isFinite(relIdx) ? rels[relIdx] : undefined;
    const t = rId ? relTargets.get(rId) : undefined;
    if (!t) continue;
    const path = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\.\//, "")}`;
    const bytes = files[path];
    if (bytes) out.set(Number(ref[2] ?? 0), bytes);
  }
  return out;
}
