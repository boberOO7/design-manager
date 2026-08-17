"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { applyAdministrationDecision, formatAdministrationDateRange, type AdministrationModel, type AdministrationRequest } from "@/lib/administration";
import { getTimeOffStatusBadgeStyle } from "@/lib/semantic-styles";
import { updateTimeOffRequest, type TimeOffMutationResult } from "@/lib/time-off-request-client";
import { ChecklistTemplateManager } from "@/components/administration/checklist-template-manager";
import type { CalendarItem } from "@/types/calendar";

const typeKey = (type: AdministrationRequest["requestType"]) => ({ vacation: "vacation", day_off: "dayOff", medical_appointment: "medicalAppointment", sick_leave: "sickLeave", other: "other" } as const)[type];

export function AdministrationWorkspace({ initialData, requestId }: { initialData: AdministrationModel; requestId?: string }) {
  const t = useTranslations("Administration");
  const timeOff = useTranslations("TimeOff");
  const availability = useTranslations("Availability");
  const calendar = useTranslations("Calendar");
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mutationInFlight = useRef(false);
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState<AdministrationRequest | null>(() => requestId ? [...initialData.pendingRequests, ...initialData.upcomingAbsences, ...initialData.recentDecisions].find((item) => item.id === requestId) ?? null : null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function openRequest(request: AdministrationRequest, trigger?: HTMLButtonElement, preserveError = false) {
    if (trigger) triggerRef.current = trigger;
    if (!preserveError) setError("");
    setSelected(request);
  }

  function update(request: AdministrationRequest) {
    setData((current) => applyAdministrationDecision(current, request));
    setSelected(null);
    router.refresh();
  }

  async function decide(request: AdministrationRequest, action: "approve" | "reject", reviewNote = "") {
    if (mutationInFlight.current) return false;
    if (action === "reject" && reviewNote && !window.confirm(timeOff("rejectConfirm"))) return false;
    mutationInFlight.current = true;
    setPendingRequestId(request.id);
    setError("");
    try {
      const result = await updateTimeOffRequest(request.id, action, reviewNote);
      if (result.requiresRefresh) {
        setSelected(null);
        router.refresh();
        return true;
      }
      if (!isResult(result) || !result.item) {
        setError(timeOff("requestUpdateFailed"));
        return false;
      }
      const item = result.item;
      const updated = { ...request, status: item.status, reviewNote: item.reviewNote, reviewedAt: item.reviewedAt, cancelledAt: null, approvalCount: result.approvalCount ?? request.approvalCount, requiredApprovalCount: result.requiredApprovalCount ?? request.requiredApprovalCount, hasCurrentAdminApproved: result.hasCurrentAdminApproved ?? request.hasCurrentAdminApproved };
      if (updated.status === "pending") {
        setData((current) => ({ ...current, pendingRequests: current.pendingRequests.map((candidate) => candidate.id === updated.id ? updated : candidate) }));
        setSelected(null);
        router.refresh();
        return true;
      }
      update(updated);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : timeOff("requestUpdateFailed")); } finally {
      mutationInFlight.current = false;
      setPendingRequestId(null);
    }
    return false;
  }

  return <div className="space-y-6">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)] xl:items-start">
      <Panel id="requests" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ui-border)] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{t("actionQueue")}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--ui-text)]">{t("requestsRequiringAction")}</h2>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("oldestFirst")}</p>
          </div>
          <span className="ui-numeric rounded-full border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-warning-text)]">{calendar("pending", { count: data.pendingRequests.length })}</span>
        </div>
        {data.pendingRequests.length ? <ul className="divide-y divide-[var(--ui-border)]">{data.pendingRequests.map((request) => <PendingRequestRow key={request.id} activeAdminCount={data.team.administrators} request={request} isPending={pendingRequestId === request.id} onApprove={(trigger) => { void decide(request, "approve").then((success) => { if (!success) openRequest(request, trigger, true); }); }} onOpen={(trigger) => openRequest(request, trigger)} />)}</ul> : <EmptyState className="mt-4" compact title={t("noRequests")} description={t("noRequestsDescription")} />}
      </Panel>

      <div className="space-y-3">
        <Panel id="upcoming" className="border-[var(--ui-success-border)] p-4 sm:p-5">
          <SectionHeading accentClassName="border-[var(--ui-success-border)]" eyebrow={availability("title")} title={availability("upcoming")} description={availability("description")} />
          {data.upcomingAbsences.length ? <ul className="mt-3 divide-y divide-[var(--ui-border)]">{data.upcomingAbsences.map((request) => <AvailabilityRow key={request.id} request={request} />)}</ul> : <EmptyState className="mt-3" compact title={availability("noApproved")} description={availability("noApprovedDescription")} />}
        </Panel>
        <Panel className="bg-[var(--ui-surface-muted)] p-4 shadow-none sm:p-5">
          <SectionHeading accentClassName="border-[var(--ui-border-strong)]" eyebrow={t("history")} title={t("recentDecisions")} description={t("recentDescription")} />
          {data.recentDecisions.length ? <div className="mt-3 border-y border-[var(--ui-border)] md:max-h-72 md:overflow-y-auto md:pr-2" aria-label={t("recentHistory")}><ul className="divide-y divide-[var(--ui-border)]">{data.recentDecisions.map((request) => <DecisionRow key={request.id} request={request} />)}</ul></div> : <EmptyState className="mt-3 bg-[var(--ui-surface)]" compact title={t("noRecent")} />}
        </Panel>
        <Panel className="p-4 shadow-none sm:p-5"><ChecklistTemplateManager studioId={data.studioId} templates={data.checklistTemplates} /></Panel>
      </div>
    </div>

    <Panel className="flex flex-col gap-3 p-4 shadow-none sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="text-sm font-semibold text-[var(--ui-text)]">{t("teamAccess")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("teamAccessSummary", { active: data.team.activeMembers, admins: data.team.administrators, inactive: data.team.inactiveMembers })}</p></div><Button asChild size="sm" variant="outline" className="min-h-11 self-start sm:self-auto"><Link href="/team">{t("openTeam")}</Link></Button></Panel>
    <RequestDrawer error={error} isPending={pendingRequestId === selected?.id} onClose={() => { if (!pendingRequestId) setSelected(null); }} onDecision={decide} request={selected} returnFocusRef={triggerRef} />
  </div>;
}

