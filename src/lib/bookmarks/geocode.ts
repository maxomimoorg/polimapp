import {
  decodePlusCode,
  isShortMapsLink,
  normalizeAddress,
  parseCoords,
  parseGoogleMapsUrl,
  splitPlusCode,
  type ParsedCoords,
} from "./parse-location";

export interface PlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export const SHORT_LINK_MESSAGE =
  "I link brevi di Google Maps (maps.app.goo.gl) non sono supportati. Apri il link, copia le coordinate o l’URL completo dalla barra degli indirizzi e incollalo qui.";

export class UnsupportedLinkError extends Error {
  constructor() {
    super(SHORT_LINK_MESSAGE);
    this.name = "UnsupportedLinkError";
  }
}

function coordLabel(c: ParsedCoords, prefix?: string | null): string {
  const coords = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  return prefix ? `${prefix} (${coords})` : coords;
}

/**
 * Riconosce i formati di Google Maps: coordinate, Plus Code, URL lungo e link breve.
 * Restituisce null se la stringa è un normale indirizzo testuale.
 */
async function parseSpecialQuery(raw: string, signal?: AbortSignal): Promise<PlaceResult | null> {
  const coords = parseCoords(raw);
  if (coords) {
    return { id: `coords-${coords.lat}-${coords.lng}`, label: coordLabel(coords), ...coords };
  }

  if (isShortMapsLink(raw)) {
    // i link brevi richiederebbero un redirect lato server: non sono supportati
    throw new UnsupportedLinkError();
  }

  const gmaps = parseGoogleMapsUrl(raw);
  if (gmaps) {
    if (gmaps.coords) {
      return {
        id: `gurl-${gmaps.coords.lat}-${gmaps.coords.lng}`,
        label: gmaps.label ?? coordLabel(gmaps.coords),
        ...gmaps.coords,
      };
    }
    if (gmaps.label) {
      const byName = await searchPlaces(gmaps.label, signal);
      if (byName[0]) return byName[0];
    }
    return null;
  }

  const plus = splitPlusCode(raw);
  if (plus) {
    let ref: ParsedCoords | undefined;
    const direct = decodePlusCode(plus.code);
    if (direct) {
      return { id: `plus-${plus.code}`, label: coordLabel(direct, plus.code), ...direct };
    }
    if (plus.locality) {
      const near = await searchPlacesNominatim(normalizeAddress(plus.locality), signal).catch(() => []);
      if (near[0]) ref = { lat: near[0].lat, lng: near[0].lng };
    }
    const decoded = ref ? decodePlusCode(plus.code, ref) : null;
    if (decoded) {
      return {
        id: `plus-${plus.code}`,
        label: coordLabel(decoded, `${plus.code} ${plus.locality}`.trim()),
        ...decoded,
      };
    }
  }

  return null;
}


interface PhotonFeature {
  properties: Record<string, string | number | undefined>;
  geometry: { coordinates: [number, number] };
}

function photonLabel(p: Record<string, string | number | undefined>): string {
  const line1 = [p["name"], p["housenumber"]].filter(Boolean).join(" ");
  const street = p["street"] && p["street"] !== p["name"] ? String(p["street"]) : "";
  const parts = [line1 || street, street && line1 ? street : "", p["postcode"], p["city"] ?? p["county"], p["state"], p["country"]]
    .filter(Boolean)
    .map(String);
  return Array.from(new Set(parts)).join(", ");
}

/** Suggerimenti tolleranti su indirizzi parziali (Photon, con fallback Nominatim). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const raw = query.trim();
  if (raw.length < 2) return [];

  const special = await parseSpecialQuery(raw, signal);
  if (special) return [special];

  const q = normalizeAddress(raw);
  try {

    const url = new URL("https://photon.komoot.io/api");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "8");
    url.searchParams.set("lang", "it");
    const res = await fetch(url.toString(), { signal: signal ?? null });
    if (res.ok) {
      const json = (await res.json()) as { features?: PhotonFeature[] };
      const out: PlaceResult[] = (json.features ?? [])
        .filter((f) => Array.isArray(f.geometry?.coordinates))
        .map((f, i) => ({
          id: `photon-${f.properties["osm_id"] ?? i}-${i}`,
          label: photonLabel(f.properties) || q,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));
      const seen = new Set<string>();
      const unique = out.filter((r) => (seen.has(r.label) ? false : (seen.add(r.label), true)));
      if (unique.length > 0) return unique;
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
  }
  return searchPlacesNominatim(q, signal);
}

async function searchPlacesNominatim(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("accept-language", "it");
  const res = await fetch(url.toString(), { signal: signal ?? null });
  if (!res.ok) throw new Error("Ricerca non disponibile");
  const json = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return json.map((r) => ({
    id: String(r.place_id),
    label: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

/** Cerca le coordinate di un indirizzo. Restituisce null se non trovato. */
export async function geocodeAddress(address: string, signal?: AbortSignal): Promise<PlaceResult | null> {
  const results = await searchPlaces(address, signal);
  return results[0] ?? null;
}

/** Indirizzo corrispondente a una coppia di coordinate. */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "it");
  const res = await fetch(url.toString(), { signal: signal ?? null });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string };
  return json.display_name ?? null;
}