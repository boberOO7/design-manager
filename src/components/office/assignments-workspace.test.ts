import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/office/assignments-workspace.tsx", "utf8");
const patterns = readFileSync("src/components/office/office-list-patterns.ts", "utf8");

describe("office assignments workspace contract", () => {
  it("uses the shared compact Office list surface and stable row geometry", () => {
    const row = source.slice(source.indexOf("function AssignmentRow"), source.indexOf("function CreateAssignmentDialog"));
    expect(source).toContain('divide-y divide-[var(--ui-border-subtle)]');
    expect(row).toContain("officeListDesktopGridClassName");
    expect(patterns).toContain('xl:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,0.75fr)_minmax(11rem,0.85fr)_7.5rem_13.5rem]');
    expect(row).toContain('font-semibold uppercase tracking-wide');
    expect(row).toContain("title={item.title}");
    expect(row).not.toContain("item.description");
    expect(row).toContain("<Person person={item.responsible}");
    expect(row).toContain("const displayedDate = terminal ? item.updatedAt : item.deadline ?? item.createdAt");
    expect(row).toContain("xl:hidden");
    expect(row).toContain("truncate text-sm font-semibold");
    expect(row).toContain('className="pointer-events-auto relative z-10 col-span-full flex min-h-0 shrink-0 items-center justify-end gap-1.5 xl:col-span-1"');
  });

  it("offers only the verified next transition and keeps cancellation in overflow", () => {
    expect(source).toContain("getPrimaryOfficeAssignmentStatus(item.status)");
    expect(source).toContain("isAdmin || item.responsible.id === currentUserId");
    expect(source).toContain("<AssignmentWorkflowAction");
    expect(source).toContain('status === "in_progress" ? "info" : "success"');
    expect(source).toContain("officeWorkflowStyles[tone]");
    expect(source).toContain('bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]');
    expect(source).toContain('bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]');
    expect(source).toContain('aria-label={t("actions.more")}');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('<Ellipsis className="size-4"');
    expect(source).toContain('<Ban className="size-4"');
  });

  it("keeps one standard drawer close control and aligns drawer sections", () => {
    const drawer = source.slice(source.indexOf("function AssignmentDetailDrawer"), source.indexOf("function AssignmentAdminControls"));
    const cancel = source.slice(source.indexOf("function AssignmentCancelAction"));
    expect(drawer).toContain('className="w-full max-w-[34rem]"');
    expect(drawer).toContain('className="mt-1 flex flex-wrap items-center gap-2"');
    expect(drawer).toContain('sm:grid-cols-2');
    expect(drawer.match(/<X className="size-5"/g)).toHaveLength(1);
    expect(cancel).not.toContain("<X");
    expect(source).toContain('border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6');
  });
});
