"use client";

import * as Popover from "@radix-ui/react-popover";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Ban, CalendarClock, CheckCircle2, ClipboardCheck, Ellipsis, Play, UserRound, X } from "lucide-react";
import { createOfficeAssignment, manageOfficeAssignment, transitionOfficeAssignment } from "@/app/(app)/office/assignments/actions";
import { officeListDesktopGridClassName, officeWorkflowStyles } from "@/components/office/office-list-patterns";
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
import { getAllowedOfficeAssignmentStatuses, getPrimaryOfficeAssignmentStatus, isOfficeAssignmentOverdue, isTerminalOfficeAssignmentStatus, OFFICE_ASSIGNMENT_PRIORITIES, type OfficeAssignmentPriority, type OfficeAssignmentProgressStatus, type OfficeAssignmentStatus } from "@/lib/office-assignments";
import { getPriorityBadgeStyle } from "@/lib/semantic-styles";
import type { OfficeAssignmentActionState } from "@/lib/validation/office-assignment";
import { cn } from "@/lib/utils";

type Filter = "active" | "mine" | "history";
const initialCreateState: OfficeAssignmentActionState = {};

function statusStyle(status: OfficeAssignmentStatus) {
  if (status === "done") return "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]";
  if (status === "cancelled") return "bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]";
  if (status === "in_progress") return "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
  return "bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]";
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

  return <div className="space-y-5">
    <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("description")}</p></div>
    <div className="flex gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="tablist" aria-label={t("filters.label")}>
      {filters.map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("min-h-10 shrink-0 cursor-pointer rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", filter === value ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>{t(`filters.${value}`)}</button>)}
    </div>
    {createdNotice ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">{t("createdNotice")}</p> : null}
    {filtered.length ? <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{filtered.map((item) => <AssignmentRow key={item.id} currentUserId={currentUserId} isAdmin={isAdmin} item={item} today={today} onOpen={() => openItem(item.id)} />)}</div> : <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><ClipboardCheck className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="mt-3 font-semibold">{t("empty.title")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("empty.description")}</p></div>}
    {isAdmin ? <CreateAssignmentDialog key={`assignment-create-${createOpen ? "open" : "closed"}`} isOpen={createOpen} members={members} onClose={closeCreate} onCreated={(id) => { setCreatedNotice(true); openItem(id); }} /> : null}
    <AssignmentDetailDrawer key={`assignment-detail-${selected?.id ?? "closed"}`} currentUserId={currentUserId} isAdmin={isAdmin} item={selected} members={members} today={today} onClose={closeItem} />
  </div>;
}

