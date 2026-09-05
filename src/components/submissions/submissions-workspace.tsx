"use client";

import { useActionState, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Ban, CalendarCheck2, CalendarClock, Check, CheckCircle2, CircleAlert, Eye, Lightbulb, LockKeyhole, MessageSquareText, Play, Send, ShieldCheck, ThumbsUp, UserRound, Wrench, X } from "lucide-react";
import { addSubmissionComment, createSubmission, manageSubmission, toggleSuggestionSupport } from "@/app/(app)/submissions/actions";
import { useOfficeOverlayRouting } from "@/components/office/use-office-overlay-routing";
import { taskPrioritySelectItem } from "@/components/tasks/task-select-presentation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SubmissionItem, SubmissionPerson } from "@/data/queries/submissions";
import { canRejectSubmission, getPrimarySubmissionAction, getPrimarySubmissionStatus, isTerminalSubmissionStatus, submissionTransitionRequiresResponsible, SUBMISSION_PRIORITIES, SUBMISSION_TYPES, type SubmissionPriority, type SubmissionStatus, type SubmissionType, type SubmissionWorkflowAction as SubmissionWorkflowActionDefinition } from "@/lib/submissions";
import type { SubmissionActionState } from "@/lib/validation/submission";
import { getPriorityBadgeStyle } from "@/lib/semantic-styles";
import { cn } from "@/lib/utils";

type InboxFilter = "active" | "mine" | "history";
type TypeFilter = "all" | SubmissionType;
type ManageSubmissionInput = { submissionId: string; status: string; responsibleId: string | null; priority: SubmissionPriority; deadline: string | null; internalNote: string };
const initialCreateState: SubmissionActionState = {};

