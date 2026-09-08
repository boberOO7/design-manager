import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workspacePath = new URL("./leads-workspace.tsx", import.meta.url);
const metadataControlsPath = new URL("../projects/project-metadata-controls.tsx", import.meta.url);

describe("CRM leads workspace contract", () => {
  it("reuses Project metadata controls and defaults new lead location to Ukraine", async () => {
    const [workspace, controls] = await Promise.all([readFile(workspacePath, "utf8"), readFile(metadataControlsPath, "utf8")]);
    expect(workspace).toContain("ProjectCountrySelect");
    expect(workspace).toContain("ProjectTypeSelect");
    expect(workspace).toContain("<CityCombobox");
    expect(controls).toContain('defaults.countryCode ?? "UA"');
    expect(controls).toContain('if (value !== "other") setProjectTypeCustom("")');
  });

  it("opens an accessible row into detail before editing", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain('aria-label={t("leads.openRecord"');
    expect(workspace).toContain('type="button"');
    expect(workspace).toContain("isNestedInteractiveTarget");
    expect(workspace).toContain('setView("detail")');
    expect(workspace).toContain('setView("edit")');
    expect(workspace).toContain("<LeadDetail");
  });

  it("keeps contact actions in detail and delete in a confirmed overflow action", async () => {
    const workspace = await readFile(workspacePath, "utf8");
    expect(workspace).toContain("mailto:");
    expect(workspace).toContain("tel:");
    expect(workspace).toContain("<Popover.Root");
    expect(workspace).toContain("window.confirm");
    expect(workspace).not.toContain("ExternalLink");
  });
});
