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
    expect(source).toContain('isDefault: false');
    expect(source).toContain('checked={draft.isDefault}');
    expect(source).toContain('onUpdate({ isDefault: event.target.checked })');
    expect(source).toContain('projectTemplates("defaultTemplate")');
    expect(source).not.toContain('checked={draft.isActive}');
    expect(source).toContain("mergeSavedProjectTemplate(current, next)");
  });

  it("uses stable sortable task rows and keeps template task ordering derived", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain("<DragDropProvider");
    expect(source).toContain("<DragOverlay>");
    expect(source).toContain('useSortable({ id: task.id');
    expect(source).toContain("template-task-stage:");
    expect(source).toContain("getProjectTemplateTaskDestination");
    expect(source).toContain("moveProjectTemplateTask");
    expect(source).toContain("useDroppable");
    expect(source).toContain("commitPendingTask");
    expect(source).toContain('priority: "normal"');
    expect(source).toContain("tasks.map((task, order)");
    expect(source).toContain("order={order + 1}");
    expect(source).toContain("const lastPosition = Math.max");
    expect(source).not.toContain('value={task.priority}');
  });
});
