"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, ChevronDown, ExternalLink, Info, LoaderCircle, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { instantToDateOnly } from "@/lib/calendar";
import { META_BATCH_SIZE, metaResponseSchema, type MetaFormSummary, type MetaJobState, type MetaPreview, type MetaResponse } from "@/lib/meta-leads/contracts";
const endpoint = "/api/integrations/meta-leads/manage";
const panel = "rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]";
const cell = "px-3 py-3 text-left align-top sm:px-4";
const badge = "inline-flex rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-2 py-0.5 text-xs font-medium leading-5";
const batches = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / META_BATCH_SIZE) }, (_, index) => ids.slice(index * META_BATCH_SIZE, (index + 1) * META_BATCH_SIZE));
const matchesDates = (lead: MetaPreview, from: string, to: string) => {
  const day = lead.submitted_at ? instantToDateOnly(lead.submitted_at) : "";
  return (!from || day >= from) && (!to || Boolean(day && day <= to));
};
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
  const [infoOpen,setInfoOpen]=useState(false),[previewFailed,setPreviewFailed]=useState(false);
  const currentForm = forms.find(item => item.form_id === formId);
  const date = (value: string | null, dateOnly = false) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: dateOnly ? "medium" : "short", ...(dateOnly ? {} : {timeStyle: "short" as const}), timeZone: "Europe/Kyiv" }).format(new Date(value)) : t("unknown");
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
  async function openPreview(id: string, resetView = true) {
    preview.current?.abort();
    const controller = new AbortController();
    preview.current = controller;
    setFormId(id);
    if (resetView) {
      setLeads([]);setSelected(new Set());setExpanded(new Set());
      setFrom("");setTo("");setResult(null);setPage(0);
    }
    setError(null);
    setPreviewFailed(false);
    setPreviewLoading(true);
    try {
      let cursor: string | null = null;
      const seen = new Set<string>(), collected = new Map<string, MetaPreview>();
      do {
        const response = await request({ operation: "preview", formId: id, ...(cursor ? { after: cursor } : {}) }, undefined, controller.signal);
        if (response.kind !== "preview")
          throw new Error("request_failed");
        response.leads.forEach(lead => collected.set(lead.id, lead));
        if (resetView) setLeads([...collected.values()]);
        cursor = response.next;
        if (cursor && seen.has(cursor))
          throw new Error("request_failed");
        if (cursor)
          seen.add(cursor);
      } while (cursor);
      if (controller.signal.aborted) return;
      const records = [...collected.values()];
      setLeads(records);
      if (!resetView) {
        const eligibleIds = new Set(records.filter(lead => lead.eligible).map(lead => lead.id));
        setSelected(old => new Set([...old].filter(id => eligibleIds.has(id))));
        setExpanded(old => new Set([...old].filter(id => collected.has(id))));
        const lastPage = Math.max(0, Math.ceil(records.filter(lead => matchesDates(lead, from, to)).length / META_BATCH_SIZE) - 1);
        setPage(old => Math.min(old, lastPage));
      }
    }
    catch (error) {
      if (!controller.signal.aborted) {
        setPreviewFailed(true);
        setError(error instanceof Error ? error.message : "request_failed");
      }
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
      if (formId === item.form_id) await openPreview(item.form_id, false);
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
      // The job may have completed while this request was in flight. Read the
      // authoritative state instead of assuming exclusion changed the record.
      await openPreview(formId, false);
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
      await openPreview(formId, false);
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
  const filtered = leads.filter(lead => matchesDates(lead, from, to));
  const eligible = filtered.filter(lead => lead.eligible), shown = filtered.slice(page * META_BATCH_SIZE, (page + 1) * META_BATCH_SIZE);
  const allSelected = eligible.length > 0 && eligible.every(lead => selected.has(lead.id));
  const interactionDisabled = busy || importing || previewLoading;
  const canSelect = Boolean(currentForm?.sync_enabled) && !previewFailed;
  const refresh = () => { void loadForms(); if (formId) void openPreview(formId, false); };

  return <div className="min-w-0 space-y-4">
    <div className={`${panel} px-3 py-2 sm:px-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-[var(--ui-text-secondary)]">
          {diagnostics ? <><span>{t("enabledCount", {count:diagnostics.enabledForms})}</span><span>{t("pendingCount", {count:diagnostics.pending})}</span><span className={diagnostics.failed ? "text-[var(--ui-danger-text)]" : undefined}>{t("failedCount", {count:diagnostics.failed})}</span></> : <span>{t("loadingForms")}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="compact" aria-expanded={infoOpen} aria-controls="meta-sync-info" onClick={() => setInfoOpen(!infoOpen)}><Info className="size-4" aria-hidden="true"/>{t("syncInfo")}</Button>
          <Button variant="outline" size="compact" onClick={refresh} disabled={loading || interactionDisabled}><RefreshCw className={`size-4 ${loading || previewLoading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true"/>{t("refresh")}</Button>
        </div>
      </div>
      <div id="meta-sync-info" aria-hidden={!infoOpen} inert={!infoOpen} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${infoOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden"><div className="mt-3 grid gap-4 border-t border-[var(--ui-border)] py-3 text-sm leading-6 text-[var(--ui-text-muted)] md:grid-cols-2">
          <div><p className="font-medium text-[var(--ui-text)]">{t("syncRulesTitle")}</p><p>{t("enableHint")}</p><p className="mt-2">{t("selectionHint")}</p></div>
          <div><p className="font-medium text-[var(--ui-text)]">{t("metaLimitsTitle")}</p><p>{t("formHint")}</p><p className="mt-2">{t("adUsageUnknown")}</p></div>
          <div className="md:col-span-2"><p>{diagnostics?.manualAvailable ? t("manualAvailable") : t("manualUnavailable")} · {t("lastSuccess", {date:date(diagnostics?.lastSuccess ?? null)})}</p><p>{t("deliveryHint")}</p></div>
        </div></div>
      </div>
    </div>
    {error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error === "permission" ? t("permission") : error === "form_disabled" ? t("disabledHint") : previewFailed ? t("previewFailed") : t("requestFailed")}</p> : null}
    {diagnostics?.graphError ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("graphUnavailable")} {reason(diagnostics.graphError)}</p> : null}
    {formId ? <section className="min-w-0 space-y-3" aria-labelledby="meta-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="compact" disabled={busy || importing} onClick={() => { preview.current?.abort(); setFormId(null); setLeads([]); setSelected(new Set()); setResult(null); setPreviewLoading(false); setPreviewFailed(false); setError(null); }}><ArrowLeft className="size-4" aria-hidden="true"/>{t("forms")}</Button>
          <div className="min-w-0"><h2 id="meta-preview-title" className="break-words text-base font-semibold text-[var(--ui-text)]">{currentForm?.name || formId}</h2><p className="text-xs text-[var(--ui-text-muted)]">{t("formId", {id:formId})}</p></div>
        </div>
        {currentForm?.sync_enabled ? <FormSyncSwitch form={currentForm} disabled={loading || interactionDisabled} onToggle={() => void toggle(currentForm)}/> : null}
      </div>
      {currentForm && !currentForm.sync_enabled ? <div className={`${panel} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
        <div className="max-w-2xl"><h3 className="text-sm font-semibold">{t("activationTitle")}</h3><p className="mt-1 text-sm leading-5 text-[var(--ui-text-muted)]">{t("activationHint")}</p></div>
        <Button size="compact" disabled={loading || interactionDisabled} onClick={() => void toggle(currentForm)}>{busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/> : null}{t(busy ? "saving" : "enableForm")}</Button>
      </div> : null}
      {importing || result ? <div role="status" aria-live="polite" className={`${panel} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
        <div className="min-w-0"><h3 className="flex items-center gap-2 text-sm font-semibold">{importing ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/> : null}{t(importing ? "importing" : "result")}</h3>{result ? <p className="mt-1 text-sm tabular-nums text-[var(--ui-text-secondary)]">{t("resultCounts", result)}</p> : null}{result?.pending ? <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--ui-text-muted)]">{t("pendingHint")}</p> : null}</div>
        {importing ? <Button variant="outline" size="compact" onClick={() => {operation.current?.abort();setImporting(false);}}>{t("stopWaiting")}</Button> : null}
      </div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <FormField as="div" label={t("dateFrom")} className="w-40"><DatePicker placeholder={t("anyDate")} aria-label={t("dateFrom")} value={from} max={to || undefined} onValueChange={value => {setFrom(value);setSelected(new Set());setPage(0);}} locale={locale} disabled={interactionDisabled}/></FormField>
          <FormField as="div" label={t("dateTo")} className="w-40"><DatePicker placeholder={t("anyDate")} aria-label={t("dateTo")} value={to} min={from || undefined} onValueChange={value => {setTo(value);setSelected(new Set());setPage(0);}} locale={locale} disabled={interactionDisabled}/></FormField>
          <p className="pb-3 text-xs text-[var(--ui-text-muted)]">{t("kyivDates")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm tabular-nums text-[var(--ui-text-muted)]">{t("availableCount", {count:filtered.length})}</span>
          <Button variant="outline" size="compact" disabled={interactionDisabled || !canSelect || !eligible.length} onClick={() => setSelected(old => {const next=new Set(old);eligible.forEach(lead => allSelected ? next.delete(lead.id) : next.add(lead.id));return next;})}>{allSelected ? t("clearSelection") : t("selectAll")}</Button>
          {currentForm?.sync_enabled ? <Button size="compact" disabled={!selected.size || interactionDisabled || previewFailed || !diagnostics?.manualAvailable} onClick={() => void prepareImport()}>{busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/> : null}{t("importSelected", {count:selected.size})}</Button> : null}
        </div>
      </div>
      <div className={`${panel} overflow-x-auto`} aria-busy={previewLoading}>
        <table className="w-full min-w-[820px] text-sm"><caption className="sr-only">{t("previewTable", {name:currentForm?.name || formId})}</caption><thead className="bg-[var(--ui-surface-muted)] text-xs text-[var(--ui-text-muted)]"><tr>{[t("selection"),t("submitted"),t("name"),t("phone"),t("email"),t("status"),t("actions")].map(label => <th key={label} scope="col" className={`${cell} py-2 font-medium`}>{label}</th>)}</tr></thead><tbody>
          {shown.map(lead => <MetaLeadRows key={lead.id} lead={lead} checked={selected.has(lead.id)} expanded={expanded.has(lead.id)} disabled={interactionDisabled} selectable={canSelect} date={date(lead.submitted_at)} reason={reason(lead.reason)} onSelect={() => setSelected(old => {const next=new Set(old);next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);return next;})} onExpand={() => setExpanded(old => {const next=new Set(old);next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);return next;})} onExclude={() => void exclude(lead)}/>)}
        </tbody></table>
        {!filtered.length && !previewLoading ? <p className="p-6 text-sm text-[var(--ui-text-muted)]">{t(from || to ? "noFilteredLeads" : "noLeads")}</p> : null}
        {previewLoading ? <p role="status" className="flex items-center gap-2 p-4 text-sm"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>{t("loadingPreview")}</p> : null}
      </div>
      {filtered.length > META_BATCH_SIZE ? <div className="flex flex-wrap items-center justify-end gap-2"><span className="mr-auto text-sm text-[var(--ui-text-muted)]">{t("page", {page:page+1,count:Math.ceil(filtered.length/META_BATCH_SIZE)})}</span><Button variant="outline" size="compact" disabled={page===0} onClick={() => setPage(old=>old-1)}>{t("previous")}</Button><Button variant="outline" size="compact" disabled={(page+1)*META_BATCH_SIZE>=filtered.length} onClick={() => setPage(old=>old+1)}>{t("next")}</Button></div> : null}
    </section> : <section className="min-w-0 space-y-3" aria-labelledby="meta-forms-title">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="meta-forms-title" className="text-base font-semibold">{t("formsTitle")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("formsSubtitle")}</p></div><Button asChild variant="ghost" size="compact"><a href="https://business.facebook.com/" target="_blank" rel="noreferrer">{t("businessSuite")}<ExternalLink className="size-3.5" aria-hidden="true"/></a></Button></div>
      <div className={`${panel} overflow-x-auto`} aria-busy={loading}>
        <table className="w-full min-w-[960px] text-sm"><caption className="sr-only">{t("formsTitle")}</caption><thead className="bg-[var(--ui-surface-muted)] text-xs text-[var(--ui-text-muted)]"><tr>{[t("form"),t("metaStatus"),t("created"),t("lifetimeCount"),t("available"),t("lastLead"),t("imported"),t("sync")].map(label => <th className={`${cell} py-2 font-medium`} key={label} scope="col">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--ui-border)]">
          {forms.map(item => <tr key={item.form_id} className="transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] motion-reduce:transition-none">
            <td className={`${cell} min-w-48 max-w-72`}><button className="cursor-pointer break-words rounded-sm text-left font-semibold underline decoration-[var(--ui-border-strong)] underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-60" disabled={busy} onClick={() => void openPreview(item.form_id)}>{item.name || item.form_id}</button><p className="mt-1 text-xs tabular-nums text-[var(--ui-text-muted)]">{item.form_id}</p></td>
            <td className={cell}><span className={badge}>{item.meta_status || t("unknown")}</span></td>
            <td className={`${cell} whitespace-nowrap text-[var(--ui-text-secondary)]`}>{date(item.meta_created_at, true)}</td><td className={`${cell} tabular-nums`}>{item.lifetime_leads_count ?? "—"}</td>
            <td className={`${cell} tabular-nums`}>{availability[item.form_id]?.loading ? t("checking") : availability[item.form_id]?.error ? t("checkFailed") : availability[item.form_id]?.count ?? "—"}</td>
            <td className={`${cell} whitespace-nowrap text-[var(--ui-text-secondary)]`}>{availability[item.form_id]?.loading ? t("checking") : availability[item.form_id]?.error ? t("checkFailed") : availability[item.form_id]?.latest ? date(availability[item.form_id].latest) : "—"}</td>
            <td className={`${cell} tabular-nums`}>{item.imported}{item.pending || item.failed ? <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("formJobs", {pending:item.pending,failed:item.failed})}</p> : null}</td>
            <td className={`${cell} py-1.5`}><FormSyncSwitch form={item} disabled={loading || busy || importing} onToggle={() => void toggle(item)}/></td>
          </tr>)}
        </tbody></table>
        {loading ? <p role="status" className="p-4 text-sm">{t("loadingForms")}</p> : !forms.length ? <p className="p-6 text-sm text-[var(--ui-text-muted)]">{t("noForms")}</p> : null}
      </div>
    </section>}
    <Dialog isOpen={Boolean(plan)} onRequestClose={() => setPlan(null)} title={t("confirmTitle")} closeLabel={t("cancel")}>
      <p className="text-sm leading-6">{t("confirmCounts", {count:plan?.ids.length ?? 0,existing:plan?.existing ?? 0,skipped:plan?.skipped ?? 0})}</p><p className="mt-3 text-sm text-[var(--ui-text-muted)]">{t("confirmHint")}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setPlan(null)}>{t("cancel")}</Button><Button onClick={() => void importSelection()}>{t("confirmImport")}</Button></div>
    </Dialog>
  </div>;
}

