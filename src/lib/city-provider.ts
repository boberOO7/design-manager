import "server-only";

import type { AppLocale } from "@/i18n/config";
import type { CountryCode } from "@/lib/countries";
import { buildGeoNamesCitySearchUrl } from "@/lib/geonames";

export type CitySearchResult = {
  id: number;
  name: string;
  region: string | null;
  countryName: string | null;
  displayName: string;
};

type GeoNamesPlace = {
  adminName1?: unknown;
  countryName?: unknown;
  geonameId?: unknown;
  name?: unknown;
  toponymName?: unknown;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function searchCities({ country, locale, query, signal }: {
  country: CountryCode;
  locale: AppLocale;
  query: string;
  signal?: AbortSignal;
}): Promise<CitySearchResult[]> {
  const username = process.env.GEONAMES_USERNAME?.trim();
  if (!username) throw new Error("GEONAMES_USERNAME is not configured");

  const response = await fetch(buildGeoNamesCitySearchUrl({ country, locale, query, username }), {
    cache: "force-cache",
    next: { revalidate: 300 },
    signal,
  });
  if (!response.ok) throw new Error(`GeoNames request failed with ${response.status}`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.geonames)) throw new Error("GeoNames returned an invalid response");

  return payload.geonames.flatMap((place): CitySearchResult[] => {
    if (!isRecord(place)) return [];
    const typedPlace: GeoNamesPlace = place;
    const id = typeof typedPlace.geonameId === "number" ? typedPlace.geonameId : null;
    const name = textValue(typedPlace.name) ?? textValue(typedPlace.toponymName);
    if (id === null || !name) return [];
    const region = textValue(typedPlace.adminName1);
    const countryName = textValue(typedPlace.countryName);
    return [{
      id,
      name,
      region,
      countryName,
      displayName: [name, region, countryName].filter((part): part is string => part !== null).join(", "),
    }];
  }).slice(0, 10);
}
