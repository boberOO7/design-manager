"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronLeft, ChevronRight, Filter, MapPin, Plus, Repeat2, Search, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Drawer } from "@/components/ui/drawer";
import { focusVisibleClassName, FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  APPLICATION_TIME_ZONE, addCalendarDays, filterCalendarItems,
  formatCalendarDateTime, formatCalendarTime, getCalendarRange, getDayItems, getMonthGrid,
  getCurrentWeekTimePosition, getInitialWeekScrollTop, getMonthDateLaneLayout, getMonthItemGeometry, getMonthLaneLayout, getMonthLayoutSegments, getMonthSegmentGeometry,
  getTimedEventHeight, getTimedWeekLayout, getTimedWeekSegments, getWeekAllDaySegments, getMonthMobileDayItems,
  getMonthItemTop, getCalendarItemDisplayTitle, itemOccursOn, mergeCalendarItem, MONTH_EVENT_GEOMETRY, MONTH_LANE_GAP, MONTH_LANE_HEIGHT, parseDateOnly, WEEK_PIXELS_PER_MINUTE,
  removeCalendarItem, startOfMondayWeek, toDateOnly,
} from "@/lib/calendar";
import { createCalendarEventFormValues, toCalendarEventMutationPayload, updateEventStartDate, updateEventStartTime } from "@/lib/calendar-event-form";
import type { RecurrenceRule } from "@/lib/calendar-recurrence";
import { isTimeOffMutationResult, updateTimeOffRequest } from "@/lib/time-off-request-client";
import { getTimeOffStatusBadgeStyle } from "@/lib/semantic-styles";
import { timeOffRequestTypeKey, timeOffStatusKey } from "@/lib/time-off-labels";
import type { CalendarEventInvitationStatus, CalendarEventType, CalendarFilters, CalendarItem, CalendarPageData, CalendarPerson, CalendarView, TimeOffRequestType } from "@/types/calendar";
import { CALENDAR_EVENT_TYPES, TIME_OFF_REQUEST_TYPES } from "@/types/calendar";

type SearchParams = Record<string, string | string[] | undefined>;
type Drawer = { kind: "day"; date: string } | { kind: "item"; item: CalendarItem } | { kind: "event-form"; item?: Extract<CalendarItem, { source: "calendar_event" }>; date?: string } | { kind: "time-off-form"; date?: string } | null;

const fieldClass = inputClassName;

function recurrenceText(locale: string, rule: RecurrenceRule | null) {
  const uk = locale.startsWith("uk"); if (!rule) return uk ? "Не повторювати" : "Does not repeat";
  const names = uk ? { daily: "Щодня", weekly: "Щотижня", monthly: "Щомісяця", yearly: "Щороку" } : { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  return rule.interval === 1 ? names[rule.frequency] : `${uk ? "Кожні" : "Every"} ${rule.interval} ${uk ? "рази" : rule.frequency}`;
}
const eventTypeKey: Record<CalendarEventType, "meeting" | "presentation" | "siteVisit" | "internalReview" | "businessTrip" | "event"> = {
  meeting: "meeting",
  client_presentation: "presentation",
  site_visit: "siteVisit",
  internal_review: "internalReview",
  business_trip: "businessTrip",
  other: "event",
};

function param(params: SearchParams, key: string) { const value = params[key]; return typeof value === "string" ? value : ""; }
function itemTone(item: CalendarItem) {
  if (item.source === "calendar_event") return "border-l-[var(--ui-event-border)] bg-[var(--ui-event-surface)] text-[var(--ui-event-text)]";
  if (item.source === "project_deadline") return "border-l-[var(--ui-warning-accent)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
  if (item.source === "task_deadline") return "border-l-[var(--ui-info-accent)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
  if (item.source === "birthday") return "border-l-[var(--ui-birthday-border)] bg-[var(--ui-birthday-surface)] text-[var(--ui-birthday-text)]";
  if (item.source === "team_anniversary") return "border-l-[var(--ui-anniversary-border)] bg-[var(--ui-anniversary-surface)] text-[var(--ui-anniversary-text)]";
  if (item.source === "salary_payment") return "border-l-[var(--ui-payment-border)] bg-[var(--ui-payment-surface)] text-[var(--ui-payment-text)]";
  if (item.source === "time_off_request_admin") {
    const status = getTimeOffStatusBadgeStyle(item.status).variant;
    if (status === "warning") return "border-l-[var(--ui-warning-accent)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
    if (status === "danger") return "border-l-[var(--ui-danger-solid)] bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]";
    if (status === "muted") return "border-l-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] text-[var(--ui-text-secondary)]";
  }
  return "border-l-[var(--ui-success-accent)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]";
}
function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }, locale = "en") { return new Intl.DateTimeFormat(locale, options).format(parseDateOnly(date)); }

function useCalendarItemTitle() {
  const t = useTranslations("Calendar");
  const common = useTranslations("Common");
  return (item: CalendarItem) => item.source === "birthday" ? t("birthdayEvent", { name: item.member.fullName }) : item.source === "team_anniversary" ? t("teamAnniversaryEvent", { name: item.member.fullName }) : item.source === "salary_payment" ? t("salaryPaymentEvent", { name: item.member.fullName }) : getCalendarItemDisplayTitle(item, {
    outOfOffice: t("outOfOffice"),
    pendingRequest: t("pendingRequest"),
    rejectedRequest: t("rejectedRequest"),
    unknownEmployee: common("unknown"),
  });
}

function useCalendarItemTypeLabel() {
  const t = useTranslations("Calendar");
  return (item: CalendarItem) => item.source === "calendar_event" ? t(eventTypeKey[item.eventType]) : item.source === "project_deadline" ? t("projectDeadline") : item.source === "task_deadline" ? t("taskDeadline") : item.source === "birthday" ? t("birthdays") : item.source === "team_anniversary" ? t("teamAnniversaries") : item.source === "salary_payment" ? t("salaryPayments") : item.source === "time_off_request_admin" && item.status === "pending" ? t("pendingRequest") : item.source === "time_off_request_admin" && item.status === "rejected" ? t("rejectedRequest") : t("outOfOffice");
}

const monthItemPresentationClassName = "box-border min-w-0 overflow-hidden border-y-0 border-r-0 p-0 text-left text-xs font-medium leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1";

