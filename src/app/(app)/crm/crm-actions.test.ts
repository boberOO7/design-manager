import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const actionsPath = new URL("./actions.ts", import.meta.url);

describe("CRM Server Action contract", () => {
  it("distinguishes denied access from resolution failures", async () => {
    const source = await readFile(actionsPath, "utf8");
    expect(source).toContain('return { error: "permission" }');
    expect(source).toContain('return { error: "unavailable" }');
    expect(source).toContain('crm.error === "permission" ? "errors.permission" : "errors.unavailable"');
    expect(source).toContain('console.error("Unable to establish CRM action context", error)');
  });

  it("maps known invalid fields and keeps malformed identifiers action-specific", async () => {
    const source = await readFile(actionsPath, "utf8");
    for (const key of ["invalidEmail", "invalidPhone", "invalidUrl", "invalidArea", "invalidBudget", "invalidCountry", "invalidResponsible", "invalidTime", "invalidDate", "invalidDateTime"]) {
      expect(source).toContain(`validation.${key}`);
    }
    expect(source).toContain('return { error: t("errors.deleteLead") }');
    expect(source).toContain('return { error: t("errors.deleteCandidate") }');
  });
});
