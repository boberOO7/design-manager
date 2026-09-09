"use client";

import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Banknote, Building2, CalendarDays, CircleDot, FileText, FolderKanban, History, LoaderCircle, Mail, MapPin, Megaphone, MoreHorizontal, Pencil, Phone, Plus, Ruler, Search, Shapes, StickyNote, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { deleteLead, loadLeadHistory, saveLead, updateLeadStatus } from "@/app/(app)/crm/actions";
import { createProjectFromLead } from "@/app/(app)/projects/new/actions";
import { CrmActionForm } from "@/components/crm/action-form";
import { AdminField, NotesField, TextField } from "@/components/crm/crm-fields";
import { CityCombobox } from "@/components/projects/city-combobox";
import { ProjectForm, type ProjectFormDefaults } from "@/components/projects/project-form";
import { ProjectCountrySelect, ProjectTypeSelect, useProjectMetadataControls } from "@/components/projects/project-metadata-controls";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { CrmAdmin, CrmLead, CrmLeadHistory } from "@/data/queries/crm";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import { formatCrmBudget, getCrmBudgetInputValue } from "@/lib/crm-budget";
import { filterLeads } from "@/lib/crm";
import { getCountryName, isCountryCode } from "@/lib/countries";
import { CRM_LEAD_SOURCE_KEYS, CRM_LEAD_STATUSES, getCrmLeadSourceFormValues, isCrmLeadSourceKey, isCrmLeadStatus, type CrmActionState } from "@/lib/validation/crm";
import { getProjectTypeDisplayName } from "@/lib/validation/project";
import type { ProjectTemplate } from "@/lib/project-templates";
import { getProjectDialogCloseIntent } from "@/lib/project-dialog";

function today() { return new Date().toISOString().slice(0, 10); }

function isNestedInteractiveTarget(target: EventTarget | null, row: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const interactiveTarget = target.closest("a, button, input, select, textarea, [role='button'], [role='link'], [role='menuitem']");
  return interactiveTarget !== null && interactiveTarget !== row;
}

