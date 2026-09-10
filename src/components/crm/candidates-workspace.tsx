"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, CircleDot, ExternalLink, FileText, Link as LinkIcon, Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createCandidate, deleteCandidate, saveCandidateEditor, startRecruitingCycle } from "@/app/(app)/crm/actions";
import { CrmActionForm } from "@/components/crm/action-form";
import { AdminField, TextField } from "@/components/crm/crm-fields";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input } from "@/components/ui/form-field";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectItem } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import type { CrmAdmin, CrmCandidate, CrmRecruitingCycle } from "@/data/queries/crm";
import { filterCandidates, isCandidateStatusFilter, type CandidateStatusFilter } from "@/lib/crm";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import type { ProfessionalRole } from "@/lib/validation/employee-invitation";
import { CRM_LEAD_SOURCE_KEYS, getCrmLeadSourceFormValues, RECRUITING_OUTCOMES, RECRUITING_STAGES } from "@/lib/validation/crm";

function isNestedInteractiveTarget(target: EventTarget | null, row: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const interactiveTarget = target.closest("a, button, input, select, textarea, [role='button'], [role='link'], [role='menuitem']");
  return interactiveTarget !== null && interactiveTarget !== row;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function positionLabel(value: string, roles: ReturnType<typeof useTranslations>) {
  const key = getCanonicalRoleTranslationKey(value);
  return key ? roles(key) : value;
}

function PositionField({ defaultValue, error, positions }: { defaultValue?: string | null; error?: string; positions: readonly ProfessionalRole[] }) {
  const t = useTranslations("Crm");
  const roles = useTranslations("Roles");
  const [selection, setSelection] = useState<ProfessionalRole | "">(positions.includes(defaultValue as ProfessionalRole) ? defaultValue as ProfessionalRole : "");
  const preservedValue = defaultValue && !positions.includes(defaultValue as ProfessionalRole) ? defaultValue : "";
  return <FormField as="div" label={t("fields.position")} error={error}><input type="hidden" name="target_position" value={selection || preservedValue} /><Select value={selection} onValueChange={(value) => setSelection(value as ProfessionalRole | "")} placeholder={t("sourceOptions.notSpecified")}><SelectItem value="">{t("sourceOptions.notSpecified")}</SelectItem>{positions.map((position) => <SelectItem key={position} value={position}>{positionLabel(position, roles)}</SelectItem>)}</Select></FormField>;
}

function CandidateSourceField({ defaultValue, error }: { defaultValue?: string | null; error?: string }) {
  const t = useTranslations("Crm");
  const initial = getCrmLeadSourceFormValues(defaultValue);
  const [source, setSource] = useState(initial.source);
  const [customSource, setCustomSource] = useState(initial.sourceCustom);
  return <>
    <FormField as="div" label={t("fields.source")} error={error} optional><Select name="source" value={source} onValueChange={(value) => { if (value === "" || value === "other" || CRM_LEAD_SOURCE_KEYS.includes(value as typeof CRM_LEAD_SOURCE_KEYS[number])) setSource(value as typeof source); if (value !== "other") setCustomSource(""); }}><SelectItem value="">{t("sourceOptions.notSpecified")}</SelectItem>{CRM_LEAD_SOURCE_KEYS.map((key) => <SelectItem key={key} value={key}>{t(`sourceOptions.${key}`)}</SelectItem>)}<SelectItem value="other">{t("sourceOptions.other")}</SelectItem></Select></FormField>
    {source === "other" ? <FormField label={t("fields.sourceCustom")} error={error}><Input name="source_custom" value={customSource} onChange={(event) => setCustomSource(event.target.value)} aria-invalid={Boolean(error)} /></FormField> : <input type="hidden" name="source_custom" value="" />}
  </>;
}

function CandidateContactFields({ admins, candidate, fieldErrors, includePosition, positions }: { admins: CrmAdmin[]; candidate?: CrmCandidate | null; fieldErrors?: Record<string, string>; includePosition: boolean; positions: readonly ProfessionalRole[] }) {
  const t = useTranslations("Crm");
  return <div className="grid gap-4 sm:grid-cols-2">
    <TextField name="full_name" label={t("fields.fullName")} defaultValue={candidate?.full_name} required initialFocus error={fieldErrors?.full_name} />
    {includePosition ? <PositionField positions={positions} error={fieldErrors?.target_position} /> : null}
    <TextField name="email" label={t("fields.email")} type="email" autoComplete="off" placeholder={t("fields.emailPlaceholder")} defaultValue={candidate?.email} error={fieldErrors?.email} />
    <FormField label={t("fields.phone")} error={fieldErrors?.phone} optional><PhoneInput autoComplete="off" countryCode="UA" preserveInternational name="phone" defaultValue={candidate?.phone} placeholder="+380 (XX) XXX-XX-XX" aria-invalid={Boolean(fieldErrors?.phone)} /></FormField>
    <TextField name="external_profile_url" label={t("fields.profileLink")} type="url" autoComplete="off" placeholder="https://…" defaultValue={candidate?.external_profile_url} error={fieldErrors?.external_profile_url} />
    <CandidateSourceField defaultValue={candidate?.source} error={fieldErrors?.source} />
    <AdminField admins={admins} defaultValue={candidate?.responsible_admin_id} label={t("fields.responsible")} emptyLabel={t("notAssigned")} />
  </div>;
}

function CandidateCycleFields({ cycle, fieldErrors, positions }: { cycle?: CrmRecruitingCycle; fieldErrors?: Record<string, string>; positions: readonly ProfessionalRole[] }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const initialInterview = localDateTime(cycle?.interview_at ?? null);
  const [interviewDate, setInterviewDate] = useState(initialInterview.slice(0, 10));
  const [interviewTime, setInterviewTime] = useState(initialInterview.slice(11) || "00:00");
  return <><div className="grid gap-4 sm:grid-cols-2"><PositionField positions={positions} defaultValue={cycle?.target_position} error={fieldErrors?.target_position} /><FormField as="div" label={t("fields.stage")}><Select name="stage" defaultValue={cycle?.stage ?? "new"}>{RECRUITING_STAGES.map((value) => <SelectItem key={value} value={value}>{t(`candidateStage.${value}`)}</SelectItem>)}</Select></FormField><FormField as="div" label={t("fields.outcome")} optional><Select name="outcome" defaultValue={cycle?.outcome ?? ""} placeholder="—"><SelectItem value="">—</SelectItem>{RECRUITING_OUTCOMES.map((value) => <SelectItem key={value} value={value}>{t(`candidateOutcome.${value}`)}</SelectItem>)}</Select></FormField><FormField as="div" label={t("fields.nextContact")} error={fieldErrors?.next_contact_date} optional><DatePicker name="next_contact_date" defaultValue={cycle?.next_contact_date ?? ""} locale={locale} invalid={Boolean(fieldErrors?.next_contact_date)} /></FormField><FormField as="div" label={t("fields.interviewDate")} error={fieldErrors?.interview_at} optional><input type="hidden" name="interview_at" value={interviewDate ? `${interviewDate}T${interviewTime}` : ""} /><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("fields.interviewDate")} locale={locale} value={interviewDate} onValueChange={setInterviewDate} invalid={Boolean(fieldErrors?.interview_at)} /><TimePicker aria-label={t("fields.interviewDate")} className="min-w-0" locale={locale} value={interviewTime} disabled={!interviewDate} onValueChange={setInterviewTime} /></div></FormField></div><TextField name="test_task_result" label={t("fields.testResult")} defaultValue={cycle?.test_task_result} error={fieldErrors?.test_task_result} /></>;
}

