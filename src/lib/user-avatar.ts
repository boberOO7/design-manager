export function getUserInitials(name: string | null | undefined): string {
  const nameParts = name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (nameParts.length === 0) return "";

  const [firstName, ...remainingNames] = nameParts;
  if (!firstName) return "";

  if (remainingNames.length === 0) {
    return Array.from(firstName).slice(0, 2).join("").toLocaleUpperCase();
  }

  return [firstName, remainingNames.at(-1)]
    .map((part) => Array.from(part ?? "")[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}
