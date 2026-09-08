"use client";

import { ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createCandidate, deleteCandidate, startRecruitingCycle, updateCandidate, updateRecruitingCycle } from "@/app/(app)/crm/actions";
import { CrmActionForm } from "@/components/crm/action-form";
import { AdminField, NotesField, TextField } from "@/components/crm/crm-fields";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { CrmAdmin, CrmCandidate, CrmRecruitingCycle } from "@/data/queries/crm";
import { filterCandidates, isCandidateStatusFilter, type CandidateStatusFilter } from "@/lib/crm";
import { RECRUITING_OUTCOMES, RECRUITING_STAGES } from "@/lib/validation/crm";

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CandidateContactFields({ admins, candidate, fieldErrors, includePosition }: { admins: CrmAdmin[]; candidate?: CrmCandidate | null; fieldErrors?: Record<string, string>; includePosition: boolean }) {
  const t = useTranslations("Crm");
  return <div className="grid gap-4 sm:grid-cols-2">
    <TextField name="full_name" label={t("fields.fullName")} defaultValue={candidate?.full_name} required error={fieldErrors?.full_name} />
    {includePosition ? <TextField name="target_position" label={t("fields.position")} required error={fieldErrors?.target_position} /> : null}
    <TextField name="email" label={t("fields.email")} type="email" defaultValue={candidate?.email} error={fieldErrors?.email} />
    <TextField name="phone" label={t("fields.phone")} type="tel" defaultValue={candidate?.phone} error={fieldErrors?.phone} />
    <TextField name="external_profile_url" label={t("fields.profileLink")} type="url" defaultValue={candidate?.external_profile_url} error={fieldErrors?.external_profile_url} />
    <TextField name="source" label={t("fields.source")} defaultValue={candidate?.source} error={fieldErrors?.source} />
    <AdminField admins={admins} defaultValue={candidate?.responsible_admin_id} label={t("fields.responsible")} emptyLabel={t("notAssigned")} />
    <div className="sm:col-span-2"><NotesField name="internal_notes" label={t("fields.notes")} defaultValue={candidate?.internal_notes} rows={4} error={fieldErrors?.internal_notes} /></div>
  </div>;
}

function CycleForm({ cycle, onSuccess }: { cycle: CrmRecruitingCycle; onSuccess: () => void }) {
  const t = useTranslations("Crm");
  return <CrmActionForm action={updateRecruitingCycle.bind(null, cycle.id)} submitLabel={t("saveCycle")} onSuccess={onSuccess}>{(state) => <>
    <div className="grid gap-4 sm:grid-cols-2"><TextField name="target_position" label={t("fields.position")} defaultValue={cycle.target_position} required error={state.fieldErrors?.target_position} /><FormField as="div" label={t("fields.stage")}><Select name="stage" defaultValue={cycle.stage}>{RECRUITING_STAGES.map((value) => <SelectItem key={value} value={value}>{t(`candidateStage.${value}`)}</SelectItem>)}</Select></FormField><FormField as="div" label={t("fields.outcome")} optional><Select name="outcome" defaultValue={cycle.outcome ?? ""} placeholder="—"><SelectItem value="">—</SelectItem>{RECRUITING_OUTCOMES.map((value) => <SelectItem key={value} value={value}>{t(`candidateOutcome.${value}`)}</SelectItem>)}</Select></FormField><TextField name="next_contact_date" label={t("fields.nextContact")} type="date" defaultValue={cycle.next_contact_date} error={state.fieldErrors?.next_contact_date} /><TextField name="interview_at" label={t("fields.interviewDate")} type="datetime-local" defaultValue={localDateTime(cycle.interview_at)} error={state.fieldErrors?.interview_at} /></div>
    <NotesField name="interview_notes" label={t("fields.interviewNotes")} defaultValue={cycle.interview_notes} rows={4} error={state.fieldErrors?.interview_notes} /><NotesField name="test_task_result" label={t("fields.testResult")} defaultValue={cycle.test_task_result} rows={4} error={state.fieldErrors?.test_task_result} /><NotesField name="decision_notes" label={t("fields.decisionNotes")} defaultValue={cycle.decision_notes} rows={4} error={state.fieldErrors?.decision_notes} />
  </>}</CrmActionForm>;
}

