// @ts-expect-error - il pacchetto non ha tipi
import { OpenLocationCode } from "open-location-code";

const olc = new OpenLocationCode() as {
  isValid: (c: string) => boolean;
  isShort: (c: string) => boolean;
  isFull: (c: string) => boolean;
  decode: (c: string) => { latitudeCenter: number; longitudeCenter: number };
  recoverNearest: (c: string, lat: number, lng: number) => string;
};

export interface ParsedCoords {
  lat: number;
  lng: number;
}

export type LocationFormat =
  | "decimal"
  | "cardinal"
  | "dm"
  | "dms"
  | "pluscode"
  | "pluscode-short"
  | "gmaps-url";

export const FORMAT_LABELS: Record<LocationFormat, string> = {
  decimal: "Coordinate decimali",
  cardinal: "Coordinate con punti cardinali",
  dm: "Gradi e minuti",
  dms: "Gradi, minuti, secondi",
  pluscode: "Plus Code",
  "pluscode-short": "Plus Code breve",
  "gmaps-url": "Link Google Maps",
};

export const RANGE_MESSAGE =
  "Coordinate fuori intervallo: la latitudine deve essere fra -90 e 90, la longitudine fra -180 e 180.";
export const SHORT_PLUS_MESSAGE =
  "Plus Code breve: aggiungi la città o località (es. “QMHF+RM San Teodoro”) oppure usa il Plus Code completo.";
export const SHORT_PLUS_NOT_FOUND =
  "Località del Plus Code non trovata: controlla il nome o usa il Plus Code completo.";
export const AMBIGUOUS_MESSAGE =
  "Coordinate ambigue: separa latitudine e longitudine con “;” oppure usa il punto come separatore decimale.";

/** Esito dell'analisi di un riferimento geografico incollato dall'utente. */
export type LocationParse =
  | { kind: "coords"; coords: ParsedCoords; format: LocationFormat; label?: string | null }
  | { kind: "short-plus"; code: string; locality: string }
  | { kind: "place-name"; label: string }
  | { kind: "error"; message: string }
  | null;

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const inRange = (c: ParsedCoords) => Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
const num = (s: string | undefined) => Number((s ?? "").replace(",", "."));

interface Component {
  value: number;
  axis: "lat" | "lng" | null;
  hasMin: boolean;
  hasSec: boolean;
  hasLetter: boolean;
}

const N = String.raw`\d{1,3}(?:[.,]\d+)?`;
const COMP_RE = new RegExp(
  String.raw`^([NSEW])?\s*([-+]?${N})\s*(?:°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*'\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*"\s*)?)?)?([NSEW])?$`,
  "i",
);

function parseComponent(raw: string): Component | null {
  const s = raw.trim();
  if (!s) return null;
  const m = COMP_RE.exec(s);
  if (!m) return null;
  const [, pre, degS, minS, secS, post] = m;
  if (pre && post) return null;
  const letter = (pre ?? post ?? "").toUpperCase();
  const deg = num(degS);
  const hasMin = minS !== undefined;
  const hasSec = secS !== undefined;
  if (hasMin && !/^[-+]?\d+$/.test(degS ?? "")) return null; // gradi interi se ci sono minuti
  const min = hasMin ? num(minS) : 0;
  const sec = hasSec ? num(secS) : 0;
  if (min >= 60 || sec >= 60) return null;
  if (hasSec && !/^\d+$/.test(minS ?? "")) return null;
  const negative = deg < 0 || (degS ?? "").startsWith("-");
  if (letter && negative) return null;
  let value = Math.abs(deg) + min / 60 + sec / 3600;
  if (negative || letter === "S" || letter === "W") value = -value;
  const axis = letter === "N" || letter === "S" ? "lat" : letter ? "lng" : null;
  return { value, axis, hasMin, hasSec, hasLetter: !!letter };
}

function normalizeSymbols(input: string): string {
  return input
    .trim()
    .replace(/[º˚]/g, "°")
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″“”]|''/g, '"')
    .replace(/\s+/g, " ");
}

type CoordsResult =
  | { ok: true; coords: ParsedCoords; format: LocationFormat }
  | { ok: false; message: string }
  | null;

/**
 * Coordinate decimali, con punti cardinali, in gradi/minuti o DMS.
 * null = non sembra una coppia di coordinate.
 */
export function parseCoordsDetailed(input: string): CoordsResult {
  const s = normalizeSymbols(input);
  if (!/^[-+\d\sNSEW°'".,;]+$/i.test(s) || !/\d/.test(s)) return null;

  const found = new Map<string, { coords: ParsedCoords; format: LocationFormat }>();
  let outOfRange = false;
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1]!;
    const ch = s[i]!;
    const sepHere = /[\s,;]/.test(ch);
    const letterBoundary = /[NSEW]/i.test(prev) && !/[\s,;]/.test(ch);
    if (!sepHere && !letterBoundary) continue;
    const left = s.slice(0, i);
    const right = s.slice(i).replace(/^[\s,;]+/, "");
    // un solo separatore fra le due parti
    const sep = s.slice(i, s.length - right.length);
    if ((sep.match(/[,;]/g) ?? []).length > 1) continue;
    const a = parseComponent(left);
    const b = parseComponent(right);
    if (!a || !b) continue;
    // senza simboli né lettere servono separatori decimali coerenti
    let lat: number;
    let lng: number;
    if (a.axis && b.axis && a.axis === b.axis) continue;
    if (a.axis === "lng" || b.axis === "lat") {
      lat = b.value;
      lng = a.value;
    } else {
      lat = a.value;
      lng = b.value;
    }
    const format: LocationFormat =
      a.hasSec || b.hasSec ? "dms" : a.hasMin || b.hasMin ? "dm" : a.hasLetter || b.hasLetter ? "cardinal" : "decimal";
    const coords = { lat, lng };
    if (!inRange(coords)) {
      outOfRange = true;
      continue;
    }
    found.set(`${round6(lat)},${round6(lng)}`, { coords, format });
  }
  if (found.size === 1) {
    const [only] = found.values();
    return { ok: true, ...only! };
  }
  if (found.size > 1) return { ok: false, message: AMBIGUOUS_MESSAGE };
  if (outOfRange) return { ok: false, message: RANGE_MESSAGE };
  return null;
}

