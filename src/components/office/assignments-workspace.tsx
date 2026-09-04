"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardCheck, UserRound, X } from "lucide-react";
import { createOfficeAssignment, manageOfficeAssignment, transitionOfficeAssignment } from "@/app/(app)/office/assignments/actions";
import { useOfficeOverlayRouting } from "@/components/office/use-office-overlay-routing";
import { taskPrioritySelectItem } from "@/components/tasks/task-select-presentation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { OfficeAssignmentItem } from "@/data/queries/office-assignments";
import type { SubmissionPerson } from "@/data/queries/submissions";
import { getAllowedOfficeAssignmentStatuses, isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus, OFFICE_ASSIGNMENT_PRIORITIES, type OfficeAssignmentPriority, type OfficeAssignmentStatus } from "@/lib/office-assignments";
import { getPriorityBadgeStyle } from "@/lib/semantic-styles";
import type { OfficeAssignmentActionState } from "@/lib/validation/office-assignment";
import { cn } from "@/lib/utils";

type Filter = "active" | "mine" | "history";
const initialCreateState: OfficeAssignmentActionState = {};

function statusStyle(status: OfficeAssignmentStatus) {
  if (status === "done") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "cancelled") return "bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]";
  if (status === "in_progress") return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

export function AssignmentsWorkspace({ currentUserId, isAdmin, items, members, today }: { currentUserId: string; isAdmin: boolean; items: OfficeAssignmentItem[]; members: SubmissionPerson[]; today: string }) {
  const t = useTranslations("OfficeAssignments");
  const [filter, setFilter] = useState<Filter>("active");
  const [createdNotice, setCreatedNotice] = useState(false);
  const { closeCreate, closeItem, createOpen: createRequested, openItem, selectedItemId } = useOfficeOverlayRouting("/office/assignments", "assignment");
  const createOpen = createRequested && isAdmin;
  const selected = items.find((item) => item.id === selectedItemId) ?? null;
  const filters: Filter[] = ["active", "mine", "history"];
  const filtered = useMemo(() => items.filter((item) => {
    if (filter === "mine") return item.responsible.id === currentUserId;
    if (filter === "active") return !isTerminalOfficeAssignmentStatus(item.status);
    return isTerminalOfficeAssignmentStatus(item.status);
  }), [currentUserId, filter, items]);

  return <div className="space-y-6">
    <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("description")}</p></div>
    <div className="flex gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="tablist" aria-label={t("filters.label")}>
      {filters.map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("min-h-10 shrink-0 cursor-pointer rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", filter === value ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>{t(`filters.${value}`)}</button>)}
    </div>
    {createdNotice ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">{t("createdNotice")}</p> : null}
    {filtered.length ? <div className="grid gap-3 lg:grid-cols-2">{filtered.map((item) => <AssignmentRow key={item.id} item={item} today={today} onOpen={() => openItem(item.id)} />)}</div> : <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><ClipboardCheck className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="mt-3 font-semibold">{t("empty.title")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("empty.description")}</p></div>}
    {isAdmin ? <CreateAssignmentDialog key={`assignment-create-${createOpen ? "open" : "closed"}`} isOpen={createOpen} members={members} onClose={closeCreate} onCreated={(id) => { setCreatedNotice(true); openItem(id); }} /> : null}
    <AssignmentDetailDrawer key={`assignment-detail-${selected?.id ?? "closed"}`} currentUserId={currentUserId} isAdmin={isAdmin} item={selected} members={members} today={today} onClose={closeItem} />
  </div>;
}

