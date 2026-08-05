import type { AppLocale } from "@/i18n/config";
import type { CountryCode } from "@/lib/countries";

export function buildGeoNamesCitySearchUrl({ country, locale, query, username }: {
  country: CountryCode;
  locale: AppLocale;
  query: string;
  username: string;
}): URL {
  const url = new URL("https://secure.geonames.org/searchJSON");
  url.search = new URLSearchParams({
    country,
    featureClass: "P",
    lang: locale,
    maxRows: "10",
    name_startsWith: query,
    orderby: "relevance",
    style: "FULL",
    username,
  }).toString();
  return url;
}
