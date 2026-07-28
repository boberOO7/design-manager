"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, MapPin, Plus, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_TIME_ZONE, addCalendarDays, filterCalendarItems,
  formatCalendarDateTime, formatCalendarTime, getCalendarRange, getDayItems, getMonthGrid,
  getVisibleDayItems, itemOccursOn, mergeCalendarItem, parseDateOnly,
  removeCalendarItem, startOfMondayWeek, toDateOnly,
} from "@/lib/calendar";
import { createCalendarEventFormValues, toCalendarEventMutationPayload } from "@/lib/calendar-event-form";
import { isTimeOffMutationResult, updateTimeOffRequest } from "@/lib/time-off-request-client";
import { getTaskPriorityLabel, getTaskStatusLabel } from "@/lib/tasks";
import type { CalendarEventType, CalendarFilters, CalendarItem, CalendarPageData, CalendarView, TimeOffRequestType } from "@/types/calendar";
import { CALENDAR_EVENT_TYPES, TIME_OFF_REQUEST_TYPES } from "@/types/calendar";

type SearchParams = Record<string, string | string[] | undefined>;
type Drawer = { kind: "day"; date: string } | { kind: "item"; item: CalendarItem } | { kind: "event-form"; item?: Extract<CalendarItem, { source: "calendar_event" }>; date?: string } | { kind: "time-off-form"; date?: string } | null;

const fieldClass = "h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200";
const eventLabels: Record<CalendarEventType, string> = { meeting: "Meeting", client_presentation: "Presentation", site_visit: "Site visit", internal_review: "Internal review", other: "Event" };
const requestLabels: Record<TimeOffRequestType, string> = { vacation: "Vacation", day_off: "Day off", medical_appointment: "Medical appointment", sick_leave: "Sick leave", other: "Other" };

function param(params: SearchParams, key: string) { const value = params[key]; return typeof value === "string" ? value : ""; }
function itemLabel(item: CalendarItem) {
  if (item.source === "calendar_event") return eventLabels[item.eventType];
  if (item.source === "project_deadline") return "Project deadline";
  if (item.source === "task_deadline") return "Task deadline";
  if (item.source === "time_off") return "Out of office";
  return item.status === "pending" ? "Pending request" : item.status === "rejected" ? "Rejected request" : "Out of office";
}
function itemTone(item: CalendarItem) {
  if (item.source === "calendar_event") return "border-l-sky-600 bg-sky-50 text-sky-950";
  if (item.source === "project_deadline") return "border-l-amber-600 bg-amber-50 text-amber-950";
  if (item.source === "task_deadline") return "border-l-stone-500 bg-stone-100 text-stone-800";
  if (item.source === "time_off_request_admin" && item.status === "pending") return "border-l-violet-500 bg-violet-50 text-violet-950";
  return "border-l-emerald-600 bg-emerald-50 text-emerald-950";
}
function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) { return new Intl.DateTimeFormat("en-US", options).format(parseDateOnly(date)); }

function CalendarPill({ item, onClick }: { item: CalendarItem; onClick: () => void }) {
  return <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={`w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-xs font-medium ${itemTone(item)}`} title={`${itemLabel(item)}: ${item.title}`}>
    <span className="sr-only">{itemLabel(item)}: </span>{!item.allDay && item.source === "calendar_event" ? `${formatCalendarTime(item.startsAt)} ` : ""}{item.title}
  </button>;
}

