import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const managerPath = new URL("./checklist-template-manager.tsx", import.meta.url);

describe("checklist template manager", () => {
  it("uses the existing guarded RPCs for saving and archiving", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('rpc("save_checklist_template"');
    expect(source).toContain('rpc("set_checklist_template_archived"');
    expect(source).not.toContain('from("checklist_templates").update');
    expect(source).toContain("p_name: draft.name.trim()");
    expect(source).toContain("title: stage.title.trim()");
  });

  it("uses one sidebar and detail editor with the existing stage controls", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('xl:grid-cols-[19rem_minmax(0,1fr)]');
    expect(source).toContain("<aside");
    expect(source).toContain("<TemplateEditor draft={draft}");
    expect(source).not.toContain('t("manage")');
    expect(source).toContain("DragDropProvider");
    expect(source).toContain("moveChecklistTemplateStage");
  });
});