function CalendarPill({ item, month = false, mobile = false, onClick }: { item: CalendarItem; month?: boolean; mobile?: boolean; onClick: () => void }) {
  const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  const label = itemTypeLabel(item);
  const monthGeometry = month && !mobile ? getMonthItemGeometry() : undefined;
  const monthStyle = monthGeometry ? { height: monthGeometry.height, paddingInline: monthGeometry.textPaddingInline, paddingBlock: monthGeometry.verticalPadding, borderRadius: monthGeometry.leftRadius, borderLeftWidth: monthGeometry.borderInlineStartWidth } : undefined;
  const title = itemTitle(item);
  const accessibleLabel = `${label}: ${!item.allDay && item.source === "calendar_event" ? `${formatCalendarTime(item.startsAt, locale)}, ` : ""}${title}`;
  return <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} aria-label={accessibleLabel} className={month ? mobile ? `box-border block min-h-8 w-full appearance-none truncate rounded-md border-l-2 px-2 text-left text-xs font-medium leading-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 ${itemTone(item)}` : `block min-h-0 w-full appearance-none ${monthItemPresentationClassName} ${itemTone(item)}` : `min-h-10 w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-xs font-medium ${itemTone(item)}`} style={monthStyle} title={accessibleLabel}>
    <span className="sr-only">{label}: </span>{!item.allDay && item.source === "calendar_event" ? `${formatCalendarTime(item.startsAt, locale)} ` : ""}{title}
  </button>;
}

export function CalendarWorkspace({ initialData, initialView, initialDate, searchParams }: { initialData: CalendarPageData; initialView: CalendarView; initialDate: string; searchParams: SearchParams }) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(() => [...initialData.items]);
  const [drawer, setDrawer] = useState<Drawer>(() => {
    const eventId = param(searchParams, "event");
    const requestId = param(searchParams, "request");
    const item = initialData.items.find((candidate) => candidate.id === (eventId || requestId) && (eventId ? candidate.source === "calendar_event" : candidate.source === "time_off_request_admin"));
    return item ? { kind: "item", item } : null;
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => drawer !== null);
  const [showFilters, setShowFilters] = useState(false);
  const filters: CalendarFilters = {
    events: param(searchParams, "events") !== "0",
    projectDeadlines: param(searchParams, "projects") !== "0",
    taskDeadlines: param(searchParams, "tasks") === "1",
    timeOff: param(searchParams, "timeOff") !== "0",
    birthdays: param(searchParams, "birthdays") !== "0",
    teamAnniversaries: param(searchParams, "anniversaries") !== "0",
    salaryPayments: initialData.isAdmin && param(searchParams, "payments") !== "0",
    projectId: param(searchParams, "project"), personId: param(searchParams, "person"), mine: param(searchParams, "mine") === "1",
  };


  const visibleItems = filterCalendarItems(items, filters, initialData.currentUserId);

  function openDrawer(nextDrawer: Exclude<Drawer, null>) {
    setDrawer(nextDrawer);
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function clearExitedDrawer() {
    setDrawer(null);
  }

  function navigate(next: { view?: CalendarView; date?: string }, replace = false, filterPatch?: Partial<CalendarFilters>) {
    const nextParams = new URLSearchParams();
    nextParams.set("view", next.view ?? initialView); nextParams.set("date", next.date ?? initialDate);
    const merged = { ...filters, ...filterPatch };
    if (!merged.events) nextParams.set("events", "0");
    if (!merged.projectDeadlines) nextParams.set("projects", "0");
    if (merged.taskDeadlines) nextParams.set("tasks", "1");
    if (!merged.timeOff) nextParams.set("timeOff", "0");
    if (!merged.birthdays) nextParams.set("birthdays", "0");
    if (!merged.teamAnniversaries) nextParams.set("anniversaries", "0");
    if (initialData.isAdmin && !merged.salaryPayments) nextParams.set("payments", "0");
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
    ? dateLabel(initialDate, { month: "long", year: "numeric" }, locale)
    : `${dateLabel(getCalendarRange(initialView, initialDate).start, { month: "short", day: "numeric" }, locale)} – ${dateLabel(getCalendarRange(initialView, initialDate).end, { month: "short", day: "numeric", year: "numeric" }, locale)}`;

  return <div className="min-w-0 space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-sm font-medium text-[var(--ui-text-muted)]">{t("schedule", { timezone: APPLICATION_TIME_ZONE })}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("description")}</p></div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="sm" className="min-h-11 sm:min-h-0" onClick={() => openDrawer({ kind: "event-form" })}><Plus className="size-4" />{t("addEvent")}</Button>
        <Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" onClick={() => openDrawer({ kind: "time-off-form" })}>{t("requestTimeOff")}</Button>
        {initialData.isAdmin && initialData.pendingCount > 0 ? <span className="inline-flex items-center rounded-full bg-[var(--ui-violet-surface)] px-3 text-xs font-semibold text-[var(--ui-violet-text)]">{t("pending", { count: initialData.pendingCount })}</span> : null}
      </div>
    </header>

    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" aria-label={t("previous")} onClick={() => movePeriod(-1)}><ChevronLeft className="size-4" /></Button><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" onClick={() => navigate({ date: initialData.today })}>{t("today")}</Button><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" aria-label={t("next")} onClick={() => movePeriod(1)}><ChevronRight className="size-4" /></Button></div><h2 className="min-w-0 text-sm font-semibold text-[var(--ui-text)] sm:ml-2 sm:text-base">{periodLabel}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl className="w-full sm:w-auto [&_button]:min-h-11 sm:[&_button]:min-h-0" ariaLabel={t("view")} items={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "agenda", label: t("agenda") }]} value={initialView} onValueChange={(view) => navigate({ view })} />
          <Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}><Filter className="size-4" />{t("filters")}{filters.taskDeadlines ? "" : t("tasksOff")}</Button>
        </div>
      </div>
      {showFilters ? <FilterBar data={initialData} filters={filters} onChange={(patch) => navigate({}, true, patch)} /> : null}
      {initialView === "month" ? <MonthView anchor={initialDate} today={initialData.today} items={visibleItems} onDay={(date) => openDrawer({ kind: "day", date })} onItem={(item) => openDrawer({ kind: "item", item })} /> : null}
      {initialView === "week" ? <WeekView anchor={initialDate} items={visibleItems} onItem={(item) => openDrawer({ kind: "item", item })} /> : null}
      {initialView === "agenda" ? <AgendaView start={initialDate} items={visibleItems} onItem={(item) => openDrawer({ kind: "item", item })} /> : null}
    </section>

    {drawer?.kind === "day" ? <DetailPanel isOpen={isDrawerOpen} onExited={clearExitedDrawer} title={dateLabel(drawer.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale)} eyebrow={t("dayDetails")} onClose={closeDrawer}>
      <DayDetails date={drawer.date} items={getDayItems(visibleItems, drawer.date)} onItem={(item) => openDrawer({ kind: "item", item })} />
      <div className="mt-6 flex flex-wrap gap-2"><Button size="sm" onClick={() => openDrawer({ kind: "event-form", date: drawer.date })}>{t("addEventOnDay")}</Button><Button size="sm" variant="outline" onClick={() => openDrawer({ kind: "time-off-form", date: drawer.date })}>{t("requestTimeOff")}</Button></div>
    </DetailPanel> : null}
    {drawer?.kind === "item" ? <ItemPanel isOpen={isDrawerOpen} onExited={clearExitedDrawer} item={drawer.item} data={initialData} onClose={closeDrawer} onEdit={(item) => openDrawer({ kind: "event-form", item })} onMutated={(item, removedKey) => { if (removedKey) setItems((current) => removeCalendarItem(current, removedKey)); if (item) { setItems((current) => mergeCalendarItem(current, item)); openDrawer({ kind: "item", item }); } else closeDrawer(); router.refresh(); }} /> : null}
    {drawer?.kind === "event-form" ? <EventForm isOpen={isDrawerOpen} onExited={clearExitedDrawer} data={initialData} item={drawer.item} initialDate={drawer.date} onClose={closeDrawer} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); openDrawer({ kind: "item", item }); }} /> : null}
    {drawer?.kind === "time-off-form" ? <TimeOffForm isOpen={isDrawerOpen} onExited={clearExitedDrawer} data={initialData} initialDate={drawer.date} onClose={closeDrawer} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); openDrawer({ kind: "item", item }); }} /> : null}
  </div>;
}

