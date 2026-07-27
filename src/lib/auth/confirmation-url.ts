import "server-only";

export function getAuthConfirmationUrl(origin: string | null): string | null {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    url.pathname = "/auth/confirm";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
