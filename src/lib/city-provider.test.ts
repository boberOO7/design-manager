import { describe, expect, it } from "vitest";
import { buildGeoNamesCitySearchUrl } from "./geonames";

describe("GeoNames city provider", () => {
  it("keeps credentials server-side and hard-filters populated places by country", () => {
    const url = buildGeoNamesCitySearchUrl({ country: "UA", locale: "uk", query: "К", username: "private-user" });
    expect(url.origin).toBe("https://secure.geonames.org");
    expect(url.searchParams.get("country")).toBe("UA");
    expect(url.searchParams.get("featureClass")).toBe("P");
    expect(url.searchParams.get("name_startsWith")).toBe("К");
    expect(url.searchParams.get("maxRows")).toBe("10");
    expect(url.searchParams.get("lang")).toBe("uk");
    expect(url.searchParams.get("username")).toBe("private-user");
  });
});
