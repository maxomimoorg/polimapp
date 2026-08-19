export interface PlaceResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
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