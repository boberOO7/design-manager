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

export const AVATAR_BUCKET = "avatars";
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type AvatarFileValidationError = "unsupported_type" | "file_too_large" | null;

export function getAvatarFileValidationError(file: Pick<File, "size" | "type">): AvatarFileValidationError {
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])) return "unsupported_type";
  if (file.size > AVATAR_MAX_FILE_SIZE) return "file_too_large";
  return null;
}

export function isAvatarObjectPath(value: string | null | undefined): value is string {
  if (!value) return false;
  const segments = value.split("/");
  return segments.length === 2 && segments.every(Boolean);
}

export function getAvatarImageUrl(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return undefined;
  if (/^(blob:|https?:\/\/)/i.test(trimmedValue)) return trimmedValue;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return supabaseUrl && isAvatarObjectPath(trimmedValue)
    ? `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${trimmedValue.split("/").map(encodeURIComponent).join("/")}`
    : trimmedValue;
}
