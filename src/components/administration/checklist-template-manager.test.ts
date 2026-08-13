import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const managerPath = new URL("./checklist-template-manager.tsx", import.meta.url);

describe("checklist template manager persistence", () => {
  it("uses the whole-template save RPC without direct table updates", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('rpc("save_checklist_template"');
    expect(source).not.toContain('rpc("set_checklist_template_archived"');
    expect(source).not.toContain('from("checklist_templates").update');
  });

  it("keeps client presentation normalized with the stored draft contract", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain("p_name: draft.name.trim()");
    expect(source).toContain("title: stage.title.trim()");
  });

  it("uses a single section-level manager and a compact stage reordering surface", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('t("manage")');
    expect(source).not.toContain(">Manage</button>");
    expect(source).toContain("DragDropProvider");
    expect(source).toContain("GripVertical");
    expect(source).toContain("moveChecklistTemplateStage");
    expect(source).toContain('t("reorderHelp")');
  });

  it("renders a structured template summary alongside the existing compact editor controls", async () => {
    const source = await readFile(managerPath, "utf8");
    expect(source).toContain('className="space-y-4"');
    expect(source).toContain('t("stages", { count: template.stages.length })');
    expect(source).toContain('t("totalWeight", { weight: getChecklistTemplateWeight(template) })');
    expect(source).toContain('t("archived")');
    expect(source).not.toContain('t("templateSummary"');
    expect(source).toContain("StageRowOverlay");
    expect(source).toContain("w-[min(30rem,calc(100vw-2rem))]");
    expect(source).toContain("grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_2.75rem]");
    expect(source).toContain('className="h-11 shrink-0 px-4"');
    expect(source).not.toContain("Archive template");
    expect(source).not.toContain("MoreHorizontal");
  });
});
