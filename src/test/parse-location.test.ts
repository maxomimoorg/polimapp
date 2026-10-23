import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLocation, parseCoords, SHORT_PLUS_MESSAGE, RANGE_MESSAGE } from "@/lib/bookmarks/parse-location";
import { searchPlaces, LocationInputError, UnsupportedLinkError } from "@/lib/bookmarks/geocode";

const LAT = 41.5855912;
const LNG = 12.6604862;

function coordsOf(input: string) {
  const r = parseLocation(input);
  if (!r || r.kind !== "coords") throw new Error(`non riconosciuto: ${input} → ${JSON.stringify(r)}`);
  return r;
}

describe("coordinate decimali", () => {
  it.each([
    "41.5855912, 12.6604862",
    "41,5855912; 12,6604862",
    "41.5855912 12.6604862",
    "41,5855912, 12,6604862",
    "41.5855912;12.6604862",
  ])("%s", (input) => {
    const r = coordsOf(input);
    expect(r.format).toBe("decimal");
    expect(r.coords.lat).toBeCloseTo(LAT, 6);
    expect(r.coords.lng).toBeCloseTo(LNG, 6);
  });

  it("valori negativi", () => {
    const r = coordsOf("-33.8688, -70.6693");
    expect(r.coords).toEqual({ lat: -33.8688, lng: -70.6693 });
  });
});

describe("punti cardinali", () => {
  it("41.5855912 N, 12.6604862 E", () => {
    const r = coordsOf("41.5855912 N, 12.6604862 E");
    expect(r.format).toBe("cardinal");
    expect(r.coords.lat).toBeCloseTo(LAT, 6);
    expect(r.coords.lng).toBeCloseTo(LNG, 6);
  });
  it("S e W diventano negativi", () => {
    const r = coordsOf("33.8688° S, 70.6693° W");
    expect(r.coords.lat).toBeCloseTo(-33.8688, 6);
    expect(r.coords.lng).toBeCloseTo(-70.6693, 6);
  });
  it("ordine invertito longitudine/latitudine", () => {
    const r = coordsOf("12.6604862 E 41.5855912 N");
    expect(r.coords.lat).toBeCloseTo(LAT, 6);
    expect(r.coords.lng).toBeCloseTo(LNG, 6);
  });
  it("lettere come prefisso", () => {
    const r = coordsOf("N 41.5855912 E 12.6604862");
    expect(r.coords.lat).toBeCloseTo(LAT, 6);
  });
});

describe("DMS e gradi/minuti", () => {
  it(`41°35'08.1"N 12°39'37.8"E`, () => {
    const r = coordsOf(`41°35'08.1"N 12°39'37.8"E`);
    expect(r.format).toBe("dms");
    expect(r.coords.lat).toBeCloseTo(41.585583, 5);
    expect(r.coords.lng).toBeCloseTo(12.6605, 5);
  });
  it("DMS con apici tipografici, S e W", () => {
    const r = coordsOf("33°52′07.7″S 70°40′09.5″W");
    expect(r.coords.lat).toBeCloseTo(-(33 + 52 / 60 + 7.7 / 3600), 6);
    expect(r.coords.lng).toBeCloseTo(-(70 + 40 / 60 + 9.5 / 3600), 6);
  });
  it("gradi e minuti decimali", () => {
    const r = coordsOf("41°35.1355'N, 12°39.6292'E");
    expect(r.format).toBe("dm");
    expect(r.coords.lat).toBeCloseTo(41 + 35.1355 / 60, 6);
    expect(r.coords.lng).toBeCloseTo(12 + 39.6292 / 60, 6);
  });
  it("minuti ≥ 60 non validi", () => {
    expect(parseLocation(`41°75'00"N 12°39'37.8"E`)).toBeNull();
  });
});

describe("limiti", () => {
  it.each(["91, 12", "-90.5, 10", "45, 181", "45, -180.1", "95°00'00\"N 12°00'00\"E"])(
    "%s rifiutato",
    (input) => {
      expect(parseLocation(input)).toEqual({ kind: "error", message: RANGE_MESSAGE });
      expect(parseCoords(input)).toBeNull();
    },
  );
  it("estremi validi", () => {
    expect(coordsOf("90, 180").coords).toEqual({ lat: 90, lng: 180 });
    expect(coordsOf("-90, -180").coords).toEqual({ lat: -90, lng: -180 });
  });
});

