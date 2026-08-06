import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const operationalForms = [
  "../components/projects/project-form.tsx",
  "../components/tasks/add-task-dialog.tsx",
  "../components/calendar/calendar-workspace.tsx",
  "../components/team/invite-employee-form.tsx",
  "../components/projects/add-project-member-form.tsx",
] as const;

describe("operational form autocomplete policy", () => {
  it("opts operational create, edit, calendar, time-off, and team forms out of browser autofill", async () => {
    const sources = await Promise.all(operationalForms.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
    for (const source of sources) expect(source).toContain('autoComplete="off"');
  });

  it("keeps the city application combobox while suppressing browser suggestions", async () => {
    const [cityCombobox, projectForm] = await Promise.all([
      readFile(new URL("../components/projects/city-combobox.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/projects/project-form.tsx", import.meta.url), "utf8"),
    ]);
    expect(cityCombobox).toContain('aria-autocomplete="list"');
    expect(cityCombobox).toContain('autoComplete="off"');
    expect(cityCombobox).toContain("userEditedRef.current = true");
    expect(projectForm).toContain('name="city_search"');
    expect(projectForm).toContain('<input type="hidden" name="city" value={city} />');
  });

  it("suppresses autofill for dynamically mounted operational drawer fields without overriding explicit tokens", async () => {
    const source = await readFile(new URL("../components/ui/drawer.tsx", import.meta.url), "utf8");
    expect(source).toContain('querySelectorAll("input, textarea")');
    expect(source).toContain('if (!field.hasAttribute("autocomplete")) field.setAttribute("autocomplete", "off")');
    expect(source).toContain("new MutationObserver(suppressOperationalAutofill)");
  });
});