function FormSyncSwitch({form,disabled,onToggle}:{form:MetaFormSummary;disabled:boolean;onToggle:()=>void}) {
  const t=useTranslations("Crm.meta");
  return <BinarySwitch hideLabel label={`${t("sync")} ${form.name || form.form_id}`} emptyLabel={t("disabled")} options={["off","on"]} value={form.sync_enabled ? "on" : "off"} optionLabel={value=>t(value==="on" ? "enabled" : "disabled")} disabled={disabled} onChange={onToggle}/>;
}

function MetaLeadRows({lead,checked,expanded,disabled,selectable,date,reason,onSelect,onExpand,onExclude}:{lead:MetaPreview;checked:boolean;expanded:boolean;disabled:boolean;selectable:boolean;date:string;reason:string;onSelect:()=>void;onExpand:()=>void;onExclude:()=>void}) {
  const t=useTranslations("Crm.meta");
  const [menuOpen,setMenuOpen]=useState(false);
  const canExclude=lead.status!=="crm" && lead.reason!=="crm_lead_deleted";
  return <>
    <tr className="border-t border-[var(--ui-border)] transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] motion-reduce:transition-none">
      <td className="w-12 px-2 py-1 align-top"><label className="flex min-h-11 min-w-9 items-center justify-center rounded-[var(--ui-radius-control)] has-enabled:cursor-pointer has-enabled:hover:bg-[var(--ui-surface-muted)]"><input type="checkbox" className="size-4 accent-[var(--ui-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed" aria-label={t("selectLead", {id:lead.id})} checked={checked} disabled={disabled || !selectable || !lead.eligible} onChange={onSelect}/></label></td>
      <td className={`${cell} whitespace-nowrap tabular-nums text-[var(--ui-text-secondary)]`}>{date}</td><td className={`${cell} max-w-60 break-words font-medium`}>{lead.client_name || "—"}</td><td className={`${cell} whitespace-nowrap tabular-nums`}>{lead.phone || "—"}</td><td className={`${cell} max-w-64 [overflow-wrap:anywhere]`}>{lead.email || "—"}</td>
      <td className={cell}><span className={`${badge} ${lead.status==="error" || lead.status==="incomplete" ? "text-[var(--ui-danger-text)]" : ""}`}>{t(`statuses.${lead.status}`)}</span>{reason ? <p className="mt-1 max-w-60 text-xs leading-5 text-[var(--ui-text-muted)]">{reason}</p> : null}</td>
      <td className="px-3 py-1.5 align-top"><div className="flex items-center justify-end gap-1">
        <Button size="compact" variant="ghost" aria-expanded={expanded} aria-controls={`meta-answers-${lead.id}`} onClick={onExpand}><ChevronDown className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true"/>{t("answers")}</Button>
        {canExclude ? <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}><Popover.Trigger asChild><Button variant="ghost" size="compact" className="size-11 shrink-0 p-0 sm:size-9" aria-label={t("leadActions", {id:lead.id})} disabled={disabled}><MoreHorizontal className="size-4" aria-hidden="true"/></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} collisionPadding={8} className="z-50 max-w-[calc(100vw-2rem)] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]"><button type="button" onClick={()=>{setMenuOpen(false);onExclude();}} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-text)] outline-none transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:bg-[var(--ui-surface-muted)]">{lead.reason==="admin_skipped" ? t("allowImport") : t("exclude")}</button></Popover.Content></Popover.Portal></Popover.Root> : null}
      </div></td>
    </tr>
    <tr><td colSpan={7} className="p-0"><div id={`meta-answers-${lead.id}`} aria-hidden={!expanded} inert={!expanded} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="min-h-0 overflow-hidden"><dl className="grid gap-3 bg-[var(--ui-surface-muted)] p-4 sm:grid-cols-2 xl:grid-cols-3">
      {lead.field_data.map((answer,index)=><div key={`${answer.name}-${index}`} className="min-w-0"><dt className="text-xs text-[var(--ui-text-muted)]">{answer.name}</dt><dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{answer.values.join(", ") || "—"}</dd></div>)}
      {lead.custom_disclaimer_responses?.map((answer,index)=><div key={`disclaimer-${index}`} className="min-w-0"><dt className="text-xs text-[var(--ui-text-muted)]">{t("disclaimerAnswer", {key:answer.checkbox_key})}</dt><dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{String(answer.is_checked)}</dd></div>)}
    </dl></div></div></td></tr>
  </>;
}