function FilterBar({ data, filters, onChange }: { data: CalendarPageData; filters: CalendarFilters; onChange: (patch: Partial<CalendarFilters>) => void }) {
  const t = useTranslations("Calendar"); const checks: Array<[keyof Pick<CalendarFilters, "events" | "projectDeadlines" | "taskDeadlines" | "timeOff" | "birthdays" | "teamAnniversaries" | "salaryPayments">, string]> = [["events", t("events")], ["projectDeadlines", t("projectDeadlines")], ["taskDeadlines", t("taskDeadlines")], ["timeOff", t("teamAvailability")], ["birthdays", t("birthdays")], ["teamAnniversaries", t("teamAnniversaries")]];
  if (data.isAdmin) checks.push(["salaryPayments", t("salaryPayments")]);
  return <div className="grid gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-4 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
    <div className="flex flex-wrap gap-x-4 gap-y-2">{checks.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />{label}</label>)}</div>
    <Select aria-label={t("filterProject")} value={filters.projectId} onValueChange={(projectId) => onChange({ projectId })}><SelectItem value="">{t("allProjects")}</SelectItem>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select>
    <Select aria-label={t("filterPerson")} value={filters.personId} onValueChange={(personId) => onChange({ personId })}><SelectItem value="">{t("allPeople")}</SelectItem>{data.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</Select>
    <label className="flex items-center gap-2 whitespace-nowrap text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={filters.mine} onChange={(event) => onChange({ mine: event.target.checked })} />{t("relevantToMe")}</label>
  </div>;
}

function MonthView({ anchor, today, items, onDay, onItem }: { anchor: string; today: string; items: CalendarItem[]; onDay: (date: string) => void; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const dates = getMonthGrid(anchor); const month = anchor.slice(0, 7);
  const segments = getMonthLayoutSegments(items, dates);
  const visibleLaneCount = 3;
  const allDayItemKeys = new Set(segments.map((segment) => segment.itemId));
  const segmentsByWeek = new Map<number, typeof segments>();
  for (const segment of segments) segmentsByWeek.set(segment.weekIndex, [...(segmentsByWeek.get(segment.weekIndex) ?? []), segment]);

  return <><div className="hidden grid-cols-7 border-b border-[var(--ui-border)] text-center text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] md:grid">{Array.from({ length: 7 }, (_, index) => dateLabel(addCalendarDays("2024-01-01", index), { weekday: "short" }, locale)).map((day) => <div key={day} className="py-3">{day}</div>)}</div>
    <div className="hidden md:block">{Array.from({ length: 6 }, (_, weekIndex) => {
      const weekDates = dates.slice(weekIndex * 7, weekIndex * 7 + 7);
      const weekSegments = segmentsByWeek.get(weekIndex) ?? [];
      const laneLayout = getMonthLaneLayout(weekSegments, visibleLaneCount);
      return <section key={weekDates[0]} className="relative grid grid-cols-7" aria-label={t("weekOf", { date: dateLabel(weekDates[0] ?? anchor, undefined, locale) })}>
        {weekDates.map((date) => {
          const timedItems = getDayItems(items, date).filter((item) => !allDayItemKeys.has(item.key));
          const hiddenSpanningItems = new Set(weekSegments.filter((segment) => segment.lane >= visibleLaneCount && segment.visibleStartDate <= date && segment.visibleEndDate >= date).map((segment) => segment.itemId));
          const overflow = hiddenSpanningItems.size;
          const dateLaneLayout = getMonthDateLaneLayout(weekSegments, date);
          return <div key={date} className={`min-h-36 border-b border-r border-[var(--ui-border-subtle)] p-2 text-left align-top hover:bg-[var(--ui-surface-subtle)] ${date.slice(0, 7) !== month ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text-subtle)]" : ""}`}><button type="button" onClick={() => onDay(date)} aria-label={t("openDate", { date: dateLabel(date, { month: "long", day: "numeric" }, locale) })} className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "hover:bg-[var(--ui-surface-muted)]"}`}>{Number(date.slice(-2))}</button><div className="grid" style={{ marginTop: dateLaneLayout.itemOffset, rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>{timedItems.map((item) => <CalendarPill key={item.key} item={item} month onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} aria-label={t("moreEvents", { count: overflow, date: dateLabel(date, { month: "long", day: "numeric" }, locale) })} className="min-h-11 px-2 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} {t("more")}</button> : null}</div></div>;
        })}
        <div className="pointer-events-none absolute inset-x-0 grid grid-cols-7" style={{ top: getMonthItemTop(), gridTemplateRows: `repeat(${laneLayout.laneCount}, ${MONTH_LANE_HEIGHT}px)`, rowGap: MONTH_LANE_GAP }} aria-label={t("allDayItems")}>
          {weekSegments.filter((segment) => segment.lane < visibleLaneCount).map((segment) => { const geometry = getMonthSegmentGeometry(segment); const title = itemTitle(segment.item); return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}${segment.continuesBefore ? ", continues from the previous week" : ""}${segment.continuesAfter ? ", continues into the next week" : ""}`} className={`pointer-events-auto ${monthItemPresentationClassName} ${itemTone(segment.item)}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1, height: geometry.height, marginLeft: geometry.leftInset, marginRight: geometry.rightInset, paddingInline: geometry.textPaddingInline, paddingBlock: geometry.verticalPadding, borderLeftWidth: geometry.borderInlineStartWidth, borderTopLeftRadius: geometry.leftRadius, borderBottomLeftRadius: geometry.leftRadius, borderTopRightRadius: geometry.rightRadius, borderBottomRightRadius: geometry.rightRadius }}><span className="block truncate">{segment.showLabel ? title : ""}</span></button>; })}
        </div>
      </section>;
    })}</div>
    <div className="divide-y divide-[var(--ui-border-subtle)] md:hidden">{dates.filter((date) => getDayItems(items, date).some((item) => !allDayItemKeys.has(item.key)) || segments.some((segment) => segment.visibleStartDate === date) || date === today).map((date) => { const { visible, overflow } = getMonthMobileDayItems(items, segments, date); return <div key={date} className="flex w-full gap-3 p-3 text-left sm:gap-4 sm:p-4"><button type="button" onClick={() => onDay(date)} aria-label={`Open ${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}`} className="min-h-11 w-12 shrink-0 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="block text-xs font-semibold uppercase text-[var(--ui-text-subtle)]">{dateLabel(date, { weekday: "short" })}</span><span className={`mx-auto mt-1 flex size-9 items-center justify-center rounded-full font-semibold ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text)]"}`}>{Number(date.slice(-2))}</span></button><div className="min-w-0 flex-1" style={{ display: "grid", rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>{visible.map((item) => <CalendarPill key={item.key} item={item} mobile month onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} aria-label={`Show ${overflow} more events on ${dateLabel(date, { month: "long", day: "numeric" })}`} className="min-h-11 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} more</button> : null}</div></div>; })}</div></>;
}