function SectionHeading({ accentClassName, eyebrow, title, description }: { accentClassName: string; eyebrow: string; title: string; description: string }) {
  return <div className={`border-l-2 pl-3 ${accentClassName}`}><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[var(--ui-text)]">{title}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p></div>;
}

function PendingRequestRow({ activeAdminCount, request, isPending, onApprove, onOpen }: { activeAdminCount: number; request: AdministrationRequest; isPending: boolean; onApprove: (trigger: HTMLButtonElement) => void; onOpen: (trigger: HTMLButtonElement) => void }) {
  const timeOff = useTranslations("TimeOff"); const administration = useTranslations("Administration"); const locale = useLocale();
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  const thresholdUnavailable = activeAdminCount < request.requiredApprovalCount;
  const approveDisabled = isPending || request.hasCurrentAdminApproved || thresholdUnavailable;
  return <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(10rem,0.8fr)_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold text-[var(--ui-text)]">{request.employeeName}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{request.status === "pending" ? timeOff("request") : statusStyle.label}</span></div><p className="mt-1 break-words text-sm text-[var(--ui-text-secondary)]">{timeOff(typeKey(request.requestType))} · {formatAdministrationDateRange(request, locale)}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{request.employeeRole ?? administration("noJobTitle")}</p>{request.requiredApprovalCount > 1 ? <p className="mt-2 text-xs font-medium text-[var(--ui-text-secondary)]">{administration("approvalProgress", { approved: request.approvalCount, required: request.requiredApprovalCount })}</p> : null}{thresholdUnavailable ? <p className="mt-1 text-xs font-medium text-[var(--ui-danger-text)]">{administration("insufficientApprovers", { active: activeAdminCount, required: request.requiredApprovalCount })}</p> : null}</div><div className="min-w-0 text-sm text-[var(--ui-text-secondary)]"><p className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--ui-text-muted)]">{administration("reason")}</p><p className="mt-1 whitespace-pre-wrap break-words">{request.privateNote || timeOff("noPrivateNote")}</p></div><div className="flex flex-wrap gap-2 md:justify-end"><Button size="sm" variant="outline" className="min-h-11" disabled={isPending} onClick={(event) => onOpen(event.currentTarget)}>{timeOff("viewDetails")}</Button><Button size="sm" className="min-h-11" disabled={approveDisabled} onClick={(event) => onApprove(event.currentTarget)}>{isPending ? timeOff("updating") : request.hasCurrentAdminApproved ? administration("alreadyApproved") : timeOff("approve")}</Button><Button size="sm" variant="outline" className="min-h-11" disabled={isPending} onClick={(event) => onOpen(event.currentTarget)}>{timeOff("reject")}</Button></div></li>;
}

