import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getNextSelectValue } from "./select";

const selectPath = new URL("./select.tsx", import.meta.url);
const componentPaths = [
  new URL("../administration/checklist-template-manager.tsx", import.meta.url),
  new URL("../calendar/calendar-workspace.tsx", import.meta.url),
  new URL("../projects/add-project-member-form.tsx", import.meta.url),
  new URL("../projects/project-form.tsx", import.meta.url),
  new URL("../projects/project-list-controls.tsx", import.meta.url),
  new URL("../tasks/stage-columns-dialog.tsx", import.meta.url),
  new URL("../tasks/add-task-dialog.tsx", import.meta.url),
  new URL("../tasks/task-details-drawer.tsx", import.meta.url),
  new URL("../tasks/task-status-control.tsx", import.meta.url),
  new URL("../team/invite-employee-form.tsx", import.meta.url),
];

describe("shared Select contract", () => {
  it("matches the menu to the trigger and supports full or option-content sizing", async () => {
    const source = await readFile(selectPath, "utf8");

    expect(source).toContain("collisionPadding={8}");
    expect(source).toContain("w-[var(--radix-popover-trigger-width)]");
    expect(source).toContain("min-w-[var(--radix-popover-trigger-width)]");
    expect(source).toContain("max-w-[calc(100vw-1rem)]");
    expect(source).toContain('width?: "content" | "full"');
    expect(source).toContain('width === "content" ? "w-fit min-w-32 max-w-[calc(100vw-2rem)]" : "w-full"');
    expect(source).toContain("grid-cols-[minmax(0,1fr)_2.5rem]");
    expect(source).toContain('className="grid min-w-0 pl-3 pr-2"');
    expect(source).toContain('className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"');
    expect(source).toContain("var(--ui-shadow-popover)");
  });

  it("sizes from every option while wrapping only multi-word labels on narrow screens", async () => {
    const source = await readFile(selectPath, "utf8");

    expect(source).toContain("title={selectedText || undefined}");
    expect(source).toContain('aria-hidden="true" className="invisible col-start-1 row-start-1 grid max-w-64"');
    expect(source).toContain('className="col-start-1 row-start-1 whitespace-nowrap"');
    expect(source).toContain("grid-cols-[1rem_minmax(0,1fr)]");
    expect(source).toContain("whitespace-normal break-normal [overflow-wrap:normal] sm:whitespace-nowrap");
    expect(source).not.toContain("overflow-wrap:anywhere");
    expect(source).not.toContain("break-words");
  });

  it("supports arrow, Home, and End navigation while skipping disabled options", () => {
    const items = [
      { value: "one" },
      { value: "two", disabled: true },
      { value: "three" },
    ];

    expect(getNextSelectValue(items, "one", "next")).toBe("three");
    expect(getNextSelectValue(items, "three", "next")).toBe("one");
    expect(getNextSelectValue(items, "one", "previous")).toBe("three");
    expect(getNextSelectValue(items, undefined, "first")).toBe("one");
    expect(getNextSelectValue(items, undefined, "last")).toBe("three");
  });

  it("renders through a collision-aware portal without enabling modal page scroll locking", async () => {
    const source = await readFile(selectPath, "utf8");

    expect(source).toContain("<PopoverPrimitive.Root modal={false}");
    expect(source).toContain("<PopoverPrimitive.Portal container={portalContainer}>");
    expect(source).toContain("closest(\"dialog, [role='dialog']\")");
    expect(source).toContain("overflow-y-auto overscroll-auto");
    expect(source).not.toContain("RemoveScroll");
    expect(source).not.toContain("overflow: hidden");
  });

  it("keeps form submission, required validation, and empty application values in the wrapper", async () => {
    const source = await readFile(selectPath, "utf8");

    expect(source).toContain("name={name}");
    expect(source).toContain("required={required}");
    expect(source).toContain('value={selectedValue ?? ""}');
    expect(source).toContain("onInvalid={(event) =>");
  });

  it("uses the shared Select for every listed application control", async () => {
    const sources = await Promise.all(componentPaths.map((path) => readFile(path, "utf8")));
    const nativeSelects = sources.flatMap((source) => source.match(/<select\b/g) ?? []);

    expect(sources.every((source) => source.includes("<Select") || !source.includes("select"))).toBe(true);
    expect(nativeSelects).toHaveLength(0);
  });
});
