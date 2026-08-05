import { NextResponse } from "next/server";
import { isAppLocale } from "@/i18n/config";
import { isCountryCode } from "@/lib/countries";
import { searchCities } from "@/lib/city-provider";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get("q")?.trim() ?? "";
  const country = parameters.get("country");
  const locale = parameters.get("locale");

  if (!query || query.length > 100 || !isCountryCode(country) || !isAppLocale(locale)) {
    return NextResponse.json({ error: "invalid_request", results: [] }, { status: 400 });
  }

  try {
    const results = await searchCities({ country, locale, query, signal: request.signal });
    return NextResponse.json({ results });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("Unable to search cities", error);
    return NextResponse.json({ error: "provider_unavailable", results: [] }, { status: 502 });
  }
}
