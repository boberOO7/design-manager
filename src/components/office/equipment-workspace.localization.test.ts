import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_TYPES } from "@/lib/equipment";

describe("Equipment localization", () => {
  it("keeps English and Ukrainian Equipment keys in parity", () => {
    const english = createTranslator({ locale: "en", messages: en, namespace: "Equipment" });
    const ukrainian = createTranslator({ locale: "uk", messages: uk, namespace: "Equipment" });
    for (const key of ["title", "description", "views.workstations", "views.other", "actions.addWorkstation", "actions.addEquipment", "workstation.unassigned", "form.displayName", "form.workstation", "assignment.attach", "errors.permission"] as const) {
      expect(english(key)).toBeTruthy();
      expect(ukrainian(key)).toBeTruthy();
    }
  });

  it("localizes every equipment type and lifecycle state", () => {
    const english = createTranslator({ locale: "en", messages: en, namespace: "Equipment" });
    const ukrainian = createTranslator({ locale: "uk", messages: uk, namespace: "Equipment" });
    for (const type of EQUIPMENT_TYPES) {
      expect(english(`types.${type}`)).toBeTruthy();
      expect(ukrainian(`types.${type}`)).toBeTruthy();
    }
    for (const state of EQUIPMENT_LIFECYCLE_STATES) {
      expect(english(`states.${state}`)).toBeTruthy();
      expect(ukrainian(`states.${state}`)).toBeTruthy();
    }
  });
});
