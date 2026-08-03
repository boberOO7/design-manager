import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, localeCookieName, resolveLocale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(cookieStore.get(localeCookieName)?.value, headerStore.get("accept-language"));

  const baseMessages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale: locale ?? defaultLocale,
    messages: baseMessages,
  };
});
