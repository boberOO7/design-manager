"use client";

import { useActionState, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleAlert, Lightbulb, LockKeyhole, MessageSquareText, Send, ThumbsUp, UserRound, Wrench, X } from "lucide-react";
import { addSubmissionComment, createSubmission, manageSubmission, toggleSuggestionSupport } from "@/app/(app)/submissions/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { SubmissionItem, SubmissionPerson } from "@/data/queries/submissions";
import { getAllowedNextStatuses, isTerminalSubmissionStatus, SUBMISSION_PRIORITIES, SUBMISSION_TYPES, type SubmissionPriority, type SubmissionStatus, type SubmissionType } from "@/lib/submissions";
import type { SubmissionActionState } from "@/lib/validation/submission";
import { cn } from "@/lib/utils";

type Filter = "all" | "mine" | SubmissionType | "attention" | "assigned";
const initialCreateState: SubmissionActionState = {};

const typeIcons = { request: Wrench, suggestion: Lightbulb, complaint: CircleAlert } as const;
const typeStyles = {
  request: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  suggestion: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  complaint: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

function statusStyle(status: SubmissionStatus) {
  if (["done", "implemented", "closed"].includes(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "rejected") return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (status === "new") return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

export function SubmissionsWorkspace({ currentUserId, isAdmin, items, members, requestedItemId, createRequested }: { currentUserId: string; isAdmin: boolean; items: SubmissionItem[]; members: SubmissionPerson[]; requestedItemId: string | null; createRequested: boolean }) {
  const t = useTranslations("Submissions");
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(createRequested);
  const [createdNotice, setCreatedNotice] = useState<"named" | "anonymous" | null>(null);
  const [selectedId, setSelectedId] = useState(requestedItemId);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filters: Filter[] = isAdmin ? ["all", "mine", "request", "suggestion", "complaint", "attention", "assigned"] : ["all", "mine", "request", "suggestion", "complaint"];
  const filtered = useMemo(() => items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "mine") return item.author?.id === currentUserId;
    if (filter === "assigned") return item.responsible?.id === currentUserId;
    if (filter === "attention") return !isTerminalSubmissionStatus(item.type, item.status);
    return item.type === filter;
  }), [currentUserId, filter, items]);

  function openItem(id: string) { setSelectedId(id); router.replace(`/office/submissions?item=${id}`, { scroll: false }); }
  function closeItem() { setSelectedId(null); router.replace("/office/submissions", { scroll: false }); }
  function closeCreate() { setCreateOpen(false); router.replace("/office/submissions", { scroll: false }); }

  return <div className="space-y-6">
    <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{t("description")}</p></div>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("filters.label")}>
      {filters.map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", filter === value ? "border-[var(--ui-action-primary)] bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]")}>{t(`filters.${value}`)}</button>)}
    </div>
    {createdNotice ? <p role="status" className="rounded-[var(--ui-radius-control)] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">{t(createdNotice === "anonymous" ? "anonymousCreatedNotice" : "createdNotice")}</p> : null}
    {filtered.length ? <div className="grid gap-3 lg:grid-cols-2">{filtered.map((item) => <SubmissionRow key={item.id} item={item} onOpen={() => openItem(item.id)} />)}</div> : <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><MessageSquareText className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h2 className="mt-3 font-semibold">{t("empty.title")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("empty.description")}</p></div>}
    <CreateSubmissionDialog key={`submission-create-${createOpen ? "open" : "closed"}`} isOpen={createOpen} onClose={closeCreate} onCreated={(id, anonymous) => { setCreatedNotice(anonymous ? "anonymous" : "named"); if (id) openItem(id); }} />
    <SubmissionDetailDrawer key={`submission-detail-${selected?.id ?? "closed"}`} currentUserId={currentUserId} isAdmin={isAdmin} item={selected} members={members} onClose={closeItem} />
  </div>;
}

