export type CanonicalRoleTranslationKey = "studioAdministrator" | "administrator" | "designer" | "architect";

export function getCanonicalRoleTranslationKey(value: string | null | undefined): CanonicalRoleTranslationKey | null {
  if (value === "Studio Administrator") return "studioAdministrator";
  if (value === "Administrator") return "administrator";
  if (value === "Designer") return "designer";
  if (value === "Architect") return "architect";
  return null;
}
