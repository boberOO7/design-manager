"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form-field";
import { instantToDateOnly } from "@/lib/calendar";
import { META_BATCH_SIZE, metaResponseSchema, type MetaFormSummary, type MetaJobState, type MetaPreview, type MetaResponse } from "@/lib/meta-leads/contracts";
const endpoint = "/api/integrations/meta-leads/manage";
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const cell = "px-4 py-3 text-left align-top";
const batches = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / META_BATCH_SIZE) }, (_, index) => ids.slice(index * META_BATCH_SIZE, (index + 1) * META_BATCH_SIZE));
type Diagnostics = Extract<MetaResponse, {
  kind: "forms";
}>["diagnostics"];
type Availability = {
  count: number;
  latest: string | null;
  loading: boolean;
  error: boolean;
};
type Plan = {
  ids: string[];
  existing: number;
  skipped: number;
};
type Result = {
  imported: number;
  existing: number;
  skipped: number;
  errors: number;
  pending: number;
};

async function request(parameters: Record<string, string>, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`${endpoint}?${new URLSearchParams(parameters)}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined, cache: "no-store", signal });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(response.status === 403 ? "permission" : response.status === 409 ? "form_disabled" : "request_failed");
  return metaResponseSchema.parse(data);
}

export function MetaLeadsWorkspace() {
  const t = useTranslations("Crm.meta"), locale = useLocale(), router = useRouter();
  const [forms, setForms] = useState<MetaFormSummary[]>([]), [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [formId, setFormId] = useState<string | null>(null), [leads, setLeads] = useState<MetaPreview[]>([]), [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()), [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [page, setPage] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null), [result, setResult] = useState<Result | null>(null), [importing, setImporting] = useState(false);
  const catalog = useRef<AbortController | null>(null), preview = useRef<AbortController | null>(null), operation = useRef<AbortController | null>(null);
  const currentForm = forms.find(item => item.form_id === formId);
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv" }).format(new Date(value)) : t("unknown");
  function reason(code: string | null) {
    switch (code) {
      case "missing_client_name": return t("missingName");
      case "missing_or_invalid_created_time": return t("missingDate");
      case "invalid_crm_fields": return t("invalidFields");
      case "crm_lead_deleted": return t("deletedLead");
      case "admin_skipped": return t("excludedLead");
      case "form_disabled": return t("disabledHint");
      default: return code ? t("technicalError", { code }) : "";
    }
  }
  async function scanForms(items: MetaFormSummary[], signal: AbortSignal) {
    for (const item of items) {
      let cursor: string | null = null, count = 0, latest: string | null = null;
      const seen = new Set<string>();
      setAvailability(old => ({ ...old, [item.form_id]: { count, latest, loading: true, error: false } }));
      try {
        do {
          const response = await request({ operation: "availability", formId: item.form_id, ...(cursor ? { after: cursor } : {}) }, undefined, signal);
          if (response.kind !== "availability")
            throw new Error("request_failed");
          count += response.count;
          if (response.latest && (!latest || response.latest > latest))
            latest = response.latest;
          cursor = response.next;
          if (cursor && seen.has(cursor))
            throw new Error("request_failed");
          if (cursor)
            seen.add(cursor);
        } while (cursor);
        if (!signal.aborted)
          setAvailability(old => ({ ...old, [item.form_id]: { count, latest, loading: false, error: false } }));
      }
      catch {
        if (signal.aborted)
          return;
        setAvailability(old => ({ ...old, [item.form_id]: { count, latest, loading: false, error: true } }));
      }
    }
  }
  async function loadForms() {
    catalog.current?.abort();
    const controller = new AbortController();
    catalog.current = controller;
    setLoading(true);
    setError(null);
    try {
      let cursor: string | null = null, items: MetaFormSummary[] = [];
      const seen = new Set<string>();
      do {
        const response = await request({ operation: "forms", ...(cursor ? { after: cursor } : {}) }, undefined, controller.signal);
        if (response.kind !== "forms")
          throw new Error("request_failed");
        items = response.forms;
        setForms(items);
        setDiagnostics(response.diagnostics);
        cursor = response.next;
        if (cursor && seen.has(cursor))
          throw new Error("request_failed");
        if (cursor)
          seen.add(cursor);
      } while (cursor);
      setLoading(false);
      if (!controller.signal.aborted)
        void scanForms(items, controller.signal);
    }
    catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "request_failed");
        setLoading(false);
      }
    }
  }
  useEffect(() => { void loadForms(); return () => { catalog.current?.abort(); preview.current?.abort(); operation.current?.abort(); }; }, []);
  async function openPreview(id: string) {
    preview.current?.abort();
    const controller = new AbortController();
    preview.current = controller;
    setFormId(id);
    setLeads([]);
    setSelected(new Set());
    setExpanded(new Set());
    setFrom("");
    setTo("");
    setPage(0);
    setResult(null);
    setError(null);
    setPreviewLoading(true);
    try {
      let cursor: string | null = null;
      const seen = new Set<string>(), collected = new Map<string, MetaPreview>();
      do {
        const response = await request({ operation: "preview", formId: id, ...(cursor ? { after: cursor } : {}) }, undefined, controller.signal);
        if (response.kind !== "preview")
          throw new Error("request_failed");
        response.leads.forEach(lead => collected.set(lead.id, lead));
        setLeads([...collected.values()]);
        cursor = response.next;
        if (cursor && seen.has(cursor))
          throw new Error("request_failed");
        if (cursor)
          seen.add(cursor);
      } while (cursor);
    }
    catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "request_failed");
    }
    finally {
      if (!controller.signal.aborted)
        setPreviewLoading(false);
    }
  }
  async function toggle(item: MetaFormSummary) {
    setBusy(true);
    setError(null);
    try {
      await request({}, { action: "sync", formId: item.form_id, enabled: !item.sync_enabled });
      setForms(old => old.map(form => form.form_id === item.form_id ? { ...form, sync_enabled: !item.sync_enabled } : form));
      setDiagnostics(old => old ? { ...old, enabledForms: old.enabledForms + (item.sync_enabled ? -1 : 1) } : old);
    }
    catch (error) {
      setError(error instanceof Error ? error.message : "request_failed");
    }
    finally {
      setBusy(false);
    }
  }
  async function exclude(lead: MetaPreview) {
    if (!formId)
      return;
    setBusy(true);
    setError(null);
    const excluded = lead.reason !== "admin_skipped";
    try {
      await request({}, { action: "exclude", formId, leadId: lead.id, excluded });
      setSelected(old => { const next = new Set(old); next.delete(lead.id); return next; });
      if (excluded)
        setLeads(old => old.map(item => item.id === lead.id ? { ...item, status: "skipped", reason: "admin_skipped", eligible: false } : item));
      else
        await openPreview(formId);
    }
    catch (error) {
      setError(error instanceof Error ? error.message : "request_failed");
    }
    finally {
      setBusy(false);
    }
  }
  async function prepareImport() {
    if (!formId)
      return;
    setBusy(true);
    setError(null);
    try {
      const next: Plan = { ids: [], existing: 0, skipped: 0 };
      for (const ids of batches([...selected])) {
        const response = await request({}, { action: "plan", formId, leadIds: ids });
        if (response.kind !== "plan")
          throw new Error("request_failed");
        next.ids.push(...response.importable);
        next.existing += response.existing;
        next.skipped += response.skipped;
      }
      setPlan(next);
    }
    catch (error) {
      setError(error instanceof Error ? error.message : "request_failed");
    }
    finally {
      setBusy(false);
    }
  }
  async function importSelection() {
    if (!plan || !formId)
      return;
    const chosen = plan;
    setPlan(null);
    setImporting(true);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    operation.current = controller;
    let existing = chosen.existing, skipped = chosen.skipped;
    const queued: string[] = [];
    try {
      for (const ids of batches(chosen.ids)) {
        const response = await request({}, { action: "enqueue", formId, leadIds: ids }, controller.signal);
        if (response.kind !== "plan")
          throw new Error("request_failed");
        queued.push(...response.importable);
        existing += response.existing;
        skipped += response.skipped;
        setResult({ imported: 0, existing, skipped, errors: 0, pending: queued.length });
      }
      const states = new Map<string, MetaJobState>();
      let pending = true;
      while (pending && !controller.signal.aborted) {
        for (const ids of batches(queued)) {
          const response = await request({}, { action: "process", formId, leadIds: ids }, controller.signal);
          if (response.kind !== "status")
            throw new Error("request_failed");
          response.jobs.forEach(job => states.set(job.leadgen_id, job));
        }
        const summary: Result = { imported: 0, existing, skipped, errors: 0, pending: 0 };
        for (const id of queued) {
          const job = states.get(id);
          if (job?.status === "completed" && job.crm_lead_id)
            summary.imported++;
          else if (job?.status === "completed" || job?.status === "skipped" || job?.status === "blocked")
            summary.skipped++;
          else if (job?.status === "failed")
            summary.errors++;
          else
            summary.pending++;
        }
        setResult(summary);
        pending = summary.pending > 0;
        if (pending)
          await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (controller.signal.aborted)
        return;
      setSelected(new Set());
      router.refresh();
      void loadForms();
    }
    catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "request_failed");
    }
    finally {
      if (!controller.signal.aborted || operation.current === controller)
        setImporting(false);
    }
  }
  const filtered = leads.filter(lead => { const day = lead.submitted_at ? instantToDateOnly(lead.submitted_at) : ""; return (!from || day >= from) && (!to || Boolean(day && day <= to)); });
  const eligible = filtered.filter(lead => lead.eligible), shown = filtered.slice(page * META_BATCH_SIZE, (page + 1) * META_BATCH_SIZE);
  const allSelected = eligible.length > 0 && eligible.every(lead => selected.has(lead.id));
  return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--ui-text-muted)]"><div className="flex flex-wrap gap-x-5 gap-y-1">
   <span>{t("enabledCount", { count: diagnostics?.enabledForms ?? 0 })}</span><span>{t("pendingCount", { count: diagnostics?.pending ?? 0 })}</span><span>{t("failedCount", { count: diagnostics?.failed ?? 0 })}</span><span>{t("lastSuccess", { date: date(diagnostics?.lastSuccess ?? null) })}</span>
  </div><Button variant="outline" size="compact" onClick={() => void loadForms()} disabled={loading || busy || importing}><RefreshCw size={15} aria-hidden="true"/>{t("refresh")}</Button></div>
  <p className="text-sm text-[var(--ui-text-muted)]">{t("deliveryHint")}</p>
  {error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error === "permission" ? t("permission") : error === "form_disabled" ? t("disabledHint") : t("requestFailed")}</p> : null}
  {diagnostics?.graphError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("graphUnavailable")} {reason(diagnostics.graphError)}</p> : null}
  {formId ? <div className="space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" size="compact" disabled={importing} onClick={() => { preview.current?.abort(); setFormId(null); setLeads([]); setSelected(new Set()); setResult(null); }}><ArrowLeft size={16} aria-hidden="true"/>{t("forms")}</Button>
    <div className="min-w-0 flex-1"><h2 className="font-semibold">{currentForm?.name || formId}</h2><p className="text-xs text-[var(--ui-text-muted)]">{t("formId", { id: formId })}</p></div>
    <Button disabled={!selected.size || busy || importing || !diagnostics?.manualAvailable || !currentForm?.sync_enabled} onClick={() => void prepareImport()}>{t("importSelected", { count: selected.size })}</Button></div>
   {!currentForm?.sync_enabled ? <p className="text-sm text-[var(--ui-text-muted)]">{t("disabledHint")}</p> : null}
   <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">{t("dateFrom")}<Input type="date" value={from} onChange={event => { setFrom(event.target.value); setSelected(new Set()); setPage(0); }} disabled={importing}/></label>
    <label className="grid gap-1 text-sm">{t("dateTo")}<Input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setSelected(new Set()); setPage(0); }} disabled={importing}/></label>
    <Button variant="outline" disabled={previewLoading || importing || !eligible.length} onClick={() => setSelected(old => { const next = new Set(old); eligible.forEach(lead => allSelected ? next.delete(lead.id) : next.add(lead.id)); return next; })}>{allSelected ? t("clearSelection") : t("selectAll")}</Button><span className="pb-2 text-sm text-[var(--ui-text-muted)]">{t("availableCount", { count: filtered.length })}</span></div>
   <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("selectionHint")}</p>
   <div className={`${panel} overflow-x-auto`} aria-busy={previewLoading}><table className="w-full min-w-[840px] text-sm"><thead className="bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><tr>{[t("selection"), t("submitted"), t("name"), t("phone"), t("email"), t("form"), t("status"), t("actions")].map(label => <th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--ui-border)]">
    {shown.map(lead => <MetaLeadRows key={lead.id} lead={lead} formName={currentForm?.name || formId} checked={selected.has(lead.id)} expanded={expanded.has(lead.id)} disabled={busy || importing} date={date(lead.submitted_at)} reason={reason(lead.reason)} onSelect={() => setSelected(old => { const next = new Set(old); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} onExpand={() => setExpanded(old => { const next = new Set(old); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} onExclude={() => void exclude(lead)}/>)}</tbody></table>
    {!leads.length && !previewLoading ? <p className="p-6 text-sm text-[var(--ui-text-muted)]">{t("noLeads")}</p> : null}{previewLoading ? <p role="status" className="flex items-center gap-2 p-4 text-sm"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>{t("loadingPreview")}</p> : null}</div>
   <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(old => old - 1)}>{t("previous")}</Button><span className="text-sm">{t("page", { page: page + 1, count: Math.max(1, Math.ceil(filtered.length / META_BATCH_SIZE)) })}</span><Button variant="outline" disabled={(page + 1) * META_BATCH_SIZE >= filtered.length} onClick={() => setPage(old => old + 1)}>{t("next")}</Button></div>
   {importing ? <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>{t("importing")}<Button variant="outline" onClick={() => { operation.current?.abort(); setImporting(false); }}>{t("stopWaiting")}</Button></div> : null}
   {result ? <div role="status" aria-live="polite" className={`${panel} p-4`}><h3 className="font-semibold">{t("result")}</h3><p className="mt-2 text-sm">{t("resultCounts", result)}</p>{result.pending ? <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("pendingHint")}</p> : null}<Button className="mt-3" variant="outline" disabled={importing} onClick={() => void openPreview(formId)}>{t("refreshPreview")}</Button></div> : null}
  </div> : <div className="space-y-3"><p className="text-sm leading-6 text-[var(--ui-text-muted)]">{t("formHint")}</p>
   <div className={`${panel} overflow-x-auto`} aria-busy={loading}><table className="w-full min-w-[860px] text-sm"><thead className="bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><tr>{[t("form"), t("metaStatus"), t("created"), t("lifetimeCount"), t("available"), t("lastLead"), t("imported"), t("sync")].map(label => <th className={cell} key={label} scope="col">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--ui-border)]">{forms.map(item => <tr key={item.form_id}>
    <td className={cell}><button className="text-left font-semibold underline decoration-[var(--ui-border-strong)] underline-offset-4 focus-visible:outline-2" disabled={busy} onClick={() => void openPreview(item.form_id)}>{item.name || item.form_id}</button><p className="mt-1 break-all text-xs text-[var(--ui-text-muted)]">{item.form_id}</p></td>
    <td className={cell}>{item.meta_status || t("unknown")}<p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("adUsageUnknown")}</p></td><td className={cell}>{date(item.meta_created_at)}</td><td className={cell}>{item.lifetime_leads_count ?? t("unknown")}</td>
    <td className={cell}>{availability[item.form_id]?.loading ? t("checking") : availability[item.form_id]?.error ? t("checkFailed") : availability[item.form_id]?.count ?? t("unknown")}</td><td className={cell}>{availability[item.form_id]?.loading ? t("checking") : availability[item.form_id]?.error ? t("checkFailed") : date(availability[item.form_id]?.latest ?? null)}</td>
    <td className={cell}>{item.imported}<p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("formJobs", { pending: item.pending, failed: item.failed })}</p></td><td className={cell}><label className="inline-flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" role="switch" className="size-4 accent-[var(--ui-action-primary)]" checked={item.sync_enabled} disabled={loading || busy || importing} onChange={() => void toggle(item)}/><span>{t("sync")}</span><span className="sr-only">{item.name || item.form_id}</span></label><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{item.sync_enabled ? t("enabled") : t("disabled")}</p></td>
   </tr>)}</tbody></table>{loading ? <p role="status" className="p-4 text-sm">{t("loadingForms")}</p> : !forms.length ? <p className="p-6 text-sm text-[var(--ui-text-muted)]">{t("noForms")}</p> : null}</div>
   <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("enableHint")}</p><a href="https://business.facebook.com/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4">{t("businessSuite")}<ExternalLink size={14} aria-hidden="true"/></a></div>}
  <Dialog isOpen={Boolean(plan)} onRequestClose={() => setPlan(null)} title={t("confirmTitle")} closeLabel={t("cancel")}><p className="text-sm leading-6">{t("confirmCounts", { count: plan?.ids.length ?? 0, existing: plan?.existing ?? 0, skipped: plan?.skipped ?? 0 })}</p><p className="mt-3 text-sm text-[var(--ui-text-muted)]">{t("confirmHint")}</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setPlan(null)}>{t("cancel")}</Button><Button onClick={() => void importSelection()}>{t("confirmImport")}</Button></div></Dialog>
 </div>;
}

function MetaLeadRows({ lead, formName, checked, expanded, disabled, date, reason, onSelect, onExpand, onExclude }: {
  lead: MetaPreview;
  formName: string;
  checked: boolean;
  expanded: boolean;
  disabled: boolean;
  date: string;
  reason: string;
  onSelect: () => void;
  onExpand: () => void;
  onExclude: () => void;
}) {
  const t = useTranslations("Crm.meta");
  return <><tr><td className={cell}><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)]" aria-label={t("selectLead", { id: lead.id })} checked={checked} disabled={disabled || !lead.eligible} onChange={onSelect}/></td><td className={cell}>{date}</td><td className={cell}>{lead.client_name || "—"}</td><td className={cell}>{lead.phone || "—"}</td><td className={`${cell} break-all`}>{lead.email || "—"}</td><td className={cell}>{formName}</td>
  <td className={cell}>{t(`statuses.${lead.status}`)}{reason ? <p className="mt-1 max-w-60 text-xs leading-5 text-[var(--ui-text-muted)]">{reason}</p> : null}</td><td className={cell}><div className="flex flex-col items-start gap-1"><Button size="compact" variant="ghost" aria-expanded={expanded} aria-controls={`meta-answers-${lead.id}`} onClick={onExpand}><ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}/>{t("answers")}</Button>{lead.status !== "crm" && lead.reason !== "crm_lead_deleted" ? <Button size="compact" variant="ghost" disabled={disabled} onClick={onExclude}>{lead.reason === "admin_skipped" ? t("allowImport") : t("exclude")}</Button> : null}</div></td></tr>
  <tr><td colSpan={8} className="p-0"><div id={`meta-answers-${lead.id}`} aria-hidden={!expanded} inert={!expanded} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="min-h-0 overflow-hidden"><dl className="grid gap-3 bg-[var(--ui-surface-muted)] p-4 sm:grid-cols-2">{lead.field_data.map((answer, index) => <div key={`${answer.name}-${index}`}><dt className="text-xs text-[var(--ui-text-muted)]">{answer.name}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{answer.values.join(", ") || "—"}</dd></div>)}</dl></div></div></td></tr></>;
}