function SubmissionRow({ item, onOpen }: { item: SubmissionItem; onOpen: () => void }) {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const router = useRouter();
  const [optimisticSupport, setOptimisticSupport] = useOptimistic(
    { count: item.supportCount, supported: item.supportedByMe },
    (_current, next: { count: number; supported: boolean }) => next,
  );
  const [supportError, setSupportError] = useState(false);
  const [supportPending, startSupportTransition] = useTransition();
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
  return <article className="group relative flex h-full flex-col rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow-panel)] transition-colors hover:border-[var(--ui-border-strong)] focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus)]">
    <button type="button" aria-label={`${t(`types.${item.type}`)}: ${item.title}`} onClick={onOpen} className="absolute inset-0 cursor-pointer rounded-[var(--ui-radius-panel)] focus-visible:outline-none" />
    <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col">
      <div className="flex items-start gap-3"><div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)]", typeStyles[item.type])}><Icon className="size-4.5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.type}`)}</span><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span></div><h3 className="mt-1.5 line-clamp-2 text-base font-semibold leading-5 text-[var(--ui-text)]">{item.title}</h3>{item.description.trim() ? <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[var(--ui-text-secondary)]">{item.description}</p> : null}</div></div>
      <div className="mt-4 grid gap-3 border-t border-[var(--ui-border-subtle)] pt-3 sm:grid-cols-2">
        {item.isAnonymous ? <AnonymousPerson label={t("anonymous")} /> : item.author ? <Person person={item.author} label={t("author")} /> : null}
        {item.responsible ? <Person person={item.responsible} label={t("responsible")} /> : null}
      </div>
      <div className="mt-3 flex min-h-9 flex-wrap items-end justify-between gap-2">
        <time dateTime={item.createdAt} className="inline-flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]"><CalendarClock className="size-3.5" aria-hidden="true" />{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</time>
        {item.type === "suggestion" ? <button type="button" aria-label={supportedByMe ? t("supported", { count: supportCount }) : t("support", { count: supportCount })} aria-pressed={supportedByMe} disabled={supportPending} onClick={toggleSupport} className={cn("pointer-events-auto relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-wait disabled:opacity-70", supportedByMe ? "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-90" : "border-[var(--ui-border)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] hover:border-[var(--ui-warning-border)] hover:bg-[var(--ui-warning-surface)] hover:text-[var(--ui-warning-text)]")}><ThumbsUp className={cn("size-4", supportedByMe && "fill-current")} aria-hidden="true" />{supportCount}</button> : null}
      </div>
      {supportError ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{t("errors.support")}</p> : null}
    </div>
  </article>;
}

function CreateSubmissionDialog({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: (id: string | null, anonymous: boolean) => void }) {
  const t = useTranslations("Submissions");
  const [type, setType] = useState<SubmissionType>("request");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createSubmission, initialCreateState);
  useEffect(() => { if (state.success && !processed.current) { processed.current = true; onClose(); onCreated(state.submissionId ?? null, Boolean(state.anonymousSubmitted)); } }, [onClose, onCreated, state.anonymousSubmitted, state.submissionId, state.success]);
  return <Dialog closeDisabled={pending} closeLabel={t("close")} description={t("form.description")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.title")}>
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold text-[var(--ui-text-secondary)]">{t("form.type")}</legend><div className="grid gap-2 sm:grid-cols-3">{SUBMISSION_TYPES.map((value) => { const Icon = typeIcons[value]; return <label key={value} className={cn("flex min-h-14 cursor-pointer items-center gap-2 rounded-[var(--ui-radius-control)] border px-3 transition-colors", type === value ? "border-[var(--ui-action-primary)] bg-[var(--ui-action-primary)]/5" : "border-[var(--ui-border-strong)] hover:bg-[var(--ui-surface-muted)]")}><input className="sr-only" type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} /><Icon className="size-4" aria-hidden="true" /><span className="text-sm font-semibold">{t(`types.${value}`)}</span></label>; })}</div></fieldset>
      <FormField label={t("form.subject")}><Input name="title" required maxLength={160} /></FormField>
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
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!item) return null;
  const submissionId = item.id;
  const Icon = typeIcons[item.type];
  function refreshAfter(operation: () => Promise<{ error?: string }>) { setError(null); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else router.refresh(); }); }
  function submitComment() { if (!comment.trim()) return; refreshAfter(async () => { const result = await addSubmissionComment({ submissionId, body: comment }); if (!result.error) setComment(""); return result; }); }
  return <Drawer isOpen={Boolean(item)} onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.title} className="w-[calc(100%-0.5rem)] max-w-2xl sm:w-full">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 gap-3"><div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)]", typeStyles[item.type])}><Icon className="size-5" aria-hidden="true" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.type}`)}</p><h2 className="mt-0.5 text-lg font-bold leading-6">{item.title}</h2></div></div><button ref={closeRef} type="button" aria-label={t("close")} onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="space-y-5 p-5 sm:p-6"><div className="flex flex-wrap gap-2"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusStyle(item.status))}>{t(`statuses.${item.status}`)}</span>{item.priority ? <span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-semibold">{t(`priorities.${item.priority}`)}</span> : null}</div>
        <dl className="grid gap-x-6 gap-y-4 border-y border-[var(--ui-border-subtle)] py-4 sm:grid-cols-2">{item.isAnonymous ? <AnonymousMeta label={t("author")} value={t("anonymousPrivate")} /> : item.author ? <PersonMeta label={t("author")} person={item.author} /> : <Meta label={t("author")} value="—" />}{item.responsible ? <PersonMeta label={t("responsible")} person={item.responsible} /> : <Meta label={t("responsible")} value={t("unassigned")} />}<Meta label={t("created")} value={new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(item.createdAt))} /><Meta label={t("deadline")} value={item.deadline ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(`${item.deadline}T00:00:00`)) : "—"} /></dl>
        <div><h3 className="text-sm font-semibold">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{item.description}</p></div>
        {item.type === "suggestion" ? <Button type="button" size="lg" variant="outline" aria-pressed={item.supportedByMe} disabled={pending} onClick={() => refreshAfter(() => toggleSuggestionSupport(item.id, item.supportedByMe))} className={item.supportedByMe ? "border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)] hover:opacity-90" : undefined}><ThumbsUp className={cn("mr-2 size-4", item.supportedByMe && "fill-current")} aria-hidden="true" />{item.supportedByMe ? t("supported", { count: item.supportCount }) : t("support", { count: item.supportCount })}</Button> : null}
      </section>
      {isAdmin ? <AdminControls key={item.id} item={item} members={members} disabled={pending} onSave={(input) => refreshAfter(() => manageSubmission(input))} /> : null}
      <section className="border-t border-[var(--ui-border)] p-5 sm:p-6"><h3 className="font-semibold">{t("discussion")}</h3><div className="mt-4 grid gap-4">{item.comments.map((entry) => <div key={entry.id} className="flex gap-3"><UserAvatar imageUrl={entry.author.avatarUrl} name={entry.author.fullName} size="sm" /><div className="min-w-0 flex-1 rounded-[var(--ui-radius-panel)] bg-[var(--ui-surface-muted)] p-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold">{entry.author.id === currentUserId ? t("you") : entry.author.fullName}</span><time className="text-xs text-[var(--ui-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ui-text-secondary)]">{entry.body}</p></div></div>)}{!item.comments.length ? <p className="text-sm text-[var(--ui-text-muted)]">{t("noComments")}</p> : null}</div>
        <div className="mt-5 flex items-end gap-2"><FormField className="min-w-0 flex-1" label={t("comment")}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={3000} rows={3} /></FormField><Button type="button" aria-label={t("send")} disabled={pending || !comment.trim()} onClick={submitComment} className="size-11 px-0"><Send className="size-4" aria-hidden="true" /></Button></div>
        {error ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{t(`errors.${error}`)}</p> : null}
      </section>
    </div>
  </Drawer>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1 text-sm font-medium text-[var(--ui-text)]">{value}</dd></div>; }