const typeIcons = { request: Wrench, suggestion: Lightbulb, complaint: CircleAlert } as const;
const typeStyles = {
  request: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  suggestion: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  complaint: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

const workflowIcons = {
  accept: Check,
  start: Play,
  complete: CheckCircle2,
  review: Eye,
  action: ShieldCheck,
  plan: CalendarCheck2,
} as const;

const workflowStyles = {
  info: "border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)] hover:opacity-85",
  success: "border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)] hover:opacity-85",
  warning: "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-85",
  violet: "border-[var(--ui-violet-border)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)] hover:opacity-85",
} as const;

function statusStyle(status: SubmissionStatus) {
  if (["done", "implemented", "closed"].includes(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (status === "new") return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

export function SubmissionsWorkspace({ currentUserId, isAdmin, items, members }: { currentUserId: string; isAdmin: boolean; items: SubmissionItem[]; members: SubmissionPerson[] }) {
  const t = useTranslations("Submissions");
  const [filter, setFilter] = useState<InboxFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [createdNotice, setCreatedNotice] = useState<"named" | "anonymous" | null>(null);
  const { closeCreate, closeItem, createOpen, openItem, selectedItemId } = useOfficeOverlayRouting("/office/submissions", "submission");
  const selected = items.find((item) => item.id === selectedItemId) ?? null;
  const filters: InboxFilter[] = ["active", "mine", "history"];
  const filtered = useMemo(() => items.filter((item) => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (filter === "mine") return item.author?.id === currentUserId || item.responsible?.id === currentUserId;
    const terminal = isTerminalSubmissionStatus(item.type, item.status);
    return filter === "history" ? terminal : !terminal;
  }).sort((a, b) => {
    if (filter === "active") {
      const actionDifference = Number(Boolean(getPrimarySubmissionStatus(b.type, b.status))) - Number(Boolean(getPrimarySubmissionStatus(a.type, a.status)));
      if (actionDifference) return actionDifference;
      const newDifference = Number(b.status === "new") - Number(a.status === "new");
      if (newDifference) return newDifference;
    }
    return b.createdAt.localeCompare(a.createdAt);
  }), [currentUserId, filter, items, typeFilter]);

  return <div className="space-y-6">
    <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("description")}</p></div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="tablist" aria-label={t("filters.label")}>
      {filters.map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("min-h-10 shrink-0 cursor-pointer rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", filter === value ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>{t(`filters.${value}`)}</button>)}
    </div><Select aria-label={t("filters.typeLabel")} value={typeFilter} width="content" onValueChange={(value) => setTypeFilter(value as TypeFilter)}><SelectItem value="all">{t("filters.allTypes")}</SelectItem>{SUBMISSION_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`filters.${value}`)}</SelectItem>)}</Select></div>
    {createdNotice ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">{t(createdNotice === "anonymous" ? "anonymousCreatedNotice" : "createdNotice")}</p> : null}
    {filtered.length ? <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{filtered.map((item) => <SubmissionRow key={item.id} currentUserId={currentUserId} isAdmin={isAdmin} item={item} members={members} onOpen={() => openItem(item.id)} />)}</div> : <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><MessageSquareText className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h2 className="mt-3 font-semibold">{t("empty.title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("empty.description")}</p></div>}
    <CreateSubmissionDialog key={`submission-create-${createOpen ? "open" : "closed"}`} isOpen={createOpen} onClose={closeCreate} onCreated={(id, anonymous) => { setCreatedNotice(anonymous ? "anonymous" : "named"); if (id) openItem(id); else closeCreate(); }} />
    <SubmissionDetailDrawer key={`submission-detail-${selected?.id ?? "closed"}`} currentUserId={currentUserId} isAdmin={isAdmin} item={selected} members={members} onClose={closeItem} />
  </div>;
}

function SubmissionRow({ currentUserId, isAdmin, item, members, onOpen }: { currentUserId: string; isAdmin: boolean; item: SubmissionItem; members: SubmissionPerson[]; onOpen: () => void }) {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const router = useRouter();
  const [optimisticSupport, setOptimisticSupport] = useOptimistic(
    { count: item.supportCount, supported: item.supportedByMe },
    (_current, next: { count: number; supported: boolean }) => next,
  );
  const [supportError, setSupportError] = useState(false);
  const [supportPending, startSupportTransition] = useTransition();
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowPending, startWorkflowTransition] = useTransition();
  const Icon = typeIcons[item.type];
  const supportCount = optimisticSupport.count;
  const supportedByMe = optimisticSupport.supported;
  function toggleSupport() {
    const previousSupported = supportedByMe;
    setSupportError(false);
    startSupportTransition(async () => {
      setOptimisticSupport({ count: Math.max(0, supportCount + (previousSupported ? -1 : 1)), supported: !previousSupported });
      const result = await toggleSuggestionSupport(item.id, previousSupported);
      if (result.error) {
        setSupportError(true);
        return;
      }
      router.refresh();
    });
  }
  function runWorkflow(status: SubmissionStatus, responsibleId: string | null) {
    setWorkflowError(null);
    startWorkflowTransition(async () => {
      const result = await manageSubmission({ submissionId: item.id, status, responsibleId, priority: item.priority, deadline: item.deadline, internalNote: item.internalNote ?? "" });
      if (result.error) setWorkflowError(result.error);
      else router.refresh();
    });
  }
  const primaryAction = getPrimarySubmissionAction(item.type, item.status);
  const terminal = isTerminalSubmissionStatus(item.type, item.status);
  const displayedDate = terminal ? item.updatedAt : item.deadline ?? item.createdAt;
  const displayedDateTime = item.deadline && !terminal ? `${item.deadline}T00:00:00` : displayedDate;
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(displayedDateTime));
  return <article className="group relative bg-[var(--ui-surface)] px-3 py-2.5 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--ui-focus)]">
    <button type="button" aria-label={`${t(`types.${item.type}`)}: ${item.title}`} onClick={onOpen} className="absolute inset-0 cursor-pointer focus-visible:outline-none" />
    <div className="pointer-events-none relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 lg:min-h-[4rem] lg:grid-cols-[auto_minmax(8rem,0.8fr)_minmax(12rem,1.75fr)_minmax(8rem,0.9fr)_minmax(8rem,0.9fr)_minmax(6rem,0.65fr)_auto] lg:gap-x-4">
      <div className={cn("row-span-2 flex size-8 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)]", typeStyles[item.type])}><Icon className="size-4" aria-hidden="true" /></div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:row-span-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.type}`)}</span><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span></div>
      <div className="col-start-2 min-w-0 lg:col-start-auto lg:row-span-2"><h3 className="truncate text-sm font-semibold leading-5 text-[var(--ui-text)]">{item.title}</h3>{item.description.trim() ? <p className="mt-0.5 hidden truncate text-xs leading-4 text-[var(--ui-text-secondary)] xl:block">{item.description}</p> : null}</div>
      <div className="hidden min-w-0 lg:block">{item.isAnonymous ? <AnonymousPerson label={t("anonymous")} /> : item.author ? <RowPerson person={item.author} /> : <span className="text-sm text-[var(--ui-text-muted)]">—</span>}</div>
      <div className="hidden min-w-0 lg:block">{item.responsible ? <RowPerson person={item.responsible} /> : <span className="text-sm text-[var(--ui-text-muted)]">—</span>}</div>
      <time dateTime={displayedDateTime} className="hidden shrink-0 text-xs text-[var(--ui-text-muted)] lg:block">{dateLabel}</time>
      {(isAdmin && (primaryAction || canRejectSubmission(item.type, item.status))) || item.type === "suggestion" ? <div className="pointer-events-auto relative z-10 col-start-3 row-span-2 row-start-1 flex shrink-0 flex-wrap items-center justify-end gap-1.5 lg:col-start-auto" onClick={(event) => event.stopPropagation()}>{item.type === "suggestion" ? <button type="button" aria-label={supportedByMe ? t("supported", { count: supportCount }) : t("support", { count: supportCount })} aria-pressed={supportedByMe} disabled={supportPending} onClick={toggleSupport} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-wait disabled:opacity-70 lg:min-h-9", supportedByMe ? "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-90" : "border-[var(--ui-border)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] hover:border-[var(--ui-warning-border)] hover:bg-[var(--ui-warning-surface)] hover:text-[var(--ui-warning-text)]")}><ThumbsUp className={cn("size-3.5", supportedByMe && "fill-current")} aria-hidden="true" />{supportCount}</button> : null}{isAdmin && primaryAction ? <SubmissionWorkflowAction action={primaryAction} currentUserId={currentUserId} disabled={workflowPending} members={members} responsibleId={item.responsible?.id ?? null} type={item.type} onTransition={runWorkflow} compact /> : null}{isAdmin && canRejectSubmission(item.type, item.status) ? <SubmissionRejectAction disabled={workflowPending} title={item.title} onReject={() => runWorkflow("rejected", item.responsible?.id ?? null)} /> : null}</div> : null}
      <div className="col-span-2 col-start-2 flex min-w-0 items-center gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)] sm:flex-wrap lg:hidden">{item.isAnonymous ? <AnonymousPerson label={t("anonymous")} /> : item.author ? <RowPerson person={item.author} /> : null}{item.responsible ? <span className="hidden sm:block"><RowPerson person={item.responsible} /></span> : null}<time dateTime={displayedDateTime} className="inline-flex items-center gap-1"><CalendarClock className="size-3" aria-hidden="true" />{dateLabel}</time></div>
      {supportError ? <p role="alert" className="col-span-full text-xs text-[var(--ui-danger-text)]">{t("errors.support")}</p> : null}{workflowError ? <p role="alert" className="col-span-full text-xs text-[var(--ui-danger-text)]">{t(`errors.${workflowError}`)}</p> : null}
    </div>
  </article>;
}

function CreateSubmissionDialog({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string | null, anonymous: boolean) => void }) {
  const t = useTranslations("Submissions");
  const [type, setType] = useState<SubmissionType>("request");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createSubmission, initialCreateState);
  useEffect(() => { if (state.success && !processed.current) { processed.current = true; onCreated(state.submissionId ?? null, Boolean(state.anonymousSubmitted)); } }, [onCreated, state.anonymousSubmitted, state.submissionId, state.success]);
  return <Dialog closeDisabled={pending} closeLabel={t("close")} description={t("form.description")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.title")}>
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold text-[var(--ui-text-secondary)]">{t("form.type")}</legend><div className="grid gap-2 sm:grid-cols-3">{SUBMISSION_TYPES.map((value) => { const Icon = typeIcons[value]; return <label key={value} className={cn("flex min-h-14 cursor-pointer items-center gap-2 rounded-[var(--ui-radius-control)] border px-3 transition-colors", type === value ? "border-[var(--ui-action-primary)] bg-[var(--ui-action-primary)]/5" : "border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-muted)]")}><input className="sr-only" type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} /><Icon className="size-4" aria-hidden="true" /><span className="text-sm font-semibold">{t(`types.${value}`)}</span></label>; })}</div></fieldset>
      <FormField label={t("form.subject")}><Input data-dialog-initial-focus name="title" required maxLength={160} /></FormField>
      <FormField label={t("form.details")}><Textarea name="description" required maxLength={5000} rows={6} /></FormField>
      {type === "complaint" ? <label className="flex cursor-pointer gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4"><input type="checkbox" name="anonymous" className="mt-1 size-4 accent-[var(--ui-action-primary)]" /><span><span className="block text-sm font-semibold">{t("form.anonymous")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-secondary)]">{t("form.anonymousNotice")}</span></span></label> : null}
      {state.error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t(`errors.${state.error}`)}</p> : null}
      <div className="flex justify-end gap-3"><Button type="button" size="lg" variant="outline" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("form.submitting") : t("form.submit")}</Button></div>
    </form>
  </Dialog>;
}

function SubmissionDetailDrawer({ currentUserId, isAdmin, item, members, onClose }: { currentUserId: string; isAdmin: boolean; item: SubmissionItem | null; members: SubmissionPerson[]; onClose: () => void }) {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isComposingCommentRef = useRef(false);
  useEffect(() => {
    const composer = commentRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 112)}px`;
  }, [comment]);
  if (!item) return null;
  const submissionId = item.id;
  const Icon = typeIcons[item.type];
  function refreshAfter(operation: () => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else router.refresh(); }); }
  function submitComment() { if (!comment.trim()) return; refreshAfter(async () => { const result = await addSubmissionComment({ submissionId, body: comment }); if (!result.error) setComment(""); return result; }); }
  return <Drawer isOpen={Boolean(item)} onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.title} className="w-full max-w-[34rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 gap-3"><div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)]", typeStyles[item.type])}><Icon className="size-5" aria-hidden="true" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.type}`)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="max-w-full break-words text-lg font-bold leading-6">{item.title}</h2><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span></div></div></div><button ref={closeRef} type="button" aria-label={t("close")} onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="space-y-5 p-5 sm:p-6"><dl className="grid gap-x-6 gap-y-4 border-b border-[var(--ui-border-subtle)] pb-4 sm:grid-cols-2">{item.isAnonymous ? <AnonymousMeta label={t("author")} value={t("anonymousPrivate")} /> : item.author ? <PersonMeta label={t("author")} person={item.author} /> : <Meta label={t("author")} value="—" />}{item.responsible ? <PersonMeta label={t("responsible")} person={item.responsible} /> : <Meta label={t("responsible")} value={t("unassigned")} />}<Meta label={t("created")} value={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(item.createdAt))} /><Meta label={t("deadline")} value={item.deadline ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${item.deadline}T00:00:00`)) : "—"} /></dl>
        <div><h3 className="text-sm font-semibold">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{item.description}</p></div>
        {item.type === "suggestion" ? <Button type="button" size="lg" variant="outline" aria-pressed={item.supportedByMe} disabled={pending} onClick={() => refreshAfter(() => toggleSuggestionSupport(item.id, item.supportedByMe))} className={item.supportedByMe ? "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-90" : undefined}><ThumbsUp className={cn("mr-2 size-4", item.supportedByMe && "fill-current")} aria-hidden="true" />{item.supportedByMe ? t("supported", { count: item.supportCount }) : t("support", { count: item.supportCount })}</Button> : null}
      </section>
      {isAdmin ? <AdminControls key={`${item.id}:${item.updatedAt}`} item={item} members={members} disabled={pending} onSave={(input) => refreshAfter(() => manageSubmission(input))} onReject={canRejectSubmission(item.type, item.status) ? () => refreshAfter(() => manageSubmission({ submissionId: item.id, status: "rejected", responsibleId: item.responsible?.id ?? null, priority: item.priority, deadline: item.deadline, internalNote: item.internalNote ?? "" })) : undefined} /> : null}
      {!item.isAnonymous ? <section className="border-t border-[var(--ui-border)] p-5 sm:p-6"><h3 className="flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" />{t(item.type === "suggestion" ? "discussion" : "communication")}</h3><div className="mt-4 grid gap-4">{item.comments.map((entry) => <div key={entry.id} className="flex gap-3"><UserAvatar imageUrl={entry.author.avatarUrl} name={entry.author.fullName} size="sm" /><div className="min-w-0 flex-1 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)] p-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold">{entry.author.id === currentUserId ? t("you") : entry.author.fullName}</span><time className="text-xs text-[var(--ui-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{entry.body}</p></div></div>)}</div>
        <div className="mt-4 flex items-end gap-2"><FormField className="min-w-0 flex-1" label={t("comment")}><Textarea ref={commentRef} value={comment} onChange={(event) => setComment(event.target.value)} onCompositionStart={() => { isComposingCommentRef.current = true; }} onCompositionEnd={() => { isComposingCommentRef.current = false; }} onKeyDown={(event) => { if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || isComposingCommentRef.current) return; event.preventDefault(); submitComment(); }} maxLength={3000} rows={1} className="min-h-11 max-h-28 resize-none overflow-y-auto py-2.5 leading-5" /></FormField><Button type="button" aria-label={t("send")} disabled={pending || !comment.trim()} onClick={submitComment} className="size-11 px-0"><Send className="size-4" aria-hidden="true" /></Button></div>
      </section> : null}
      {error ? <p role="alert" className="mx-5 mb-5 text-sm text-[var(--ui-danger-text)] sm:mx-6 sm:mb-6">{t(`errors.${error}`)}</p> : null}
    </div>
  </Drawer>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-medium text-[var(--ui-text)]">{value}</dd></div>; }

function RowPerson({ person }: { person: SubmissionPerson }) { return <span className="flex min-w-0 items-center gap-1.5"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="boardCard" /><span className="truncate text-xs font-medium text-[var(--ui-text-secondary)]">{person.fullName}</span></span>; }
function AnonymousPerson({ label }: { label: string }) { return <div className="flex min-w-0 items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><LockKeyhole className="size-4" aria-hidden="true" /></span><span className="text-xs font-semibold text-[var(--ui-text-secondary)]">{label}</span></div>; }
function PersonMeta({ label, person }: { label: string; person: SubmissionPerson }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span>{person.fullName}</span></dd></div>; }
function AnonymousMeta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><LockKeyhole className="size-4" aria-hidden="true" /></span><span>{value}</span></dd></div>; }

function AdminControls({ disabled, item, members, onReject, onSave }: { disabled: boolean; item: SubmissionItem; members: SubmissionPerson[]; onReject?: () => void; onSave: (input: ManageSubmissionInput) => void }) {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const [responsibleId, setResponsibleId] = useState(item.responsible?.id ?? "");
  const [priority, setPriority] = useState<SubmissionPriority>(item.priority);
  const [deadline, setDeadline] = useState(item.deadline ?? "");
  const [note, setNote] = useState(item.internalNote ?? "");
  function save() { onSave({ submissionId: item.id, status: item.status, responsibleId: responsibleId || null, priority, deadline: deadline || null, internalNote: note }); }
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center gap-2"><UserRound className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="font-semibold">{t("admin.title")}</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2">
    <FormField label={t("admin.responsible")}><Select disabled={disabled || item.type === "complaint"} value={responsibleId} onValueChange={setResponsibleId}><SelectItem value="">{t("unassigned")}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField>
    <FormField label={t("admin.deadline")}><DatePicker value={deadline} disabled={disabled} locale={locale} onValueChange={setDeadline} /></FormField>
    <FormField label={t("admin.priority")}><Select value={priority} disabled={disabled} onValueChange={(value) => setPriority(value as SubmissionPriority)}>{SUBMISSION_PRIORITIES.map((value) => taskPrioritySelectItem(value, t(`priorities.${value}`)))}</Select></FormField>
    <FormField className="sm:col-span-2" label={t("admin.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={5000} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("admin.notePrivate")}</span></FormField>
  </div><div className={cn("mt-4 flex flex-wrap items-center gap-3", onReject ? "justify-between" : "justify-end")}>{onReject ? <SubmissionRejectAction label disabled={disabled} title={item.title} onReject={onReject} /> : null}<Button type="button" disabled={disabled} onClick={save}>{disabled ? t("admin.saving") : t("admin.save")}</Button></div></section>;
}

function SubmissionWorkflowAction({ action, compact = false, currentUserId, disabled, members, onTransition, responsibleId, type }: { action: SubmissionWorkflowActionDefinition; compact?: boolean; currentUserId: string; disabled: boolean; members: SubmissionPerson[]; onTransition: (status: SubmissionStatus, responsibleId: string | null) => void; responsibleId: string | null; type: SubmissionType }) {
  const t = useTranslations("Submissions");
  const [open, setOpen] = useState(false);
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  const requiresResponsible = submissionTransitionRequiresResponsible(type, action.status) && !responsibleId;
  const ActionIcon = workflowIcons[action.icon];
  function transition(nextResponsibleId: string | null) {
    setOpen(false);
    onTransition(action.status, nextResponsibleId);
  }
  const actionClassName = cn("gap-1.5 border", workflowStyles[action.tone], compact && "min-h-11 px-2.5 sm:min-h-9");
  const label = disabled ? t("workflow.updating") : t(`workflow.${action.status}`);
  if (!requiresResponsible) return <Button type="button" size={compact ? "sm" : "default"} variant="outline" disabled={disabled} onClick={() => transition(responsibleId)} className={actionClassName}><ActionIcon className="size-3.5" aria-hidden="true" />{label}</Button>;
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><Button ref={setTriggerNode} type="button" size={compact ? "sm" : "default"} variant="outline" disabled={disabled} className={actionClassName}><ActionIcon className="size-3.5" aria-hidden="true" />{label}</Button></Popover.Trigger><Popover.Portal container={portalContainer}><Popover.Content align="end" sideOffset={6} collisionPadding={12} className="z-[70] w-[min(22rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-4 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]"><p className="text-sm font-semibold">{t("workflow.chooseResponsible")}</p><div className="mt-3 grid gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => transition(currentUserId)}>{t("workflow.assignMe")}</Button><Select aria-label={t("admin.responsible")} disabled={disabled} placeholder={t("workflow.chooseMember")} onValueChange={(value) => transition(value)}>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></div><Popover.Arrow className="fill-[var(--ui-surface)]" /></Popover.Content></Popover.Portal></Popover.Root>;
}

function SubmissionRejectAction({ disabled, label = false, onReject, title }: { disabled: boolean; label?: boolean; onReject: () => void; title: string }) {
  const t = useTranslations("Submissions");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <><button ref={triggerRef} type="button" aria-label={t("workflow.reject")} disabled={disabled} onClick={(event) => { event.stopPropagation(); setOpen(true); }} className={cn("cursor-pointer rounded-[var(--ui-radius-control)] border text-[var(--ui-danger-text)] transition-colors hover:border-[var(--ui-danger-border)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50", label ? "inline-flex min-h-11 items-center gap-2 border-[var(--ui-danger-border)] px-3 text-sm font-semibold" : "flex size-11 justify-center border-transparent sm:size-9")}>{label ? <Ban className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}{label ? t("workflow.reject") : null}</button><Dialog isOpen={open} onRequestClose={() => setOpen(false)} returnFocusRef={triggerRef} closeLabel={t("close")} title={t("workflow.rejectTitle")} description={t("workflow.rejectDescription", { title })} className="h-auto max-w-md"><div className="flex justify-end gap-2 p-5 sm:p-6"><Button data-dialog-initial-focus type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button type="button" disabled={disabled} onClick={() => { setOpen(false); onReject(); }} className="bg-[var(--ui-danger-solid)] text-white hover:opacity-90"><Ban className="mr-1.5 size-4" aria-hidden="true" />{t("workflow.confirmReject")}</Button></div></Dialog></>;
}
