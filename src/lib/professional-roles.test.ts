import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";
import { getCanonicalRoleTranslationKey } from "./professional-roles";

describe("canonical role localization", () => {
  it.each([
    ["Studio Administrator", "studioAdministrator", "Адміністратор студії"],
    ["Administrator", "administrator", "Адміністратор"],
    ["Designer", "designer", "Дизайнер"],
    ["Architect", "architect", "Архітектор"],
  ] as const)("maps %s without changing its stored value", (storedValue, key, ukrainianLabel) => {
    expect(getCanonicalRoleTranslationKey(storedValue)).toBe(key);
    expect(en.Roles[key]).toBe(storedValue);
    expect(uk.Roles[key]).toBe(ukrainianLabel);
  });

  it("leaves administrator-entered free-text titles untranslated", () => {
    expect(getCanonicalRoleTranslationKey("Senior Interior Designer")).toBeNull();
  });
});