function WeekView({ anchor, items, onItem }: { anchor: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const start = startOfMondayWeek(anchor);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index)), [start]);
  const allDaySegments = getWeekAllDaySegments(items, dates);
  const allDayLanes = Math.max(1, ...allDaySegments.map((segment) => segment.lane + 1));
  const timedSegments = getTimedWeekLayout(getTimedWeekSegments(items, dates));
  const timedByDate = new Map<string, typeof timedSegments>();
  for (const segment of timedSegments) timedByDate.set(segment.date, [...(timedByDate.get(segment.date) ?? []), segment]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const initialCurrentDayIndexRef = useRef<number | undefined>(undefined);
  const [now, setNow] = useState<Date | null>(null);
  const currentTime = now ? getCurrentWeekTimePosition(dates, now) : null;
  useEffect(() => {
    const initialNow = new Date();
    initialCurrentDayIndexRef.current = getCurrentWeekTimePosition(dates, initialNow)?.dayIndex;
    const frame = window.requestAnimationFrame(() => setNow(initialNow));
    const container = scrollRef.current;
    if (container) container.scrollTop = getInitialWeekScrollTop();
    const horizontalContainer = horizontalScrollRef.current;
    if (horizontalContainer && window.matchMedia("(max-width: 767px)").matches && initialCurrentDayIndexRef.current !== undefined) {
      horizontalContainer.scrollLeft = Math.max(0, initialCurrentDayIndexRef.current * 112 - 56);
    }
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [dates]);

  return <div className="relative"><p id="week-scroll-hint" className="border-b border-[var(--ui-border-subtle)] px-3 py-2 text-xs text-[var(--ui-text-muted)] md:hidden">{t("weekScrollHint")}</p><div ref={horizontalScrollRef} aria-describedby="week-scroll-hint" aria-label={t("weeklyCalendar")} className="overflow-x-auto overscroll-x-contain"><div className="min-w-[840px] sm:min-w-[900px]">
    <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))] border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border-subtle)]" />
      {dates.map((date, dayIndex) => <div key={date} className={`border-r border-[var(--ui-border-subtle)] px-2 py-3 text-center text-xs font-semibold ${currentTime?.dayIndex === dayIndex ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}><span className="block uppercase tracking-wide">{dateLabel(date, { weekday: "short" }, locale)}</span><span className="mt-1 block text-sm">{dateLabel(date, { month: "short", day: "numeric" }, locale)}</span></div>)}
    </div>
    <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))] border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border-subtle)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-subtle)]">{t("allDay")}</div>
      <div className="relative col-span-7 grid grid-cols-7 gap-y-1 px-1 py-1" style={{ minHeight: allDayLanes * 22 + 8, gridTemplateRows: `repeat(${allDayLanes}, 20px)` }}>
        {allDaySegments.map((segment) => { const title = itemTitle(segment.item); return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}`} className={`min-w-0 border-l-2 px-2 text-left text-xs font-medium leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] focus:ring-offset-1 ${itemTone(segment.item)} ${segment.continuesBefore ? "rounded-l-none" : "rounded-l-md"} ${segment.continuesAfter ? "rounded-r-none" : "rounded-r-md"}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1 }}><span className="block truncate">{title}</span></button>; })}
      </div>
    </div>
    <div ref={scrollRef} className="calendar-week-timeline max-h-[36rem] overflow-y-auto">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))]">
        <div className="sticky left-0 z-20 bg-[var(--ui-surface)]">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-[60px] border-r border-b border-[var(--ui-border-subtle)] pr-2 pt-1 text-right text-[10px] text-[var(--ui-text-subtle)]">{String(hour).padStart(2, "0")}:00</div>)}</div>
        {dates.map((date, dayIndex) => <div key={date} className={`relative border-r border-[var(--ui-border-subtle)] ${dayIndex === currentTime?.dayIndex ? "bg-[var(--ui-surface-subtle)]" : ""}`} style={{ height: 24 * 60 * WEEK_PIXELS_PER_MINUTE, backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 59px, var(--ui-calendar-gridline) 60px)", backgroundSize: `100% ${60 * WEEK_PIXELS_PER_MINUTE}px` }}>
          {(timedByDate.get(date) ?? []).map((segment) => { const title = itemTitle(segment.item); const timeLabel = segment.item.source === "calendar_event" ? `${formatCalendarTime(segment.item.startsAt)}–${formatCalendarTime(segment.item.endsAt)}` : `${segment.item.startTime}–${segment.item.endTime}`; return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${timeLabel}`} className={`absolute overflow-hidden border-l-2 px-2 py-1 text-left text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] ${itemTone(segment.item)}`} style={{ top: segment.startMinute * WEEK_PIXELS_PER_MINUTE, height: getTimedEventHeight(segment.startMinute, segment.endMinute), left: `calc(${(segment.column / segment.columnCount) * 100}% + 2px)`, width: `calc(${100 / segment.columnCount}% - 4px)` }}><span className="block truncate">{title}</span><span className="block truncate text-[10px] font-normal opacity-80">{timeLabel}{segment.item.source === "calendar_event" && segment.item.location ? ` · ${segment.item.location}` : ""}</span></button>; })}
          {currentTime?.dayIndex === dayIndex ? <div className="pointer-events-none absolute z-10 inset-x-0 border-t-2 border-[var(--ui-danger-solid)]" style={{ top: currentTime.minute * WEEK_PIXELS_PER_MINUTE }} aria-label={t("currentTime", { time: `${String(Math.floor(currentTime.minute / 60)).padStart(2, "0")}:${String(currentTime.minute % 60).padStart(2, "0")}` })}><span className="absolute -left-1 -top-1.5 size-3 rounded-full bg-[var(--ui-danger-surface)]0" /></div> : null}
        </div>)}
      </div>
    </div>
  </div></div></div>;
}

