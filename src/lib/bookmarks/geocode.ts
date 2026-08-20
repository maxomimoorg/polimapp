export interface PlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
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
  const q = query.trim();
  if (q.length < 2) return [];
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