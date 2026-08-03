export const locales = ["en", "uk"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
export const localeCookieName = "studioflow-locale";

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return value !== undefined && locales.includes(value as AppLocale);
}

export function resolveLocale(cookieValue?: string | null, acceptLanguage?: string | null): AppLocale {
  if (isAppLocale(cookieValue)) return cookieValue;
  if (acceptLanguage?.toLowerCase().includes("uk")) return "uk";
  return defaultLocale;
}
