"use client";

import { ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { deleteLead, saveLead } from "@/app/(app)/crm/actions";
import { CrmActionForm } from "@/components/crm/action-form";
import { AdminField, NotesField, TextField } from "@/components/crm/crm-fields";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { CrmAdmin, CrmLead } from "@/data/queries/crm";
import { filterLeads } from "@/lib/crm";
import { CRM_LEAD_STATUSES } from "@/lib/validation/crm";

function today() { return new Date().toISOString().slice(0, 10); }

export function LeadsWorkspace({ admins, leads }: { admins: CrmAdmin[]; leads: CrmLead[] }) {
  const t = useTranslations("Crm");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [openLead, setOpenLead] = useState<CrmLead | "new" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const visible = useMemo(() => filterLeads(leads, query, status), [leads, query, status]);
  const lead = openLead === "new" ? null : openLead;

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
        <Button type="button" onClick={() => setOpenLead("new")}><Plus className="size-4" aria-hidden="true" />{t("leads.add")}</Button>
      </div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs uppercase tracking-wide text-[var(--ui-text-muted)]"><tr><th className="px-4 py-3">{t("leads.columns.contact")}</th><th className="px-4 py-3">{t("leads.columns.request")}</th><th className="px-4 py-3">{t("leads.columns.status")}</th><th className="px-4 py-3">{t("leads.columns.responsible")}</th><th className="px-4 py-3">{t("leads.columns.followUp")}</th></tr></thead>
        <tbody className="divide-y divide-[var(--ui-border)]">{visible.map((item) => <tr key={item.id} className="hover:bg-[var(--ui-surface-subtle)]"><td className="px-4 py-3"><button type="button" onClick={() => setOpenLead(item)} className="font-medium text-[var(--ui-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{item.client_name}</button><p className="text-xs text-[var(--ui-text-muted)]">{item.company || item.email || "—"}</p></td><td className="max-w-80 px-4 py-3 text-[var(--ui-text-secondary)]"><span className="line-clamp-2">{item.request_description || "—"}</span></td><td className="px-4 py-3"><span className="rounded-full border border-[var(--ui-border)] px-2 py-1 text-xs">{t(`leadStatus.${item.status}`)}</span></td><td className="px-4 py-3 text-[var(--ui-text-secondary)]">{item.responsibleAdmin?.name ?? "—"}</td><td className="px-4 py-3 tabular-nums text-[var(--ui-text-secondary)]">{item.next_contact_date ? new Intl.DateTimeFormat(locale).format(new Date(`${item.next_contact_date}T12:00:00`)) : "—"}</td></tr>)}</tbody>
      </table></div> : <EmptyState title={query || status !== "all" ? t("empty.filteredTitle") : t("leads.emptyTitle")} description={query || status !== "all" ? t("empty.filteredDescription") : t("leads.emptyDescription")} />}
    </div>
    <Dialog isOpen={Boolean(openLead)} onRequestClose={() => setOpenLead(null)} closeLabel={t("close")} title={lead ? lead.client_name : t("leads.add")} description={t("leads.formDescription")}>
      <div className="overflow-y-auto p-4 sm:p-6"><CrmActionForm action={saveLead.bind(null, lead?.id ?? null)} submitLabel={t("save")} onSuccess={() => { setOpenLead(null); router.refresh(); }}>{(state) => <>
        <div className="grid gap-4 sm:grid-cols-2"><TextField name="client_name" label={t("fields.clientName")} defaultValue={lead?.client_name} required error={state.fieldErrors?.client_name} /><TextField name="company" label={t("fields.company")} defaultValue={lead?.company} error={state.fieldErrors?.company} /><TextField name="email" label={t("fields.email")} type="email" defaultValue={lead?.email} error={state.fieldErrors?.email} /><TextField name="phone" label={t("fields.phone")} type="tel" defaultValue={lead?.phone} error={state.fieldErrors?.phone} /><TextField name="source" label={t("fields.source")} defaultValue={lead?.source} error={state.fieldErrors?.source} /><TextField name="expected_project_type" label={t("fields.projectType")} defaultValue={lead?.expected_project_type} error={state.fieldErrors?.expected_project_type} /><TextField name="city" label={t("fields.city")} defaultValue={lead?.city} error={state.fieldErrors?.city} /><TextField name="country" label={t("fields.country")} defaultValue={lead?.country} error={state.fieldErrors?.country} /><TextField name="approximate_area" label={t("fields.area")} type="number" defaultValue={lead?.approximate_area?.toString()} error={state.fieldErrors?.approximate_area} /><TextField name="budget_note" label={t("fields.budget")} defaultValue={lead?.budget_note} error={state.fieldErrors?.budget_note} /><TextField name="first_contact_date" label={t("fields.firstContact")} type="date" defaultValue={lead?.first_contact_date ?? today()} required error={state.fieldErrors?.first_contact_date} /><TextField name="next_contact_date" label={t("fields.nextContact")} type="date" defaultValue={lead?.next_contact_date} error={state.fieldErrors?.next_contact_date} /><AdminField admins={admins} defaultValue={lead?.responsible_admin_id} label={t("fields.responsible")} /><FormField as="div" label={t("fields.status")}><Select name="status" defaultValue={lead?.status ?? "new"}>{CRM_LEAD_STATUSES.map((value) => <SelectItem key={value} value={value}>{t(`leadStatus.${value}`)}</SelectItem>)}</Select></FormField></div>
        <NotesField name="request_description" label={t("fields.request")} defaultValue={lead?.request_description} error={state.fieldErrors?.request_description} /><NotesField name="internal_notes" label={t("fields.notes")} defaultValue={lead?.internal_notes} rows={5} error={state.fieldErrors?.internal_notes} />
      </>}</CrmActionForm>{lead ? <div className="mt-4 flex justify-between"><a href={lead.email ? `mailto:${lead.email}` : undefined} className={lead.email ? "inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ui-text-secondary)] hover:underline" : "hidden"}><ExternalLink className="size-4" aria-hidden="true" />{lead.email}</a><Button type="button" variant="outline" className="border-[var(--ui-danger-border)] text-[var(--ui-danger-text)]" disabled={deleting} onClick={remove}><Trash2 className="size-4" aria-hidden="true" />{deleting ? t("deleting") : t("delete")}</Button></div> : null}</div>
    </Dialog>
  </>;
}
