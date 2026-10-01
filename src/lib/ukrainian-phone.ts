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

/** Decides whether a value should use the UA mask without capturing an existing foreign number. */
export function shouldFormatAsUkrainianPhone(value: string, countryCode: string, preserveInternational: boolean) {
  if (countryCode !== "UA") return false;
  const trimmed = value.trim();
  if (!preserveInternational || !trimmed) return true;
  if (trimmed.startsWith("+")) return trimmed.startsWith("+380");
  if (trimmed.startsWith("00")) return trimmed.startsWith("00380");
  return true;
}

/** Normalizes UA numbers while retaining foreign numbers on country-aware CRM records. */
export function normalizePhoneForCountry(value: string, countryCode: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!shouldFormatAsUkrainianPhone(trimmed, countryCode, true)) return trimmed;
  return normalizeUkrainianPhone(trimmed) ?? trimmed;
}

/** Returns the database representation of a complete number, or undefined when invalid. */
export function normalizeUkrainianPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !ukrainianPhoneCharacters.test(trimmed)) return undefined;

  const digits = removeCountryPrefix(trimmed.replace(/\D/g, ""));
  return digits.length === 9 ? `+380${digits}` : undefined;
}

/** Display complete UA numbers without masking/truncating international or legacy values. */
export function phoneDisplay(value: string) {
  const trimmed = value.trim(), digits = trimmed.replace(/\D/g, "");
  if (!ukrainianPhoneCharacters.test(trimmed) ||
    (trimmed.startsWith("+") && !digits.startsWith("380")) ||
    (trimmed.startsWith("00") && !digits.startsWith("00380"))) return value;
  const normalized = normalizeUkrainianPhone(trimmed.startsWith("00") ? trimmed.slice(2) : trimmed);
  return normalized ? formatUkrainianPhone(normalized).replace("+380 (", "+38 (0") : value;
}

/** Shared entry mask. Incomplete country prefixes and foreign numbers stay editable. */
export function formatPhoneInput(value: string, countryCode = "UA", preserveInternational = true) {
  const allowed = value.replace(/[^\d+()\s-]/g, "").trimStart();
  const raw = (allowed.startsWith("+") ? "+" : "") + allowed.replace(/\+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.startsWith("+") ? "+" : "";
  if (countryCode !== "UA" || (preserveInternational && (
    (raw.startsWith("+") && !digits.startsWith("380")) ||
    (digits.startsWith("00") && !digits.startsWith("00380")))) ||
    digits === "0" || digits === "3" || digits === "38") return raw;
  const local = digits.startsWith("00380") ? digits.slice(5) : digits.startsWith("380") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  // Do not truncate a pasted number that exceeds the UA mask.
  return local.length > 9 ? raw : local ? formatUkrainianPhone(`+380${local}`) : "+380";
}

/** Format recognized complete UA values without rewriting foreign or legacy content. */
export function phoneInputDisplay(value: string, countryCode = "UA") {
  return countryCode === "UA" ? phoneDisplay(value).replace(/^\+38 \(0(?=\d{2}\) \d{3}-\d{2}-\d{2}$)/u, "+380 (") : value;
}

export function phoneInputEdit(raw: string, position: number, countryCode = "UA", preserveInternational = true) {
  const value = formatPhoneInput(raw, countryCode, preserveInternational);
  // Anchor the caret to remaining digits rather than moving it to the end.
  const remaining = raw.slice(position).replace(/\D/g, "").length;
  const positions = [...value.matchAll(/\d/g)].map(match => match.index);
  const caret = remaining ? positions[Math.max(0, positions.length - remaining)] ?? 0 : value.length;
  return { value, caret };
}