export function LeadsWorkspace({ admins, defaultStartDate, leads, members, templates }: { admins: CrmAdmin[]; defaultStartDate: string; leads: CrmLead[]; members: ActiveStudioAssignee[]; templates: ProjectTemplate[] }) {
  const t = useTranslations("Crm");
  const projectForm = useTranslations("ProjectForm");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [openLead, setOpenLead] = useState<CrmLead | "new" | null>(null);
  const [view, setView] = useState<"convert" | "detail" | "edit" | "history">("detail");
  const [history, setHistory] = useState<CrmLeadHistory[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [conversionDirty, setConversionDirty] = useState(false);
  const [conversionPending, setConversionPending] = useState(false);
  const visible = useMemo(() => filterLeads(leads, query, status), [leads, query, status]);
  const lead = openLead === "new" ? null : openLead;

  function openRecord(item: CrmLead) {
    setOpenLead(item);
    setView("detail");
  }

  function openCreate() {
    setOpenLead("new");
    setView("edit");
  }

  function closeDialog(reason: DialogCloseReason) {
    if (deleting || conversionPending) return;
    if (view === "convert") {
      const intent = getProjectDialogCloseIntent(conversionDirty, reason);
      if (intent === "ignore") return;
      if (intent === "confirm" && !window.confirm(projectForm("discardChanges"))) return;
    }
    setOpenLead(null);
    setHistory(null);
    setHistoryError(null);
    setConversionDirty(false);
  }

  function cancelConversion() {
    if (conversionPending) return;
    if (conversionDirty && !window.confirm(projectForm("discardChanges"))) return;
    setConversionDirty(false);
    setView("detail");
  }

  async function showHistory() {
    if (!lead) return;
    setView("history");
    setHistory(null);
    setHistoryError(null);
    const result = await loadLeadHistory(lead.id);
    setHistory(result.history ?? []);
    setHistoryError(result.error ?? null);
  }

  async function changeStatus(nextStatus: CrmLead["status"]) {
    if (!lead || lead.status === nextStatus) return {};
    const previousStatus = lead.status;
    setOpenLead({ ...lead, status: nextStatus });
    const result = await updateLeadStatus(lead.id, nextStatus);
    if (result.error) {
      setOpenLead((current) => current && current !== "new" && current.id === lead.id ? { ...current, status: previousStatus } : current);
    } else {
      router.refresh();
    }
    return result;
  }

  async function remove() {
    if (!lead || !window.confirm(t("deleteLeadConfirm", { name: lead.client_name }))) return;
    setDeleting(true);
    const result = await deleteLead(lead.id);
    setDeleting(false);
    if (result.error) { window.alert(result.error); return; }
    setOpenLead(null);
    router.refresh();
  }

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1"><span className="sr-only">{t("search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" aria-hidden="true" /><Input className="pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("leads.searchPlaceholder")} /></label>
        <Select aria-label={t("statusFilter")} value={status} onValueChange={setStatus} className="md:w-52"><SelectItem value="all">{t("filters.all")}</SelectItem>{CRM_LEAD_STATUSES.map((value) => <SelectItem key={value} value={value}>{t(`leadStatus.${value}`)}</SelectItem>)}</Select>
        <Button type="button" onClick={openCreate}><Plus className="size-4" aria-hidden="true" />{t("leads.add")}</Button>
      </div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs uppercase tracking-wide text-[var(--ui-text-muted)]"><tr><th className="px-4 py-3">{t("leads.columns.contact")}</th><th className="px-4 py-3">{t("leads.columns.request")}</th><th className="px-4 py-3">{t("leads.columns.status")}</th><th className="px-4 py-3">{t("leads.columns.responsible")}</th><th className="px-4 py-3">{t("leads.columns.followUp")}</th></tr></thead>
        <tbody className="divide-y divide-[var(--ui-border)]">{visible.map((item) => <tr
          key={item.id}
          onClick={(event) => { if (!isNestedInteractiveTarget(event.target, event.currentTarget)) openRecord(item); }}
          className="cursor-pointer outline-none transition-colors hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--ui-focus)]"
        ><td className="px-4 py-3"><button type="button" aria-label={t("leads.openRecord", { name: item.client_name })} onClick={() => openRecord(item)} className="font-medium text-[var(--ui-text)] outline-none">{item.client_name}</button><p className="text-xs text-[var(--ui-text-muted)]">{item.company || item.email || "—"}</p></td><td className="max-w-80 px-4 py-3 text-[var(--ui-text-secondary)]"><span className="line-clamp-2">{item.request_description || "—"}</span></td><td className="px-4 py-3"><span className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-xs">{t(`leadStatus.${item.status}`)}</span></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{item.responsibleAdmin?.name ?? t("notAssigned")}</td><td className="px-4 py-3 tabular-nums text-[var(--ui-text-secondary)]">{formatDate(item.next_contact_date, locale) ?? "—"}</td></tr>)}</tbody>
      </table></div> : <EmptyState title={query || status !== "all" ? t("empty.filteredTitle") : t("leads.emptyTitle")} description={query || status !== "all" ? t("empty.filteredDescription") : t("leads.emptyDescription")} />}
    </div>
    <Dialog isOpen={Boolean(openLead)} onRequestClose={closeDialog} closeDisabled={deleting || conversionPending} closeLabel={t("close")} title={lead ? (view === "convert" ? t("conversion.title") : lead.client_name) : t("leads.add")} description={lead ? (view === "history" ? t("history.description") : view === "convert" ? t("conversion.description", { name: lead.client_name }) : view === "detail" ? t("leads.detailDescription") : t("leads.formDescription")) : t("leads.formDescription")} headerActions={lead && view !== "edit" && view !== "convert" ? <LeadHeaderActions deleting={deleting} historyOpen={view === "history"} onDelete={() => void remove()} onEdit={() => setView("edit")} onHistory={() => { if (view === "history") setView("detail"); else void showHistory(); }} /> : undefined}>
      {lead && view === "detail" ? <LeadDetail lead={lead} locale={locale} onConvert={() => { setConversionDirty(false); setView("convert"); }} onStatusChange={changeStatus} /> : lead && view === "history" ? <LeadHistoryPanel history={history} error={historyError} locale={locale} /> : lead && view === "convert" ? <ProjectForm action={createProjectFromLead.bind(null, lead.id)} defaultValues={getLeadProjectDefaults(lead, defaultStartDate)} layout="modal" members={members} mode="create" onCancel={cancelConversion} onDirtyChange={setConversionDirty} onPendingChange={setConversionPending} onSuccess={(projectId) => { setConversionDirty(false); setConversionPending(false); router.push(`/projects/${projectId}`); }} templates={templates} /> : <div className="overflow-y-auto p-4 sm:p-6"><CrmActionForm action={saveLead.bind(null, lead?.id ?? null)} cancelLabel={t("cancel")} onCancel={lead ? () => setView("detail") : () => closeDialog("explicit")} submitLabel={t("save")} onSuccess={() => { setOpenLead(null); router.refresh(); }}>{(state) => <LeadFormFields admins={admins} lead={lead} state={state} />}</CrmActionForm></div>}
    </Dialog>
  </>;
}

function LeadFormFields({ admins, lead, state }: { admins: CrmAdmin[]; lead: CrmLead | null; state: CrmActionState }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const legacyCountry = lead?.country_code === null && lead.country && !isCountryCode(lead.country) ? lead.country : null;
  const sourceDefaults = getCrmLeadSourceFormValues(lead?.source);
  const [source, setSource] = useState(sourceDefaults.source);
  const [customSource, setCustomSource] = useState(sourceDefaults.sourceCustom);
  const metadata = useProjectMetadataControls({
    city: lead?.city,
    cityGeoNamesId: lead?.city_geonames_id,
    countryCode: legacyCountry ? "__legacy__" : lead?.country_code ?? (isCountryCode(lead?.country) ? lead.country : "UA"),
    projectType: lead?.expected_project_type,
    projectTypeCustom: lead?.expected_project_type_custom,
  });
  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="client_name" label={t("fields.clientName")} defaultValue={lead?.client_name} required initialFocus error={state.fieldErrors?.client_name} />
      <TextField name="company" label={t("fields.company")} defaultValue={lead?.company} error={state.fieldErrors?.company} />
      <TextField name="email" label={t("fields.email")} type="email" defaultValue={lead?.email} error={state.fieldErrors?.email} />
      <TextField name="phone" label={t("fields.phone")} type="tel" defaultValue={lead?.phone} error={state.fieldErrors?.phone} />
      <FormField as="div" label={t("fields.source")} error={state.fieldErrors?.source} optional><Select name="source" value={source} onValueChange={(value) => { if (value === "" || value === "other" || isCrmLeadSourceKey(value)) setSource(value); if (value !== "other") setCustomSource(""); }}><SelectItem value="">{t("sourceOptions.notSpecified")}</SelectItem>{CRM_LEAD_SOURCE_KEYS.map((key) => <SelectItem key={key} value={key}>{t(`sourceOptions.${key}`)}</SelectItem>)}<SelectItem value="other">{t("sourceOptions.other")}</SelectItem></Select></FormField>
      {source === "other" ? <FormField label={t("fields.sourceCustom")} error={state.fieldErrors?.source_custom} optional><Input name="source_custom" value={customSource} maxLength={160} onChange={(event) => setCustomSource(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.source_custom)} /></FormField> : null}
      <FormField as="div" label={t("fields.projectType")} error={state.fieldErrors?.expected_project_type} optional><ProjectTypeSelect name="expected_project_type" value={metadata.projectType} onValueChange={metadata.changeProjectType} /></FormField>
      {metadata.projectType === "other" ? <FormField label={t("fields.projectTypeCustom")} error={state.fieldErrors?.expected_project_type_custom}><Input name="expected_project_type_custom" value={metadata.projectTypeCustom} onChange={(event) => metadata.changeProjectTypeCustom(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.expected_project_type_custom)} /></FormField> : null}
      <FormField as="div" label={t("fields.country")} error={state.fieldErrors?.country_code}><ProjectCountrySelect legacyCountry={legacyCountry} name="country_code" required value={metadata.countryCode} onValueChange={metadata.changeCountry} /></FormField>
      <FormField as="div" label={t("fields.city")} error={state.fieldErrors?.city} optional><CityCombobox countryCode={metadata.countryCode} describedBy={state.fieldErrors?.city ? "city-error" : undefined} invalid={Boolean(state.fieldErrors?.city)} name="city_search" value={metadata.city} onGeoNamesIdChange={metadata.setCityGeoNamesId} onValueChange={metadata.changeCity} /><input type="hidden" name="city" value={metadata.city} /><input type="hidden" name="city_geonames_id" value={metadata.cityGeoNamesId ?? ""} /></FormField>
      <TextField name="approximate_area" label={t("fields.area")} type="number" defaultValue={lead?.approximate_area?.toString()} error={state.fieldErrors?.approximate_area} />
      <FormField label={t("fields.budget")} error={state.fieldErrors?.budget} optional><Input name="budget" defaultValue={lead ? getCrmBudgetInputValue({ amount: lead.budget_amount, currency: lead.budget_currency, legacyNote: lead.budget_note }) : ""} inputMode="numeric" placeholder={t("fields.budgetPlaceholder")} aria-invalid={Boolean(state.fieldErrors?.budget)} /></FormField>
      <FormField as="div" label={t("fields.firstContact")} error={state.fieldErrors?.first_contact_date}><DatePicker name="first_contact_date" defaultValue={lead?.first_contact_date ?? today()} locale={locale} invalid={Boolean(state.fieldErrors?.first_contact_date)} /></FormField>
      <FormField as="div" label={t("fields.nextContact")} error={state.fieldErrors?.next_contact_date} optional><DatePicker name="next_contact_date" defaultValue={lead?.next_contact_date ?? ""} locale={locale} invalid={Boolean(state.fieldErrors?.next_contact_date)} /></FormField>
      <AdminField admins={admins} defaultValue={lead?.responsible_admin_id} label={t("fields.responsible")} emptyLabel={t("notAssigned")} />
    </div>
    <p aria-live="polite" className={metadata.countryResetMessage ? "text-sm text-[var(--ui-text-muted)]" : "sr-only"}>{metadata.countryResetMessage}</p>
    <NotesField name="request_description" label={t("fields.request")} defaultValue={lead?.request_description} error={state.fieldErrors?.request_description} />
    <NotesField name="internal_notes" label={t("fields.notes")} defaultValue={lead?.internal_notes} rows={5} error={state.fieldErrors?.internal_notes} />
  </>;
}

function LeadHeaderActions({ deleting, historyOpen, onDelete, onEdit, onHistory }: { deleting: boolean; historyOpen: boolean; onDelete: () => void; onEdit: () => void; onHistory: () => void }) {
  const t = useTranslations("Crm");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const setMenuTriggerRef = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest<HTMLElement>("dialog, [role='dialog']") ?? null), []);
  const [menuOpen, setMenuOpen] = useState(false);

  return <>
    <Button type="button" variant="ghost" className="size-11 p-0 sm:w-auto sm:px-3" onClick={onHistory} aria-label={t(historyOpen ? "history.back" : "history.action")}>{historyOpen ? <ArrowLeft className="size-4" aria-hidden="true" /> : <History className="size-4" aria-hidden="true" />}<span className="hidden sm:inline">{t(historyOpen ? "history.back" : "history.action")}</span></Button>
    <Button type="button" variant="ghost" className="size-11 p-0 sm:w-auto sm:px-3" onClick={onEdit} aria-label={t("edit")}><Pencil className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{t("edit")}</span></Button>
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger asChild><Button ref={setMenuTriggerRef} type="button" variant="ghost" className="size-11 p-0" aria-label={t("recordActions")}><MoreHorizontal className="size-5" aria-hidden="true" /></Button></Popover.Trigger>
      <Popover.Portal container={portalContainer ?? undefined}><Popover.Content align="end" sideOffset={6} className="z-[80] min-w-48 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" disabled={deleting} onClick={() => { setMenuOpen(false); onDelete(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] outline-none transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:bg-[var(--ui-danger-surface)] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" />{deleting ? t("deleting") : t("delete")}</button></Popover.Content></Popover.Portal>
    </Popover.Root>
  </>;
}

function LeadDetail({ lead, locale, onConvert, onStatusChange }: { lead: CrmLead; locale: string; onConvert: () => void; onStatusChange: (status: CrmLead["status"]) => Promise<{ error?: string }> }) {
  const t = useTranslations("Crm");
  const projectTypes = useTranslations("ProjectTypes");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  const countryCode = lead.country_code ?? (isCountryCode(lead.country) ? lead.country : null);
  const country = countryCode ? getCountryName(countryCode, locale) : lead.country;
  const budget = lead.budget_amount !== null && (lead.budget_currency === "UAH" || lead.budget_currency === "USD")
    ? formatCrmBudget(lead.budget_amount, lead.budget_currency)
    : lead.budget_note;
  const projectType = getProjectTypeDisplayName(lead.expected_project_type, lead.expected_project_type_custom, projectTypes);
  const source = isCrmLeadSourceKey(lead.source) ? t(`sourceOptions.${lead.source}`) : lead.source;

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <DetailField icon={Building2} label={t("fields.company")} value={lead.company} />
        <DetailField icon={CircleDot} label={t("fields.status")} value={<div className="flex flex-col items-start gap-2"><Select aria-label={t("status.changeLabel")} value={lead.status} disabled={statusPending} onValueChange={(value) => { if (!isCrmLeadStatus(value)) return; setStatusError(null); startStatusTransition(async () => { const result = await onStatusChange(value); setStatusError(result.error ?? null); }); }} className="max-w-64">{CRM_LEAD_STATUSES.map((value) => <SelectItem key={value} value={value}>{t(`leadStatus.${value}`)}</SelectItem>)}</Select>{statusError ? <p role="alert" className="text-xs text-[var(--ui-danger-text)]">{statusError}</p> : null}{lead.project_id ? <Button asChild size="sm" variant="outline"><Link href={`/projects/${lead.project_id}`}><FolderKanban className="size-4" aria-hidden="true" />{t("conversion.openProject")}</Link></Button> : lead.status !== "lost" ? <Button type="button" size="sm" variant="outline" onClick={onConvert}><Plus className="size-4" aria-hidden="true" />{t("conversion.action")}</Button> : null}</div>} />
        <DetailField icon={Mail} label={t("fields.email")} value={lead.email ? <a className="font-medium text-[var(--ui-text)] hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null} />
        <DetailField icon={Phone} label={t("fields.phone")} value={lead.phone ? <a className="font-medium text-[var(--ui-text)] hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a> : null} />
        <DetailField icon={Megaphone} label={t("fields.source")} value={source} />
        <DetailField icon={UserRound} label={t("fields.responsible")} value={lead.responsibleAdmin?.name ?? t("notAssigned")} />
        <DetailField icon={Shapes} label={t("fields.projectType")} value={projectType} />
        <DetailField icon={MapPin} label={t("fields.location")} value={[lead.city, country].filter(Boolean).join(", ")} />
        <DetailField icon={Ruler} label={t("fields.area")} value={lead.approximate_area !== null ? `${lead.approximate_area} m²` : null} />
        <DetailField icon={Banknote} label={t("fields.budget")} value={budget} />
        <DetailField icon={CalendarDays} label={t("fields.firstContact")} value={formatDate(lead.first_contact_date, locale)} />
        <DetailField icon={CalendarDays} label={t("fields.nextContact")} value={lead.next_contact_date ? <>{formatDate(lead.next_contact_date, locale)}{!lead.responsible_admin_id ? <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ui-warning-text)]"><AlertCircle className="size-3.5" aria-hidden="true" />{t("reminder.needsResponsible")}</span> : null}</> : null} />
      </dl>
      <div className="mt-6 grid gap-5 border-t border-[var(--ui-border)] pt-5">
        <DetailField icon={FileText} label={t("fields.request")} value={lead.request_description} multiline />
        <DetailField icon={StickyNote} label={t("fields.notes")} value={lead.internal_notes} multiline />
      </div>
    </div>
  </div>;
}

function LeadHistoryPanel({ error, history, locale }: { error: string | null; history: CrmLeadHistory[] | null; locale: string }) {
  const t = useTranslations("Crm");
  if (!history) return <div className="flex min-h-48 items-center justify-center p-6 text-[var(--ui-text-muted)]"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /><span className="sr-only">{t("history.loading")}</span></div>;
  if (error) return <p role="alert" className="p-6 text-sm text-[var(--ui-danger-text)]">{error}</p>;
  if (!history.length) return <p className="p-6 text-sm text-[var(--ui-text-muted)]">{t("history.empty")}</p>;
  return <div className="overflow-y-auto p-4 sm:p-6"><ol className="space-y-4">{history.map((event) => <li key={event.id} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-3"><span className="mt-1.5 size-2 rounded-full bg-[var(--ui-action-primary)]" aria-hidden="true" /><div className="min-w-0 border-b border-[var(--ui-border-subtle)] pb-4"><p className="text-sm font-medium text-[var(--ui-text)]">{event.event_type === "created" ? t("history.created", { status: event.new_status ? t(`leadStatus.${event.new_status}`) : "—" }) : event.event_type === "project_linked" ? t("history.projectLinked", { project: event.project?.name ?? t("history.unknownProject") }) : t("history.statusChanged", { from: event.previous_status ? t(`leadStatus.${event.previous_status}`) : "—", to: event.new_status ? t(`leadStatus.${event.new_status}`) : "—" })}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("history.meta", { actor: event.actor?.full_name ?? t("history.systemActor"), date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at)) })}</p></div></li>)}</ol></div>;
}

function DetailField({ icon: Icon, label, multiline = false, value }: { icon: LucideIcon; label: string; multiline?: boolean; value: React.ReactNode }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return <div className={multiline ? "sm:col-span-2" : undefined}><dt className="flex min-w-0 items-center gap-2.5 text-xs font-medium text-[var(--ui-text-muted)]"><Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} /><span>{label}</span></dt><dd className={`ml-[1.625rem] mt-1 min-w-0 text-sm ${hasValue ? "text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"} ${multiline ? "whitespace-pre-wrap leading-6" : "leading-5"}`}>{hasValue ? value : "—"}</dd></div>;
}

function getLeadProjectDefaults(lead: CrmLead, defaultStartDate: string): ProjectFormDefaults {
  const countryCode = lead.country_code ?? (isCountryCode(lead.country) ? lead.country : "");
  return {
    city: lead.city ?? undefined,
    city_geonames_id: lead.city_geonames_id ?? undefined,
    client_name: lead.client_name,
    country_code: countryCode,
    description: lead.request_description ?? undefined,
    priority: "normal",
    project_type: lead.expected_project_type ?? undefined,
    project_type_custom: lead.expected_project_type_custom ?? undefined,
    start_date: defaultStartDate,
    total_area_m2: lead.approximate_area && lead.approximate_area > 0 ? lead.approximate_area : undefined,
  };
}

function formatDate(value: string | null, locale: string) {
  return value ? new Intl.DateTimeFormat(locale).format(new Date(`${value}T12:00:00`)) : null;
}