describe("Plus Code", () => {
  it("completo, decodificato offline", () => {
    const r = coordsOf("8FHJHMP6+66");
    expect(r.format).toBe("pluscode");
    expect(Math.abs(r.coords.lat - LAT)).toBeLessThan(0.0002);
    expect(Math.abs(r.coords.lng - LNG)).toBeLessThan(0.0002);
  });
  it("breve senza località: nessuna ipotesi", () => {
    expect(parseLocation("QMHF+RM")).toEqual({ kind: "error", message: SHORT_PLUS_MESSAGE });
  });
  it("breve con località: richiede il contesto", () => {
    expect(parseLocation("QMHF+RM San Teodoro")).toEqual({
      kind: "short-plus",
      code: "QMHF+RM",
      locality: "San Teodoro",
    });
  });
  it("codice non valido", () => {
    expect(parseLocation("8FHJHMP6+6")).toMatchObject({ kind: "error" });
  });
});

describe("URL Google Maps", () => {
  it("con !3d!4d", () => {
    const r = coordsOf(
      "https://www.google.com/maps/place/Aprilia/@41.58,12.65,15z/data=!3m1!4b1!4m6!3m5!3d41.5855912!4d12.6604862",
    );
    expect(r.format).toBe("gmaps-url");
    expect(r.coords).toEqual({ lat: LAT, lng: LNG });
    expect(r.label).toBe("Aprilia");
  });
  it("con @lat,lng negativi", () => {
    expect(coordsOf("https://www.google.com/maps/@-33.8688,-70.6693,14z").coords).toEqual({
      lat: -33.8688,
      lng: -70.6693,
    });
  });
  it("con ?q=", () => {
    expect(coordsOf("https://maps.google.com/?q=41.5855912,12.6604862").coords.lat).toBe(LAT);
  });
  it("fuori intervallo", () => {
    expect(parseLocation("https://www.google.com/maps/@99.1,12.6,14z")).toMatchObject({ kind: "error" });
  });
});

describe("input ambigui o non validi", () => {
  it("testo libero = indirizzo", () => {
    expect(parseLocation("Via Enna 10, Aprilia")).toBeNull();
  });
  it("virgole ambigue", () => {
    expect(parseLocation("41,5,12")).toMatchObject({ kind: "error" });
  });
  it("numero singolo", () => {
    expect(parseLocation("41.5855")).toBeNull();
  });
  it("due latitudini", () => {
    expect(parseLocation("41 N, 12 S")).toBeNull();
  });
});

describe("searchPlaces", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("risultato immediato con coordinate a 6 decimali, senza rete", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const [r] = await searchPlaces(`41°35'08.1"N 12°39'37.8"E`);
    expect(r?.label).toContain("41.585583, 12.660500");
    expect(r?.label).toContain("Gradi, minuti, secondi");
    expect(r?.precise).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("link brevi rifiutati", async () => {
    await expect(searchPlaces("https://maps.app.goo.gl/abc")).rejects.toBeInstanceOf(UnsupportedLinkError);
  });

  it("coordinate fuori intervallo → errore leggibile", async () => {
    await expect(searchPlaces("120, 12")).rejects.toBeInstanceOf(LocationInputError);
  });

  it("Plus Code breve con località: cerca il contesto e usa recoverNearest", async () => {
    // San Teodoro (SS) ≈ 40.773, 9.672
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            features: [{ properties: { name: "San Teodoro" }, geometry: { coordinates: [9.672, 40.773] } }],
          }),
        ),
      ),
    );
    const [r] = await searchPlaces("QMHF+RM San Teodoro");
    expect(r?.label).toContain("Plus Code breve");
    expect(Math.abs(r!.lat - 40.773)).toBeLessThan(0.5);
    expect(Math.abs(r!.lng - 9.672)).toBeLessThan(0.5);
  });

  it("Plus Code breve con località sconosciuta → errore", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response(u.includes("photon") ? '{"features":[]}' : "[]")));
    await expect(searchPlaces("QMHF+RM Inesistente")).rejects.toBeInstanceOf(LocationInputError);
  });
});
