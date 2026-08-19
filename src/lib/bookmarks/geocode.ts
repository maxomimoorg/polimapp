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
  url.searchParams.set("viewbox", "-25,72,45,33");
  url.searchParams.set("bounded", "1");
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