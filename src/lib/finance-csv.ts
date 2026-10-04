const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/;

function escapeField(value: string | null): string {
  const text = value ?? "";
  const safeText = /^[\u0000-\u0020]*[=+@-]/.test(text) && !SIGNED_DECIMAL.test(text)
    ? `'${text}`
    : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}

export function financeCsv(rows: readonly (readonly (string | null)[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeField).join(",")).join("\r\n")}`;
}
