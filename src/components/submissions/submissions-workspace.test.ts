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

  it("keeps a stable desktop options region and limits categories to requests", () => {
    const dialog = source.slice(source.indexOf("function CreateSubmissionDialog"), source.indexOf("function SubmissionDetailDrawer"));
    expect(dialog).toContain('sm:min-h-[7.5rem]');
    expect(dialog).toContain('overflow-y-auto');
    expect(dialog).toContain('type === "request"');
    expect(dialog).toContain('name="requestCategory"');
    expect(dialog).toContain('placeholder={t("form.categoryPlaceholder")}');
    expect(dialog).toContain('required value={requestCategory}');
    expect(dialog).toContain("SUBMISSION_REQUEST_CATEGORIES.map");
    expect(dialog).toContain('type === "complaint"');
    expect(dialog).toContain('name="anonymous"');
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

  it("uses one compact clickable list with content-first responsive rows and inline optimistic support", () => {
    const row = source.slice(source.indexOf("function SubmissionRow"), source.indexOf("function CreateSubmissionDialog"));
    expect(source).toContain('divide-y divide-[var(--ui-border-subtle)]');
    expect(source).toContain('const submissionDesktopGridClassName = "xl:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,0.75fr)_minmax(11rem,0.85fr)_7.5rem_13.5rem]"');
    expect(source).toContain("submissionDesktopGridClassName");
    expect(source).toContain("xl:min-h-14");
    expect(source).not.toContain('lg:grid-cols-2');
    expect(source).toContain('className="absolute inset-0');
    expect(source).toContain("startSupportTransition");
    expect(source).toContain("aria-pressed={supportedByMe}");
    expect(source).toContain("function RowPerson");
    expect(source).toContain("const displayedDate = terminal ? item.updatedAt : item.deadline ?? item.createdAt");
    expect(row.indexOf("<h3")).toBeLessThan(row.indexOf('className="hidden min-w-0 items-center'));
    expect(row).toContain("item.responsible ?? item.author");
    expect(row).toContain('item.responsible ? t("responsible") : t("author")');
    expect(row).toContain('item.description.trim() ?');
    expect(row).toContain('className="min-w-0 truncate"');
    expect(row).toContain("title={item.description}");
    expect(row).toContain('aria-hidden="true" className="shrink-0 text-[var(--ui-text-subtle)]">·</span>');
    expect(row).toContain('rounded-full bg-[var(--ui-warning-surface)]');
    expect(row).toContain('text-[var(--ui-warning-text)]');
    expect(row).toContain("xl:min-h-7");
    expect(row).not.toContain('border-[var(--ui-warning-border)]');
    expect(row).toContain('size-9 shrink-0');
    expect(row).toContain('size-[1.125rem]');
    expect(row).not.toContain("uppercase");
    expect(row).toContain('item.type === "request" && item.requestCategory');
    expect(row).toContain('className="pointer-events-auto relative z-10 col-span-full flex min-h-0 shrink-0 items-center justify-end gap-1.5 xl:col-span-1"');
  });

  it("uses canonical semantic workflow actions and confirmed explicit rejection", () => {
    expect(source).toContain("getPrimarySubmissionAction");
    expect(source).toContain("submissionTransitionRequiresResponsible");
    expect(source).toContain("<SubmissionWorkflowAction");
    expect(source).toContain("workflowStyles[action.tone]");
    expect(source).toContain('warning: "border-[var(--ui-warning-border)]');
    expect(source).toContain('info: "border-[var(--ui-info-border)]');
    expect(source).toContain('violet: "border-[var(--ui-violet-border)]');
    expect(source).toContain('success: "border-[var(--ui-success-border)]');
    expect(source).toContain("<SubmissionRejectAction");
    expect(source).toContain("<SubmissionRejectAction overflow");
    expect(source).toContain('aria-label={t("workflow.moreActions")}');
    expect(source).toContain('<Ellipsis className="size-4"');
    expect(source).toContain("compact && \"min-h-11 px-2.5 xl:min-h-9\"");
    expect(source).toContain("xl:size-9");
    expect(source).toContain("transition-[color,background-color,border-color,opacity]");
    expect(source).toContain('title={t("workflow.rejectTitle")}');
    expect(source).toContain('t("workflow.confirmReject")');
    expect(source).not.toContain("<SubmissionSecondaryActions");
    expect(source).toContain('t("workflow.chooseResponsible")');
    expect(source).toContain('t("workflow.assignMe")');
    expect(source).toContain('runWorkflow("rejected"');
    const rejectAction = source.slice(source.indexOf("function SubmissionRejectAction"));
    expect(rejectAction).not.toContain('<X className="size-4"');
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
    expect(drawer).toContain('item.type === "request" && item.requestCategory');
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

  it("scopes live comment inserts to the open submission and removes the channel on cleanup", () => {
    const drawer = source.slice(source.indexOf("function SubmissionDetailDrawer"), source.indexOf("function Meta"));
    expect(drawer).toContain('.channel(`submission-comments:${submissionId}`)');
    expect(drawer).toContain('{ event: "INSERT", schema: "public", table: "submission_comments", filter: `submission_id=eq.${submissionId}` }');
    expect(drawer).toContain("knownCommentIdsRef.current.has(row.id)");
    expect(drawer).toContain('.eq("submission_id", submissionId)');
    expect(drawer).toContain("supabase.removeChannel(channel)");
    expect(drawer).toContain("isNearDiscussionBottom()");
    expect(drawer).toContain("comments.map((entry)");
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
