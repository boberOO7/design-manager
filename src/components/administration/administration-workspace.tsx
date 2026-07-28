"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyAdministrationDecision, formatAdministrationDateRange, type AdministrationModel, type AdministrationRequest } from "@/lib/administration";
import { updateTimeOffRequest } from "@/lib/time-off-request-client";
import type { CalendarItem } from "@/types/calendar";

const labels = { vacation: "Vacation", day_off: "Day off", medical_appointment: "Medical appointment", sick_leave: "Sick leave", other: "Other" } as const;

function statusLabel(status: AdministrationRequest["status"]) { return status[0].toUpperCase() + status.slice(1); }
export function AdministrationWorkspace({ initialData, requestId }: { initialData: AdministrationModel; requestId?: string }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState<AdministrationRequest | null>(() => requestId ? [...initialData.pendingRequests, ...initialData.upcomingAbsences, ...initialData.recentDecisions].find((item) => item.id === requestId) ?? null : null);
  function update(request: AdministrationRequest) { setData((current) => applyAdministrationDecision(current, request)); setSelected(null); router.refresh(); }
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3">
      <Summary title="Pending requests" value={data.pendingRequests.length} href="#requests" />
      <Summary title="Upcoming absences" value={data.upcomingAbsences.length} href="#upcoming" />
      <Summary title="Active members" value={data.team.activeMembers} href="/team" />
    </div>
    <section id="requests" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-4"><div><h2 className="text-lg font-semibold">Requests requiring action</h2><p className="mt-1 text-sm text-stone-500">Oldest requests appear first.</p></div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-900">{data.pendingRequests.length} pending</span></div>
      {data.pendingRequests.length ? <div className="mt-4 divide-y divide-stone-100">{data.pendingRequests.map((request) => <RequestRow key={request.id} request={request} actionLabel="View details" onOpen={() => setSelected(request)} />)}</div> : <Empty text="No time-off requests require action." />}
    </section>
    <div className="grid gap-6 xl:grid-cols-2">
      <section id="upcoming" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Upcoming availability</h2><p className="mt-1 text-sm text-stone-500">Approved team absence over the next 30 days.</p>{data.upcomingAbsences.length ? <div className="mt-4 divide-y divide-stone-100">{data.upcomingAbsences.map((request) => <RequestRow key={request.id} request={request} actionLabel="View details" onOpen={() => setSelected(request)} />)}</div> : <div className="mt-4"><Empty text="No approved team absence in the next 30 days." /></div>}</section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Recent decisions</h2><p className="mt-1 text-sm text-stone-500">The latest reviewed or cancelled time-off requests.</p>{data.recentDecisions.length ? <div className="mt-4 divide-y divide-stone-100">{data.recentDecisions.map((request) => <RequestRow key={request.id} request={request} actionLabel="View details" onOpen={() => setSelected(request)} detail={request.reviewerName ? `by ${request.reviewerName}` : undefined} />)}</div> : <div className="mt-4"><Empty text="No recent time-off decisions." /></div>}</section>
    </div>
    <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Team & access</h2><p className="mt-1 text-sm text-stone-500">{data.team.activeMembers} active members · {data.team.administrators} administrators{data.team.inactiveMembers ? ` · ${data.team.inactiveMembers} inactive` : ""}</p></div><Button asChild variant="outline"><Link href="/team">Open Team</Link></Button></section>
    {selected ? <RequestDrawer request={selected} onClose={() => setSelected(null)} onUpdated={update} onReconcile={() => { setSelected(null); router.refresh(); }} /> : null}
  </div>;
}

function Summary({ title, value, href }: { title: string; value: number; href: string }) { return <Link href={href} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:bg-stone-50"><p className="text-sm font-medium text-stone-500">{title}</p><p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p></Link>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center text-sm text-stone-500">{text}</p>; }
function RequestRow({ request, onOpen, actionLabel, detail }: { request: AdministrationRequest; onOpen: () => void; actionLabel: string; detail?: string }) { return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-stone-900">{request.employeeName}</p><span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">{statusLabel(request.status)}</span></div><p className="mt-1 text-sm text-stone-600">{labels[request.requestType]} · {formatAdministrationDateRange(request)}</p><p className="mt-1 text-xs text-stone-500">{request.employeeRole ?? "No job title"}{detail ? ` · ${detail}` : ""}</p></div><Button size="sm" variant="outline" onClick={onOpen}>{actionLabel}</Button></div>; }

function RequestDrawer({ request, onClose, onUpdated, onReconcile }: { request: AdministrationRequest; onClose: () => void; onUpdated: (request: AdministrationRequest) => void; onReconcile: () => void }) {
  const [reviewNote, setReviewNote] = useState(request.reviewNote ?? ""); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const mutationInFlight = useRef(false);
  async function action(action: "approve" | "reject") { if (mutationInFlight.current) return; if (action === "reject" && reviewNote && !window.confirm("Reject this request with the review note?")) return; mutationInFlight.current = true; setPending(true); setError(""); try { const result = await updateTimeOffRequest(request.id, action, reviewNote); if (result.requiresRefresh) { onReconcile(); return; } if (!isResult(result) || !result.item) { setError("The request could not be updated."); return; } const item = result.item; onUpdated({ ...request, status: item.status, reviewNote: item.reviewNote, reviewedAt: item.reviewedAt, cancelledAt: null }); } catch { setError("The request could not be updated."); } finally { mutationInFlight.current = false; setPending(false); } }
  return <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><div role="dialog" aria-modal="true" aria-label="Time-off request details" className="flex h-dvh w-full max-w-[34rem] flex-col bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-stone-100 px-5 py-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">Time-off request</p><h2 className="mt-1 text-xl font-semibold">{request.employeeName}</h2></div><Button size="sm" variant="ghost" disabled={pending} onClick={onClose} aria-label="Close"><X className="size-4" /></Button></header><main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">{error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p> : null}<dl className="grid grid-cols-2 gap-4"><div><dt className="text-stone-500">Request type</dt><dd>{labels[request.requestType]}</dd></div><div><dt className="text-stone-500">Status</dt><dd>{statusLabel(request.status)}</dd></div><div><dt className="text-stone-500">When</dt><dd>{formatAdministrationDateRange(request)}</dd></div><div><dt className="text-stone-500">Created</dt><dd>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</dd></div></dl><section><h3 className="font-semibold">Private note</h3><p className="mt-2 whitespace-pre-wrap text-stone-600">{request.privateNote || "No private note"}</p></section>{request.status === "pending" ? <section className="space-y-3 border-t border-stone-100 pt-5"><label className="grid gap-1.5 font-medium">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="rounded-xl border border-stone-200 p-3 font-normal" /></label><div className="flex gap-2"><Button disabled={pending} onClick={() => void action("approve")}>Approve</Button><Button disabled={pending} variant="outline" onClick={() => void action("reject")}>Reject</Button></div></section> : null}</main></div></div>;
}
function isResult(value: unknown): value is { success: true; item: Extract<CalendarItem, { source: "time_off_request_admin" }> | null } { return typeof value === "object" && value !== null && "success" in value && value.success === true && "item" in value && (value.item === null || (typeof value.item === "object" && value.item !== null && "source" in value.item && value.item.source === "time_off_request_admin")); }
