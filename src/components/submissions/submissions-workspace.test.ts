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

  it("derives create and detail overlays directly from URL search parameters", () => {
    expect(source).toContain("useOfficeOverlayRouting");
    expect(source).not.toContain("setCreateOpen");
    expect(source).not.toContain("setSelectedId");
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

  it("uses canonical semantic workflow actions and confirmed explicit rejection", () => {
    expect(source).toContain("getPrimarySubmissionAction");
    expect(source).toContain("submissionTransitionRequiresResponsible");
    expect(source).toContain("<SubmissionWorkflowAction");
    expect(source).toContain("workflowStyles[action.tone]");
    expect(source).toContain("<SubmissionRejectAction");
    expect(source).toContain('title={t("workflow.rejectTitle")}');
    expect(source).toContain('t("workflow.confirmReject")');
    expect(source).not.toContain("<SubmissionSecondaryActions");
    expect(source).toContain('t("workflow.chooseResponsible")');
    expect(source).toContain('t("workflow.assignMe")');
    expect(source).toContain('runWorkflow("rejected"');
  });

  it("keeps workflow transitions out of the editable drawer admin form but separates rejection there", () => {
    const adminControls = source.slice(source.indexOf("function AdminControls"), source.indexOf("function SubmissionWorkflowAction"));
    expect(adminControls).toContain('t("admin.save")');
    expect(adminControls).not.toContain("<SubmissionWorkflowAction");
    expect(adminControls).toContain("<SubmissionRejectAction label");
  });

  it("uses the canonical detail drawer width and keeps badges in the title row", () => {
    const drawer = source.slice(source.indexOf("function SubmissionDetailDrawer"), source.indexOf("function Meta"));
    expect(drawer).toContain('className="w-full max-w-[34rem]"');
    expect(drawer).toContain('className="mt-1 flex flex-wrap items-center gap-2"');
    expect(drawer).toContain("getPriorityBadgeStyle(item.priority)");
    expect(drawer).toContain('!border-0", getPriorityBadgeStyle(item.priority).className');
    expect(drawer).not.toContain('className="mt-2 flex flex-wrap gap-1.5"');
    expect(drawer).not.toContain('<SubmissionRejectAction disabled={pending}');
  });

  it("starts the communication composer at one row and grows it modestly", () => {
    expect(source).toContain("ref={commentRef}");
    expect(source).toContain("rows={1}");
    expect(source).toContain("Math.min(composer.scrollHeight, 112)");
    expect(source).toContain('event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || isComposingCommentRef.current');
    expect(source).toContain("onCompositionStart");
    expect(source).toContain("onCompositionEnd");
    expect(source).not.toContain('t("noComments")');
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
    expect(source).toContain("data-dialog-initial-focus");
    expect(source).toContain("<Ban");
    expect(source).toContain("taskPrioritySelectItem(value, t(`priorities.${value}`))");
    expect(source).toContain('<MessageSquareText className="size-4 text-[var(--ui-text-muted)]"');
  });
});
