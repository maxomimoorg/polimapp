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

/** "41,5855912, 12,6604862" oppure "41.5855912 12.6604862" (anche con °, N/E). */
export function parseCoords(input: string): ParsedCoords | null {
  const s = input.trim().replace(/[°\s]*([NSEW])\b/gi, "$1");
  // due numeri separati da virgola/spazio, con decimali a punto o virgola
  const m =
    /^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(s) ??
    /^(-?\d{1,3}[.,]\d+)\s+(-?\d{1,3}[.,]\d+)$/.exec(s);
  if (!m) return null;

  // con separatore virgola e decimali a virgola: "41,58, 12,66" → 2 gruppi già corretti
  const lat = Number((m[1] ?? "").replace(",", "."));
  const lng = Number((m[2] ?? "").replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Estrae un eventuale Plus Code e il resto del testo (località di riferimento). */
export function splitPlusCode(input: string): { code: string; locality: string } | null {
  const m = /([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})/i.exec(input.trim());
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
    if (!olc.isFull(code)) {
      if (!ref) return null;
      full = olc.recoverNearest(code, ref.lat, ref.lng);
    }
    if (!olc.isValid(full)) return null;
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
export function parseGoogleMapsUrl(input: string): { coords: ParsedCoords | null; label: string | null } | null {
  const s = input.trim();
  if (!/^https?:\/\//i.test(s) || !/(google\.[a-z.]+\/maps|goo\.gl)/i.test(s)) return null;
  const hit =
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(s) ??
    /[?&](?:q|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/.exec(s) ??
    /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s);
  const place = /\/maps\/place\/([^/@?]+)/.exec(s);
  return {
    coords: hit ? { lat: Number(hit[1]), lng: Number(hit[2]) } : null,
    label: place?.[1] ? decodeURIComponent(place[1]).replace(/\+/g, " ") : null,
  };
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
