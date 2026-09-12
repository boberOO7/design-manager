import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_TYPES } from "@/lib/equipment";

describe("Equipment localization", () => {
  it("keeps English and Ukrainian Equipment keys in parity", () => {
    const english = createTranslator({ locale: "en", messages: en, namespace: "Equipment" });
    const ukrainian = createTranslator({ locale: "uk", messages: uk, namespace: "Equipment" });
    for (const key of ["title", "description", "views.workstations", "views.inventory", "inventory.office", "inventory.allTypes", "inventory.noMatches", "workstation.types.office", "workstation.types.remote", "workstation.form.type", "actions.changeCode", "actions.retry", "maintenance.saveSchedule", "configuration.save", "views.maintenance", "actions.addWorkstation", "actions.createWorkstations", "actions.addEquipment", "actions.more", "workstation.numberLabel", "workstation.unassigned", "workstation.actions.renumber", "workstation.form.quantity", "workstation.form.decreaseQuantity", "workstation.form.increaseQuantity", "workstation.form.numberConflict", "workstation.form.assignEmployees", "form.displayName", "form.workstation", "form.identificationSummary", "form.assetTagDescription", "assignment.attachComputer", "assignment.attachMonitor", "assignment.attachPeripheral", "assignment.search", "assignment.noMatches", "assignment.moveConfirm", "maintenance.queueTitle", "maintenance.summaryTitle", "maintenance.openWorkspace", "maintenance.upcoming", "maintenance.overdue", "service.send", "service.complete", "history.title", "history.types.regular_maintenance", "history.types.repair", "history.types.upgrade", "errors.numberConflict", "errors.employeeAssigned", "errors.permission"] as const) {
      expect(english(key)).toBeTruthy();
      expect(ukrainian(key)).toBeTruthy();
    }
  });

  it("translates every structured configuration label and summary in both locales", () => {
    expect(Object.keys(uk.Equipment.configuration).sort()).toEqual(Object.keys(en.Equipment.configuration).sort());
    expect(Object.keys(uk.Equipment.configuration.driveTypes).sort()).toEqual(Object.keys(en.Equipment.configuration.driveTypes).sort());
    for (const [locale, messages] of [["en", en], ["uk", uk]] as const) {
      const t = createTranslator({ locale, messages, namespace: "Equipment" });
      expect(t("configuration.modules", { count: 2 })).toBe(locale === "uk" ? "2 модулі" : "2 modules");
      expect(t("configuration.driveNumber", { number: 2 })).toContain("2");
      expect(t("configuration.removeDrive", { number: 2 })).toContain("2");
      for (const value of Object.values(messages.Equipment.configuration)) {
        if (typeof value === "string") expect(value.trim().length).toBeGreaterThan(0);
      }
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
