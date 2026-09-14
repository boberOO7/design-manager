import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const nativeDateControl = /type\s*=\s*["'](?:date|datetime-local)["']/;

describe("date-field consistency", () => {
  it("does not expose native date controls in application components", () => {
    const inconsistent = sourceFiles("src").filter((path) => nativeDateControl.test(readFileSync(path, "utf8")));
    expect(inconsistent).toEqual([]);
  });

  it.each([
    ["Equipment / Maintenance", ["src/components/office/equipment-form.tsx", "src/components/office/equipment-workspace.tsx"]],
    ["Projects", ["src/components/projects/project-form.tsx", "src/components/projects/project-completion-date-form.tsx"]],
    ["CRM", ["src/components/crm/leads-workspace.tsx", "src/components/crm/candidates-workspace.tsx"]],
    ["Team / Profile", ["src/components/team/studio-member-profile-editor.tsx", "src/components/layout/profile-avatar-editor.tsx"]],
  ])("uses DatePicker in %s", (_area, paths) => {
    const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).toContain("<DatePicker");
    expect(source).not.toMatch(nativeDateControl);
  });
});