export function CalendarWorkspace({ initialData, initialView, initialDate, searchParams }: { initialData: CalendarPageData; initialView: CalendarView; initialDate: string; searchParams: SearchParams }) {
  const router = useRouter();
  const [items, setItems] = useState(initialData.items);
  const [drawer, setDrawer] = useState<Drawer>(() => {
    const eventId = param(searchParams, "event");
    const requestId = param(searchParams, "request");
    const item = initialData.items.find((candidate) => candidate.id === (eventId || requestId) && (eventId ? candidate.source === "calendar_event" : candidate.source === "time_off_request_admin"));
    return item ? { kind: "item", item } : null;
  });
  const [showFilters, setShowFilters] = useState(false);
  const filters: CalendarFilters = {
    events: param(searchParams, "events") !== "0",
    projectDeadlines: param(searchParams, "projects") !== "0",
    taskDeadlines: param(searchParams, "tasks") === "1",
    timeOff: param(searchParams, "timeOff") !== "0",
    projectId: param(searchParams, "project"), personId: param(searchParams, "person"), mine: param(searchParams, "mine") === "1",
  };


  const visibleItems = filterCalendarItems(items, filters, initialData.currentUserId);

  function navigate(next: { view?: CalendarView; date?: string }, replace = false, filterPatch?: Partial<CalendarFilters>) {
    const nextParams = new URLSearchParams();
    nextParams.set("view", next.view ?? initialView); nextParams.set("date", next.date ?? initialDate);
    const merged = { ...filters, ...filterPatch };
    if (!merged.events) nextParams.set("events", "0");
    if (!merged.projectDeadlines) nextParams.set("projects", "0");
    if (merged.taskDeadlines) nextParams.set("tasks", "1");
    if (!merged.timeOff) nextParams.set("timeOff", "0");
    if (merged.projectId) nextParams.set("project", merged.projectId);
    if (merged.personId) nextParams.set("person", merged.personId);
    if (merged.mine) nextParams.set("mine", "1");
    const href = `/calendar?${nextParams.toString()}`;
    if (replace) router.replace(href);
    else router.push(href);
  }

  function movePeriod(direction: -1 | 1) {
    if (initialView === "week") return navigate({ date: addCalendarDays(initialDate, direction * 7) });
    if (initialView === "agenda") return navigate({ date: addCalendarDays(initialDate, direction * 30) });
    const date = parseDateOnly(initialDate); date.setDate(1); date.setMonth(date.getMonth() + direction);
    navigate({ date: toDateOnly(date) });
  }

  const periodLabel = initialView === "month"
    ? dateLabel(initialDate, { month: "long", year: "numeric" })
    : `${dateLabel(getCalendarRange(initialView, initialDate).start, { month: "short", day: "numeric" })} – ${dateLabel(getCalendarRange(initialView, initialDate).end, { month: "short", day: "numeric", year: "numeric" })}`;

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-sm font-medium text-stone-500">Studio schedule · {APPLICATION_TIME_ZONE}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950">Calendar</h1><p className="mt-1 text-sm text-stone-500">Events, live deadlines, and privacy-safe team availability.</p></div>
      <div className="flex flex-wrap gap-2">
        {initialData.isAdmin ? <Button size="sm" onClick={() => setDrawer({ kind: "event-form" })}><Plus className="size-4" />Add event</Button> : null}
        <Button size="sm" variant="outline" onClick={() => setDrawer({ kind: "time-off-form" })}>Request time off</Button>
        {initialData.isAdmin && initialData.pendingCount > 0 ? <span className="inline-flex items-center rounded-full bg-violet-100 px-3 text-xs font-semibold text-violet-900">{initialData.pendingCount} pending</span> : null}
      </div>
    </header>

    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-stone-200 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2"><Button size="sm" variant="outline" aria-label="Previous period" onClick={() => movePeriod(-1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" onClick={() => navigate({ date: initialData.today })}>Today</Button><Button size="sm" variant="outline" aria-label="Next period" onClick={() => movePeriod(1)}><ChevronRight className="size-4" /></Button><h2 className="ml-2 text-sm font-semibold text-stone-900 sm:text-base">{periodLabel}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-stone-100 p-1">{(["month", "week", "agenda"] as const).map((view) => <button key={view} type="button" onClick={() => navigate({ view })} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${initialView === view ? "bg-white text-stone-950 shadow-sm" : "text-stone-500"}`}>{view}</button>)}</div>
          <Button size="sm" variant="outline" onClick={() => setShowFilters((value) => !value)}><Filter className="size-4" />Filters{filters.taskDeadlines ? "" : " · tasks off"}</Button>
        </div>
      </div>
      {showFilters ? <FilterBar data={initialData} filters={filters} onChange={(patch) => navigate({}, true, patch)} /> : null}
      {initialView === "month" ? <MonthView anchor={initialDate} today={initialData.today} items={visibleItems} onDay={(date) => setDrawer({ kind: "day", date })} onItem={(item) => setDrawer({ kind: "item", item })} /> : null}
      {initialView === "week" ? <WeekView anchor={initialDate} items={visibleItems} onItem={(item) => setDrawer({ kind: "item", item })} /> : null}
      {initialView === "agenda" ? <AgendaView start={initialDate} items={visibleItems} onItem={(item) => setDrawer({ kind: "item", item })} /> : null}
    </section>

    {drawer?.kind === "day" ? <DetailPanel title={dateLabel(drawer.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} eyebrow="Day details" onClose={() => setDrawer(null)}>
      <DayDetails date={drawer.date} items={getDayItems(visibleItems, drawer.date)} onItem={(item) => setDrawer({ kind: "item", item })} />
      <div className="mt-6 flex flex-wrap gap-2">{initialData.isAdmin ? <Button size="sm" onClick={() => setDrawer({ kind: "event-form", date: drawer.date })}>Add event on this day</Button> : null}<Button size="sm" variant="outline" onClick={() => setDrawer({ kind: "time-off-form", date: drawer.date })}>Request time off</Button></div>
    </DetailPanel> : null}
    {drawer?.kind === "item" ? <ItemPanel item={drawer.item} data={initialData} onClose={() => setDrawer(null)} onEdit={(item) => setDrawer({ kind: "event-form", item })} onMutated={(item, removedKey) => { if (removedKey) setItems((current) => removeCalendarItem(current, removedKey)); if (item) setItems((current) => mergeCalendarItem(current, item)); setDrawer(item ? { kind: "item", item } : null); router.refresh(); }} /> : null}
    {drawer?.kind === "event-form" ? <EventForm data={initialData} item={drawer.item} initialDate={drawer.date} onClose={() => setDrawer(null)} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); setDrawer({ kind: "item", item }); }} /> : null}
    {drawer?.kind === "time-off-form" ? <TimeOffForm data={initialData} initialDate={drawer.date} onClose={() => setDrawer(null)} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); setDrawer({ kind: "item", item }); }} /> : null}
  </div>;
}

