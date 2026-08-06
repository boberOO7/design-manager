import { describe, expect, it } from "vitest";
import { buildGeoNamesCityDetailsUrl, buildGeoNamesCitySearchUrl, getPreferredGeoNamesCityName } from "./geonames";

describe("GeoNames city provider", () => {
  it("keeps credentials server-side and hard-filters populated places by country", () => {
    const url = buildGeoNamesCitySearchUrl({ country: "UA", locale: "uk", query: "К", username: "private-user" });
    expect(url.origin).toBe("https://secure.geonames.org");
    expect(url.searchParams.get("country")).toBe("UA");
    expect(url.searchParams.get("featureClass")).toBe("P");
    expect(url.searchParams.get("name_startsWith")).toBe("К");
    expect(url.searchParams.get("maxRows")).toBe("10");
    expect(url.searchParams.get("lang")).toBe("uk");
    expect(url.searchParams.get("searchlang")).toBe("uk");
    expect(url.searchParams.get("username")).toBe("private-user");
  });

  it("uses a locale-restricted preferred name instead of the alternate search match", () => {
    const place = {
      name: "Львив",
      toponymName: "Lviv",
      alternateNames: [
        { lang: "uk", name: "Львів", isPreferredName: true },
        { lang: "en", name: "Lviv", isPreferredName: true },
        { lang: "ru", name: "Львов", isPreferredName: true },
      ],
    };

    expect(getPreferredGeoNamesCityName(place, "uk")).toBe("Львів");
    expect(getPreferredGeoNamesCityName(place, "en")).toBe("Lviv");
  });

  it("falls back to English for Ukrainian only when a preferred Ukrainian name is unavailable", () => {
    const place = { name: "Lviv", toponymName: "Lviv", alternateNames: [{ lang: "en", name: "Lviv", isPreferredName: true }] };
    expect(getPreferredGeoNamesCityName(place, "uk")).toBe("Lviv");
  });

  it("builds locale-scoped details requests for resolving selected cities", () => {
    const url = buildGeoNamesCityDetailsUrl({ geonamesId: 702550, locale: "en", username: "private-user" });
    expect(url.pathname).toBe("/getJSON");
    expect(url.searchParams.get("geonameId")).toBe("702550");
    expect(url.searchParams.get("lang")).toBe("en");
  });
});