function AssignmentRow({ item, today, onOpen }: { item: OfficeAssignmentItem; today: string; onOpen: () => void }) {
  const t = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const overdue = isOfficeAssignmentOverdue(item.deadline, item.status, today);
  return <article className="group relative rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow-panel)] transition-colors hover:border-[var(--ui-border-strong)] focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus)]">
    <button type="button" aria-label={`${t("eyebrow")}: ${item.title}`} onClick={onOpen} className="absolute inset-0 cursor-pointer rounded-[var(--ui-radius-panel)] focus-visible:outline-none" />
    <div className="pointer-events-none relative min-w-0"><div className="flex items-start gap-2.5"><div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]"><ClipboardCheck className="size-3.5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("eyebrow")}</span><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span></div><h3 className="mt-0.5 line-clamp-1 text-sm font-semibold leading-5 text-[var(--ui-text)]">{item.title}</h3>{item.description?.trim() ? <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[var(--ui-text-secondary)]">{item.description}</p> : null}</div></div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"><Person person={item.responsible} label={t("responsible")} /><time dateTime={item.createdAt} className="text-[11px] text-[var(--ui-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</time>{item.deadline ? <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", overdue ? "text-[var(--ui-danger-text)]" : "text-[var(--ui-text-secondary)]")}><CalendarClock className="size-3" aria-hidden="true" />{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${item.deadline}T00:00:00`))}</span> : null}</div></div>
  </article>;
}

function CreateAssignmentDialog({ isOpen, members, onClose, onCreated }: { isOpen: boolean; members: SubmissionPerson[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createOfficeAssignment, initialCreateState);
  useEffect(() => { if (state.success && state.assignmentId && !processed.current) { processed.current = true; onCreated(state.assignmentId); } }, [onCreated, state.assignmentId, state.success]);
  return <Dialog closeDisabled={pending} closeLabel={t("close")} description={t("form.description")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.title")}>
    <form action={action} className="grid gap-5 overflow-y-auto p-5 sm:p-6">
      <FormField label={t("form.name")}><Input data-dialog-initial-focus name="title" required maxLength={160} /></FormField>
      <FormField label={t("form.details")} optional><Textarea name="description" maxLength={5000} rows={4} /></FormField>
      <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("form.responsible")}><Select name="responsibleId" required defaultValue="" placeholder={t("form.selectResponsible")}>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField><FormField label={t("form.priority")}><Select name="priority" defaultValue="normal">{OFFICE_ASSIGNMENT_PRIORITIES.map((value) => taskPrioritySelectItem(value, t(`priorities.${value}`)))}</Select></FormField></div>
      <FormField label={t("form.deadline")} optional><DatePicker name="deadline" locale={locale} /></FormField>
      {state.error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t(`errors.${state.error}`)}</p> : null}
      <div className="flex justify-end gap-3"><Button type="button" size="lg" variant="outline" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("form.submitting") : t("form.submit")}</Button></div>
    </form>
  </Dialog>;
}

function AssignmentDetailDrawer({ currentUserId, isAdmin, item, members, today, onClose }: { currentUserId: string; isAdmin: boolean; item: OfficeAssignmentItem | null; members: SubmissionPerson[]; today: string; onClose: () => void }) {
  const t = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!item) return null;
  const nextStatuses = getAllowedOfficeAssignmentStatuses(item.status, isAdmin);
  function run(operation: () => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else router.refresh(); }); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.title} className="w-[calc(100%-0.5rem)] max-w-xl sm:w-full">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-violet-500/10 text-violet-700 dark:text-violet-300"><ClipboardCheck className="size-5" aria-hidden="true" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("eyebrow")}</p><h2 className="mt-0.5 text-lg font-bold leading-6">{item.title}</h2></div></div><div className="flex shrink-0 items-center gap-1">{isAdmin && !isTerminalOfficeAssignmentStatus(item.status) ? <AssignmentCancelAction disabled={pending} title={item.title} onCancel={() => run(() => transitionOfficeAssignment({ assignmentId: item.id, status: "cancelled" }))} /> : null}<button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"><div className="flex flex-wrap gap-2"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span>{isOfficeAssignmentOverdue(item.deadline, item.status, today) ? <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{t("overdue")}</span> : null}</div>
      <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-[var(--ui-border-subtle)] py-4 sm:grid-cols-2"><PersonMeta label={t("responsible")} person={item.responsible} /><PersonMeta label={t("creator")} person={item.creator} /><Meta label={t("created")} value={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(item.createdAt))} /><Meta label={t("deadline")} value={item.deadline ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${item.deadline}T00:00:00`)) : "—"} /></dl>
      {item.description ? <div className="mt-5"><h3 className="text-sm font-semibold">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{item.description}</p></div> : null}
      {!isAdmin && item.responsible.id === currentUserId && nextStatuses.length ? <div className="mt-6 border-t border-[var(--ui-border)] pt-5"><h3 className="font-semibold">{t("progress")}</h3><div className="mt-3 flex flex-wrap gap-2">{nextStatuses.map((status) => <Button key={status} type="button" size="lg" disabled={pending} onClick={() => run(() => transitionOfficeAssignment({ assignmentId: item.id, status }))}><CheckCircle2 className="mr-2 size-4" aria-hidden="true" />{t(`actions.${status}`)}</Button>)}</div></div> : null}
      {isAdmin ? <AssignmentAdminControls key={item.id} item={item} members={members} disabled={pending} onSave={(input) => run(() => manageOfficeAssignment(input))} /> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{t(`errors.${error}`)}</p> : null}
    </div>
  </Drawer>;
}