/** Versione semplice: coordinate valide oppure null. */
export function parseCoords(input: string): ParsedCoords | null {
  const r = parseCoordsDetailed(input);
  return r && r.ok ? r.coords : null;
}

const OLC_CHARS = "23456789CFGHJMPQRVWX";
const PLUS_RE = new RegExp(`(?:^|\\s|,)([${OLC_CHARS}0]{2,8}\\+[${OLC_CHARS}]{0,7})(?=$|\\s|,)`, "i");

/** Estrae un eventuale Plus Code e il resto del testo (località di riferimento). */
export function splitPlusCode(input: string): { code: string; locality: string } | null {
  const m = PLUS_RE.exec(input.trim());
  if (!m) return null;
  const raw = m[1] ?? "";
  const code = raw.toUpperCase();
  const locality = input.replace(raw, "").replace(/^[\s,]+|[\s,]+$/g, "");
  return { code, locality };
}

/** Decodifica un Plus Code completo, o corto usando coordinate di riferimento. */
export function decodePlusCode(code: string, ref?: ParsedCoords): ParsedCoords | null {
  try {
    let full = code;
    if (!olc.isValid(code)) return null;
    if (!olc.isFull(code)) {
      if (!ref) return null;
      full = olc.recoverNearest(code, ref.lat, ref.lng);
    }
    if (!olc.isValid(full) || !olc.isFull(full)) return null;
    const area = olc.decode(full);
    return { lat: area.latitudeCenter, lng: area.longitudeCenter };
  } catch {
    return null;
  }
}

export function isPlusCodeShort(code: string): boolean {
  try {
    return olc.isShort(code);
  } catch {
    return true;
  }
}

/** Coordinate contenute in un URL lungo di Google Maps. */
export function parseGoogleMapsUrl(
  input: string,
): { coords: ParsedCoords | null; label: string | null } | null {
  const s = input.trim();
  if (!/^https?:\/\//i.test(s) || !/(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl)/i.test(s))
    return null;
  const D = String.raw`(-?\d+(?:\.\d+)?)`;
  const hit =
    new RegExp(`!3d${D}!4d${D}`).exec(s) ??
    new RegExp(`[?&](?:q|query|destination|ll|center)=(?:loc:)?${D}(?:,|%2C)(?:\\+|%20)?${D}`, "i").exec(s) ??
    new RegExp(`@${D},${D}`).exec(s);
  const place = /\/maps\/place\/([^/@?]+)/.exec(s);
  let label: string | null = null;
  if (place?.[1]) {
    try {
      label = decodeURIComponent(place[1].replace(/\+/g, " "));
    } catch {
      label = place[1].replace(/\+/g, " ");
    }
  }
  return { coords: hit ? { lat: Number(hit[1]), lng: Number(hit[2]) } : null, label };
}

export function isShortMapsLink(input: string): boolean {
  const s = input.trim();
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(s);
}

/** Ripulisce un indirizzo copiato da Google Maps ("Via Enna, 10, 04011 Aprilia LT"). */
export function normalizeAddress(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}

/**
 * Analisi locale (offline) di un riferimento geografico.
 * I link brevi Google vanno controllati prima con isShortMapsLink().
 * null = testo libero da cercare come indirizzo.
 */
export function parseLocation(input: string): LocationParse {
  const raw = input.trim();
  if (!raw) return null;

  const gmaps = parseGoogleMapsUrl(raw);
  if (gmaps) {
    if (gmaps.coords) {
      if (!inRange(gmaps.coords)) return { kind: "error", message: RANGE_MESSAGE };
      return { kind: "coords", coords: gmaps.coords, format: "gmaps-url", label: gmaps.label };
    }
    if (gmaps.label) return { kind: "place-name", label: gmaps.label };
    return {
      kind: "error",
      message: "Il link non contiene coordinate: incolla l’URL completo, le coordinate o il Plus Code.",
    };
  }

  const c = parseCoordsDetailed(raw);
  if (c) return c.ok ? { kind: "coords", coords: c.coords, format: c.format } : { kind: "error", message: c.message };

  const plus = splitPlusCode(raw);
  if (plus) {
    if (!olc.isValid(plus.code)) return { kind: "error", message: "Plus Code non valido." };
    if (olc.isFull(plus.code)) {
      const coords = decodePlusCode(plus.code);
      if (!coords) return { kind: "error", message: "Plus Code non valido." };
      return { kind: "coords", coords, format: "pluscode", label: plus.code };
    }
    if (!plus.locality) return { kind: "error", message: SHORT_PLUS_MESSAGE };
    return { kind: "short-plus", code: plus.code, locality: normalizeAddress(plus.locality) };
  }
  return null;
}

/** Etichetta "Formato · 41.585591, 12.660486". */
export function formatCoordsLabel(c: ParsedCoords, format: LocationFormat, prefix?: string | null) {
  const coords = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  return `${prefix ? `${prefix} · ` : ""}${FORMAT_LABELS[format]} · ${coords}`;
}
