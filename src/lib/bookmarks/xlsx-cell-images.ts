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