export function CandidatesWorkspace({ admins, candidates, positions }: { admins: CrmAdmin[]; candidates: CrmCandidate[]; positions: readonly ProfessionalRole[] }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CandidateStatusFilter>("active");
  const [position, setPosition] = useState("");
  const [selected, setSelected] = useState<CrmCandidate | null>(null);
  const [view, setView] = useState<"detail" | "edit">("detail");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const roles = useTranslations("Roles");
  const positionFilterValues = positions;
  const visible = useMemo(() => filterCandidates(candidates, query, status, position), [candidates, position, query, status]);
  const latest = selected?.cycles[0];
  function openRecord(candidate: CrmCandidate) { setSelected(candidate); setView("detail"); }
  const closeAndRefresh = () => { setSelected(null); setView("detail"); router.refresh(); };
  async function remove() { if (!selected || !window.confirm(t("deleteCandidateConfirm", { name: selected.full_name }))) return; setDeleting(true); const result = await deleteCandidate(selected.id); setDeleting(false); if (result.error) { window.alert(result.error); return; } closeAndRefresh(); }

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]"><div className="grid gap-3 border-b border-[var(--ui-border)] p-4 md:grid-cols-[minmax(14rem,1fr)_11rem_13rem_auto]"><label className="relative"><span className="sr-only">{t("search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" aria-hidden="true" /><Input className="pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("candidates.searchPlaceholder")} /></label><Select aria-label={t("statusFilter")} value={status} onValueChange={(value) => { if (isCandidateStatusFilter(value)) setStatus(value); }}>{(["active", "reserve", "hired", "rejected", "all"] as const).map((value) => <SelectItem key={value} value={value}>{t(`filters.${value}`)}</SelectItem>)}</Select><Select aria-label={t("positionFilter")} value={position} onValueChange={setPosition} placeholder={t("filters.allPositions")}><SelectItem value="">{t("filters.allPositions")}</SelectItem>{positionFilterValues.map((value) => <SelectItem key={value} value={value}>{positionLabel(value, roles)}</SelectItem>)}</Select><Button type="button" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{t("candidates.add")}</Button></div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs uppercase tracking-wide text-[var(--ui-text-muted)]"><tr><th className="px-4 py-3">{t("candidates.columns.name")}</th><th className="px-4 py-3">{t("candidates.columns.position")}</th><th className="px-4 py-3">{t("candidates.columns.stage")}</th><th className="px-4 py-3">{t("candidates.columns.responsible")}</th><th className="px-4 py-3">{t("candidates.columns.nextContact")}</th></tr></thead><tbody className="divide-y divide-[var(--ui-border)]">{visible.map((candidate) => { const cycle = candidate.cycles[0]; return <tr key={candidate.id} onClick={(event) => { if (!isNestedInteractiveTarget(event.target, event.currentTarget)) openRecord(candidate); }} className="cursor-pointer outline-none transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--ui-focus)]"><td className="px-4 py-3"><button type="button" aria-label={t("candidates.openRecord", { name: candidate.full_name })} onClick={() => openRecord(candidate)} className="font-medium text-[var(--ui-text)] outline-none">{candidate.full_name}</button><p className="text-xs text-[var(--ui-text-muted)]">{candidate.email || candidate.phone || "—"}</p></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{cycle ? positionLabel(cycle.target_position, roles) : "—"}</td><td className="px-4 py-3"><span className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-xs">{cycle?.outcome ? t(`candidateOutcome.${cycle.outcome}`) : cycle ? t(`candidateStage.${cycle.stage}`) : "—"}</span></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{candidate.responsibleAdmin?.name ?? t("notAssigned")}</td><td className="px-4 py-3 tabular-nums text-[var(--ui-text-secondary)]">{formatDate(cycle?.next_contact_date ?? null, locale) ?? "—"}</td></tr>; })}</tbody></table></div> : <EmptyState title={query || position || status !== "active" ? t("empty.filteredTitle") : t("candidates.emptyTitle")} description={query || position || status !== "active" ? t("empty.filteredDescription") : t("candidates.emptyDescription")} />}
    </div>
    <Dialog isOpen={creating} onRequestClose={() => setCreating(false)} closeLabel={t("close")} title={t("candidates.add")} description={t("candidates.createDescription")}><div className="overflow-y-auto p-4 sm:p-6"><CrmActionForm action={createCandidate} submitLabel={t("save")} onSuccess={() => { setCreating(false); router.refresh(); }}>{(state) => <><CandidateContactFields admins={admins} positions={positions} includePosition={false} fieldErrors={state.fieldErrors} /><CandidateCycleFields positions={positions} fieldErrors={state.fieldErrors} /></>}</CrmActionForm></div></Dialog>
    <Dialog isOpen={Boolean(selected)} onRequestClose={() => { if (!deleting) { setSelected(null); setView("detail"); } }} closeLabel={t("close")} title={selected?.full_name} description={view === "detail" ? t("candidates.detailDescription") : t("candidates.editDescription")} className="max-w-[60rem]" closeDisabled={deleting} headerActions={selected && view === "detail" ? <CandidateHeaderActions deleting={deleting} onDelete={() => void remove()} onEdit={() => setView("edit")} /> : undefined}>{selected ? view === "detail" ? <CandidateDetail candidate={selected} locale={locale} /> : <div className="overflow-y-auto p-4 sm:p-6">{latest ? <CrmActionForm action={saveCandidateEditor.bind(null, selected.id, latest.id)} submitLabel={t("save")} cancelLabel={t("cancel")} onCancel={() => setView("detail")} onSuccess={closeAndRefresh}>{(state) => <><CandidateContactFields admins={admins} positions={positions} candidate={selected} includePosition={false} fieldErrors={state.fieldErrors} /><CandidateCycleFields cycle={latest} positions={positions} fieldErrors={state.fieldErrors} /></>}</CrmActionForm> : null}{latest?.outcome ? <section className="mt-8 border-t border-[var(--ui-border)] pt-6"><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("candidates.startCycle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("candidates.startCycleDescription")}</p><CrmActionForm action={startRecruitingCycle.bind(null, selected.id)} submitLabel={t("candidates.startCycle")} onSuccess={closeAndRefresh}>{(state) => <PositionField positions={positions} error={state.fieldErrors?.target_position} />}</CrmActionForm></section> : null}</div> : null}</Dialog>
  </>;
}

function CandidateHeaderActions({ deleting, onDelete, onEdit }: { deleting: boolean; onDelete: () => void; onEdit: () => void }) {
  const t = useTranslations("Crm"); const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null); const setMenuTriggerRef = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest<HTMLElement>("dialog, [role='dialog']") ?? null), []); const [menuOpen, setMenuOpen] = useState(false);
  return <><Button type="button" variant="ghost" className="size-11 p-0 sm:w-auto sm:px-3" onClick={onEdit} aria-label={t("edit")}><Pencil className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t("edit")}</span></Button><Popover.Root open={menuOpen} onOpenChange={setMenuOpen}><Popover.Trigger asChild><Button ref={setMenuTriggerRef} type="button" variant="ghost" className="size-11 p-0" aria-label={t("recordActions")}><MoreHorizontal className="size-5" aria-hidden="true" /></Button></Popover.Trigger><Popover.Portal container={portalContainer ?? undefined}><Popover.Content align="end" sideOffset={6} className="z-[80] min-w-48 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" disabled={deleting} onClick={() => { setMenuOpen(false); onDelete(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] outline-none transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:bg-[var(--ui-danger-surface)] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" />{deleting ? t("deleting") : t("delete")}</button></Popover.Content></Popover.Portal></Popover.Root></>;
}

function CandidateDetail({ candidate, locale }: { candidate: CrmCandidate; locale: string }) {
  const t = useTranslations("Crm"); const roles = useTranslations("Roles"); const cycle = candidate.cycles[0];
  return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2"><DetailField icon={Mail} label={t("fields.email")} value={candidate.email ? <a className="font-medium text-[var(--ui-text)] hover:underline" href={`mailto:${candidate.email}`}>{candidate.email}</a> : null} /><DetailField icon={Phone} label={t("fields.phone")} value={candidate.phone ? <a className="font-medium text-[var(--ui-text)] hover:underline" href={`tel:${candidate.phone}`}>{candidate.phone}</a> : null} /><DetailField icon={UserRound} label={t("fields.responsible")} value={candidate.responsibleAdmin?.name ?? t("notAssigned")} /><DetailField icon={LinkIcon} label={t("fields.profileLink")} value={candidate.external_profile_url ? <a className="inline-flex items-center gap-1 font-medium text-[var(--ui-text)] hover:underline" href={candidate.external_profile_url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" aria-hidden="true" />{t("openProfile")}</a> : null} /><DetailField icon={FileText} label={t("fields.source")} value={candidate.source} /></dl>{cycle ? <section className="mt-6 border-t border-[var(--ui-border)] pt-5"><h3 className="mb-5 text-sm font-semibold text-[var(--ui-text)]">{cycle.outcome ? t("candidates.latestCycle") : t("candidates.currentCycle")}</h3><dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2"><DetailField icon={UserRound} label={t("fields.position")} value={positionLabel(cycle.target_position, roles)} /><DetailField icon={CircleDot} label={t("fields.stage")} value={cycle.outcome ? t(`candidateOutcome.${cycle.outcome}`) : t(`candidateStage.${cycle.stage}`)} /><DetailField icon={CalendarDays} label={t("fields.nextContact")} value={formatDate(cycle.next_contact_date, locale)} /><DetailField icon={CalendarDays} label={t("fields.interviewDate")} value={formatDateTime(cycle.interview_at, locale)} /><DetailField icon={FileText} label={t("fields.testResult")} value={cycle.test_task_result} multiline /></dl></section> : null}{candidate.cycles.length > 1 ? <section className="mt-8 border-t border-[var(--ui-border)] pt-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("candidates.history")}</h3><div className="space-y-3">{candidate.cycles.slice(1).map((previousCycle) => <article key={previousCycle.id} className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-[var(--ui-text)]">{positionLabel(previousCycle.target_position, roles)}</p><span className="text-xs text-[var(--ui-text-muted)]">{t("candidates.cycleStarted", { date: formatDateTime(previousCycle.started_at, locale) ?? "—" })}</span></div><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{previousCycle.outcome ? t(`candidateOutcome.${previousCycle.outcome}`) : t(`candidateStage.${previousCycle.stage}`)}</p></article>)}</div></section> : null}</div>;
}

function DetailField({ icon: Icon, label, multiline = false, value }: { icon: LucideIcon; label: string; multiline?: boolean; value: React.ReactNode }) { const hasValue = value !== null && value !== undefined && value !== ""; return <div className={multiline ? "sm:col-span-2" : undefined}><dt className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-[var(--ui-text-muted)]"><Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} /><span>{label}</span></dt><dd className={`ml-[1.625rem] mt-1 min-w-0 text-sm ${hasValue ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"} ${multiline ? "whitespace-pre-wrap leading-6" : "leading-5"}`}>{hasValue ? value : "—"}</dd></div>; }
function formatDate(value: string | null, locale: string) { return value ? new Intl.DateTimeFormat(locale).format(new Date(`${value}T12:00:00`)) : null; }
function formatDateTime(value: string | null, locale: string) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : null; }
