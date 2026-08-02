import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const managerPath = new URL("./checklist-template-manager.tsx", import.meta.url);

describe("checklist template manager persistence", () => {
  it("uses RPCs for whole-template saves and archive changes", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('rpc("save_checklist_template"');
    expect(source).toContain('rpc("set_checklist_template_archived"');
    expect(source).not.toContain('from("checklist_templates").update');
  });

  it("keeps client presentation normalized with the stored draft contract", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain("p_name: draft.name.trim()");
    expect(source).toContain("title: stage.title.trim()");
  });
});