function AgendaView({ start, items, onItem }: { start: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const dates = Array.from({ length: 30 }, (_, index) => addCalendarDays(start, index)).filter((date) => items.some((item) => itemOccursOn(item, date)));
  if (!dates.length) return <p className="p-10 text-center text-sm text-[var(--ui-text-muted)]">{t("agendaEmpty")}</p>;
  return <div className="grid gap-x-8 p-3 sm:p-4 lg:grid-cols-2">{dates.map((date) => <section key={date} className="border-b border-[var(--ui-border-subtle)] py-3 sm:py-4"><h3 className="mb-2 text-sm font-semibold text-[var(--ui-text)]">{dateLabel(date, { weekday: "long", month: "long", day: "numeric" }, locale)}</h3><div className="space-y-2">{getDayItems(items, date).map((item) => <CalendarPill key={item.key} item={item} onClick={() => onItem(item)} />)}</div></section>)}</div>;
}

function DetailPanel({ isOpen, onExited, title, eyebrow, onClose, children }: { isOpen: boolean; onExited: () => void; title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("Calendar"); return <Drawer isOpen={isOpen} focusKey={`${eyebrow}:${title}`} onClose={onClose} onExited={onExited} title={title} className="w-full max-w-[34rem] sm:w-[min(34rem,calc(100%-1rem))]"><header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{eyebrow}</p><h2 className="mt-1 break-words text-xl font-semibold text-[var(--ui-text)]">{title}</h2></div><Button size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={onClose} aria-label={t("close")}><X className="size-4" /></Button></header><main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</main></Drawer>;
}

function DayDetails({ items, onItem }: { date: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  if (!items.length) return <p className="rounded-xl border border-dashed border-[var(--ui-border-strong)] p-6 text-center text-sm text-[var(--ui-text-muted)]">{t("nothingScheduled")}</p>;
  return <div className="space-y-2">{items.map((item) => <button key={item.key} type="button" onClick={() => onItem(item)} className={`w-full rounded-xl border-l-4 p-3 text-left ${itemTone(item)}`}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{itemTypeLabel(item)}</p><p className="mt-1 font-semibold">{itemTitle(item)}</p>{item.source === "calendar_event" && !item.allDay ? <p className="mt-1 text-sm">{formatCalendarTime(item.startsAt, locale)}–{formatCalendarTime(item.endsAt, locale)}</p> : null}</button>)}</div>;
}

function ItemPanel({ isOpen, onExited, item, data, onClose, onEdit, onMutated }: { isOpen: boolean; onExited: () => void; item: CalendarItem; data: CalendarPageData; onClose: () => void; onEdit: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void; onMutated: (item: CalendarItem | null, removedKey: string | null) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale(); const timeOff = useTranslations("TimeOff"); const notifications = useTranslations("Notifications"); const status = useTranslations("Status"); const priority = useTranslations("Priority");
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [reviewNote, setReviewNote] = useState("");
  const timeOffMutationInFlight = useRef(false);
  const itemEyebrow = itemTypeLabel(item);
  async function cancelEvent() { if (item.source !== "calendar_event") return; const thisOccurrence = item.occurrenceStart && window.confirm(locale.startsWith("uk") ? "Скасувати лише цю подію? Натисніть «Скасувати» для всієї серії." : "Cancel only this event? Press Cancel to cancel the entire series."); if (!thisOccurrence && !window.confirm(t("cancelEventConfirm"))) return; setPending(true); const suffix = thisOccurrence ? `?scope=this&occurrenceStart=${encodeURIComponent(item.occurrenceStart ?? "")}` : ""; const response = await fetch(`/api/calendar/events/${encodeURIComponent(item.id)}${suffix}`, { method: "DELETE" }); setPending(false); if (response.ok) onMutated(null, item.key); else setError(t("eventCancelFailed")); }
  async function respondToInvitation(inviteId: string, invitationStatus: "accepted" | "declined") {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/calendar/invitations/${encodeURIComponent(inviteId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: invitationStatus }) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "calendar_event") onMutated(result.item, null);
      else setError(t("eventSaveFailed"));
    } catch { setError(t("eventSaveFailed")); } finally { setPending(false); }
  }
  async function timeOffAction(action: "approve" | "reject" | "cancel") { if (item.source !== "time_off_request_admin" || timeOffMutationInFlight.current) return; if (action === "cancel" && !window.confirm(t("cancelRequestConfirm"))) return; timeOffMutationInFlight.current = true; setPending(true); setError(""); try { const result = await updateTimeOffRequest(item.id, action, reviewNote); if (isTimeOffMutationResult(result)) onMutated(result.item ?? null, result.removedKey ?? null); else setError(timeOff("requestUpdateFailed")); } catch { setError(timeOff("requestUpdateFailed")); } finally { timeOffMutationInFlight.current = false; setPending(false); } }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={itemTitle(item)} eyebrow={itemEyebrow} onClose={pending ? () => undefined : onClose}>{error ? <p role="alert" className="mb-4 rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="space-y-6 text-sm">
    <section><h3 className="font-semibold text-[var(--ui-text)]">{t("when")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.source === "calendar_event" ? `${formatCalendarDateTime(item.startsAt)} – ${formatCalendarDateTime(item.endsAt)}` : `${dateLabel(item.startDate, item.source === "birthday" || item.source === "team_anniversary" ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" })}${item.endDate !== item.startDate ? ` – ${dateLabel(item.endDate, { month: "long", day: "numeric", year: "numeric" })}` : ""}`}</p></section>
    {item.source === "birthday" || item.source === "team_anniversary" || item.source === "salary_payment" ? <section className="flex items-center gap-3 border-t border-[var(--ui-border-subtle)] pt-4"><UserAvatar decorative imageUrl={item.member.avatarUrl} name={item.member.fullName} /><div><h3 className="font-semibold text-[var(--ui-text)]">{item.member.fullName}</h3><p className="text-sm text-[var(--ui-text-secondary)]">{item.source === "team_anniversary" ? t("teamAnniversaryDuration", { count: item.anniversaryYears }) : itemTypeLabel(item)}</p></div></section> : null}
    {item.source === "calendar_event" ? <><section><h3 className="font-semibold">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-[var(--ui-text-secondary)]">{item.description || t("noDescription")}</p>{item.location ? <p className="mt-3 flex gap-2"><MapPin className="size-4" aria-hidden="true" />{item.location}</p> : null}{item.meetingUrl ? <a className="mt-2 flex gap-2 underline" href={item.meetingUrl} target="_blank" rel="noreferrer"><Video className="size-4" aria-hidden="true" />{t("openMeeting")}</a> : null}</section><section><h3 className="font-semibold">{t("organizer")}</h3><div className="mt-2 flex items-center gap-2"><UserAvatar decorative imageUrl={item.organizer.avatar_url} name={item.organizer.full_name} /><span>{item.organizer.full_name}</span></div></section><section><h3 className="font-semibold">{t("invitees")}</h3>{item.invitees.length ? <ul className="mt-2 space-y-2">{item.invitees.map((invitee) => <li key={invitee.inviteId} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={invitee.avatar_url} name={invitee.full_name} /><span className="truncate">{invitee.full_name}</span></span><InvitationStatus status={invitee.status} /></li>)}</ul> : <p className="mt-2 text-[var(--ui-text-secondary)]">{t("noInvitees")}</p>}</section>{item.invitees.find((invitee) => invitee.id === data.currentUserId) ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold">{t("yourResponse")}</h3><div className="mt-3 flex gap-2">{(["accepted", "declined"] as const).map((invitationStatus) => <Button key={invitationStatus} disabled={pending || item.invitees.find((invitee) => invitee.id === data.currentUserId)?.status === invitationStatus} variant={invitationStatus === "accepted" ? "default" : "outline"} onClick={() => { const invite = item.invitees.find((invitee) => invitee.id === data.currentUserId); if (invite) void respondToInvitation(invite.inviteId, invitationStatus); }}>{notifications(invitationStatus === "accepted" ? "accept" : "decline")}</Button>)}</div></section> : null}{item.project ? <Link className="font-medium underline" href={`/projects/${item.project.id}`}>{t("openProject")} · {item.project.name}</Link> : null}{(data.isAdmin || item.organizer.id === data.currentUserId) ? <div className="flex gap-2"><Button disabled={pending} onClick={() => onEdit(item)}>{t("editEvent")}</Button><Button disabled={pending} variant="outline" onClick={() => void cancelEvent()}>{t("cancelEvent")}</Button></div> : null}</> : null}
    {item.source === "project_deadline" ? <><p className="text-[var(--ui-text-secondary)]">{item.project.clientName ?? t("projectMilestone")} · {status(item.project.status)}</p><Link className="font-medium underline" href={`/projects/${item.project.id}`}>{t("openProject")}</Link></> : null}
    {item.source === "task_deadline" ? <><p className="whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.task.description || t("taskDescription")}</p><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("assignee")}</dt><dd>{item.task.assigneeName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("status")}</dt><dd>{status(item.task.status)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("priority")}</dt><dd>{priority(item.task.priority)}</dd></div></dl><Link className="font-medium underline" href={`/projects/${item.task.projectId}`}>{t("openTask", { project: item.task.projectName })}</Link></> : null}
    {item.source === "time_off" ? <p className="text-[var(--ui-text-secondary)]">{t("privateDetails", { name: item.subjectName })}</p> : null}
    {item.source === "time_off_request_admin" ? <><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("employee")}</dt><dd>{item.subjectName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("status")}</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTimeOffStatusBadgeStyle(item.status).className}`}>{timeOff(timeOffStatusKey[item.status])}</span></dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("requestType")}</dt><dd>{timeOff(timeOffRequestTypeKey[item.requestType])}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("time")}</dt><dd>{item.allDay ? timeOff("allDay") : `${item.startTime}–${item.endTime}`}</dd></div></dl><section><h3 className="font-semibold">{timeOff("privateNote")}</h3><p className="mt-2 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.privateNote || timeOff("noPrivateNote")}</p></section>{item.reviewNote ? <section><h3 className="font-semibold">{timeOff("reviewNote")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.reviewNote}</p></section> : null}{data.isAdmin && item.status === "pending" ? <section className="space-y-3 border-t border-[var(--ui-border-subtle)] pt-5"><label className="grid gap-1.5 font-medium">{timeOff("reviewNote")}<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="rounded-xl border border-[var(--ui-border)] p-3 font-normal" /></label><div className="flex gap-2"><Button disabled={pending} onClick={() => void timeOffAction("approve")}>{pending ? timeOff("updating") : timeOff("approve")}</Button><Button disabled={pending} variant="outline" onClick={() => void timeOffAction("reject")}>{timeOff("reject")}</Button></div></section> : null}{((item.isOwn && item.status === "pending") || (data.isAdmin && item.status !== "cancelled")) ? <Button disabled={pending} variant="outline" onClick={() => void timeOffAction("cancel")}>{timeOff("cancelRequest")}</Button> : null}</> : null}
  </div></DetailPanel>;
}

type MutationResult = { success: true; item?: CalendarItem | null; removedKey?: string | null };
function isCalendarItem(value: unknown): value is CalendarItem { return typeof value === "object" && value !== null && "source" in value && "key" in value && typeof value.key === "string"; }
function isMutationResult(value: unknown): value is MutationResult { if (typeof value !== "object" || value === null || !("success" in value) || value.success !== true) return false; if ("item" in value && value.item !== null && value.item !== undefined && !isCalendarItem(value.item)) return false; return !("removedKey" in value) || value.removedKey === null || value.removedKey === undefined || typeof value.removedKey === "string"; }

function InvitationStatus({ status }: { status: CalendarEventInvitationStatus }) {
  const t = useTranslations("Calendar");
  const tone = status === "accepted" ? "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]" : status === "declined" ? "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]" : "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(status === "pending" ? "invitationPending" : status)}</span>;
}

export function InviteePicker({ people, selectedIds, onChange }: { people: CalendarPerson[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("Calendar");
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const selected = people.filter((person) => selectedIds.includes(person.id));
  const visible = people.filter((person) => person.full_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function toggle(id: string) { onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]); }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2" data-invitee-chips>{selected.map((person) => <button key={person.id} type="button" className={`inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] py-1 pl-1 pr-2 text-sm text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-subtle)] ${focusVisibleClassName}`} aria-label={t("removeInvitee", { name: person.full_name })} data-invitee-chip onClick={() => toggle(person.id)}><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="max-w-40 truncate">{person.full_name}</span><X aria-hidden="true" className="ml-0.5 size-3 shrink-0 text-[var(--ui-text-secondary)]" /></button>)}</div><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)] ${focusVisibleClassName}`} data-invitee-trigger><Plus className="size-4" />{t("addInvitees")}</button></Popover.Trigger><Popover.Portal><Popover.Content align="start" sideOffset={6} className="z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 shadow-[var(--ui-shadow-popover)]"><div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 transition-colors focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus)] focus-within:ring-offset-2" data-invitee-search><Search className="size-4 shrink-0 text-[var(--ui-text-muted)]" /><input autoFocus aria-label={t("searchInvitees")} className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[var(--ui-text)] shadow-none outline-none ring-0 placeholder:text-[var(--ui-text-muted)] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" style={{ border: 0, boxShadow: "none", outline: "none" }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchInvitees")} /></div><div className="mt-2 max-h-64 overflow-y-auto">{visible.length ? visible.map((person) => <button type="button" key={person.id} onClick={() => toggle(person.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-[var(--ui-surface-muted)]"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="min-w-0 flex-1 truncate text-sm">{person.full_name}</span>{selectedIds.includes(person.id) ? <Check className="size-4 text-[var(--ui-action-primary)]" /> : null}</button>) : <p className="p-3 text-sm text-[var(--ui-text-muted)]">{t("noInviteeResults")}</p>}</div></Popover.Content></Popover.Portal></Popover.Root></div>;
}

