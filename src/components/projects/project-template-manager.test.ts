import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourcePath = new URL("./project-template-manager.tsx", import.meta.url);

describe("ProjectTemplateManager presentation", () => {
  it("uses the canonical project-type translations and keeps preview separate from editing", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain('useTranslations("ProjectTypes")');
    expect(source).toContain('type Mode = "preview" | "edit" | "create"');
    expect(source).toContain("function TemplatePreview");
    expect(source).toContain("function TemplateEditor");
  });

  it("uses column placement for a task stage and creates an opaque drag image", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain("onMoveTask?.(sourceId, stage)");
    expect(source).toContain("setDragImage(ghost");
    expect(source).toContain('ghost.style.opacity = "0.98"');
    expect(source).not.toContain('value={task.stage}');
  });
});