function AvailabilityRow({ request }: { request: AdministrationRequest }) {
  const timeOff = useTranslations("TimeOff"); const locale = useLocale();
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <li className="flex gap-3 py-3"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${statusStyle.className}`} /><div className="min-w-0"><p className="break-words text-sm font-medium text-[var(--ui-text)]">{request.employeeName}</p><p className="mt-1 break-words text-sm text-[var(--ui-text-secondary)]">{timeOff(typeKey(request.requestType))} · {formatAdministrationDateRange(request, locale)}</p></div></li>;
}

function DecisionRow({ request }: { request: AdministrationRequest }) {
  const timeOff = useTranslations("TimeOff"); const administration = useTranslations("Administration"); const locale = useLocale();
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <li className="py-3"><p className="break-words text-sm font-medium text-[var(--ui-text-secondary)]">{request.employeeName}</p><p className="mt-1 break-words text-sm text-[var(--ui-text-muted)]">{timeOff(typeKey(request.requestType))} · {formatAdministrationDateRange(request, locale)}</p><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{statusStyle.label}</span>{request.requiredApprovalCount > 1 && request.approvalCount > 0 ? <span className="text-xs font-medium text-[var(--ui-text-secondary)]">{administration("approvalProgress", { approved: request.approvalCount, required: request.requiredApprovalCount })}</span> : null}{request.reviewerName ? <p className="break-words text-xs text-[var(--ui-text-muted)]">{administration("reviewedBy", { name: request.reviewerName })}</p> : null}</div></li>;
}

function RequestDrawer({ error, isPending, onClose, onDecision, request, returnFocusRef }: { error: string; isPending: boolean; onClose: () => void; onDecision: (request: AdministrationRequest, action: "approve" | "reject", reviewNote?: string) => Promise<boolean>; request: AdministrationRequest | null; returnFocusRef: RefObject<HTMLButtonElement | null> }) {
  const timeOff = useTranslations("TimeOff"); const locale = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reviewNote, setReviewNote] = useState("");
  if (!request) return null;
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} returnFocusRef={returnFocusRef} title={timeOff("requestDetails")} description={request.employeeName} className="w-full max-w-[34rem]"><header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{timeOff("request")}</p><h2 className="mt-1 break-words text-xl font-semibold text-[var(--ui-text)]">{request.employeeName}</h2></div><Button ref={closeRef} size="sm" variant="ghost" className="size-11 shrink-0 p-0" disabled={isPending} onClick={onClose} aria-label={timeOff("close")}><X className="size-4" /></Button></header><main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">{error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-[var(--ui-danger-text)]">{error}</p> : null}<dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-[var(--ui-text-muted)]">{timeOff("requestType")}</dt><dd className="mt-1 text-[var(--ui-text)]">{timeOff(typeKey(request.requestType))}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("status")}</dt><dd className="mt-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{statusStyle.label}</span></dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("when")}</dt><dd className="mt-1 break-words text-[var(--ui-text)]">{formatAdministrationDateRange(request, locale)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("created")}</dt><dd className="mt-1 text-[var(--ui-text)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</dd></div></dl><section><h3 className="font-semibold text-[var(--ui-text)]">{timeOff("privateNote")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-[var(--ui-text-secondary)]">{request.privateNote || timeOff("noPrivateNote")}</p></section>{request.status === "pending" ? <section className="space-y-3 border-t border-[var(--ui-border)] pt-5"><label className="grid gap-1.5 font-medium text-[var(--ui-text)]">{timeOff("reviewNote")}<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="min-h-24 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] p-3 font-normal text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><div className="flex flex-wrap gap-2"><Button disabled={isPending} onClick={() => void onDecision(request, "approve", reviewNote)}>{isPending ? timeOff("updating") : timeOff("approve")}</Button><Button disabled={isPending} variant="outline" onClick={() => void onDecision(request, "reject", reviewNote)}>{timeOff("reject")}</Button></div></section> : null}</main></Drawer>;
}

function isResult(value: unknown): value is TimeOffMutationResult & { item: Extract<CalendarItem, { source: "time_off_request_admin" }> | null } { return typeof value === "object" && value !== null && "success" in value && value.success === true && "item" in value && (value.item === null || (typeof value.item === "object" && value.item !== null && "source" in value.item && value.item.source === "time_off_request_admin")); }
