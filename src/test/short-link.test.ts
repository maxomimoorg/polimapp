import { describe, expect, it } from "vitest";
import { searchPlaces, UnsupportedLinkError } from "@/lib/bookmarks/geocode";

describe("Google Maps links", () => {
  it("rejects short links without contacting a server", async () => {
    await expect(searchPlaces("https://maps.app.goo.gl/abc123")).rejects.toBeInstanceOf(UnsupportedLinkError);
  });
  it("parses plain coordinates locally", async () => {
    const [r] = await searchPlaces("41.9028, 12.4964");
    expect(r?.lat).toBeCloseTo(41.9028);
    expect(r?.lng).toBeCloseTo(12.4964);
  });
});
