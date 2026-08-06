import type { AppLocale } from "@/i18n/config";
import type { CountryCode } from "@/lib/countries";

export type GeoNamesCityLanguage = "en" | "uk";

type GeoNamesPlaceName = {
  alternateNames?: unknown;
  name?: unknown;
  toponymName?: unknown;
};

type GeoNamesAlternateName = {
  isPreferredName?: unknown;
  lang?: unknown;
  name?: unknown;
};

export function getGeoNamesCityLanguage(locale: AppLocale): GeoNamesCityLanguage {
  return locale === "uk" ? "uk" : "en";
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getAlternateName(place: GeoNamesPlaceName, language: GeoNamesCityLanguage): string | null {
  if (!Array.isArray(place.alternateNames)) return null;
  const names = place.alternateNames.flatMap((alternate): GeoNamesAlternateName[] => {
    if (!isRecord(alternate)) return [];
    const typed: GeoNamesAlternateName = alternate;
    return typed.lang === language && textValue(typed.name) ? [typed] : [];
  });
  const preferred = names.find((alternate) => alternate.isPreferredName === true || alternate.isPreferredName === 1);
  return textValue(preferred?.name) ?? textValue(names[0]?.name);
}

/** Resolves only the requested Ukrainian or English GeoNames name variants. */
export function getPreferredGeoNamesCityName(place: unknown, locale: AppLocale): string | null {
  if (!isRecord(place)) return null;
  const typedPlace: GeoNamesPlaceName = place;
  const language = getGeoNamesCityLanguage(locale);
  const localizedName = textValue(typedPlace.name);
  const preferredEnglish = getAlternateName(typedPlace, "en");
  const standardName = textValue(typedPlace.toponymName);

  if (language === "uk") {
    return getAlternateName(typedPlace, "uk") ?? localizedName ?? preferredEnglish ?? standardName;
  }

  return preferredEnglish ?? localizedName ?? standardName;
}

export function buildGeoNamesCitySearchUrl({ country, locale, query, username }: {
  country: CountryCode;
  locale: AppLocale;
  query: string;
  username: string;
}): URL {
  const language = getGeoNamesCityLanguage(locale);
  const url = new URL("https://secure.geonames.org/searchJSON");
  url.search = new URLSearchParams({
    country,
    featureClass: "P",
    lang: language,
    maxRows: "10",
    name_startsWith: query,
    orderby: "relevance",
    searchlang: language,
    style: "FULL",
    username,
  }).toString();
  return url;
}

export function buildGeoNamesCityDetailsUrl({ geonamesId, locale, username }: {
  geonamesId: number;
  locale: AppLocale;
  username: string;
}): URL {
  const url = new URL("https://secure.geonames.org/getJSON");
  url.search = new URLSearchParams({
    geonameId: String(geonamesId),
    lang: getGeoNamesCityLanguage(locale),
    style: "FULL",
    username,
  }).toString();
  return url;
}