function RecurrenceControl({ allDayControl, locale, value, onChange }: { allDayControl: React.ReactNode; locale: string; value: RecurrenceRule | null; onChange: (value: RecurrenceRule | null) => void }) {
  const uk = locale.startsWith("uk"); const label = uk ? "Повторювати" : "Repeat";
  const options: Array<[string, RecurrenceRule | null]> = [[uk ? "Не повторювати" : "Does not repeat", null], [uk ? "Щодня" : "Daily", { frequency: "daily", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }], [uk ? "Щотижня" : "Weekly", { frequency: "weekly", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }], [uk ? "Щомісяця" : "Monthly", { frequency: "monthly", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }], [uk ? "Щороку" : "Yearly", { frequency: "yearly", interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }]];
  const custom = value !== null && (value.interval > 1 || value.weekdays.length > 0 || value.endsOn !== null || value.occurrenceCount !== null);
  const selected = value === null ? "none" : custom ? "custom" : value.frequency;
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">{allDayControl}<div className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium max-sm:w-full max-sm:justify-between"><span className="flex shrink-0 items-center gap-2"><Repeat2 className="size-4" aria-hidden="true" /><span className="whitespace-nowrap">{label}</span></span><Select className="w-48 max-w-full" value={selected} onValueChange={(next) => { if (next === "none") onChange(null); else if (next === "custom") onChange(value ?? { frequency: "weekly", interval: 2, weekdays: [], endsOn: null, occurrenceCount: null }); else onChange({ frequency: next as RecurrenceRule["frequency"], interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }); }}><SelectItem value="none">{options[0][0]}</SelectItem>{options.slice(1).map(([name, rule]) => <SelectItem key={rule?.frequency} value={rule?.frequency ?? "none"}>{name}</SelectItem>)}<SelectItem value="custom">{uk ? "Власний графік" : "Custom schedule"}</SelectItem></Select></div></div>{value ? <><p className="text-xs text-[var(--ui-text-secondary)]">{recurrenceText(locale, value)}</p>{custom ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">{uk ? "Інтервал" : "Interval"}<input min="1" max="99" type="number" className={`${fieldClass} mt-1`} value={value.interval} onChange={(event) => onChange({ ...value, interval: Number(event.target.value) || 1 })} /></label><label className="text-sm font-medium">{uk ? "Завершити після" : "End after"}<input min="1" max="999" type="number" className={`${fieldClass} mt-1`} value={value.occurrenceCount ?? ""} placeholder={uk ? "Ніколи" : "Never"} onChange={(event) => onChange({ ...value, occurrenceCount: event.target.value ? Number(event.target.value) : null })} /></label>{value.frequency === "weekly" ? <div className="sm:col-span-2"><p className="text-sm font-medium">{uk ? "Дні тижня" : "Days of week"}</p><div className="mt-1 flex flex-wrap gap-2">{(uk ? ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((day, index) => <label key={day} className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" checked={value.weekdays.includes(index)} onChange={() => onChange({ ...value, weekdays: value.weekdays.includes(index) ? value.weekdays.filter((item) => item !== index) : [...value.weekdays, index] })} />{day}</label>)}</div></div> : null}<label className="text-sm font-medium sm:col-span-2">{uk ? "До дати" : "End date"}<input type="date" className={`${fieldClass} mt-1`} value={value.endsOn ?? ""} onChange={(event) => onChange({ ...value, endsOn: event.target.value || null })} /></label></div> : null}</> : null}</section>;
}

