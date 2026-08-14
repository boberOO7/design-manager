const ukrainianPhoneCharacters = /^[\d\s()+-]*$/;

function removeCountryPrefix(digits: string) {
  if (digits.startsWith("380")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Extracts the nine digits entered after Ukraine's +380 prefix for UI formatting. */
export function getUkrainianPhoneDigits(value: string) {
  return removeCountryPrefix(value.replace(/\D/g, "")).slice(0, 9);
}

/** Formats a partial or complete Ukrainian mobile number for display in the form. */
export function formatUkrainianPhone(value: string | null | undefined) {
  const digits = getUkrainianPhoneDigits(value ?? "");
  if (!digits) return "";

  let formatted = "+380 (" + digits.slice(0, 2);
  if (digits.length > 2) formatted += `) ${digits.slice(2, 5)}`;
  if (digits.length > 5) formatted += `-${digits.slice(5, 7)}`;
  if (digits.length > 7) formatted += `-${digits.slice(7, 9)}`;
  return formatted;
}

/** Returns the database representation of a complete number, or undefined when invalid. */
export function normalizeUkrainianPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !ukrainianPhoneCharacters.test(trimmed)) return undefined;

  const digits = removeCountryPrefix(trimmed.replace(/\D/g, ""));
  return digits.length === 9 ? `+380${digits}` : undefined;
}
