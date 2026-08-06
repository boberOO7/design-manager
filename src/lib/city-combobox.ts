export function shouldSearchCity({ countryCode, query, userEdited }: {
  countryCode: string;
  query: string;
  userEdited: boolean;
}): boolean {
  return userEdited && countryCode.length > 0 && query.trim().length > 0;
}

export function shouldOpenCitySuggestions({ query, status, userEdited }: {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  userEdited: boolean;
}): boolean {
  return userEdited && query.trim().length > 0 && (status === "loading" || status === "ready" || status === "error");
}