function EventForm({ isOpen, onExited, data, item, initialDate, onClose, onSaved }: { isOpen: boolean; onExited: () => void; data: CalendarPageData; item?: Extract<CalendarItem, { source: "calendar_event" }>; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const baseDate = initialDate ?? data.today;
  const initial = createCalendarEventFormValues(item, baseDate);
  const [values, setValues] = useState(initial); const [endDateLinked, setEndDateLinked] = useState(initial.endDate === initial.startDate); const [endTimeLinked, setEndTimeLinked] = useState(true); const [scope, setScope] = useState<"this" | "series">("this"); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const organizerId = item?.organizer.id ?? data.currentUserId;
  const appropriatePeople = (values.projectId && values.eventType !== "meeting" && values.eventType !== "client_presentation" ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : data.people).filter((person) => person.id !== organizerId);
  function updateContext(patch: Partial<typeof values>) {
    const next = { ...values, ...patch };
    const eligible = (next.projectId && next.eventType !== "meeting" && next.eventType !== "client_presentation" ? data.people.filter((person) => person.projectIds.includes(next.projectId)) : data.people).filter((person) => person.id !== organizerId);
    setValues({ ...next, attendeeIds: next.attendeeIds.filter((id) => eligible.some((person) => person.id === id)) });
  }
  function requestClose() { if (pending) return; if (!dirty || window.confirm(t("discardEvent"))) onClose(); }
  function eventFieldError(field: string) {
    if (field === "title") return t("invalidTitle");
    if (field === "eventType") return t("invalidEventType");
    if (field === "projectId") return t("invalidProject");
    if (field === "attendeeIds") return t("invalidAttendees");
    if (field === "meetingUrl") return t("invalidMeetingUrl");
    return t("invalidDateRange");
  }
  async function submit() {
    setPending(true); setError(""); setFieldErrors({});
    try {
      const payload = { ...toCalendarEventMutationPayload(values), scope: item?.occurrenceStart ? scope : "series", occurrenceStart: item?.occurrenceStart ?? undefined };
      const response = await fetch(item ? `/api/calendar/events/${encodeURIComponent(item.id)}` : "/api/calendar/events", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "calendar_event") onSaved(result.item);
      else if (response.ok && typeof result === "object" && result !== null && "requiresRefresh" in result && result.requiresRefresh === true) window.location.reload();
      else if (typeof result === "object" && result !== null) {
        if ("formError" in result && typeof result.formError === "string") setError(t("eventSaveFailed"));
        if ("fieldErrors" in result && typeof result.fieldErrors === "object" && result.fieldErrors !== null) setFieldErrors(Object.fromEntries(Object.keys(result.fieldErrors).map((field) => [field, eventFieldError(field)])));
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error && submissionError.message === "Invalid all-day date range" ? t("invalidDateRange") : t("eventSaveFailed"));
    } finally { setPending(false); }
  }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={item ? t("editEventTitle") : t("addEventTitle")} eyebrow={t("eventForm")} onClose={requestClose}><form autoComplete="off" className="space-y-4" aria-busy={pending} onSubmit={(event) => event.preventDefault()}>
    <FormField label={t("titleLabel")} error={fieldErrors.title}><input className={fieldClass} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("type")} error={fieldErrors.eventType}><Select value={values.eventType} onValueChange={(eventType) => updateContext({ eventType: eventType as CalendarEventType })}>{CALENDAR_EVENT_TYPES.map((type) => <SelectItem key={type} value={type}>{t(eventTypeKey[type])}</SelectItem>)}</Select></FormField><FormField label={t("project")} optional error={fieldErrors.projectId}><Select placeholder={t("selectProject")} value={values.projectId || undefined} onValueChange={(projectId) => updateContext({ projectId })}>{data.projects.map((project) => <SelectItem key={project.id} value={project.id} disabled={project.status === "completed"}>{project.name}{project.status === "completed" ? ` (${t("completedReopen")})` : ""}</SelectItem>)}</Select>{values.projectId ? <button type="button" onClick={() => updateContext({ projectId: "" })} className="mt-2 text-left text-xs font-medium text-[var(--ui-text-secondary)] underline">{t("clearProject")}</button> : null}</FormField></div>
    <RecurrenceControl allDayControl={<label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />{t("allDayEvent")}</label>} locale={locale} value={values.recurrenceRule ?? null} onChange={(recurrenceRule) => setValues({ ...values, recurrenceRule })} />
    <div className={values.allDay ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>{values.allDay ? <><FormField label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /></FormField><FormField label={t("endDate")} error={fieldErrors.endsAt}><DatePicker locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /></FormField></> : <><FormField label={t("starts")}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("startDate")} locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /><TimePicker aria-label={t("startTime")} className="min-w-0" locale={locale} value={values.startTime} onValueChange={(startTime) => setValues(updateEventStartTime(values, startTime, endTimeLinked))} /></div></FormField><FormField label={t("ends")} error={fieldErrors.endsAt}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("endDate")} locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /><TimePicker aria-label={t("endTime")} className="min-w-0" locale={locale} value={values.endTime} onValueChange={(endTime) => { setEndTimeLinked(false); setValues({ ...values, endTime }); }} /></div></FormField></>}</div>
    {item?.occurrenceStart ? <FormField label={locale.startsWith("uk") ? "Застосувати зміни до" : "Apply changes to"}><Select value={scope} onValueChange={(nextScope) => setScope(nextScope as "this" | "series")}><SelectItem value="this">{locale.startsWith("uk") ? "Лише ця подія" : "Only this event"}</SelectItem><SelectItem value="series">{locale.startsWith("uk") ? "Уся серія" : "Entire series"}</SelectItem></Select></FormField> : null}
    <FormField as="div" label={t("invitees")} error={fieldErrors.attendeeIds}><InviteePicker people={appropriatePeople} selectedIds={values.attendeeIds} onChange={(attendeeIds) => setValues({ ...values, attendeeIds })} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("inviteesHelp")}</span></FormField>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("location")}><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField><FormField label={t("meetingUrl")} error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField></div>
    <FormField label={t("descriptionLabel")}><textarea className={textareaClassName} rows={5} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></FormField>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? t("saving") : t("saveEvent")}</Button></div>
  </form></DetailPanel>;
}