function FilterBar({ data, filters, onChange }: { data: CalendarPageData; filters: CalendarFilters; onChange: (patch: Partial<CalendarFilters>) => void }) {
  const checks: Array<[keyof Pick<CalendarFilters, "events" | "projectDeadlines" | "taskDeadlines" | "timeOff">, string]> = [["events", "Events"], ["projectDeadlines", "Project deadlines"], ["taskDeadlines", "Task deadlines"], ["timeOff", "Team availability"]];
  return <div className="grid gap-3 border-b border-stone-200 bg-stone-50/70 p-4 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
    <div className="flex flex-wrap gap-x-4 gap-y-2">{checks.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />{label}</label>)}</div>
    <select aria-label="Filter by project" className={fieldClass} value={filters.projectId} onChange={(event) => onChange({ projectId: event.target.value })}><option value="">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
    <select aria-label="Filter by person" className={fieldClass} value={filters.personId} onChange={(event) => onChange({ personId: event.target.value })}><option value="">All people</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
    <label className="flex items-center gap-2 whitespace-nowrap text-sm text-stone-700"><input type="checkbox" checked={filters.mine} onChange={(event) => onChange({ mine: event.target.checked })} />Relevant to me</label>
  </div>;
}

function MonthView({ anchor, today, items, onDay, onItem }: { anchor: string; today: string; items: CalendarItem[]; onDay: (date: string) => void; onItem: (item: CalendarItem) => void }) {
  const dates = getMonthGrid(anchor); const month = anchor.slice(0, 7);
  return <><div className="hidden grid-cols-7 border-b border-stone-200 text-center text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-3">{day}</div>)}</div>
    <div className="hidden grid-cols-7 md:grid">{dates.map((date) => { const { visible, overflow } = getVisibleDayItems(items, date); return <div key={date} className={`min-h-32 border-b border-r border-stone-100 p-2 text-left align-top hover:bg-stone-50 ${date.slice(0, 7) !== month ? "bg-stone-50/60 text-stone-400" : ""}`}><button type="button" onClick={() => onDay(date)} aria-label={`Open ${dateLabel(date, { month: "long", day: "numeric" })}`} className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${date === today ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}>{Number(date.slice(-2))}</button><div className="mt-1 grid gap-1">{visible.map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} className="px-2 text-left text-xs font-semibold text-stone-500">+{overflow} more</button> : null}</div></div>; })}</div>
    <div className="divide-y divide-stone-100 md:hidden">{dates.filter((date) => getDayItems(items, date).length > 0 || date === today).map((date) => { const { visible, overflow } = getVisibleDayItems(items, date, 4); return <div key={date} className="flex w-full gap-4 p-4 text-left"><button type="button" onClick={() => onDay(date)} className="w-12 shrink-0 text-center"><span className="block text-xs font-semibold uppercase text-stone-400">{dateLabel(date, { weekday: "short" })}</span><span className={`mx-auto mt-1 flex size-9 items-center justify-center rounded-full font-semibold ${date === today ? "bg-stone-900 text-white" : "text-stone-900"}`}>{Number(date.slice(-2))}</span></button><div className="min-w-0 flex-1 space-y-1">{visible.map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} className="text-xs text-stone-500">+{overflow} more</button> : null}</div></div>; })}</div></>;
}

