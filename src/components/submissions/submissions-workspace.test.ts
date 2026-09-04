import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/submissions/submissions-workspace.tsx", "utf8");

describe("submissions workspace contract", () => {
  it("defaults to the compact active, mine, and history inbox model", () => {
    expect(source).toContain('useState<InboxFilter>("active")');
    expect(source).toContain('["active", "mine", "history"]');
    expect(source).toContain('useState<TypeFilter>("all")');
    expect(source).toContain('filters.allTypes');
    expect(source).not.toContain('"attention"');
    expect(source).not.toContain('"assigned"');
  });

  it("keeps terminal work in history and applies privacy-safe Mine semantics", () => {
    expect(source).toContain('item.author?.id === currentUserId || item.responsible?.id === currentUserId');
    expect(source).toContain('filter === "history" ? terminal : !terminal');
    expect(source).toContain('isTerminalSubmissionStatus(item.type, item.status)');
  });

  it("offers anonymous mode only when Complaint is selected", () => {
    expect(source).toContain('type === "complaint"');
    expect(source).toContain('name="anonymous"');
  });

  it("uses the shared detail drawer without task components", () => {
    expect(source).toContain("<Drawer");
    expect(source).not.toContain("TaskDetailsDrawer");
  });

  it("keeps intentional remount keys unique between sibling overlays", () => {
    expect(source).toContain('key={`submission-create-${createOpen ? "open" : "closed"}`}');
    expect(source).toContain('key={`submission-detail-${selected?.id ?? "closed"}`}');
    expect(source).not.toContain('key={createOpen ? "open" : "closed"}');
    expect(source).not.toContain('key={selected?.id ?? "closed"}');
  });

  it("does not render script markup from the Submissions client component", () => {
    expect(source).not.toMatch(/<script\b/i);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("uses dense clickable cards with an inline optimistic support control", () => {
    expect(source).toContain('lg:grid-cols-2');
    expect(source).toContain('className="absolute inset-0');
    expect(source).toContain("startSupportTransition");
    expect(source).toContain("aria-pressed={supportedByMe}");
  });

  it("shares contextual workflow actions and keeps rejection secondary", () => {
    expect(source).toContain("getPrimarySubmissionStatus");
    expect(source).toContain("submissionTransitionRequiresResponsible");
    expect(source).toContain("<SubmissionWorkflowAction");
    expect(source).toContain("<SubmissionSecondaryActions");
    expect(source).toContain('t("workflow.chooseResponsible")');
    expect(source).toContain('t("workflow.assignMe")');
    expect(source).toContain('runWorkflow("rejected"');
  });

  it("uses shared Office drawer controls and protects anonymous identity", () => {
    expect(source).toContain("<DatePicker");
    expect(source).toContain("<Select");
    expect(source).toContain("<LockKeyhole");
    expect(source).not.toContain('<Input type="date"');
    expect(source).not.toContain("<select className=");
    expect(source).toContain("!item.isAnonymous ? <section");
    expect(source).toContain('item.type === "suggestion" ? "discussion" : "communication"');
    expect(source).toContain("Popover.Portal container={portalContainer}");
  });
});