function TimeOffForm({ isOpen, onExited, data, initialDate, onClose, onSaved }: { isOpen: boolean; onExited: () => void; data: CalendarPageData; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "time_off_request_admin" }>) => void }) {
  const t = useTranslations("TimeOff");
  const calendar = useTranslations("Calendar"); const locale = useLocale();
  const date = initialDate ?? data.today; const initial = { requestType: "vacation" as TimeOffRequestType, startDate: date, endDate: date, allDay: true, startTime: "09:00", endTime: "10:00", privateNote: "" }; const [values, setValues] = useState(initial); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  function requestClose() { if (pending) return; if (!dirty || window.confirm(t("discardRequest"))) onClose(); }
  function requestFieldError(field: string) { return field === "requestType" ? t("invalidRequestType") : t("invalidDateRange"); }
  async function submit() {
    setPending(true); setError(""); setFieldErrors({});
    try {
      const response = await fetch("/api/calendar/time-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, startTime: values.allDay ? null : values.startTime, endTime: values.allDay ? null : values.endTime }) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "time_off_request_admin") onSaved(result.item);
      else if (typeof result === "object" && result !== null) {
        if ("formError" in result && typeof result.formError === "string") setError(t("requestCreateFailed"));
        if ("fieldErrors" in result && typeof result.fieldErrors === "object" && result.fieldErrors !== null) setFieldErrors(Object.fromEntries(Object.keys(result.fieldErrors).map((field) => [field, requestFieldError(field)])));
      }
    } catch { setError(t("requestCreateFailed")); }
    finally { setPending(false); }
  }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={calendar("requestTimeOffTitle")} eyebrow={t("privateRequest")} onClose={requestClose}><form autoComplete="off" className="space-y-4" aria-busy={pending} onSubmit={(event) => event.preventDefault()}>
    <Input label={t("requestType")} error={fieldErrors.requestType}><Select value={values.requestType} onValueChange={(requestType) => setValues({ ...values, requestType: requestType as TimeOffRequestType })}>{TIME_OFF_REQUEST_TYPES.map((type) => <SelectItem key={type} value={type}>{t(timeOffRequestTypeKey[type])}</SelectItem>)}</Select></Input>
    <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked, endDate: event.target.checked ? values.endDate : values.startDate })} />{t("allDay")}</label>
    <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues({ ...values, startDate, endDate: values.allDay ? values.endDate : startDate })} /></Input><Input label={t("endDate")} error={fieldErrors.endDate}><DatePicker locale={locale} min={values.startDate} value={values.endDate} disabled={!values.allDay} invalid={Boolean(fieldErrors.endDate)} onValueChange={(endDate) => setValues({ ...values, endDate })} /></Input></div>
    {!values.allDay ? <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startTime")}><TimePicker locale={locale} value={values.startTime} onValueChange={(startTime) => setValues({ ...values, startTime })} /></Input><Input label={t("endTime")} error={fieldErrors.endDate}><TimePicker locale={locale} value={values.endTime} onValueChange={(endTime) => setValues({ ...values, endTime })} /></Input></div> : null}
    <Input label={t("privateNote")}><textarea className={textareaClassName} rows={5} value={values.privateNote} onChange={(event) => setValues({ ...values, privateNote: event.target.value })} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("visibleNote")}</span></Input>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? t("submitting") : t("submit")}</Button></div>
  </form></DetailPanel>;
}

function Input({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <FormField label={label} error={error}>{children}</FormField>; }