function AssignmentRow({ currentUserId, isAdmin, item, today, onOpen }: { currentUserId: string; isAdmin: boolean; item: OfficeAssignmentItem; today: string; onOpen: () => void }) {
  const t = useTranslations("OfficeAssignments");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const overdue = isOfficeAssignmentOverdue(item.deadline, item.status, today);
  const primaryStatus = isAdmin || item.responsible.id === currentUserId ? getPrimaryOfficeAssignmentStatus(item.status) : null;
  const terminal = isTerminalOfficeAssignmentStatus(item.status);
  const displayedDate = terminal ? item.updatedAt : item.deadline ?? item.createdAt;
  const displayedDateTime = item.deadline && !terminal ? `${item.deadline}T00:00:00` : displayedDate;
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(displayedDateTime));
  function run(status: OfficeAssignmentStatus) { setError(null); startTransition(async () => { const result = await transitionOfficeAssignment({ assignmentId: item.id, status }); if (result.error) setError(result.error); else router.refresh(); }); }
  return <article className="group relative bg-[var(--ui-surface)] px-3 py-2 transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--ui-focus)] sm:px-4">
    <button type="button" aria-label={`${t("eyebrow")}: ${item.title}`} onClick={onOpen} className="absolute inset-0 cursor-pointer focus-visible:outline-none" />
    <div className={cn("pointer-events-none relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 xl:min-h-14 xl:gap-x-3", officeListDesktopGridClassName)}>
      <div className="col-span-full flex min-w-0 items-center gap-2.5 xl:col-span-1"><div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]"><ClipboardCheck className="size-[1.125rem]" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("eyebrow")}</p><h3 className="mt-0.5 truncate text-sm font-semibold leading-5 text-[var(--ui-text)]" title={item.title}>{item.title}</h3></div></div>
      <div className="hidden min-w-0 items-center gap-2 xl:flex"><span title={t(`statuses.${item.status}`)} className={cn("truncate rounded-full px-2 py-0.5 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("truncate rounded-full px-2 py-0.5 text-xs font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span></div>
      <div className="hidden min-w-0 xl:block"><Person person={item.responsible} label={t("responsible")} /></div>
      <time dateTime={displayedDateTime} className={cn("ui-numeric hidden shrink-0 text-[13px] xl:block", overdue ? "font-medium text-[var(--ui-danger-text)]" : "text-[var(--ui-text-muted)]")}>{dateLabel}</time>
      <div className="col-span-full flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--ui-border-subtle)] pt-1.5 text-[13px] text-[var(--ui-text-muted)] xl:hidden"><span title={t(`statuses.${item.status}`)} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span><Person person={item.responsible} label={t("responsible")} /><time dateTime={displayedDateTime} className={cn("ui-numeric inline-flex items-center gap-1", overdue && "font-medium text-[var(--ui-danger-text)]")}><CalendarClock className="size-3.5" aria-hidden="true" />{dateLabel}</time></div>
      <div className="pointer-events-auto relative z-10 col-span-full flex min-h-0 shrink-0 items-center justify-end gap-1.5 xl:col-span-1" onClick={(event) => event.stopPropagation()}>{primaryStatus ? <AssignmentWorkflowAction disabled={pending} status={primaryStatus} onTransition={() => run(primaryStatus)} compact /> : null}{isAdmin && !terminal ? <AssignmentCancelAction disabled={pending} title={item.title} onCancel={() => run("cancelled")} /> : null}</div>
      {error ? <p role="alert" className="col-span-full text-xs text-[var(--ui-danger-text)]">{t(`errors.${error}`)}</p> : null}
    </div>
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
  const primaryStatus = getPrimaryOfficeAssignmentStatus(item.status);
  function run(operation: () => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else router.refresh(); }); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.title} className="w-full max-w-[34rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]"><ClipboardCheck className="size-5" aria-hidden="true" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("eyebrow")}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="max-w-full break-words text-lg font-bold leading-6">{item.title}</h2><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold !border-0", getPriorityBadgeStyle(item.priority).className)}>{t(`priorities.${item.priority}`)}</span>{isOfficeAssignmentOverdue(item.deadline, item.status, today) ? <span className="rounded-full bg-[var(--ui-danger-surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ui-danger-text)]">{t("overdue")}</span> : null}</div></div></div><div className="flex shrink-0 items-center gap-1">{isAdmin && !isTerminalOfficeAssignmentStatus(item.status) ? <AssignmentCancelAction disabled={pending} title={item.title} onCancel={() => run(() => transitionOfficeAssignment({ assignmentId: item.id, status: "cancelled" }))} /> : null}<button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto"><section className="space-y-5 p-5 sm:p-6">
      <dl className="grid gap-x-6 gap-y-4 border-b border-[var(--ui-border-subtle)] pb-4 sm:grid-cols-2"><PersonMeta label={t("responsible")} person={item.responsible} /><PersonMeta label={t("creator")} person={item.creator} /><Meta label={t("created")} value={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(item.createdAt))} /><Meta label={t("deadline")} value={item.deadline ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${item.deadline}T00:00:00`)) : "—"} /></dl>
      {item.description ? <div><h3 className="text-sm font-semibold">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{item.description}</p></div> : null}
      {!isAdmin && item.responsible.id === currentUserId && primaryStatus ? <div className="border-t border-[var(--ui-border)] pt-5"><h3 className="font-semibold">{t("progress")}</h3><div className="mt-3"><AssignmentWorkflowAction disabled={pending} status={primaryStatus} onTransition={() => run(() => transitionOfficeAssignment({ assignmentId: item.id, status: primaryStatus }))} /></div></div> : null}
    </section>
      {isAdmin ? <AssignmentAdminControls key={item.id} item={item} members={members} disabled={pending} onSave={(input) => run(() => manageOfficeAssignment(input))} /> : null}
      {error ? <p role="alert" className="mx-5 mb-5 mt-4 text-sm text-[var(--ui-danger-text)] sm:mx-6 sm:mb-6">{t(`errors.${error}`)}</p> : null}
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
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center gap-2"><UserRound className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="font-semibold">{t("admin.title")}</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField label={t("admin.status")}><Select value={status} disabled={disabled} onValueChange={(value) => setStatus(value as OfficeAssignmentStatus)}>{statuses.map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}</Select></FormField><FormField label={t("admin.responsible")}><Select value={responsibleId} disabled={disabled} onValueChange={setResponsibleId}>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField><FormField label={t("admin.priority")}><Select value={priority} disabled={disabled} onValueChange={(value) => setPriority(value as OfficeAssignmentPriority)}>{OFFICE_ASSIGNMENT_PRIORITIES.map((value) => taskPrioritySelectItem(value, t(`priorities.${value}`)))}</Select></FormField><FormField label={t("admin.deadline")}><DatePicker value={deadline} disabled={disabled} locale={locale} onValueChange={setDeadline} /></FormField></div><div className="mt-4 flex justify-end"><Button type="button" disabled={disabled} onClick={() => onSave({ assignmentId: item.id, status, responsibleId, priority, deadline: deadline || null })}>{disabled ? t("admin.saving") : t("admin.save")}</Button></div></section>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>; }
function Person({ label, person }: { label: string; person: SubmissionPerson }) { return <div className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="boardCard" /><span className="min-w-0"><span title={person.fullName} className="block truncate text-sm font-semibold leading-4 text-[var(--ui-text)]">{person.fullName}</span><span className="mt-0.5 block text-[11px] font-medium leading-3 text-[var(--ui-text-muted)]">{label}</span></span></div>; }
function PersonMeta({ label, person }: { label: string; person: SubmissionPerson }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span>{person.fullName}</span></dd></div>; }

function AssignmentWorkflowAction({ compact = false, disabled, onTransition, status }: { compact?: boolean; disabled: boolean; onTransition: () => void; status: OfficeAssignmentProgressStatus }) {
  const t = useTranslations("OfficeAssignments");
  const ActionIcon = status === "in_progress" ? Play : CheckCircle2;
  const tone = status === "in_progress" ? "info" : "success";
  return <Button type="button" size={compact ? "sm" : "default"} variant="outline" disabled={disabled} onClick={onTransition} className={cn("gap-1.5 border transition-[color,background-color,border-color,opacity]", officeWorkflowStyles[tone], compact && "min-h-11 min-w-0 max-w-full px-2.5 xl:min-h-9")}><ActionIcon className="size-3.5 shrink-0" aria-hidden="true" /><span className={compact ? "truncate" : undefined}>{disabled ? t("actions.updating") : t(`actions.${status}`)}</span></Button>;
}

function AssignmentCancelAction({ disabled, onCancel, title }: { disabled: boolean; onCancel: () => void; title: string }) {
  const t = useTranslations("OfficeAssignments");
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function openConfirmation() { setMenuOpen(false); setOpen(true); }
  return <><Popover.Root open={menuOpen} onOpenChange={setMenuOpen}><Popover.Trigger asChild><button ref={triggerRef} type="button" aria-label={t("actions.more")} aria-haspopup="menu" disabled={disabled} className="flex size-11 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] active:bg-[var(--ui-surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50 xl:size-9"><Ellipsis className="size-4" aria-hidden="true" /></button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={6} collisionPadding={12} className="z-[70] min-w-44 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" role="menuitem" onClick={openConfirmation} className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] transition-colors hover:bg-[var(--ui-danger-surface)] active:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] xl:min-h-9"><Ban className="size-4" aria-hidden="true" />{t("actions.cancelled")}</button></Popover.Content></Popover.Portal></Popover.Root><Dialog isOpen={open} onRequestClose={() => setOpen(false)} returnFocusRef={triggerRef} closeLabel={t("close")} title={t("cancelDialog.title")} description={t("cancelDialog.description", { title })} className="h-auto max-w-md"><div className="flex justify-end gap-2 p-5 sm:p-6"><Button data-dialog-initial-focus type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button><Button type="button" disabled={disabled} onClick={() => { setOpen(false); onCancel(); }} className="bg-[var(--ui-danger-solid)] text-white hover:opacity-90"><Ban className="mr-1.5 size-4" aria-hidden="true" />{t("cancelDialog.confirm")}</Button></div></Dialog></>;
}