function Person({ label, person }: { label: string; person: SubmissionPerson }) { return <div className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span className="min-w-0"><span className="block text-[11px] font-medium text-[var(--ui-text-muted)]">{label}</span><span className="block truncate text-xs font-semibold text-[var(--ui-text-secondary)]">{person.fullName}</span></span></div>; }
function AnonymousPerson({ label }: { label: string }) { return <div className="flex min-w-0 items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><LockKeyhole className="size-4" aria-hidden="true" /></span><span className="text-xs font-semibold text-[var(--ui-text-secondary)]">{label}</span></div>; }
function PersonMeta({ label, person }: { label: string; person: SubmissionPerson }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><UserAvatar decorative imageUrl={person.avatarUrl} name={person.fullName} size="sm" /><span>{person.fullName}</span></dd></div>; }
function AnonymousMeta({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><LockKeyhole className="size-4" aria-hidden="true" /></span><span>{value}</span></dd></div>; }

function AdminControls({ disabled, item, members, onSave }: { disabled: boolean; item: SubmissionItem; members: SubmissionPerson[]; onSave: (input: { submissionId: string; status: string; responsibleId: string | null; priority: string | null; deadline: string | null; internalNote: string }) => void }) {
  const t = useTranslations("Submissions");
  const locale = useLocale();
  const [status, setStatus] = useState<SubmissionStatus>(item.status);
  const [responsibleId, setResponsibleId] = useState(item.responsible?.id ?? "");
  const [priority, setPriority] = useState<SubmissionPriority | "">(item.priority ?? "");
  const [deadline, setDeadline] = useState(item.deadline ?? "");
  const [note, setNote] = useState(item.internalNote ?? "");
  const statuses = [item.status, ...getAllowedNextStatuses(item.type, item.status)];
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center gap-2"><UserRound className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="font-semibold">{t("admin.title")}</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2">
    <FormField label={t("admin.status")}><Select value={status} disabled={disabled} onValueChange={(value) => setStatus(value as SubmissionStatus)}>{statuses.map((value) => <SelectItem key={value} value={value}>{t(`statuses.${value}`)}</SelectItem>)}</Select></FormField>
    <FormField label={t("admin.responsible")}><Select disabled={disabled || item.type === "complaint"} value={responsibleId} onValueChange={setResponsibleId}><SelectItem value="">{t("unassigned")}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField>
    <FormField label={t("admin.priority")}><Select value={priority} disabled={disabled} onValueChange={(value) => setPriority(value as SubmissionPriority | "")}><SelectItem value="">—</SelectItem>{SUBMISSION_PRIORITIES.map((value) => <SelectItem key={value} value={value}>{t(`priorities.${value}`)}</SelectItem>)}</Select></FormField>
    <FormField label={t("admin.deadline")}><DatePicker value={deadline} disabled={disabled} locale={locale} onValueChange={setDeadline} /></FormField>
    <FormField className="sm:col-span-2" label={t("admin.note")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={5000} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("admin.notePrivate")}</span></FormField>
  </div><Button type="button" size="lg" className="mt-4" disabled={disabled} onClick={() => onSave({ submissionId: item.id, status, responsibleId: responsibleId || null, priority: priority || null, deadline: deadline || null, internalNote: note })}>{disabled ? t("admin.saving") : t("admin.save")}</Button></section>;
}
