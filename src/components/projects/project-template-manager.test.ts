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
    expect(source).toContain('const [category, setCategory] = useState<TemplateCategory>("all")');
    expect(source).toContain("PROJECT_TYPE_KEYS.map");
    expect(source).toContain("За замовчуванням");
  });

  it("uses column placement for a task stage and creates an opaque drag image", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain("onMoveTask?.(sourceId, stage)");
    expect(source).toContain("setDragImage(ghost");
    expect(source).toContain('ghost.style.opacity = "0.98"');
    expect(source).not.toContain('value={task.stage}');
    expect(source).toContain('priority: "normal"');
    expect(source).toContain("tasks.map((task, order)");
    expect(source).toContain("order={order + 1}");
    expect(source).toContain("const firstStageIndex = next.findIndex");
    expect(source).toContain("next.splice(firstStageIndex < 0 ? next.length : firstStageIndex, 0, newTask(stage, 0))");
    expect(source).not.toContain('value={task.priority}');
  });
});
