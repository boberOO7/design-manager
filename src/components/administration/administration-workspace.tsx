"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { applyAdministrationDecision, formatAdministrationDateRange, getTimeOffRequestTypeLabel, type AdministrationModel, type AdministrationRequest } from "@/lib/administration";
import { getTimeOffStatusBadgeStyle } from "@/lib/semantic-styles";
import { updateTimeOffRequest } from "@/lib/time-off-request-client";
import { ChecklistTemplateManager } from "@/components/administration/checklist-template-manager";
import type { CalendarItem } from "@/types/calendar";

export function AdministrationWorkspace({ initialData, requestId }: { initialData: AdministrationModel; requestId?: string }) {
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
    if (action === "reject" && reviewNote && !window.confirm("Reject this request with the review note?")) return false;
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
        setError("The request could not be updated.");
        return false;
      }
      const item = result.item;
      update({ ...request, status: item.status, reviewNote: item.reviewNote, reviewedAt: item.reviewedAt, cancelledAt: null });
      return true;
    } catch { setError("The request could not be updated."); } finally {
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
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">Action queue</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--ui-text)]">Requests requiring action</h2>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)]">Oldest requests appear first.</p>
          </div>
          <span className="ui-numeric rounded-full border border-[var(--ui-warning-border)] bg-[var(--ui-warning-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-warning-text)]">{data.pendingRequests.length} pending</span>
        </div>
        {data.pendingRequests.length ? <ul className="divide-y divide-[var(--ui-border)]">{data.pendingRequests.map((request) => <PendingRequestRow key={request.id} request={request} isPending={pendingRequestId === request.id} onApprove={(trigger) => { void decide(request, "approve").then((success) => { if (!success) openRequest(request, trigger, true); }); }} onOpen={(trigger) => openRequest(request, trigger)} />)}</ul> : <EmptyState className="mt-4" compact title="No time-off requests require action." description="Upcoming availability and recent decisions remain available alongside this queue." />}
      </Panel>

      <div className="space-y-3">
        <Panel id="upcoming" className="border-[var(--ui-success-border)] p-4 sm:p-5">
          <SectionHeading accentClassName="border-[var(--ui-success-border)]" eyebrow="Availability" title="Upcoming availability" description="Approved team absence over the next 30 days." />
          {data.upcomingAbsences.length ? <ul className="mt-3 divide-y divide-[var(--ui-border)]">{data.upcomingAbsences.map((request) => <AvailabilityRow key={request.id} request={request} />)}</ul> : <EmptyState className="mt-3" compact title="No approved team absence" description="There is no approved absence in the next 30 days." />}
        </Panel>
        <Panel className="bg-[var(--ui-surface-muted)] p-4 shadow-none sm:p-5">
          <SectionHeading accentClassName="border-[var(--ui-border-strong)]" eyebrow="History" title="Recent decisions" description="The latest reviewed or cancelled time-off requests." />
          {data.recentDecisions.length ? <div className="mt-3 border-y border-[var(--ui-border)] md:max-h-72 md:overflow-y-auto md:pr-2" aria-label="Recent decisions history"><ul className="divide-y divide-[var(--ui-border)]">{data.recentDecisions.map((request) => <DecisionRow key={request.id} request={request} />)}</ul></div> : <EmptyState className="mt-3 bg-[var(--ui-surface)]" compact title="No recent time-off decisions." />}
        </Panel>
        <Panel className="p-4 shadow-none sm:p-5"><ChecklistTemplateManager studioId={data.studioId} templates={data.checklistTemplates} /></Panel>
      </div>
    </div>

    <Panel className="flex flex-col gap-3 p-4 shadow-none sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="text-sm font-semibold text-[var(--ui-text)]">Team & access</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{data.team.activeMembers} active members · {data.team.administrators} administrators{data.team.inactiveMembers ? ` · ${data.team.inactiveMembers} inactive` : ""}</p></div><Button asChild size="sm" variant="outline" className="min-h-11 self-start sm:self-auto"><Link href="/team">Open Team</Link></Button></Panel>
    <RequestDrawer error={error} isPending={pendingRequestId === selected?.id} onClose={() => { if (!pendingRequestId) setSelected(null); }} onDecision={decide} request={selected} returnFocusRef={triggerRef} />
  </div>;
}

function SectionHeading({ accentClassName, eyebrow, title, description }: { accentClassName: string; eyebrow: string; title: string; description: string }) {
  return <div className={`border-l-2 pl-3 ${accentClassName}`}><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[var(--ui-text)]">{title}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p></div>;
}

