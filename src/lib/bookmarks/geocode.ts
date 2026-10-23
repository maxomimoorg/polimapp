import {
  formatCoordsLabel,
  isShortMapsLink,
  normalizeAddress,
  parseLocation,
  round6,
  SHORT_PLUS_NOT_FOUND,
  decodePlusCode,
} from "./parse-location";

export interface PlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** true se proviene da coordinate/Plus Code/URL riconosciuti (posizione precisa). */
  precise?: boolean;
}

export const SHORT_LINK_MESSAGE =
  "I link brevi di Google Maps (maps.app.goo.gl) non sono supportati. Apri il link, copia le coordinate o l’URL completo dalla barra degli indirizzi e incollalo qui.";

/** Riferimento geografico riconosciuto ma non utilizzabile (messaggio per l'utente). */
export class LocationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationInputError";
  }
}

export class UnsupportedLinkError extends LocationInputError {
  constructor() {
    super(SHORT_LINK_MESSAGE);
    this.name = "UnsupportedLinkError";
  }
}

const precise = (lat: number, lng: number, label: string, id: string): PlaceResult => ({
  id,
  label,
  lat: round6(lat),
  lng: round6(lng),
  precise: true,
});

/**
 * Riconosce coordinate (decimali, cardinali, DM, DMS), Plus Code, URL lunghi e link brevi.
 * Restituisce null se la stringa è un normale indirizzo testuale.
 */
async function parseSpecialQuery(raw: string, signal?: AbortSignal): Promise<PlaceResult | null> {
  if (isShortMapsLink(raw)) throw new UnsupportedLinkError();
  const p = parseLocation(raw);
  if (!p) return null;
  switch (p.kind) {
    case "error":
      throw new LocationInputError(p.message);
    case "coords": {
      const { lat, lng } = p.coords;
      return precise(lat, lng, formatCoordsLabel(p.coords, p.format, p.label), `${p.format}-${lat}-${lng}`);
    }
    case "place-name": {
      const byName = await searchPlaces(p.label, signal);
      return byName[0] ?? null;
    }
    case "short-plus": {
      let near: PlaceResult[] = [];
      try {
        near = await searchPlaces(p.locality, signal);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
      }
      const ref = near[0];
      const decoded = ref ? decodePlusCode(p.code, { lat: ref.lat, lng: ref.lng }) : null;
      if (!decoded) throw new LocationInputError(SHORT_PLUS_NOT_FOUND);
      return precise(
        decoded.lat,
        decoded.lng,
        formatCoordsLabel(decoded, "pluscode-short", `${p.code} ${p.locality}`),
        `plus-${p.code}`,
      );
    }
  }
}

/** Analizza un riferimento preciso (coordinate, Plus Code, URL). null = testo libero. */
export async function resolvePreciseLocation(
  raw: string,
  signal?: AbortSignal,
): Promise<PlaceResult | null> {
  return parseSpecialQuery(raw.trim(), signal);
}

interface PhotonFeature {
  properties: Record<string, string | number | undefined>;
  geometry: { coordinates: [number, number] };
}

function photonLabel(p: Record<string, string | number | undefined>): string {
  const line1 = [p["name"], p["housenumber"]].filter(Boolean).join(" ");
  const street = p["street"] && p["street"] !== p["name"] ? String(p["street"]) : "";
  const parts = [
    line1 || street,
    street && line1 ? street : "",
    p["postcode"],
    p["city"] ?? p["county"],
    p["state"],
    p["country"],
  ]
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
export async function geocodeAddress(
  address: string,
  signal?: AbortSignal,
): Promise<PlaceResult | null> {
  const results = await searchPlaces(address, signal);
  return results[0] ?? null;
}

/** Indirizzo corrispondente a una coppia di coordinate. */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
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
