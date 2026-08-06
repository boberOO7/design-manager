import "server-only";

import type { AppLocale } from "@/i18n/config";
import type { CountryCode } from "@/lib/countries";
import { buildGeoNamesCityDetailsUrl, buildGeoNamesCitySearchUrl, getPreferredGeoNamesCityName } from "@/lib/geonames";

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

async function getGeoNamesCityPlace({ geonamesId, locale, signal, username }: {
  geonamesId: number;
  locale: AppLocale;
  signal?: AbortSignal;
  username: string;
}): Promise<GeoNamesPlace | null> {
  const response = await fetch(buildGeoNamesCityDetailsUrl({ geonamesId, locale, username }), {
    cache: "force-cache",
    next: { revalidate: 300 },
    signal,
  });
  if (!response.ok) throw new Error(`GeoNames city details request failed with ${response.status}`);
  const payload: unknown = await response.json();
  return isRecord(payload) ? payload : null;
}

export async function getLocalizedCityName({ city, geonamesId, locale }: {
  city: string | null;
  geonamesId: number | null;
  locale: AppLocale;
}): Promise<string | null> {
  if (geonamesId === null) return city;

  try {
    const username = process.env.GEONAMES_USERNAME?.trim();
    if (!username) throw new Error("GEONAMES_USERNAME is not configured");
    const place = await getGeoNamesCityPlace({ geonamesId, locale, username });
    return getPreferredGeoNamesCityName(place, locale) ?? city;
  } catch (error) {
    console.error("Unable to resolve GeoNames city", error);
    return city;
  }
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

  const candidates = payload.geonames.flatMap((place): Array<Omit<CitySearchResult, "displayName" | "name">> => {
    if (!isRecord(place)) return [];
    const typedPlace: GeoNamesPlace = place;
    const id = typeof typedPlace.geonameId === "number" ? typedPlace.geonameId : null;
    if (id === null) return [];
    const region = textValue(typedPlace.adminName1);
    const countryName = textValue(typedPlace.countryName);
    return [{ id, region, countryName }];
  }).filter((candidate, index, values) => values.findIndex((value) => value.id === candidate.id) === index).slice(0, 10);

  const localized = await Promise.all(candidates.map(async (candidate): Promise<CitySearchResult | null> => {
    try {
      const place = await getGeoNamesCityPlace({ geonamesId: candidate.id, locale, signal, username });
      const name = getPreferredGeoNamesCityName(place, locale);
      if (!name) return null;
      return {
        ...candidate,
        name,
        displayName: [name, candidate.region, candidate.countryName].filter((part): part is string => part !== null).join(", "),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      console.error("Unable to resolve GeoNames search result", error);
      return null;
    }
  }));

  return localized.filter((result): result is CitySearchResult => result !== null);
}