function WeekView({ anchor, items, onItem }: { anchor: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const start = startOfMondayWeek(anchor); const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
  return <div className="grid divide-y divide-stone-100 lg:grid-cols-7 lg:divide-x lg:divide-y-0">{dates.map((date) => { const dayItems = getDayItems(items, date); const allDay = dayItems.filter((item) => item.allDay); const timed = dayItems.filter((item) => !item.allDay); return <section key={date} className="min-h-48 p-3"><h3 className="text-sm font-semibold text-stone-900">{dateLabel(date, { weekday: "short", month: "short", day: "numeric" })}</h3><div className="mt-3 space-y-1">{allDay.map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}</div>{timed.length ? <div className="mt-4 border-t border-stone-100 pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">Timed</p><div className="space-y-2">{timed.map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}</div></div> : null}{dayItems.length === 0 ? <p className="mt-4 text-xs text-stone-400">No items</p> : null}</section>; })}</div>;
}

function AgendaView({ start, items, onItem }: { start: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const dates = Array.from({ length: 30 }, (_, index) => addCalendarDays(start, index)).filter((date) => items.some((item) => itemOccursOn(item, date)));
  if (!dates.length) return <p className="p-10 text-center text-sm text-stone-500">No visible Calendar items in this 30-day range.</p>;
  return <div className="grid gap-x-8 p-4 lg:grid-cols-2">{dates.map((date) => <section key={date} className="border-b border-stone-100 py-4"><h3 className="mb-3 text-sm font-semibold text-stone-900">{dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}</h3><div className="space-y-2">{getDayItems(items, date).map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}</div></section>)}</div>;
}

function DetailPanel({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/45" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="flex h-dvh w-full max-w-[34rem] flex-col bg-white shadow-2xl outline-none" onMouseDown={(event) => event.stopPropagation()}><header className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-stone-400">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold text-stone-950">{title}</h2></div><Button size="sm" variant="ghost" className="size-9 p-0" onClick={onClose} aria-label="Close"><X className="size-4" /></Button></header><main className="min-h-0 flex-1 overflow-y-auto p-5">{children}</main></div></div>;
}

function DayDetails({ items, onItem }: { date: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Nothing scheduled.</p>;
  return <div className="space-y-2">{items.map((item) => <button key={item.key} type="button" onClick={() => onItem(item)} className={`w-full rounded-xl border-l-4 p-3 text-left ${itemTone(item)}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{itemLabel(item)}</p><p className="mt-1 font-semibold">{item.title}</p>{item.source === "calendar_event" && !item.allDay ? <p className="mt-1 text-sm">{formatCalendarTime(item.startsAt)}–{formatCalendarTime(item.endsAt)}</p> : null}</button>)}</div>;
}

function ItemPanel({ item, data, onClose, onEdit, onMutated }: { item: CalendarItem; data: CalendarPageData; onClose: () => void; onEdit: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void; onMutated: (item: CalendarItem | null, removedKey: string | null) => void }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [reviewNote, setReviewNote] = useState("");
  const timeOffMutationInFlight = useRef(false);
  async function cancelEvent() { if (item.source !== "calendar_event" || !window.confirm("Cancel this event?")) return; setPending(true); const response = await fetch(`/api/calendar/events/${encodeURIComponent(item.id)}`, { method: "DELETE" }); setPending(false); if (response.ok) onMutated(null, item.key); else setError("The event could not be cancelled."); }
  async function timeOffAction(action: "approve" | "reject" | "cancel") { if (item.source !== "time_off_request_admin" || timeOffMutationInFlight.current) return; if (action === "cancel" && !window.confirm("Cancel this request?")) return; timeOffMutationInFlight.current = true; setPending(true); setError(""); try { const result = await updateTimeOffRequest(item.id, action, reviewNote); if (isTimeOffMutationResult(result)) onMutated(result.item ?? null, result.removedKey ?? null); else setError("The request could not be updated."); } catch { setError("The request could not be updated."); } finally { timeOffMutationInFlight.current = false; setPending(false); } }
  return <DetailPanel title={item.title} eyebrow={itemLabel(item)} onClose={pending ? () => undefined : onClose}>{error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<div className="space-y-6 text-sm">
    <section><h3 className="font-semibold text-stone-900">When</h3><p className="mt-2 text-stone-600">{item.source === "calendar_event" ? `${formatCalendarDateTime(item.startsAt)} – ${formatCalendarDateTime(item.endsAt)}` : `${dateLabel(item.startDate, { month: "long", day: "numeric", year: "numeric" })}${item.endDate !== item.startDate ? ` – ${dateLabel(item.endDate, { month: "long", day: "numeric", year: "numeric" })}` : ""}`}</p></section>
    {item.source === "calendar_event" ? <><section><h3 className="font-semibold">Details</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-stone-600">{item.description || "No description"}</p>{item.location ? <p className="mt-3 flex gap-2"><MapPin className="size-4" />{item.location}</p> : null}{item.meetingUrl ? <a className="mt-2 flex gap-2 underline" href={item.meetingUrl} target="_blank" rel="noreferrer"><Video className="size-4" />Open meeting link</a> : null}</section><section><h3 className="font-semibold">Attendees</h3><p className="mt-2 text-stone-600">{item.attendees.map((person) => person.full_name).join(", ") || "No attendees"}</p></section>{item.project ? <Link className="font-medium underline" href={`/projects/${item.project.id}`}>Open {item.project.name}</Link> : null}{data.isAdmin ? <div className="flex gap-2"><Button disabled={pending} onClick={() => onEdit(item)}>Edit event</Button><Button disabled={pending} variant="outline" onClick={() => void cancelEvent()}>Cancel event</Button></div> : null}</> : null}
    {item.source === "project_deadline" ? <><p className="text-stone-600">{item.project.clientName ?? "Project milestone"} · {item.project.status}</p><Link className="font-medium underline" href={`/projects/${item.project.id}`}>Open project</Link></> : null}
    {item.source === "task_deadline" ? <><p className="whitespace-pre-wrap text-stone-600">{item.task.description || "No task description"}</p><dl className="grid grid-cols-2 gap-4"><div><dt className="text-stone-500">Assignee</dt><dd>{item.task.assigneeName}</dd></div><div><dt className="text-stone-500">Status</dt><dd>{getTaskStatusLabel(item.task.status)}</dd></div><div><dt className="text-stone-500">Priority</dt><dd>{getTaskPriorityLabel(item.task.priority)}</dd></div></dl><Link className="font-medium underline" href={`/projects/${item.task.projectId}`}>Open task in {item.task.projectName}</Link></> : null}
    {item.source === "time_off" ? <p className="text-stone-600">{item.employeeName} is out of office. Private request details are not shared.</p> : null}
    {item.source === "time_off_request_admin" ? <><dl className="grid grid-cols-2 gap-4"><div><dt className="text-stone-500">Employee</dt><dd>{item.employeeName}</dd></div><div><dt className="text-stone-500">Status</dt><dd className="capitalize">{item.status}</dd></div><div><dt className="text-stone-500">Request type</dt><dd>{requestLabels[item.requestType]}</dd></div><div><dt className="text-stone-500">Time</dt><dd>{item.allDay ? "All day" : `${item.startTime}–${item.endTime}`}</dd></div></dl><section><h3 className="font-semibold">Private note</h3><p className="mt-2 whitespace-pre-wrap text-stone-600">{item.privateNote || "No private note"}</p></section>{item.reviewNote ? <section><h3 className="font-semibold">Review note</h3><p className="mt-2 text-stone-600">{item.reviewNote}</p></section> : null}{data.isAdmin && item.status === "pending" ? <section className="space-y-3 border-t border-stone-100 pt-5"><label className="grid gap-1.5 font-medium">Review note<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="rounded-xl border border-stone-200 p-3 font-normal" /></label><div className="flex gap-2"><Button disabled={pending} onClick={() => void timeOffAction("approve")}>Approve</Button><Button disabled={pending} variant="outline" onClick={() => void timeOffAction("reject")}>Reject</Button></div></section> : null}{((item.isOwn && item.status === "pending") || (data.isAdmin && item.status !== "cancelled")) ? <Button disabled={pending} variant="outline" onClick={() => void timeOffAction("cancel")}>Cancel request</Button> : null}</> : null}
  </div></DetailPanel>;
}

type MutationResult = { success: true; item?: CalendarItem | null; removedKey?: string | null };
function isCalendarItem(value: unknown): value is CalendarItem { return typeof value === "object" && value !== null && "source" in value && "key" in value && typeof value.key === "string"; }
function isMutationResult(value: unknown): value is MutationResult { if (typeof value !== "object" || value === null || !("success" in value) || value.success !== true) return false; if ("item" in value && value.item !== null && value.item !== undefined && !isCalendarItem(value.item)) return false; return !("removedKey" in value) || value.removedKey === null || value.removedKey === undefined || typeof value.removedKey === "string"; }

function EventForm({ data, item, initialDate, onClose, onSaved }: { data: CalendarPageData; item?: Extract<CalendarItem, { source: "calendar_event" }>; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void }) {
  const baseDate = initialDate ?? data.today;
  const initial = createCalendarEventFormValues(item, baseDate);
  const [values, setValues] = useState(initial); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const appropriatePeople = values.projectId && values.eventType !== "meeting" && values.eventType !== "client_presentation" ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : data.people;
  function requestClose() { if (pending) return; if (!dirty || window.confirm("Discard unsaved event changes?")) onClose(); }
  async function submit() {
    setPending(true); setError(""); setFieldErrors({});
    try {
      const payload = toCalendarEventMutationPayload(values);
      const response = await fetch(item ? `/api/calendar/events/${encodeURIComponent(item.id)}` : "/api/calendar/events", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "calendar_event") onSaved(result.item);
      else if (response.ok && typeof result === "object" && result !== null && "requiresRefresh" in result && result.requiresRefresh === true) window.location.reload();
      else if (typeof result === "object" && result !== null) {
        if ("formError" in result && typeof result.formError === "string") setError(result.formError);
        if ("fieldErrors" in result && typeof result.fieldErrors === "object" && result.fieldErrors !== null) setFieldErrors(Object.fromEntries(Object.entries(result.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error && submissionError.message === "Invalid all-day date range" ? "Choose an end date on or after the start date." : "The event could not be saved.");
    } finally { setPending(false); }
  }
  return <DetailPanel title={item ? "Edit event" : "Add event"} eyebrow="Calendar event" onClose={requestClose}><div className="space-y-4"><Input label="Title" error={fieldErrors.title}><input className={fieldClass} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></Input><div className="grid gap-4 sm:grid-cols-2"><Input label="Type" error={fieldErrors.eventType}><select className={fieldClass} value={values.eventType} onChange={(event) => setValues({ ...values, eventType: event.target.value as CalendarEventType, attendeeIds: [] })}>{CALENDAR_EVENT_TYPES.map((type) => <option key={type} value={type}>{eventLabels[type]}</option>)}</select></Input><Input label="Project (optional)" error={fieldErrors.projectId}><select className={fieldClass} value={values.projectId} onChange={(event) => setValues({ ...values, projectId: event.target.value, attendeeIds: [] })}><option value="">Studio-wide</option>{data.projects.map((project) => <option key={project.id} value={project.id} disabled={project.status === "completed"}>{project.name}{project.status === "completed" ? " (completed — reopen first)" : ""}</option>)}</select></Input></div><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />All-day event</label><div className="grid gap-4 sm:grid-cols-2">{values.allDay ? <><Input label="Start date"><input type="date" className={fieldClass} value={values.startDate} onChange={(event) => setValues({ ...values, startDate: event.target.value })} /></Input><Input label="End date" error={fieldErrors.endsAt}><input type="date" className={fieldClass} min={values.startDate} value={values.endDate} onChange={(event) => setValues({ ...values, endDate: event.target.value })} /></Input></> : <><Input label="Starts"><div className="flex gap-2"><input type="date" className={fieldClass} value={values.startDate} onChange={(event) => setValues({ ...values, startDate: event.target.value })} /><input type="time" className={fieldClass} value={values.startTime} onChange={(event) => setValues({ ...values, startTime: event.target.value })} /></div></Input><Input label="Ends" error={fieldErrors.endsAt}><div className="flex gap-2"><input type="date" className={fieldClass} min={values.startDate} value={values.endDate} onChange={(event) => setValues({ ...values, endDate: event.target.value })} /><input type="time" className={fieldClass} value={values.endTime} onChange={(event) => setValues({ ...values, endTime: event.target.value })} /></div></Input></>}</div><Input label="Attendees" error={fieldErrors.attendeeIds}><select multiple className="min-h-32 w-full rounded-xl border border-stone-200 p-2 text-sm" value={values.attendeeIds} onChange={(event) => setValues({ ...values, attendeeIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{appropriatePeople.map((person) => <option key={person.id} value={person.id}>{person.full_name} — {person.job_title}</option>)}</select><span className="text-xs font-normal text-stone-500">Use Ctrl/Cmd to select multiple people. Non-meeting project events are limited to active project members.</span></Input><div className="grid gap-4 sm:grid-cols-2"><Input label="Location"><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></Input><Input label="Meeting URL" error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></Input></div><Input label="Description"><textarea className="w-full rounded-xl border border-stone-200 p-3 text-sm" rows={5} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></Input>{error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button variant="outline" disabled={pending} onClick={requestClose}>Cancel</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? "Saving…" : "Save event"}</Button></div></div></DetailPanel>;
}

function TimeOffForm({ data, initialDate, onClose, onSaved }: { data: CalendarPageData; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "time_off_request_admin" }>) => void }) {
  const date = initialDate ?? data.today; const initial = { requestType: "vacation" as TimeOffRequestType, startDate: date, endDate: date, allDay: true, startTime: "09:00", endTime: "10:00", privateNote: "" }; const [values, setValues] = useState(initial); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  function requestClose() { if (pending) return; if (!dirty || window.confirm("Discard this time-off request?")) onClose(); }
  async function submit() { setPending(true); setError(""); setFieldErrors({}); try { const response = await fetch("/api/calendar/time-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, startTime: values.allDay ? null : values.startTime, endTime: values.allDay ? null : values.endTime }) }); const result: unknown = await response.json(); if (response.ok && isMutationResult(result) && result.item?.source === "time_off_request_admin") onSaved(result.item); else if (typeof result === "object" && result !== null) { if ("formError" in result && typeof result.formError === "string") setError(result.formError); if ("fieldErrors" in result && typeof result.fieldErrors === "object" && result.fieldErrors !== null) setFieldErrors(Object.fromEntries(Object.entries(result.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string"))); } } catch { setError("The request could not be created."); } finally { setPending(false); } }
  return <DetailPanel title="Request time off" eyebrow="Private request" onClose={requestClose}><div className="space-y-4"><Input label="Request type"><select className={fieldClass} value={values.requestType} onChange={(event) => setValues({ ...values, requestType: event.target.value as TimeOffRequestType })}>{TIME_OFF_REQUEST_TYPES.map((type) => <option key={type} value={type}>{requestLabels[type]}</option>)}</select></Input><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked, endDate: event.target.checked ? values.endDate : values.startDate })} />All day</label><div className="grid gap-4 sm:grid-cols-2"><Input label="Start date"><input type="date" className={fieldClass} value={values.startDate} onChange={(event) => setValues({ ...values, startDate: event.target.value, endDate: values.allDay ? values.endDate : event.target.value })} /></Input><Input label="End date" error={fieldErrors.endDate}><input type="date" className={fieldClass} min={values.startDate} value={values.endDate} disabled={!values.allDay} onChange={(event) => setValues({ ...values, endDate: event.target.value })} /></Input></div>{!values.allDay ? <div className="grid gap-4 sm:grid-cols-2"><Input label="Start time"><input type="time" className={fieldClass} value={values.startTime} onChange={(event) => setValues({ ...values, startTime: event.target.value })} /></Input><Input label="End time"><input type="time" className={fieldClass} value={values.endTime} onChange={(event) => setValues({ ...values, endTime: event.target.value })} /></Input></div> : null}<Input label="Private note"><textarea className="w-full rounded-xl border border-stone-200 p-3 text-sm" rows={5} value={values.privateNote} onChange={(event) => setValues({ ...values, privateNote: event.target.value })} /><span className="text-xs font-normal text-stone-500">Visible only to you and studio administrators. Avoid unnecessary medical detail.</span></Input>{error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}<div className="flex justify-end gap-2 border-t border-stone-100 pt-4"><Button variant="outline" disabled={pending} onClick={requestClose}>Cancel</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? "Submitting…" : "Submit request"}</Button></div></div></DetailPanel>;
}

function Input({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium text-stone-700">{label}{children}{error ? <span className="text-red-700">{error}</span> : null}</label>; }