function AssignmentAdminControls({ item, members, disabled, onSave }: { item: OfficeAssignmentItem; members: SubmissionPerson[]; disabled: boolean; onSave: (input: { assignmentId: string; status: string; responsibleId: string; priority: string; deadline: string | null }) => void }) {
  const t = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const [status, setStatus] = useState<OfficeAssignmentStatus>(item.status);
  const [responsibleId, setResponsibleId] = useState(item.responsible.id);
  const [priority, setPriority] = useState<OfficeAssignmentPriority>(item.priority);
  const [deadline, setDeadline] = useState(item.deadline ?? "");
  const statuses = [item.status, ...getAllowedOfficeAssignmentStatuses(item.status, true).filter((status) => status !== "cancelled")];
  return <section className="mt-6 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-subtle)] p-4 sm:p-5"><div className="flex items-center gap-2"><UserRound className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="font-semibold">{t("admin.title")}</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField label={t("admin.status")}><Select value={status} disabled={disabled} onValueChange={(value) => setStatus(value as OfficeAssignmentStatus)}>{statuses.map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}</Select></FormField><FormField label={t("admin.responsible")}><Select value={responsibleId} disabled={disabled} onValueChange={setResponsibleId}>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField><FormField label={t("admin.priority")}><Select value={priority} disabled={disabled} onValueChange={(value) => setPriority(value as OfficeAssignmentPriority)}>{OFFICE_ASSIGNMENT_PRIORITIES.map((value) => taskPrioritySelectItem(value, t(`priorities.${value}`)))}</Select></FormField><FormField label={t("admin.deadline")}><DatePicker value={deadline} disabled={disabled} locale={locale} onValueChange={setDeadline} /></FormField></div><Button type="button" size="lg" className="mt-4" disabled={disabled} onClick={() => onSave({ assignmentId: item.id, status, responsibleId, priority, deadline: deadline || null })}>{disabled ? t("admin.saving") : t("admin.save")}</Button></section>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>; }
function Person({ label, person }: { label: string; person: SubmissionPerson }) { return <div className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span className="min-w-0"><span className="block text-[11px] font-medium text-[var(--ui-text-muted)]">{label}</span><span className="block truncate text-xs font-semibold text-[var(--ui-text-secondary)]">{person.fullName}</span></span></div>; }
function PersonMeta({ label, person }: { label: string; person: SubmissionPerson }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span>{person.fullName}</span></dd></div>; }

function AssignmentCancelAction({ disabled, onCancel, title }: { disabled: boolean; onCancel: () => void; title: string }) {
  const t = useTranslations("OfficeAssignments");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <><button ref={triggerRef} type="button" aria-label={t("actions.cancelled")} disabled={disabled} onClick={() => setOpen(true)} className="flex size-11 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-transparent text-[var(--ui-danger-text)] transition-colors hover:border-[var(--ui-danger-border)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:size-9"><X className="size-4" aria-hidden="true" /></button><Dialog isOpen={open} onRequestClose={() => setOpen(false)} returnFocusRef={triggerRef} closeLabel={t("close")} title={t("cancelDialog.title")} description={t("cancelDialog.description", { title })} className="h-auto max-w-md"><div className="flex justify-end gap-2 p-5 sm:p-6"><Button data-dialog-initial-focus type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button type="button" disabled={disabled} onClick={() => { setOpen(false); onCancel(); }} className="bg-[var(--ui-danger-solid)] text-white hover:opacity-90"><X className="mr-1.5 size-4" aria-hidden="true" />{t("cancelDialog.confirm")}</Button></div></Dialog></>;
}