export function CandidatesWorkspace({ admins, candidates }: { admins: CrmAdmin[]; candidates: CrmCandidate[] }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CandidateStatusFilter>("active");
  const [position, setPosition] = useState("");
  const [selected, setSelected] = useState<CrmCandidate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const positions = useMemo(() => Array.from(new Set(candidates.flatMap((candidate) => candidate.cycles.map((cycle) => cycle.target_position)))).sort(), [candidates]);
  const visible = useMemo(() => filterCandidates(candidates, query, status, position), [candidates, position, query, status]);
  const latest = selected?.cycles[0];

  const closeAndRefresh = () => { setSelected(null); router.refresh(); };
  async function remove() {
    if (!selected || !window.confirm(t("deleteCandidateConfirm", { name: selected.full_name }))) return;
    setDeleting(true);
    const result = await deleteCandidate(selected.id);
    setDeleting(false);
    if (result.error) { window.alert(result.error); return; }
    closeAndRefresh();
  }

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="grid gap-3 border-b border-[var(--ui-border)] p-4 md:grid-cols-[minmax(14rem,1fr)_11rem_13rem_auto]">
        <label className="relative"><span className="sr-only">{t("search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" aria-hidden="true" /><Input className="pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("candidates.searchPlaceholder")} /></label>
        <Select aria-label={t("statusFilter")} value={status} onValueChange={(value) => { if (isCandidateStatusFilter(value)) setStatus(value); }}>{(["active", "reserve", "hired", "rejected", "all"] as const).map((value) => <SelectItem key={value} value={value}>{t(`filters.${value}`)}</SelectItem>)}</Select>
        <Select aria-label={t("positionFilter")} value={position} onValueChange={setPosition} placeholder={t("filters.allPositions")}><SelectItem value="">{t("filters.allPositions")}</SelectItem>{positions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</Select>
        <Button type="button" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden="true" />{t("candidates.add")}</Button>
      </div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs uppercase tracking-wide text-[var(--ui-text-muted)]"><tr><th className="px-4 py-3">{t("candidates.columns.name")}</th><th className="px-4 py-3">{t("candidates.columns.position")}</th><th className="px-4 py-3">{t("candidates.columns.stage")}</th><th className="px-4 py-3">{t("candidates.columns.responsible")}</th><th className="px-4 py-3">{t("candidates.columns.nextContact")}</th></tr></thead><tbody className="divide-y divide-[var(--ui-border)]">{visible.map((candidate) => {
        const cycle = candidate.cycles[0];
        return <tr key={candidate.id} className="hover:bg-[var(--ui-surface-subtle)]"><td className="px-4 py-3"><button type="button" onClick={() => setSelected(candidate)} className="font-medium text-[var(--ui-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{candidate.full_name}</button><p className="text-xs text-[var(--ui-text-muted)]">{candidate.email || candidate.phone || "—"}</p></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{cycle?.target_position ?? "—"}</td><td className="px-4 py-3"><span className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-xs">{cycle?.outcome ? t(`candidateOutcome.${cycle.outcome}`) : cycle ? t(`candidateStage.${cycle.stage}`) : "—"}</span></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{candidate.responsibleAdmin?.name ?? "—"}</td><td className="px-4 py-3 tabular-nums text-[var(--ui-text-secondary)]">{cycle?.next_contact_date ? new Intl.DateTimeFormat(locale).format(new Date(`${cycle.next_contact_date}T12:00:00`)) : "—"}</td></tr>;
      })}</tbody></table></div> : <EmptyState title={query || position || status !== "active" ? t("empty.filteredTitle") : t("candidates.emptyTitle")} description={query || position || status !== "active" ? t("empty.filteredDescription") : t("candidates.emptyDescription")} />}
    </div>

    <Dialog isOpen={creating} onRequestClose={() => setCreating(false)} closeLabel={t("close")} title={t("candidates.add")} description={t("candidates.createDescription")}><div className="overflow-y-auto p-4 sm:p-6"><CrmActionForm action={createCandidate} submitLabel={t("save")} onSuccess={() => { setCreating(false); router.refresh(); }}>{(state) => <CandidateContactFields admins={admins} includePosition fieldErrors={state.fieldErrors} />}</CrmActionForm></div></Dialog>

    <Dialog isOpen={Boolean(selected)} onRequestClose={() => setSelected(null)} closeLabel={t("close")} title={selected?.full_name} description={t("candidates.detailDescription")} className="max-w-[60rem]">{selected ? <div className="overflow-y-auto p-4 sm:p-6">
      <section><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("candidates.contactSection")}</h3><CrmActionForm action={updateCandidate.bind(null, selected.id)} submitLabel={t("saveContact")} onSuccess={closeAndRefresh}>{(state) => <CandidateContactFields admins={admins} candidate={selected} includePosition={false} fieldErrors={state.fieldErrors} />}</CrmActionForm></section>
      {selected.external_profile_url ? <a className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ui-text-secondary)] hover:underline" href={selected.external_profile_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" aria-hidden="true" />{t("openProfile")}</a> : null}
      {latest ? <section className="mt-8 border-t border-[var(--ui-border)] pt-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{latest.outcome ? t("candidates.latestCycle") : t("candidates.currentCycle")}</h3><CycleForm cycle={latest} onSuccess={closeAndRefresh} /></section> : null}
      {latest?.outcome ? <section className="mt-8 border-t border-[var(--ui-border)] pt-6"><h3 className="text-sm font-semibold text-[var(--ui-text)]">{t("candidates.startCycle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("candidates.startCycleDescription")}</p><CrmActionForm action={startRecruitingCycle.bind(null, selected.id)} submitLabel={t("candidates.startCycle")} onSuccess={closeAndRefresh}>{(state) => <TextField name="target_position" label={t("fields.position")} required error={state.fieldErrors?.target_position} />}</CrmActionForm></section> : null}
      {selected.cycles.length > 1 ? <section className="mt-8 border-t border-[var(--ui-border)] pt-6"><h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("candidates.history")}</h3><div className="space-y-3">{selected.cycles.slice(1).map((cycle) => <article key={cycle.id} className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-[var(--ui-text)]">{cycle.target_position}</p><span className="text-xs text-[var(--ui-text-muted)]">{t("candidates.cycleStarted", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(cycle.started_at)) })}</span></div><p className="mt-1 text-sm text-[var(--ui-text-secondary)]">{cycle.outcome ? t(`candidateOutcome.${cycle.outcome}`) : t(`candidateStage.${cycle.stage}`)}</p><dl className="mt-3 grid gap-3 text-sm">{cycle.interview_at ? <div><dt className="font-medium text-[var(--ui-text-muted)]">{t("fields.interviewDate")}</dt><dd className="mt-1 text-[var(--ui-text-secondary)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(cycle.interview_at))}</dd></div> : null}{cycle.interview_notes ? <div><dt className="font-medium text-[var(--ui-text-muted)]">{t("fields.interviewNotes")}</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{cycle.interview_notes}</dd></div> : null}{cycle.test_task_result ? <div><dt className="font-medium text-[var(--ui-text-muted)]">{t("fields.testResult")}</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{cycle.test_task_result}</dd></div> : null}{cycle.decision_notes ? <div><dt className="font-medium text-[var(--ui-text-muted)]">{t("fields.decisionNotes")}</dt><dd className="mt-1 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{cycle.decision_notes}</dd></div> : null}</dl></article>)}</div></section> : null}
      <div className="mt-8 flex justify-end border-t border-[var(--ui-border)] pt-4"><Button type="button" variant="outline" className="border-[var(--ui-danger-border)] text-[var(--ui-danger-text)]" disabled={deleting} onClick={remove}><Trash2 className="size-4" aria-hidden="true" />{deleting ? t("deleting") : t("delete")}</Button></div>
    </div> : null}</Dialog>
  </>;
}
