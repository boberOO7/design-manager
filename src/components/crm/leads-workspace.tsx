"use client";

import * as Popover from "@radix-ui/react-popover";
import { Mail, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { deleteLead, saveLead } from "@/app/(app)/crm/actions";
import { CrmActionForm } from "@/components/crm/action-form";
import { AdminField, NotesField, TextField } from "@/components/crm/crm-fields";
import { CityCombobox } from "@/components/projects/city-combobox";
import { ProjectCountrySelect, ProjectTypeSelect, useProjectMetadataControls } from "@/components/projects/project-metadata-controls";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { CrmAdmin, CrmLead } from "@/data/queries/crm";
import { formatCrmBudget, getCrmBudgetInputValue } from "@/lib/crm-budget";
import { filterLeads } from "@/lib/crm";
import { getCountryName, isCountryCode } from "@/lib/countries";
import { CRM_LEAD_STATUSES, type CrmActionState } from "@/lib/validation/crm";
import { getProjectTypeDisplayName } from "@/lib/validation/project";

function today() { return new Date().toISOString().slice(0, 10); }

function isNestedInteractiveTarget(target: EventTarget | null, row: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const interactiveTarget = target.closest("a, button, input, select, textarea, [role='button'], [role='link'], [role='menuitem']");
  return interactiveTarget !== null && interactiveTarget !== row;
}

export function LeadsWorkspace({ admins, leads }: { admins: CrmAdmin[]; leads: CrmLead[] }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [openLead, setOpenLead] = useState<CrmLead | "new" | null>(null);
  const [view, setView] = useState<"detail" | "edit">("detail");
  const [deleting, setDeleting] = useState(false);
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

  function closeDialog() {
    if (!deleting) setOpenLead(null);
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
    <Dialog isOpen={Boolean(openLead)} onRequestClose={closeDialog} closeDisabled={deleting} closeLabel={t("close")} title={lead ? lead.client_name : t("leads.add")} description={lead && view === "detail" ? t("leads.detailDescription") : t("leads.formDescription")}>
      {lead && view === "detail" ? <LeadDetail lead={lead} locale={locale} deleting={deleting} onDelete={() => void remove()} onEdit={() => setView("edit")} onClose={closeDialog} /> : <div className="overflow-y-auto p-4 sm:p-6"><CrmActionForm action={saveLead.bind(null, lead?.id ?? null)} cancelLabel={t("cancel")} onCancel={lead ? () => setView("detail") : closeDialog} submitLabel={t("save")} onSuccess={() => { setOpenLead(null); router.refresh(); }}>{(state) => <LeadFormFields admins={admins} lead={lead} state={state} />}</CrmActionForm></div>}
    </Dialog>
  </>;
}

function LeadFormFields({ admins, lead, state }: { admins: CrmAdmin[]; lead: CrmLead | null; state: CrmActionState }) {
  const t = useTranslations("Crm");
  const legacyCountry = lead?.country_code === null && lead.country && !isCountryCode(lead.country) ? lead.country : null;
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
      <TextField name="source" label={t("fields.source")} defaultValue={lead?.source} error={state.fieldErrors?.source} />
      <FormField as="div" label={t("fields.projectType")} error={state.fieldErrors?.expected_project_type} optional><ProjectTypeSelect name="expected_project_type" value={metadata.projectType} onValueChange={metadata.changeProjectType} /></FormField>
      {metadata.projectType === "other" ? <FormField label={t("fields.projectTypeCustom")} error={state.fieldErrors?.expected_project_type_custom}><Input name="expected_project_type_custom" value={metadata.projectTypeCustom} onChange={(event) => metadata.changeProjectTypeCustom(event.target.value)} aria-invalid={Boolean(state.fieldErrors?.expected_project_type_custom)} /></FormField> : null}
      <FormField as="div" label={t("fields.country")} error={state.fieldErrors?.country_code}><ProjectCountrySelect legacyCountry={legacyCountry} name="country_code" required value={metadata.countryCode} onValueChange={metadata.changeCountry} /></FormField>
      <FormField as="div" label={t("fields.city")} error={state.fieldErrors?.city} optional><CityCombobox countryCode={metadata.countryCode} describedBy={state.fieldErrors?.city ? "city-error" : undefined} invalid={Boolean(state.fieldErrors?.city)} name="city_search" value={metadata.city} onGeoNamesIdChange={metadata.setCityGeoNamesId} onValueChange={metadata.changeCity} /><input type="hidden" name="city" value={metadata.city} /><input type="hidden" name="city_geonames_id" value={metadata.cityGeoNamesId ?? ""} /></FormField>
      <TextField name="approximate_area" label={t("fields.area")} type="number" defaultValue={lead?.approximate_area?.toString()} error={state.fieldErrors?.approximate_area} />
      <FormField label={t("fields.budget")} error={state.fieldErrors?.budget} optional><Input name="budget" defaultValue={lead ? getCrmBudgetInputValue({ amount: lead.budget_amount, currency: lead.budget_currency, legacyNote: lead.budget_note }) : ""} inputMode="numeric" placeholder={t("fields.budgetPlaceholder")} aria-invalid={Boolean(state.fieldErrors?.budget)} /></FormField>
      <TextField name="first_contact_date" label={t("fields.firstContact")} type="date" defaultValue={lead?.first_contact_date ?? today()} required error={state.fieldErrors?.first_contact_date} />
      <TextField name="next_contact_date" label={t("fields.nextContact")} type="date" defaultValue={lead?.next_contact_date} error={state.fieldErrors?.next_contact_date} />
      <AdminField admins={admins} defaultValue={lead?.responsible_admin_id} label={t("fields.responsible")} emptyLabel={t("notAssigned")} />
      <FormField as="div" label={t("fields.status")}><Select name="status" defaultValue={lead?.status ?? "new"}>{CRM_LEAD_STATUSES.map((value) => <SelectItem key={value} value={value}>{t(`leadStatus.${value}`)}</SelectItem>)}</Select></FormField>
    </div>
    <p aria-live="polite" className={metadata.countryResetMessage ? "text-sm text-[var(--ui-text-muted)]" : "sr-only"}>{metadata.countryResetMessage}</p>
    <NotesField name="request_description" label={t("fields.request")} defaultValue={lead?.request_description} error={state.fieldErrors?.request_description} />
    <NotesField name="internal_notes" label={t("fields.notes")} defaultValue={lead?.internal_notes} rows={5} error={state.fieldErrors?.internal_notes} />
  </>;
}

function LeadDetail({ deleting, lead, locale, onClose, onDelete, onEdit }: { deleting: boolean; lead: CrmLead; locale: string; onClose: () => void; onDelete: () => void; onEdit: () => void }) {
  const t = useTranslations("Crm");
  const projectTypes = useTranslations("ProjectTypes");
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const setMenuTriggerRef = useCallback((node: HTMLButtonElement | null) => setPortalContainer(node?.closest<HTMLElement>("dialog, [role='dialog']") ?? null), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const countryCode = lead.country_code ?? (isCountryCode(lead.country) ? lead.country : null);
  const country = countryCode ? getCountryName(countryCode, locale) : lead.country;
  const budget = lead.budget_amount !== null && (lead.budget_currency === "UAH" || lead.budget_currency === "USD")
    ? formatCrmBudget(lead.budget_amount, lead.budget_currency)
    : lead.budget_note;
  const projectType = getProjectTypeDisplayName(lead.expected_project_type, lead.expected_project_type_custom, projectTypes);

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <DetailField label={t("fields.company")} value={lead.company} />
        <DetailField label={t("fields.status")} value={t(`leadStatus.${lead.status}`)} />
        <DetailField label={t("fields.email")} value={lead.email ? <a className="inline-flex items-center gap-2 font-medium text-[var(--ui-text)] hover:underline" href={`mailto:${lead.email}`}><Mail className="size-4" aria-hidden="true" />{lead.email}</a> : null} />
        <DetailField label={t("fields.phone")} value={lead.phone ? <a className="inline-flex items-center gap-2 font-medium text-[var(--ui-text)] hover:underline" href={`tel:${lead.phone}`}><Phone className="size-4" aria-hidden="true" />{lead.phone}</a> : null} />
        <DetailField label={t("fields.source")} value={lead.source} />
        <DetailField label={t("fields.responsible")} value={lead.responsibleAdmin?.name ?? t("notAssigned")} />
        <DetailField label={t("fields.projectType")} value={projectType} />
        <DetailField label={t("fields.location")} value={[lead.city, country].filter(Boolean).join(", ")} />
        <DetailField label={t("fields.area")} value={lead.approximate_area !== null ? `${lead.approximate_area} m²` : null} />
        <DetailField label={t("fields.budget")} value={budget} />
        <DetailField label={t("fields.firstContact")} value={formatDate(lead.first_contact_date, locale)} />
        <DetailField label={t("fields.nextContact")} value={formatDate(lead.next_contact_date, locale)} />
      </dl>
      <div className="mt-6 grid gap-5 border-t border-[var(--ui-border)] pt-5">
        <DetailField label={t("fields.request")} value={lead.request_description} multiline />
        <DetailField label={t("fields.notes")} value={lead.internal_notes} multiline />
      </div>
    </div>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild><Button ref={setMenuTriggerRef} type="button" variant="ghost" className="size-11 p-0" aria-label={t("recordActions")}><MoreHorizontal className="size-5" aria-hidden="true" /></Button></Popover.Trigger>
        <Popover.Portal container={portalContainer ?? undefined}><Popover.Content align="start" sideOffset={6} className="z-[80] min-w-48 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" disabled={deleting} onClick={() => { setMenuOpen(false); onDelete(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] outline-none transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:bg-[var(--ui-danger-surface)] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" />{deleting ? t("deleting") : t("delete")}</button></Popover.Content></Popover.Portal>
      </Popover.Root>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>{t("close")}</Button><Button type="button" onClick={onEdit}><Pencil className="size-4" aria-hidden="true" />{t("edit")}</Button></div>
    </footer>
  </div>;
}

function DetailField({ label, multiline = false, value }: { label: string; multiline?: boolean; value: React.ReactNode }) {
  return <div className={multiline ? "sm:col-span-2" : undefined}><dt className="text-xs font-medium uppercase tracking-wide text-[var(--ui-text-muted)]">{label}</dt><dd className={`mt-1 text-sm text-[var(--ui-text-secondary)] ${multiline ? "whitespace-pre-wrap leading-6" : ""}`}>{value || "—"}</dd></div>;
}

function formatDate(value: string | null, locale: string) {
  return value ? new Intl.DateTimeFormat(locale).format(new Date(`${value}T12:00:00`)) : null;
}