function PendingRequestRow({ request, isPending, onApprove, onOpen }: { request: AdministrationRequest; isPending: boolean; onApprove: (trigger: HTMLButtonElement) => void; onOpen: (trigger: HTMLButtonElement) => void }) {
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(10rem,0.8fr)_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold text-[var(--ui-text)]">{request.employeeName}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{statusStyle.label}</span></div><p className="mt-1 break-words text-sm text-[var(--ui-text-secondary)]">{getTimeOffRequestTypeLabel(request.requestType)} · {formatAdministrationDateRange(request)}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{request.employeeRole ?? "No job title"}</p></div><div className="min-w-0 text-sm text-[var(--ui-text-secondary)]"><p className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--ui-text-muted)]">Reason</p><p className="mt-1 whitespace-pre-wrap break-words">{request.privateNote || "No private note"}</p></div><div className="flex flex-wrap gap-2 md:justify-end"><Button size="sm" variant="outline" className="min-h-11" disabled={isPending} onClick={(event) => onOpen(event.currentTarget)}>View details</Button><Button size="sm" className="min-h-11" disabled={isPending} onClick={(event) => onApprove(event.currentTarget)}>{isPending ? "Updating…" : "Approve"}</Button><Button size="sm" variant="outline" className="min-h-11" disabled={isPending} onClick={(event) => onOpen(event.currentTarget)}>Reject</Button></div></li>;
}

function AvailabilityRow({ request }: { request: AdministrationRequest }) {
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <li className="flex gap-3 py-3"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${statusStyle.className}`} /><div className="min-w-0"><p className="break-words text-sm font-medium text-[var(--ui-text)]">{request.employeeName}</p><p className="mt-1 break-words text-sm text-[var(--ui-text-secondary)]">{getTimeOffRequestTypeLabel(request.requestType)} · {formatAdministrationDateRange(request)}</p></div></li>;
}

function DecisionRow({ request }: { request: AdministrationRequest }) {
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <li className="py-3"><p className="break-words text-sm font-medium text-[var(--ui-text-secondary)]">{request.employeeName}</p><p className="mt-1 break-words text-sm text-[var(--ui-text-muted)]">{getTimeOffRequestTypeLabel(request.requestType)} · {formatAdministrationDateRange(request)}</p><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{statusStyle.label}</span>{request.reviewerName ? <p className="break-words text-xs text-[var(--ui-text-muted)]">Reviewed by <span className="font-medium text-[var(--ui-text-secondary)]">{request.reviewerName}</span></p> : null}</div></li>;
}

function RequestDrawer({ error, isPending, onClose, onDecision, request, returnFocusRef }: { error: string; isPending: boolean; onClose: () => void; onDecision: (request: AdministrationRequest, action: "approve" | "reject", reviewNote?: string) => Promise<boolean>; request: AdministrationRequest | null; returnFocusRef: RefObject<HTMLButtonElement | null> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reviewNote, setReviewNote] = useState("");
  if (!request) return null;
  const statusStyle = getTimeOffStatusBadgeStyle(request.status);
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} returnFocusRef={returnFocusRef} title="Time-off request details" description={`${request.employeeName}'s time-off request`} className="w-full max-w-[34rem]"><header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">Time-off request</p><h2 className="mt-1 break-words text-xl font-semibold text-[var(--ui-text)]">{request.employeeName}</h2></div><Button ref={closeRef} size="sm" variant="ghost" className="size-11 shrink-0 p-0" disabled={isPending} onClick={onClose} aria-label="Close"><X className="size-4" /></Button></header><main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">{error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-[var(--ui-danger-text)]">{error}</p> : null}<dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-[var(--ui-text-muted)]">Request type</dt><dd className="mt-1 text-[var(--ui-text)]">{getTimeOffRequestTypeLabel(request.requestType)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">Status</dt><dd className="mt-1"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>{statusStyle.label}</span></dd></div><div><dt className="text-[var(--ui-text-muted)]">When</dt><dd className="mt-1 break-words text-[var(--ui-text)]">{formatAdministrationDateRange(request)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">Created</dt><dd className="mt-1 text-[var(--ui-text)]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</dd></div></dl><section><h3 className="font-semibold text-[var(--ui-text)]">Private note</h3><p className="mt-2 whitespace-pre-wrap break-words text-[var(--ui-text-secondary)]">{request.privateNote || "No private note"}</p></section>{request.status === "pending" ? <section className="space-y-3 border-t border-[var(--ui-border)] pt-5"><label className="grid gap-1.5 font-medium text-[var(--ui-text)]">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="min-h-24 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] p-3 font-normal text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" /></label><div className="flex flex-wrap gap-2"><Button disabled={isPending} onClick={() => void onDecision(request, "approve", reviewNote)}>{isPending ? "Updating…" : "Approve"}</Button><Button disabled={isPending} variant="outline" onClick={() => void onDecision(request, "reject", reviewNote)}>Reject</Button></div></section> : null}</main></Drawer>;
}

function isResult(value: unknown): value is { success: true; item: Extract<CalendarItem, { source: "time_off_request_admin" }> | null } { return typeof value === "object" && value !== null && "success" in value && value.success === true && "item" in value && (value.item === null || (typeof value.item === "object" && value.item !== null && "source" in value.item && value.item.source === "time_off_request_admin")); }
