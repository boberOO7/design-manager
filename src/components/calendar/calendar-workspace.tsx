"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { Banknote, CakeSlice, CalendarHeart, CalendarOff, CalendarPlus, Check, ChevronLeft, ChevronRight, Ellipsis, Filter, MapPin, Pencil, Plus, Repeat2, RotateCcw, Search, Trash2, UserRoundMinus, Video, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectNavigationLink } from "@/components/projects/project-navigation-link";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Drawer } from "@/components/ui/drawer";
import { focusVisibleClassName, FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DEFAULT_CALENDAR_FILTERS, addCalendarDays, filterCalendarItems,
  formatCalendarDateTime, formatCalendarTime, getCalendarRange, getDayItems, getMonthDesktopWeekCount, getMonthGrid,
  getCurrentWeekTimePosition, getInitialWeekScrollTop, getMonthDateLaneLayout, getMonthItemGeometry, getMonthLaneLayout, getMonthLayoutSegments, getMonthSegmentGeometry,
  getTimedEventHeight, getTimedWeekLayout, getTimedWeekSegments, getWeekAllDaySegments, getMonthMobileDayItems,
  getMonthItemTop, getCalendarItemDisplayTitle, itemOccursOn, mergeCalendarItem, MONTH_EVENT_GEOMETRY, MONTH_LANE_GAP, MONTH_LANE_HEIGHT, parseDateOnly,
  removeCalendarItem, startOfMondayWeek, toDateOnly,
} from "@/lib/calendar";
import { createCalendarEventFormValues, getBusinessTripTitle, getSiteVisitTitle, getWorkMakeupTitle, toCalendarEventMutationPayload, updateEventStartDate, updateEventStartTime } from "@/lib/calendar-event-form";
import { updateLinkedStartDate, updateLinkedStartTime } from "@/lib/calendar-form-range";
import { getCreatableCalendarEventTypes, getCreatableTimeOffRequestTypes } from "@/lib/calendar-creation";
import type { RecurrenceRule } from "@/lib/calendar-recurrence";
import { isTimeOffMutationResult, updateTimeOffRequest } from "@/lib/time-off-request-client";
import { getTimeOffStatusBadgeStyle } from "@/lib/semantic-styles";
import { getWorkMakeupMinutes } from "@/lib/time-off-compensation";
import { getTimeOffRequestPresentation, timeOffRequestTypeKey, timeOffStatusKey } from "@/lib/time-off-labels";
import { getCalendarEventDetailConfig, getCalendarEventTypeConfig } from "@/lib/calendar-event-types";
import type { CalendarEventInvitationStatus, CalendarEventType, CalendarFilters, CalendarItem, CalendarPageData, CalendarPerson, CalendarProject, CalendarView, MeetingMode, TimeOffRequestType } from "@/types/calendar";

type SearchParams = Record<string, string | string[] | undefined>;
type Drawer = { kind: "day"; date: string } | { kind: "item"; item: CalendarItem } | { kind: "event-form"; item?: Extract<CalendarItem, { source: "calendar_event" }>; date?: string } | { kind: "time-off-form"; date?: string } | { kind: "days-off" } | null;

const fieldClass = inputClassName;
// An eleven-hour desktop window and compact baseline keep the time grid dense
// while preserving the pixel-per-minute geometry used for timed events.
const WEEK_VIEWPORT_WINDOW_MINUTES = 11 * 60;
const WEEK_MIN_PIXELS_PER_MINUTE = 0.92;

function recurrenceText(locale: string, rule: RecurrenceRule | null) {
  const uk = locale.startsWith("uk"); if (!rule) return uk ? "Не повторювати" : "Does not repeat";
  const names = uk ? { daily: "Щодня", weekly: "Щотижня", monthly: "Щомісяця", yearly: "Щороку" } : { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  return rule.interval === 1 ? names[rule.frequency] : `${uk ? "Кожні" : "Every"} ${rule.interval} ${uk ? "рази" : rule.frequency}`;
}
function param(params: SearchParams, key: string) { const value = params[key]; return typeof value === "string" ? value : ""; }
function itemTone(item: CalendarItem) {
  if (item.source === "calendar_event") return getCalendarEventTypeConfig(item.eventType).tone;
  if (item.source === "project_deadline") return "border-l-[var(--ui-warning-accent)] bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
  if (item.source === "task_deadline") return "border-l-[var(--ui-info-accent)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
  if (item.source === "birthday") return "border-l-[var(--ui-birthday-border)] bg-[var(--ui-birthday-surface)] text-[var(--ui-birthday-text)]";
  if (item.source === "team_anniversary") return "border-l-[var(--ui-anniversary-border)] bg-[var(--ui-anniversary-surface)] text-[var(--ui-anniversary-text)]";
  if (item.source === "salary_payment") return "border-l-[var(--ui-payment-border)] bg-[var(--ui-payment-surface)] text-[var(--ui-payment-text)]";
  if (item.source === "studio_day_off") return "border-l-[var(--ui-violet-text)] bg-[var(--ui-violet-surface)] text-[var(--ui-violet-text)]";
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
  return (item: CalendarItem) => item.source === "studio_day_off" ? t("studioDayOffEvent", { name: item.title }) : item.source === "birthday" ? t("birthdayEvent", { name: item.member.fullName }) : item.source === "team_anniversary" ? t("teamAnniversaryEvent", { name: item.member.fullName }) : item.source === "salary_payment" ? t("salaryPaymentEvent", { name: item.member.fullName }) : getCalendarItemDisplayTitle(item, {
    outOfOffice: t("outOfOffice"),
    pendingRequest: t("pendingRequest"),
    rejectedRequest: t("rejectedRequest"),
    unknownEmployee: common("unknown"),
  });
}

function useCalendarItemTypeLabel() {
  const t = useTranslations("Calendar");
  return (item: CalendarItem) => item.source === "calendar_event" ? t(getCalendarEventTypeConfig(item.eventType).labelKey) : item.source === "project_deadline" ? t("projectDeadline") : item.source === "task_deadline" ? t("taskDeadline") : item.source === "birthday" ? t("birthdays") : item.source === "team_anniversary" ? t("teamAnniversaries") : item.source === "salary_payment" ? t("salaryPayments") : item.source === "studio_day_off" ? t("companyDaysOff") : item.source === "time_off_request_admin" && item.status === "pending" ? t("pendingRequest") : item.source === "time_off_request_admin" && item.status === "rejected" ? t("rejectedRequest") : t("outOfOffice");
}

const monthItemPresentationClassName = "box-border min-w-0 overflow-hidden border-y-0 border-r-0 p-0 text-left text-xs font-medium leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1";

const SYSTEM_CALENDAR_CHIP_ICONS: Partial<Record<CalendarItem["source"], LucideIcon>> = {
  birthday: CakeSlice,
  team_anniversary: CalendarHeart,
  salary_payment: Banknote,
  studio_day_off: CalendarOff,
  time_off: UserRoundMinus,
  time_off_request_admin: UserRoundMinus,
};

function CalendarChipIcon({ item, size = "size-3" }: { item: CalendarItem; size?: string }) {
  const Icon = item.source === "calendar_event" ? getCalendarEventTypeConfig(item.eventType).Icon : SYSTEM_CALENDAR_CHIP_ICONS[item.source];
  if (!Icon) return null;
  return <Icon aria-hidden="true" className={`${size} shrink-0 stroke-[1.75]`} />;
}

function CalendarDetailHeaderIcon({ item }: { item: CalendarItem }) {
  return <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${itemTone(item)}`}><CalendarChipIcon item={item} size="size-4" /></span>;
}

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
    <span className="sr-only">{label}: </span><span className="flex h-full min-w-0 items-center gap-1"><CalendarChipIcon item={item} /><span className="truncate">{!item.allDay && item.source === "calendar_event" ? `${formatCalendarTime(item.startsAt, locale)} ` : ""}{title}</span></span>
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
  const filters: CalendarFilters = {
    events: param(searchParams, "events") !== "0",
    projectDeadlines: param(searchParams, "projects") !== "0",
    taskDeadlines: param(searchParams, "tasks") === "1",
    timeOff: param(searchParams, "timeOff") !== "0",
    birthdays: param(searchParams, "birthdays") !== "0",
    teamAnniversaries: param(searchParams, "anniversaries") !== "0",
    salaryPayments: initialData.isAdmin && param(searchParams, "payments") !== "0",
    studioDaysOff: param(searchParams, "daysOff") !== "0",
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
    if (!merged.studioDaysOff) nextParams.set("daysOff", "0");
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
  const fillsViewport = initialView !== "agenda";

  return <div className="calendar-viewport min-w-0 space-y-3">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="sm" className="min-h-11 gap-2 sm:min-h-0" onClick={() => openDrawer({ kind: "event-form" })}><CalendarPlus aria-hidden="true" className="size-4" />{t("addEvent")}</Button>
        <Button size="sm" className="min-h-11 gap-2 sm:min-h-0" title={t("submitAbsenceRequest")} variant="outline" onClick={() => openDrawer({ kind: "time-off-form" })}><CalendarOff aria-hidden="true" className="size-4" />{t("absence")}</Button>
        {initialData.isAdmin && initialData.pendingCount > 0 ? <span className="inline-flex items-center rounded-full bg-[var(--ui-violet-surface)] px-3 text-xs font-semibold text-[var(--ui-violet-text)]">{t("pending", { count: initialData.pendingCount })}</span> : null}
      </div>
    </header>

    <section className={`${fillsViewport ? "calendar-fill-card " : ""}overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm`}>
      <div className="calendar-toolbar flex flex-col gap-3 border-b border-[var(--ui-border)] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" aria-label={t("previous")} onClick={() => movePeriod(-1)}><ChevronLeft className="size-4" /></Button><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" onClick={() => navigate({ date: initialData.today })}>{t("today")}</Button><Button size="sm" className="min-h-11 sm:min-h-0" variant="outline" aria-label={t("next")} onClick={() => movePeriod(1)}><ChevronRight className="size-4" /></Button></div><h2 className="min-w-0 text-sm font-semibold text-[var(--ui-text)] sm:ml-2 sm:text-base">{periodLabel}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl className="w-full sm:w-auto [&_button]:min-h-11 sm:[&_button]:min-h-0" ariaLabel={t("view")} items={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "agenda", label: t("agenda") }]} value={initialView} onValueChange={(view) => navigate({ view })} />
          <Select size="compact" className="min-h-11 w-[min(100%,12rem)] sm:min-h-0 sm:w-44" aria-label={t("filterProject")} value={filters.projectId} onValueChange={(projectId) => navigate({}, true, { projectId })}><SelectItem value="">{t("allProjects")}</SelectItem>{initialData.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select>
          <Select size="compact" className="min-h-11 w-[min(100%,12rem)] sm:min-h-0 sm:w-40" aria-label={t("filterPerson")} value={filters.personId} onValueChange={(personId) => navigate({}, true, { personId })}><SelectItem value="">{t("allPeople")}</SelectItem>{initialData.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</Select>
          <CalendarFilterMenu data={initialData} filters={filters} onChange={(patch) => navigate({}, true, patch)} onReset={() => navigate({}, true, { ...DEFAULT_CALENDAR_FILTERS, salaryPayments: initialData.isAdmin && DEFAULT_CALENDAR_FILTERS.salaryPayments })} />
          {initialData.isAdmin ? <Button size="sm" className="min-h-11 w-11 p-0 sm:min-h-0" variant="outline" aria-label={t("manageDaysOff")} title={t("manageDaysOff")} onClick={() => openDrawer({ kind: "days-off" })}><Ellipsis aria-hidden="true" className="size-4" /></Button> : null}
        </div>
      </div>
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
    {drawer?.kind === "days-off" ? <StudioDaysOffPanel isOpen={isDrawerOpen} onExited={clearExitedDrawer} initialYear={Number(initialDate.slice(0, 4))} items={items.filter((item): item is Extract<CalendarItem, { source: "studio_day_off" }> => item.source === "studio_day_off")} onClose={closeDrawer} onChange={(next, removedKey) => { setItems((current) => removedKey ? removeCalendarItem(current, removedKey) : next ? mergeCalendarItem(current, next) : current); router.refresh(); }} /> : null}
  </div>;
}

function CalendarFilterMenu({ data, filters, onChange, onReset }: { data: CalendarPageData; filters: CalendarFilters; onChange: (patch: Partial<CalendarFilters>) => void; onReset: () => void }) {
  const t = useTranslations("Calendar"); const checks: Array<[keyof Pick<CalendarFilters, "events" | "projectDeadlines" | "taskDeadlines" | "timeOff" | "birthdays" | "teamAnniversaries" | "salaryPayments" | "studioDaysOff">, string]> = [["events", t("events")], ["projectDeadlines", t("projectDeadlines")], ["taskDeadlines", t("taskDeadlines")], ["timeOff", t("teamAvailability")], ["birthdays", t("birthdays")], ["teamAnniversaries", t("teamAnniversaries")], ["studioDaysOff", t("companyDaysOff")]];
  if (data.isAdmin) checks.push(["salaryPayments", t("salaryPayments")]);
  return <Popover.Root><Popover.Trigger asChild><Button size="sm" className="min-h-11 gap-2 sm:min-h-0" variant="outline"><Filter aria-hidden="true" className="size-4" />{t("filters")}</Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} collisionPadding={8} className="z-[80] w-[min(18rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
    <fieldset><legend className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-[.1em] text-[var(--ui-text-muted)]">{t("show")}</legend><div className="space-y-0.5">{checks.map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-sm text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] sm:min-h-9"><input type="checkbox" className="size-4 shrink-0 accent-[var(--ui-action-primary)]" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />{label}</label>)}</div></fieldset>
    <div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-2"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] sm:min-h-9"><input type="checkbox" className="size-4 shrink-0 accent-[var(--ui-action-primary)]" checked={filters.mine} onChange={(event) => onChange({ mine: event.target.checked })} />{t("relevantToMe")}</label></div>
    <div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-2"><button type="button" onClick={onReset} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-left text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-9"><RotateCcw aria-hidden="true" className="size-4" />{t("resetFilters")}</button></div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}

function MonthView({ anchor, today, items, onDay, onItem }: { anchor: string; today: string; items: CalendarItem[]; onDay: (date: string) => void; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const dates = getMonthGrid(anchor); const month = anchor.slice(0, 7);
  const desktopWeekCount = getMonthDesktopWeekCount(anchor);
  const segments = getMonthLayoutSegments(items, dates);
  const visibleLaneCount = 3;
  const allDayItemKeys = new Set(segments.map((segment) => segment.itemId));
  const segmentsByWeek = new Map<number, typeof segments>();
  for (const segment of segments) segmentsByWeek.set(segment.weekIndex, [...(segmentsByWeek.get(segment.weekIndex) ?? []), segment]);

  return <div className="calendar-month-view"><div className="calendar-month-weekdays hidden grid-cols-7 border-b border-[var(--ui-border)] text-center text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] md:grid">{Array.from({ length: 7 }, (_, index) => dateLabel(addCalendarDays("2024-01-01", index), { weekday: "short" }, locale)).map((day) => <div key={day} className="py-3">{day}</div>)}</div>
    <div className="calendar-month-grid hidden md:block" style={{ gridTemplateRows: `repeat(${desktopWeekCount}, minmax(0, 1fr))` }}>{Array.from({ length: desktopWeekCount }, (_, weekIndex) => {
      const weekDates = dates.slice(weekIndex * 7, weekIndex * 7 + 7);
      const weekSegments = segmentsByWeek.get(weekIndex) ?? [];
      const laneLayout = getMonthLaneLayout(weekSegments, visibleLaneCount);
      return <section key={weekDates[0]} className="calendar-month-week relative grid grid-cols-7" aria-label={t("weekOf", { date: dateLabel(weekDates[0] ?? anchor, undefined, locale) })}>
        {weekDates.map((date) => {
          const timedItems = getDayItems(items, date).filter((item) => !allDayItemKeys.has(item.key));
          const hiddenSpanningItems = new Set(weekSegments.filter((segment) => segment.lane >= visibleLaneCount && segment.visibleStartDate <= date && segment.visibleEndDate >= date).map((segment) => segment.itemId));
          const dateLaneLayout = getMonthDateLaneLayout(weekSegments, date, visibleLaneCount);
          const visibleTimedItems = timedItems.slice(0, Math.max(0, visibleLaneCount - dateLaneLayout.laneCount));
          const overflow = hiddenSpanningItems.size + timedItems.length - visibleTimedItems.length;
          return <div key={date} className={`calendar-month-day min-h-36 border-b border-r border-[var(--ui-border-subtle)] p-2 text-left align-top hover:bg-[var(--ui-surface-subtle)] ${date.slice(0, 7) !== month ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text-subtle)]" : ""}`}><button type="button" onClick={() => onDay(date)} aria-label={t("openDate", { date: dateLabel(date, { month: "long", day: "numeric" }, locale) })} className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "hover:bg-[var(--ui-surface-muted)]"}`}>{Number(date.slice(-2))}</button><div className="grid" style={{ marginTop: dateLaneLayout.itemOffset, rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>{visibleTimedItems.map((item) => <CalendarPill key={item.key} item={item} month onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} aria-label={t("moreEvents", { count: overflow, date: dateLabel(date, { month: "long", day: "numeric" }, locale) })} className="calendar-month-overflow min-h-11 px-2 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} {t("more")}</button> : null}</div></div>;
        })}
        <div className="pointer-events-none absolute inset-x-0 grid grid-cols-7" style={{ top: getMonthItemTop(), gridTemplateRows: `repeat(${laneLayout.laneCount}, ${MONTH_LANE_HEIGHT}px)`, rowGap: MONTH_LANE_GAP }} aria-label={t("allDayItems")}>
          {weekSegments.filter((segment) => segment.lane < visibleLaneCount).map((segment) => { const geometry = getMonthSegmentGeometry(segment); const title = itemTitle(segment.item); return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}${segment.continuesBefore ? ", continues from the previous week" : ""}${segment.continuesAfter ? ", continues into the next week" : ""}`} className={`pointer-events-auto ${monthItemPresentationClassName} ${itemTone(segment.item)}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1, height: geometry.height, marginLeft: geometry.leftInset, marginRight: geometry.rightInset, paddingInline: geometry.textPaddingInline, paddingBlock: geometry.verticalPadding, borderLeftWidth: geometry.borderInlineStartWidth, borderTopLeftRadius: geometry.leftRadius, borderBottomLeftRadius: geometry.leftRadius, borderTopRightRadius: geometry.rightRadius, borderBottomRightRadius: geometry.rightRadius }}><span className="flex h-full min-w-0 items-center gap-1"><CalendarChipIcon item={segment.item} /><span className="truncate">{segment.showLabel ? title : ""}</span></span></button>; })}
        </div>
      </section>;
    })}</div>
    <div className="divide-y divide-[var(--ui-border-subtle)] md:hidden">{dates.filter((date) => getDayItems(items, date).some((item) => !allDayItemKeys.has(item.key)) || segments.some((segment) => segment.visibleStartDate === date) || date === today).map((date) => { const { visible, overflow } = getMonthMobileDayItems(items, segments, date); return <div key={date} className="flex w-full gap-3 p-3 text-left sm:gap-4 sm:p-4"><button type="button" onClick={() => onDay(date)} aria-label={`Open ${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}`} className="min-h-11 w-12 shrink-0 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="block text-xs font-semibold uppercase text-[var(--ui-text-subtle)]">{dateLabel(date, { weekday: "short" })}</span><span className={`mx-auto mt-1 flex size-9 items-center justify-center rounded-full font-semibold ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text)]"}`}>{Number(date.slice(-2))}</span></button><div className="min-w-0 flex-1" style={{ display: "grid", rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>{visible.map((item) => <CalendarPill key={item.key} item={item} mobile month onClick={() => onItem(item)} />)}{overflow ? <button type="button" onClick={() => onDay(date)} aria-label={`Show ${overflow} more events on ${dateLabel(date, { month: "long", day: "numeric" })}`} className="min-h-11 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} more</button> : null}</div></div>; })}</div></div>;
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
  const [pixelsPerMinute, setPixelsPerMinute] = useState(WEEK_MIN_PIXELS_PER_MINUTE);
  const currentTime = now ? getCurrentWeekTimePosition(dates, now) : null;
  useEffect(() => {
    const initialNow = new Date();
    initialCurrentDayIndexRef.current = getCurrentWeekTimePosition(dates, initialNow)?.dayIndex;
    const frame = window.requestAnimationFrame(() => setNow(initialNow));
    const horizontalContainer = horizontalScrollRef.current;
    if (horizontalContainer && window.matchMedia("(max-width: 767px)").matches && initialCurrentDayIndexRef.current !== undefined) {
      horizontalContainer.scrollLeft = Math.max(0, initialCurrentDayIndexRef.current * 112 - 56);
    }
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [dates]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !window.matchMedia("(min-width: 1024px) and (min-height: 900px)").matches) return;
    const updateScale = () => setPixelsPerMinute(Math.max(WEEK_MIN_PIXELS_PER_MINUTE, container.clientHeight / WEEK_VIEWPORT_WINDOW_MINUTES));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = getInitialWeekScrollTop() * pixelsPerMinute;
  }, [dates, pixelsPerMinute]);

  return <div className="calendar-week-view relative"><p id="week-scroll-hint" className="border-b border-[var(--ui-border-subtle)] px-3 py-2 text-xs text-[var(--ui-text-muted)] md:hidden">{t("weekScrollHint")}</p><div ref={horizontalScrollRef} aria-describedby="week-scroll-hint" aria-label={t("weeklyCalendar")} className="calendar-week-horizontal overflow-x-auto overscroll-x-contain"><div className="calendar-week-content min-w-[840px] sm:min-w-[900px]">
    <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))] border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border)]" />
      {dates.map((date, dayIndex) => <div key={date} className={`border-r border-[var(--ui-border)] px-2 py-3 text-center text-xs font-semibold ${currentTime?.dayIndex === dayIndex ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}><span className="block uppercase tracking-wide">{dateLabel(date, { weekday: "short" }, locale)}</span><span className="mt-1 block text-sm">{dateLabel(date, { month: "short", day: "numeric" }, locale)}</span></div>)}
    </div>
    <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))] border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-subtle)]">{t("allDay")}</div>
      <div className="relative col-span-7 grid grid-cols-7 gap-y-1 px-1 py-1" style={{ minHeight: allDayLanes * 22 + 8, gridTemplateRows: `repeat(${allDayLanes}, 20px)` }}>
        {allDaySegments.map((segment) => { const title = itemTitle(segment.item); return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}`} className={`min-w-0 border-l-2 px-2 text-left text-xs font-medium leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] focus:ring-offset-1 ${itemTone(segment.item)} ${segment.continuesBefore ? "rounded-l-none" : "rounded-l-md"} ${segment.continuesAfter ? "rounded-r-none" : "rounded-r-md"}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1 }}><span className="flex min-w-0 items-center gap-1"><CalendarChipIcon item={segment.item} /><span className="truncate">{title}</span></span></button>; })}
      </div>
    </div>
    <div ref={scrollRef} className="calendar-week-timeline max-h-[36rem] overflow-y-auto">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(7rem,1fr))]">
        <div className="sticky left-0 z-20 bg-[var(--ui-surface)]">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="border-r border-b border-[var(--ui-border)] pr-2 pt-1 text-right text-[10px] text-[var(--ui-text-subtle)]" style={{ height: 60 * pixelsPerMinute }}>{String(hour).padStart(2, "0")}:00</div>)}</div>
        {dates.map((date, dayIndex) => <div key={date} className={`relative border-r border-[var(--ui-border)] ${dayIndex === currentTime?.dayIndex ? "bg-[var(--ui-surface-subtle)]" : ""}`} style={{ height: 24 * 60 * pixelsPerMinute, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * pixelsPerMinute - 1}px, var(--ui-calendar-gridline) ${60 * pixelsPerMinute}px)`, backgroundSize: `100% ${60 * pixelsPerMinute}px` }}>
          {(timedByDate.get(date) ?? []).map((segment) => { const title = itemTitle(segment.item); const timeLabel = segment.item.source === "calendar_event" ? `${formatCalendarTime(segment.item.startsAt)}–${formatCalendarTime(segment.item.endsAt)}` : `${segment.item.startTime}–${segment.item.endTime}`; return <button key={segment.segmentId} type="button" onClick={() => onItem(segment.item)} title={title} aria-label={`${title}, ${timeLabel}`} className={`absolute overflow-hidden border-l-2 px-2 py-1 text-left text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] ${itemTone(segment.item)}`} style={{ top: segment.startMinute * pixelsPerMinute, height: getTimedEventHeight(segment.startMinute, segment.endMinute, pixelsPerMinute), left: `calc(${(segment.column / segment.columnCount) * 100}% + 2px)`, width: `calc(${100 / segment.columnCount}% - 4px)` }}><span className="flex min-w-0 items-center gap-1"><CalendarChipIcon item={segment.item} /><span className="truncate">{title}</span></span><span className="block truncate text-[10px] font-normal opacity-80">{timeLabel}{segment.item.source === "calendar_event" && segment.item.location ? ` · ${segment.item.location}` : ""}</span></button>; })}
          {currentTime?.dayIndex === dayIndex ? <div className="pointer-events-none absolute z-10 inset-x-0 border-t-2 border-[var(--ui-danger-solid)]" style={{ top: currentTime.minute * pixelsPerMinute }} aria-label={t("currentTime", { time: `${String(Math.floor(currentTime.minute / 60)).padStart(2, "0")}:${String(currentTime.minute % 60).padStart(2, "0")}` })}><span className="absolute -left-1 -top-1.5 size-3 rounded-full bg-[var(--ui-danger-surface)]0" /></div> : null}
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

function DetailPanel({ isOpen, onExited, title, eyebrow, item, onClose, children }: { isOpen: boolean; onExited: () => void; title: string; eyebrow: string; item?: CalendarItem; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("Calendar"); return <Drawer isOpen={isOpen} focusKey={`${eyebrow}:${title}`} onClose={onClose} onExited={onExited} title={title} className="w-full max-w-[34rem] sm:w-[min(34rem,calc(100%-1rem))]"><header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5"><div className="flex min-w-0 items-start gap-3">{item ? <CalendarDetailHeaderIcon item={item} /> : null}<div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{eyebrow}</p><h2 className="mt-1 break-words text-xl font-semibold text-[var(--ui-text)]">{title}</h2></div></div><Button size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={onClose} aria-label={t("close")}><X className="size-4" /></Button></header><main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</main></Drawer>;
}

function DayDetails({ items, onItem }: { date: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  if (!items.length) return <p className="rounded-xl border border-dashed border-[var(--ui-border-strong)] p-6 text-center text-sm text-[var(--ui-text-muted)]">{t("nothingScheduled")}</p>;
  return <div className="space-y-2">{items.map((item) => <button key={item.key} type="button" onClick={() => onItem(item)} className={`w-full rounded-xl border-l-4 p-3 text-left ${itemTone(item)}`}><p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-70"><CalendarChipIcon item={item} size="size-3.5" />{itemTypeLabel(item)}</p><p className="mt-1 font-semibold">{itemTitle(item)}</p>{item.source === "calendar_event" && !item.allDay ? <p className="mt-1 text-sm">{formatCalendarTime(item.startsAt, locale)}–{formatCalendarTime(item.endsAt, locale)}</p> : null}</button>)}</div>;
}

function ItemPanel({ isOpen, onExited, item, data, onClose, onEdit, onMutated }: { isOpen: boolean; onExited: () => void; item: CalendarItem; data: CalendarPageData; onClose: () => void; onEdit: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void; onMutated: (item: CalendarItem | null, removedKey: string | null) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale(); const timeOff = useTranslations("TimeOff"); const status = useTranslations("Status"); const priority = useTranslations("Priority");
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
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={itemTitle(item)} eyebrow={itemEyebrow} item={item} onClose={pending ? () => undefined : onClose}>{error ? <p role="alert" className="mb-4 rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="space-y-6 text-sm">
    <section><h3 className="font-semibold text-[var(--ui-text)]">{t("when")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.source === "calendar_event" ? `${formatCalendarDateTime(item.startsAt)} – ${formatCalendarDateTime(item.endsAt)}` : `${dateLabel(item.startDate, item.source === "birthday" || item.source === "team_anniversary" ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" })}${item.endDate !== item.startDate ? ` – ${dateLabel(item.endDate, { month: "long", day: "numeric", year: "numeric" })}` : ""}`}</p></section>
    {item.source === "birthday" || item.source === "team_anniversary" || item.source === "salary_payment" ? <section className="flex items-center gap-3 border-t border-[var(--ui-border-subtle)] pt-4"><UserAvatar decorative imageUrl={item.member.avatarUrl} name={item.member.fullName} /><div><h3 className="font-semibold text-[var(--ui-text)]">{item.member.fullName}</h3><p className="text-sm text-[var(--ui-text-secondary)]">{item.source === "team_anniversary" ? t("teamAnniversaryDuration", { count: item.anniversaryYears }) : itemTypeLabel(item)}</p></div></section> : null}
    {item.source === "calendar_event" ? <><CalendarEventDetails item={item} data={data} pending={pending} onRespond={(inviteId, invitationStatus) => void respondToInvitation(inviteId, invitationStatus)} />{(data.isAdmin || item.organizer.id === data.currentUserId) ? <div className="flex gap-2"><Button disabled={pending} onClick={() => onEdit(item)}>{t("editEvent")}</Button><Button disabled={pending} variant="outline" onClick={() => void cancelEvent()}>{t("cancelEvent")}</Button></div> : null}</> : null}
    {item.source === "project_deadline" ? <><p className="text-[var(--ui-text-secondary)]">{item.project.clientName ?? t("projectMilestone")} · {status(item.project.status)}</p><ProjectNavigationLink href={`/projects/${item.project.id}`} label={t("openProject")} name={item.project.name} /></> : null}
    {item.source === "task_deadline" ? <><p className="whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.task.description || t("taskDescription")}</p><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("assignee")}</dt><dd>{item.task.assigneeName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("status")}</dt><dd>{status(item.task.status)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("priority")}</dt><dd>{priority(item.task.priority)}</dd></div></dl><ProjectNavigationLink href={`/projects/${item.task.projectId}`} label={t("openTask", { project: item.task.projectName })} name={item.task.projectName} /></> : null}
    {item.source === "time_off" ? <p className="text-[var(--ui-text-secondary)]">{t("privateDetails", { name: item.subjectName })}</p> : null}
    {item.source === "studio_day_off" ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold text-[var(--ui-text)]">{item.title}</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-[var(--ui-text-secondary)]">{item.note || t("noNote")}</p></section> : null}
    {item.source === "time_off_request_admin" ? <><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("employee")}</dt><dd>{item.subjectName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("status")}</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTimeOffStatusBadgeStyle(item.status).className}`}>{timeOff(timeOffStatusKey[item.status])}</span></dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("requestType")}</dt><dd>{timeOff(timeOffRequestTypeKey[item.requestType])}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("time")}</dt><dd>{item.allDay ? timeOff("allDay") : `${item.startTime}–${item.endTime}`}</dd></div></dl>{item.compensation ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold">{t("compensation")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.compensation.compensatedMinutes === 0 ? t("notCompensated") : item.compensation.remainingMinutes === 0 ? t("compensated") : t("partiallyCompensated")} · {t("compensationProgress", { compensated: item.compensation.compensatedMinutes / 60, required: item.compensation.requiredMinutes / 60 })}</p></section> : null}<section><h3 className="font-semibold">{timeOff("reason")}</h3><p className="mt-2 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.privateNote || timeOff("noReason")}</p></section>{item.reviewNote ? <section><h3 className="font-semibold">{timeOff("reviewNote")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.reviewNote}</p></section> : null}{data.isAdmin && item.status === "pending" ? <section className="space-y-3 border-t border-[var(--ui-border-subtle)] pt-5"><label className="grid gap-1.5 font-medium">{timeOff("reviewNote")}<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="rounded-xl border border-[var(--ui-border)] p-3 font-normal" /></label><div className="flex gap-2"><Button disabled={pending} onClick={() => void timeOffAction("approve")}>{pending ? timeOff("updating") : timeOff("approve")}</Button><Button disabled={pending} variant="outline" onClick={() => void timeOffAction("reject")}>{timeOff("reject")}</Button></div></section> : null}{((item.isOwn && item.status === "pending") || (data.isAdmin && item.status !== "cancelled")) ? <Button disabled={pending} variant="outline" onClick={() => void timeOffAction("cancel")}>{timeOff("cancelRequest")}</Button> : null}</> : null}
  </div></DetailPanel>;
}

type StudioDayOffItem = Extract<CalendarItem, { source: "studio_day_off" }>;
type StudioDayOffRecord = Pick<StudioDayOffItem, "id" | "title" | "startDate" | "note">;

function studioDayOffItem(record: StudioDayOffRecord): StudioDayOffItem {
  return { source: "studio_day_off", key: `studio-day-off:${record.id}`, id: record.id, title: record.title, note: record.note, startDate: record.startDate, endDate: record.startDate, allDay: true, projectId: null, personIds: [] };
}

function parseStudioDayOffResponse(value: unknown): StudioDayOffRecord | null {
  if (typeof value !== "object" || value === null || !("dayOff" in value) || typeof value.dayOff !== "object" || value.dayOff === null) return null;
  const dayOff = value.dayOff;
  if (!("id" in dayOff) || !("date" in dayOff) || !("name" in dayOff) || !("note" in dayOff)) return null;
  return typeof dayOff.id === "string" && typeof dayOff.date === "string" && typeof dayOff.name === "string" && (typeof dayOff.note === "string" || dayOff.note === null)
    ? { id: dayOff.id, title: dayOff.name, startDate: dayOff.date, note: dayOff.note }
    : null;
}

function StudioDaysOffPanel({ isOpen, onExited, initialYear, items, onClose, onChange }: { isOpen: boolean; onExited: () => void; initialYear: number; items: StudioDayOffItem[]; onClose: () => void; onChange: (next: StudioDayOffItem | null, removedKey: string | null) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const [year, setYear] = useState(initialYear); const [editing, setEditing] = useState<StudioDayOffItem | null>(null); const [adding, setAdding] = useState(false); const [name, setName] = useState(""); const [date, setDate] = useState(`${initialYear}-01-01`); const [note, setNote] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const yearItems = items.filter((item) => item.startDate.startsWith(`${year}-`));
  function resetForm() { setEditing(null); setAdding(false); setName(""); setDate(`${year}-01-01`); setNote(""); setError(""); }
  function edit(item: StudioDayOffItem) { setEditing(item); setAdding(true); setName(item.title); setDate(item.startDate); setNote(item.note ?? ""); setError(""); }
  async function save() {
    setPending(true); setError("");
    try {
      const response = await fetch(editing ? `/api/calendar/days-off/${encodeURIComponent(editing.id)}` : "/api/calendar/days-off", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, date, note }) });
      const result: unknown = await response.json(); const record = response.ok ? parseStudioDayOffResponse(result) : null;
      if (!record) { setError(t("dayOffSaveFailed")); return; }
      onChange(studioDayOffItem(record), null); setYear(Number(record.startDate.slice(0, 4))); resetForm();
    } catch { setError(t("dayOffSaveFailed")); } finally { setPending(false); }
  }
  async function remove(item: StudioDayOffItem) {
    if (!window.confirm(t("deleteDayOffConfirm", { name: item.title }))) return;
    setPending(true); setError("");
    try { const response = await fetch(`/api/calendar/days-off/${encodeURIComponent(item.id)}`, { method: "DELETE" }); if (!response.ok) { setError(t("dayOffDeleteFailed")); return; } onChange(null, item.key); } catch { setError(t("dayOffDeleteFailed")); } finally { setPending(false); }
  }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={t("manageDaysOffTitle", { year })} eyebrow={t("companyDaysOff")} onClose={pending ? () => undefined : onClose}>
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-[var(--ui-border-subtle)] pb-3"><Button size="sm" variant="ghost" className="size-11 p-0" aria-label={t("previousYear")} onClick={() => { setYear((value) => value - 1); resetForm(); }}><ChevronLeft aria-hidden="true" className="size-4" /></Button><p aria-live="polite" className="text-base font-semibold tabular-nums text-[var(--ui-text)]">{year}</p><Button size="sm" variant="ghost" className="size-11 p-0" aria-label={t("nextYear")} onClick={() => { setYear((value) => value + 1); resetForm(); }}><ChevronRight aria-hidden="true" className="size-4" /></Button></div>
      {yearItems.length ? <div className="divide-y divide-[var(--ui-border-subtle)] border-y border-[var(--ui-border-subtle)]">{yearItems.map((item) => <div key={item.key} className="grid grid-cols-[6.25rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-4 transition-colors hover:bg-[var(--ui-surface-subtle)]"><p className="text-sm font-medium text-[var(--ui-text-secondary)]">{dateLabel(item.startDate, { month: "long", day: "numeric" }, locale)}</p><div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--ui-text)]">{item.title}</p>{item.note ? <p className="mt-1 line-clamp-2 text-sm text-[var(--ui-text-secondary)]">{item.note}</p> : null}</div><div className="flex shrink-0 gap-2"><Button size="sm" variant="ghost" className="size-11 p-0" aria-label={t("editDayOff", { name: item.title })} onClick={() => edit(item)}><Pencil aria-hidden="true" className="size-4" /></Button><Button size="sm" variant="ghost" className="size-11 p-0 text-[var(--ui-danger-text)]" aria-label={t("deleteDayOff", { name: item.title })} onClick={() => void remove(item)}><Trash2 aria-hidden="true" className="size-4" /></Button></div></div>)}</div> : <p className="rounded-xl border border-dashed border-[var(--ui-border-strong)] p-5 text-center text-sm text-[var(--ui-text-muted)]">{t("noDaysOffForYear", { year })}</p>}
      {!adding ? <Button className="min-h-11 w-full" variant="outline" onClick={() => { setAdding(true); setDate(`${year}-01-01`); }}>{t("addDayOff")}</Button> : <form className="space-y-4 border-t border-[var(--ui-border-subtle)] pt-5" aria-busy={pending} onSubmit={(event) => { event.preventDefault(); void save(); }}><FormField label={t("dayOffName")}><input autoFocus required maxLength={160} className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} /></FormField><FormField label={t("date")}><DatePicker locale={locale} value={date} onValueChange={setDate} /></FormField><FormField label={t("dayOffNote")} optional><textarea maxLength={2000} rows={3} className={textareaClassName} value={note} onChange={(event) => setNote(event.target.value)} /></FormField>{error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={resetForm}>{t("cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("saving") : editing ? t("saveDayOff") : t("addDayOff")}</Button></div></form>}
    </div>
  </DetailPanel>;
}

type MutationResult = { success: true; item?: CalendarItem | null; removedKey?: string | null };
function isCalendarItem(value: unknown): value is CalendarItem { return typeof value === "object" && value !== null && "source" in value && "key" in value && typeof value.key === "string"; }
function isMutationResult(value: unknown): value is MutationResult { if (typeof value !== "object" || value === null || !("success" in value) || value.success !== true) return false; if ("item" in value && value.item !== null && value.item !== undefined && !isCalendarItem(value.item)) return false; return !("removedKey" in value) || value.removedKey === null || value.removedKey === undefined || typeof value.removedKey === "string"; }

function InvitationStatus({ status }: { status: CalendarEventInvitationStatus }) {
  const t = useTranslations("Calendar");
  const tone = status === "accepted" ? "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]" : status === "declined" ? "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]" : "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(status === "pending" ? "invitationPending" : status)}</span>;
}

function CalendarPersonDetail({ person }: { person: CalendarPerson }) {
  return <div className="flex min-w-0 items-center gap-2.5"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="min-w-0"><span className="block truncate font-medium text-[var(--ui-text)]">{person.full_name}</span>{person.job_title ? <span className="block truncate text-xs text-[var(--ui-text-muted)]">{person.job_title}</span> : null}</span></div>;
}

function CalendarEventDetails({ item, data, pending, onRespond }: { item: Extract<CalendarItem, { source: "calendar_event" }>; data: CalendarPageData; pending: boolean; onRespond: (inviteId: string, status: "accepted" | "declined") => void }) {
  const t = useTranslations("Calendar");
  const notifications = useTranslations("Notifications");
  const locale = useLocale();
  const config = getCalendarEventDetailConfig(item.eventType);
  const sections = new Set(config.sections);
  const currentInvite = item.invitees.find((invitee) => invitee.id === data.currentUserId);
  const destination = item.project ? projectDestination(data.projects.find((project) => project.id === item.project?.id), locale) : null;

  return <>
    {sections.has("project") && item.project ? <section><h3 className="mb-2 font-semibold text-[var(--ui-text)]">{t("project")}</h3><ProjectNavigationLink href={`/projects/${item.project.id}`} label={t("openProject")} name={item.project.name} /></section> : null}
    {sections.has("destination") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("destination")}</h3><p className="mt-2 flex items-center gap-2 text-[var(--ui-text-secondary)]"><MapPin aria-hidden="true" className="size-4 shrink-0" />{destination ?? t("destinationUnavailable")}</p></section> : null}
    {sections.has("assignee") && item.assignee ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t(config.assigneeLabel ?? "assignee")}</h3><div className="mt-2"><CalendarPersonDetail person={item.assignee} /></div></section> : null}
    {sections.has("participants") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("tripParticipants")}</h3>{item.participants.length ? <ul className="mt-2 space-y-2">{item.participants.map((participant) => <li key={participant.id}><CalendarPersonDetail person={participant} /></li>)}</ul> : <p className="mt-2 text-[var(--ui-text-secondary)]">{t("noAttendees")}</p>}</section> : null}
    {sections.has("organizer") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t(config.organizerLabel ?? "organizer")}</h3><div className="mt-2"><CalendarPersonDetail person={item.organizer} /></div></section> : null}
    {sections.has("invitations") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t(config.invitationLabel ?? "invitees")}</h3>{item.invitees.length ? <ul className="mt-2 space-y-2">{item.invitees.map((invitee) => <li key={invitee.inviteId} className="flex items-center justify-between gap-3"><CalendarPersonDetail person={invitee} /><InvitationStatus status={invitee.status} /></li>)}</ul> : <p className="mt-2 text-[var(--ui-text-secondary)]">{t("noInvitees")}</p>}</section> : null}
    {sections.has("invitations") && currentInvite ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold text-[var(--ui-text)]">{t("yourResponse")}</h3><div className="mt-3 flex gap-2">{(["accepted", "declined"] as const).map((invitationStatus) => <Button key={invitationStatus} disabled={pending || currentInvite.status === invitationStatus} variant={invitationStatus === "accepted" ? "default" : "outline"} onClick={() => onRespond(currentInvite.inviteId, invitationStatus)}>{notifications(invitationStatus === "accepted" ? "accept" : "decline")}</Button>)}</div></section> : null}
    {sections.has("meetingMode") && item.meetingMode ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("meetingMode")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{t(item.meetingMode)}</p></section> : null}
    {sections.has("location") && item.location ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("location")}</h3><p className="mt-2 flex items-center gap-2 text-[var(--ui-text-secondary)]"><MapPin aria-hidden="true" className="size-4 shrink-0" />{item.location}</p></section> : null}
    {sections.has("meetingUrl") && item.meetingUrl ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("meetingUrl")}</h3><a className="mt-2 flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" href={item.meetingUrl} target="_blank" rel="noreferrer"><Video aria-hidden="true" className="size-4 shrink-0" />{t("openMeeting")}</a></section> : null}
    {sections.has("recurrence") && item.recurrenceRule ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("recurrence")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{recurrenceText(locale, item.recurrenceRule)}</p></section> : null}
    {sections.has("linkedDayOff") && item.compensationDayOff ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold text-[var(--ui-text)]">{t("linkedDayOff")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{dateLabel(item.compensationDayOff.startDate, { month: "long", day: "numeric" }, locale)} · {t("contributesHours", { hours: getWorkMakeupMinutes({ startsAt: item.startsAt, endsAt: item.endsAt, allDay: item.allDay }) / 60 })}</p></section> : null}
    <section><h3 className="font-semibold text-[var(--ui-text)]">{t("details")}</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-[var(--ui-text-secondary)]">{item.description || t("noDescription")}</p></section>
  </>;
}

export function InviteePicker({ people, selectedIds, onChange }: { people: CalendarPerson[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("Calendar");
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const selected = people.filter((person) => selectedIds.includes(person.id));
  const visible = people.filter((person) => person.full_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function toggle(id: string) { onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]); }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2" data-invitee-chips>{selected.map((person) => <button key={person.id} type="button" className={`inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] py-1 pl-1 pr-2 text-sm text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-subtle)] ${focusVisibleClassName}`} aria-label={t("removeInvitee", { name: person.full_name })} data-invitee-chip onClick={() => toggle(person.id)}><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="max-w-40 truncate">{person.full_name}</span><X aria-hidden="true" className="ml-0.5 size-3 shrink-0 text-[var(--ui-text-secondary)]" /></button>)}</div><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-subtle)] ${focusVisibleClassName}`} data-invitee-trigger><Plus className="size-4" />{t("addInvitees")}</button></Popover.Trigger><Popover.Portal><Popover.Content align="start" sideOffset={6} className="z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 shadow-[var(--ui-shadow-popover)]"><div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 transition-colors focus-within:border-[var(--ui-focus)] focus-within:ring-2 focus-within:ring-[var(--ui-focus)] focus-within:ring-offset-2" data-invitee-search><Search className="size-4 shrink-0 text-[var(--ui-text-muted)]" /><input autoFocus aria-label={t("searchInvitees")} className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[var(--ui-text)] shadow-none outline-none ring-0 placeholder:text-[var(--ui-text-muted)] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0" style={{ border: 0, boxShadow: "none", outline: "none" }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchInvitees")} /></div><div className="mt-2 max-h-64 overflow-y-auto">{visible.length ? visible.map((person) => <button type="button" key={person.id} onClick={() => toggle(person.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-[var(--ui-surface-muted)]"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="min-w-0 flex-1 truncate text-sm">{person.full_name}</span>{selectedIds.includes(person.id) ? <Check className="size-4 text-[var(--ui-action-primary)]" /> : null}</button>) : <p className="p-3 text-sm text-[var(--ui-text-muted)]">{t("noInviteeResults")}</p>}</div></Popover.Content></Popover.Portal></Popover.Root></div>;
}

function BusinessTripParticipantPicker({ people, selectedIds, onChange }: { people: CalendarPerson[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("Calendar");
  const [open, setOpen] = useState(false);
  function toggle(id: string) { onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]); }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">{people.filter((person) => selectedIds.includes(person.id)).map((person) => <button key={person.id} type="button" onClick={() => toggle(person.id)} className={`inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] py-1 pl-1 pr-2 text-sm text-[var(--ui-text)] ${focusVisibleClassName}`}><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="max-w-40 truncate">{person.full_name}</span><X aria-hidden="true" className="size-3 shrink-0 text-[var(--ui-text-secondary)]" /></button>)}</div><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--ui-radius-control)] border border-dashed border-[var(--ui-border-strong)] px-3 text-sm font-medium text-[var(--ui-text-secondary)] ${focusVisibleClassName}`}><Plus aria-hidden="true" className="size-4" />{t("tripParticipants")}</button></Popover.Trigger><Popover.Portal><Popover.Content align="start" sideOffset={6} className="z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 shadow-[var(--ui-shadow-popover)]"><div className="max-h-64 overflow-y-auto">{people.map((person) => <button type="button" key={person.id} onClick={() => toggle(person.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-[var(--ui-surface-muted)]"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="min-w-0 flex-1 truncate text-sm">{person.full_name}</span>{selectedIds.includes(person.id) ? <Check aria-hidden="true" className="size-4 text-[var(--ui-action-primary)]" /> : null}</button>)}</div></Popover.Content></Popover.Portal></Popover.Root></div>;
}

function MeetingModeControl({ ariaLabel, offlineLabel, onlineLabel, value, onValueChange }: { ariaLabel: string; offlineLabel: string; onlineLabel: string; value: MeetingMode; onValueChange: (value: MeetingMode) => void }) {
  const online = value === "online";
  return <button type="button" role="switch" aria-label={ariaLabel} aria-checked={online} onClick={() => onValueChange(online ? "offline" : "online")} className={`relative inline-grid min-h-11 w-44 grid-cols-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] p-0.5 text-sm font-medium transition-colors hover:bg-[var(--ui-surface-subtle)] ${focusVisibleClassName}`}>
    <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[calc(var(--ui-radius-control)-0.125rem)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-transform duration-200 ease-out motion-reduce:transition-none ${online ? "translate-x-full" : ""}`} />
    <span aria-hidden="true" className={`relative z-10 flex items-center justify-center transition-colors ${online ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-text)]"}`}>{offlineLabel}</span>
    <span aria-hidden="true" className={`relative z-10 flex items-center justify-center transition-colors ${online ? "text-[var(--ui-text)]" : "text-[var(--ui-text-secondary)]"}`}>{onlineLabel}</span>
  </button>;
}

function projectDestination(project: CalendarProject | undefined, locale: string): string | null {
  if (!project) return null;
  const country = project.country_code ? new Intl.DisplayNames([locale], { type: "region" }).of(project.country_code) ?? project.country_code : null;
  return [project.city, country].filter((value): value is string => Boolean(value)).join(", ") || null;
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
  const allowedEventTypes = getCreatableCalendarEventTypes(data.isAdmin ? "admin" : "employee");
  const rawInitial = createCalendarEventFormValues(item, baseDate);
  const initial = { ...rawInitial, eventType: item?.eventType ?? allowedEventTypes[0], ...(item?.eventType === "site_visit" || item?.eventType === "interview" ? { allDay: false, endDate: rawInitial.startDate } : {}) };
  const [values, setValues] = useState(initial); const [endDateLinked, setEndDateLinked] = useState(initial.endDate === initial.startDate); const [endTimeLinked, setEndTimeLinked] = useState(true); const [scope, setScope] = useState<"this" | "series">("this"); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const isWorkMakeup = values.eventType === "work_makeup";
  const isSiteVisit = values.eventType === "site_visit";
  const isBusinessTrip = values.eventType === "business_trip";
  const isInterview = values.eventType === "interview";
  const isMeetingPresentation = values.eventType === "meeting" || values.eventType === "presentation";
  const organizerId = item?.organizer.id ?? data.currentUserId;
  const siteVisitProjects = data.isAdmin ? data.projects : data.projects.filter((project) => data.people.some((person) => person.id === data.currentUserId && person.projectIds.includes(project.id)));
  const businessTripProjects = siteVisitProjects;
  const siteVisitAssignees = values.projectId ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : [];
  const businessTripParticipants = values.projectId ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : [];
  const currentUserSiteVisitAssignee = siteVisitAssignees.find((person) => person.id === data.currentUserId);
  const remainingSiteVisitAssignees = siteVisitAssignees.filter((person) => person.id !== data.currentUserId);
  const interviewers = data.people.filter((person) => person.systemRole === "admin");
  const currentUserInterviewer = interviewers.find((person) => person.id === data.currentUserId);
  const remainingInterviewers = interviewers.filter((person) => person.id !== data.currentUserId);
  const appropriatePeople = (values.projectId && values.eventType !== "meeting" && values.eventType !== "presentation" && values.eventType !== "interview" ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : data.people).filter((person) => person.id !== organizerId);
  function updateContext(patch: Partial<typeof values>) {
    const next = {
      ...values,
      ...patch,
      ...(patch.eventType === "work_makeup" ? { attendeeIds: [], participantIds: [], location: "", meetingUrl: "", projectId: "", recurrenceRule: null, assigneeId: "" } : {}),
      ...(patch.eventType === "meeting" || patch.eventType === "presentation" ? { allDay: false, endDate: values.startDate, recurrenceRule: null, meetingMode: values.meetingMode ?? "offline" } : {}),
      ...(patch.eventType === "interview" ? { attendeeIds: [], participantIds: [], projectId: "", location: "", allDay: false, endDate: values.startDate, recurrenceRule: null, assigneeId: "" } : {}),
      ...(patch.eventType === "site_visit" ? { attendeeIds: [], participantIds: [], meetingUrl: "", allDay: false, recurrenceRule: null, assigneeId: data.isAdmin ? "" : data.currentUserId, endDate: values.startDate } : {}),
      ...(patch.eventType === "business_trip" ? { attendeeIds: [], assigneeId: "", meetingUrl: "", location: "", recurrenceRule: null, allDay: true, participantIds: data.isAdmin ? [] : [data.currentUserId] } : {}),
      ...(patch.eventType && patch.eventType !== "site_visit" && patch.eventType !== "interview" ? { assigneeId: "" } : {}),
      ...(patch.eventType && patch.eventType !== "work_makeup" ? { compensatesTimeOffRequestId: "" } : {}),
    };
    const eligible = (next.projectId && next.eventType !== "meeting" && next.eventType !== "presentation" && next.eventType !== "interview" ? data.people.filter((person) => person.projectIds.includes(next.projectId)) : data.people).filter((person) => person.id !== organizerId);
    const eligibleParticipants = next.projectId ? data.people.filter((person) => person.projectIds.includes(next.projectId)) : [];
    setValues({ ...next, attendeeIds: next.attendeeIds.filter((id) => eligible.some((person) => person.id === id)), participantIds: next.participantIds.filter((id) => eligibleParticipants.some((person) => person.id === id)) });
  }
  function selectCompensatedDayOff(requestId: string) {
    const request = data.compensableDayOffs.find((candidate) => candidate.id === requestId);
    if (!request) return setValues({ ...values, compensatesTimeOffRequestId: "" });
    if (request.allDay) return setValues({ ...values, compensatesTimeOffRequestId: requestId, allDay: true, recurrenceRule: null });
    const startMinutes = Number(values.startTime.slice(0, 2)) * 60 + Number(values.startTime.slice(3));
    const endTotalMinutes = startMinutes + request.remainingMinutes;
    const endDate = addCalendarDays(values.startDate, Math.floor(endTotalMinutes / (24 * 60)));
    const endMinutes = endTotalMinutes % (24 * 60);
    setEndDateLinked(false); setEndTimeLinked(false);
    setValues({ ...values, compensatesTimeOffRequestId: requestId, allDay: false, recurrenceRule: null, endDate, endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}` });
  }
  function requestClose() { if (pending) return; if (!item || !dirty || window.confirm(t("discardEvent"))) onClose(); }
  function eventFieldError(field: string) {
    if (field === "title") return t("invalidTitle");
    if (field === "eventType") return t("invalidEventType");
    if (field === "projectId") return t("invalidProject");
    if (field === "attendeeIds") return t("invalidAttendees");
    if (field === "participantIds") return t("invalidParticipants");
    if (field === "meetingUrl") return t("invalidMeetingUrl");
    if (field === "assigneeId") return t("invalidAssignee");
    return t("invalidDateRange");
  }
  async function submit() {
    setPending(true); setError(""); setFieldErrors({});
    try {
      const selectedDayOff = data.compensableDayOffs.find((request) => request.id === values.compensatesTimeOffRequestId) ?? (item && item.compensatesTimeOffRequestId === values.compensatesTimeOffRequestId ? item.compensationDayOff : null);
      const previousContributionMinutes = selectedDayOff && item && item.compensatesTimeOffRequestId === selectedDayOff.id
        ? getWorkMakeupMinutes({ startsAt: item.startsAt, endsAt: item.endsAt, allDay: item.allDay })
        : 0;
      const payload = {
        ...toCalendarEventMutationPayload(values),
        title: isWorkMakeup ? getWorkMakeupTitle(values, locale, selectedDayOff ? { ...selectedDayOff, previousContributionMinutes } : null) : isSiteVisit ? getSiteVisitTitle(data.projects.find((project) => project.id === values.projectId)?.name ?? "", locale) : isBusinessTrip ? getBusinessTripTitle(data.projects.find((project) => project.id === values.projectId)?.name ?? "", locale) : values.title,
        assigneeId: isSiteVisit && !data.isAdmin ? data.currentUserId : values.assigneeId || null,
        scope: item?.occurrenceStart ? scope : "series",
        occurrenceStart: item?.occurrenceStart ?? undefined,
      };
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
    <FormField label={t("type")} error={fieldErrors.eventType}><Select value={values.eventType} onValueChange={(eventType) => updateContext({ eventType: eventType as CalendarEventType })}>{[...new Set([...allowedEventTypes, item?.eventType].filter((type): type is CalendarEventType => Boolean(type)))].map((type) => { const { Icon, labelKey } = getCalendarEventTypeConfig(type); return <SelectItem key={type} value={type}><span className="flex items-center gap-2"><Icon aria-hidden="true" className="size-4" />{t(labelKey)}</span></SelectItem>; })}</Select></FormField>
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip ? <FormField label={t("titleLabel")} error={fieldErrors.title}><input className={fieldClass} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></FormField> : null}
    {!isWorkMakeup && !isInterview ? <FormField label={t("project")} optional={!isSiteVisit && !isBusinessTrip} error={fieldErrors.projectId}><Select placeholder={t("selectProject")} value={values.projectId || "no-project"} onValueChange={(projectId) => updateContext({ projectId: projectId === "no-project" ? "" : projectId, ...(isSiteVisit ? { assigneeId: data.isAdmin ? "" : data.currentUserId } : {}) })}>{!isSiteVisit && !isBusinessTrip ? <SelectItem value="no-project">{t("noProject")}</SelectItem> : null}{(isSiteVisit ? siteVisitProjects : isBusinessTrip ? businessTripProjects : data.projects).map((project) => <SelectItem key={project.id} value={project.id} disabled={project.status === "completed"}>{project.name}{project.status === "completed" ? ` (${t("completedReopen")})` : ""}</SelectItem>)}</Select></FormField> : null}
    {isSiteVisit && data.isAdmin ? <FormField label={t("assignee")} error={fieldErrors.assigneeId}><Select disabled={!values.projectId} placeholder={values.projectId ? t("selectAssignee") : t("selectProjectFirst")} value={values.assigneeId || undefined} onValueChange={(assigneeId) => setValues({ ...values, assigneeId })}>{currentUserSiteVisitAssignee ? <SelectItem textValue={currentUserSiteVisitAssignee.full_name} value={currentUserSiteVisitAssignee.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={currentUserSiteVisitAssignee.avatar_url} name={currentUserSiteVisitAssignee.full_name} /><span className="truncate">{currentUserSiteVisitAssignee.full_name}</span><span className="shrink-0 text-xs font-normal text-[var(--ui-text-muted)]">{t("assignToMe")}</span></span></SelectItem> : null}{remainingSiteVisitAssignees.map((person) => <SelectItem key={person.id} textValue={person.full_name} value={person.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="truncate">{person.full_name}</span></span></SelectItem>)}</Select></FormField> : null}
    {isInterview ? <FormField label={t("interviewer")} error={fieldErrors.assigneeId}><Select placeholder={t("selectInterviewer")} value={values.assigneeId || undefined} onValueChange={(assigneeId) => setValues({ ...values, assigneeId })}>{currentUserInterviewer ? <SelectItem textValue={currentUserInterviewer.full_name} value={currentUserInterviewer.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={currentUserInterviewer.avatar_url} name={currentUserInterviewer.full_name} /><span className="truncate">{currentUserInterviewer.full_name}</span><span className="shrink-0 text-xs font-normal text-[var(--ui-text-muted)]">{t("assignToMe")}</span></span></SelectItem> : null}{remainingInterviewers.map((person) => <SelectItem key={person.id} textValue={person.full_name} value={person.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} /><span className="truncate">{person.full_name}</span></span></SelectItem>)}</Select></FormField> : null}
    {isBusinessTrip ? <><FormField as="div" label={t("tripParticipants")} error={fieldErrors.participantIds}><BusinessTripParticipantPicker people={businessTripParticipants} selectedIds={values.participantIds} onChange={(participantIds) => setValues({ ...values, participantIds })} /></FormField><FormField label={t("destination")}><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-3 text-sm text-[var(--ui-text-secondary)]">{projectDestination(data.projects.find((project) => project.id === values.projectId), locale) ?? t("destinationUnavailable")}</div></FormField></> : null}
    {isWorkMakeup ? <FormField label={t("compensatesDayOff")} optional error={fieldErrors.compensatesTimeOffRequestId}><Select disabled={data.compensableDayOffs.length === 0} placeholder={data.compensableDayOffs.length === 0 ? t("noOutstandingDayOffs") : t("selectDayOff")} value={values.compensatesTimeOffRequestId || undefined} onValueChange={selectCompensatedDayOff}>{data.compensableDayOffs.map((request) => <SelectItem key={request.id} value={request.id}>{`${dateLabel(request.startDate, { month: "long", day: "numeric" }, locale)} · ${request.allDay ? t("allDay") : `${request.startTime}–${request.endTime}`} · ${t("remainingHours", { hours: request.remainingMinutes / 60 })}`}</SelectItem>)}</Select>{values.compensatesTimeOffRequestId ? <button type="button" onClick={() => setValues({ ...values, compensatesTimeOffRequestId: "" })} className="mt-2 text-left text-xs font-medium text-[var(--ui-text-secondary)] underline">{t("removeDayOffLink")}</button> : null}</FormField> : null}
    {isWorkMakeup || isBusinessTrip ? <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />{t("allDayEvent")}</label> : !isSiteVisit && !isMeetingPresentation && !isInterview ? <RecurrenceControl allDayControl={<label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />{t("allDayEvent")}</label>} locale={locale} value={values.recurrenceRule ?? null} onChange={(recurrenceRule) => setValues({ ...values, recurrenceRule })} /> : null}
    {isSiteVisit || isMeetingPresentation || isInterview ? <><FormField label={t("date")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues({ ...values, startDate, endDate: startDate })} /></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField label={isMeetingPresentation || isInterview ? t("startTime") : t("starts")}><TimePicker locale={locale} value={values.startTime} onValueChange={(startTime) => { const next = updateEventStartTime(values, startTime, endTimeLinked); setValues({ ...next, endDate: values.startDate, ...(next.endDate !== values.startDate ? { endTime: "23:59" } : {}) }); }} /></FormField><FormField label={isMeetingPresentation || isInterview ? t("endTime") : t("ends")} error={fieldErrors.endsAt}><TimePicker locale={locale} value={values.endTime} onValueChange={(endTime) => setValues({ ...values, endTime })} /></FormField></div></> : <div className={values.allDay ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>{values.allDay ? <><FormField label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /></FormField><FormField label={t("endDate")} error={fieldErrors.endsAt}><DatePicker locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /></FormField></> : <><FormField label={t("starts")}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("startDate")} locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /><TimePicker aria-label={t("startTime")} className="min-w-0" locale={locale} value={values.startTime} onValueChange={(startTime) => setValues(updateEventStartTime(values, startTime, endTimeLinked))} /></div></FormField><FormField label={t("ends")} error={fieldErrors.endsAt}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("endDate")} locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /><TimePicker aria-label={t("endTime")} className="min-w-0" locale={locale} value={values.endTime} onValueChange={(endTime) => { setEndTimeLinked(false); setValues({ ...values, endTime }); }} /></div></FormField></>}</div>}
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip && item?.occurrenceStart ? <FormField label={locale.startsWith("uk") ? "Застосувати зміни до" : "Apply changes to"}><Select value={scope} onValueChange={(nextScope) => setScope(nextScope as "this" | "series")}><SelectItem value="this">{locale.startsWith("uk") ? "Лише ця подія" : "Only this event"}</SelectItem><SelectItem value="series">{locale.startsWith("uk") ? "Уся серія" : "Entire series"}</SelectItem></Select></FormField> : null}
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip && !isInterview ? <><FormField as="div" label={isMeetingPresentation ? t("participants") : t("invitees")} error={fieldErrors.attendeeIds}><InviteePicker people={appropriatePeople} selectedIds={values.attendeeIds} onChange={(attendeeIds) => setValues({ ...values, attendeeIds })} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("inviteesHelp")}</span></FormField>{isMeetingPresentation ? <><FormField as="div" label={t("meetingMode")}><MeetingModeControl ariaLabel={t("meetingMode")} offlineLabel={t("offline")} onlineLabel={t("online")} value={values.meetingMode} onValueChange={(meetingMode) => setValues({ ...values, meetingMode, location: meetingMode === "online" ? "" : values.location, meetingUrl: meetingMode === "offline" ? "" : values.meetingUrl })} /></FormField>{values.meetingMode === "offline" ? <FormField label={t("location")} optional><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField> : <FormField label={t("meetingUrl")} optional error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField>}</> : <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("location")}><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField><FormField label={t("meetingUrl")} error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField></div>}</> : isInterview ? <FormField label={t("meetingUrl")} optional error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField> : isSiteVisit ? <FormField label={t("location")} optional><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField> : null}
    <FormField label={t("descriptionLabel")}><textarea className={textareaClassName} rows={5} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></FormField>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? t("saving") : t("saveEvent")}</Button></div>
  </form></DetailPanel>;
}

function TimeOffForm({ isOpen, onExited, data, initialDate, onClose, onSaved }: { isOpen: boolean; onExited: () => void; data: CalendarPageData; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "time_off_request_admin" }>) => void }) {
  const t = useTranslations("TimeOff");
  const calendar = useTranslations("Calendar"); const locale = useLocale();
  const date = initialDate ?? data.today; const initial = { requestType: "vacation" as TimeOffRequestType, startDate: date, endDate: date, allDay: true, startTime: "09:00", endTime: "10:00", privateNote: "" }; const [values, setValues] = useState(initial); const [endDateLinked, setEndDateLinked] = useState(true); const [endTimeLinked, setEndTimeLinked] = useState(true); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function requestClose() { if (!pending) onClose(); }
  const requestPresentation = getTimeOffRequestPresentation(values.requestType);
  const reasonRequired = requestPresentation.requiresReason;
  function updateRequestType(requestType: TimeOffRequestType) {
    const presentation = getTimeOffRequestPresentation(requestType);
    setFieldErrors({});
    if (!presentation.supportsPartialDay) {
      setEndTimeLinked(true);
      setValues({ ...values, requestType, allDay: true, startTime: "09:00", endTime: "10:00" });
      return;
    }
    setValues({ ...values, requestType });
  }
  function requestFieldError(field: string) { if (field === "requestType") return t("invalidRequestType"); if (field === "privateNote") return t("reasonRequired"); return t("invalidDateRange"); }
  async function submit() {
    setPending(true); setError(""); setFieldErrors({});
    if (reasonRequired && !values.privateNote.trim()) {
      setFieldErrors({ privateNote: t("reasonRequired") }); setPending(false); return;
    }
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
    <Input label={t("requestType")} error={fieldErrors.requestType}><Select value={values.requestType} onValueChange={(requestType) => updateRequestType(requestType as TimeOffRequestType)}>{getCreatableTimeOffRequestTypes(data.isAdmin ? "admin" : "employee").map((type) => <SelectItem key={type} value={type}>{t(timeOffRequestTypeKey[type])}</SelectItem>)}</Select></Input>
    {requestPresentation.supportsPartialDay ? <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => { const allDay = event.target.checked; if (!allDay) setEndDateLinked(true); setValues({ ...values, allDay, endDate: allDay ? values.endDate : values.startDate }); }} />{t("allDay")}</label> : null}
    <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues({ ...values, ...updateLinkedStartDate(values, startDate, endDateLinked) })} /></Input><Input label={t("endDate")} error={fieldErrors.endDate}><DatePicker locale={locale} min={values.startDate} value={values.endDate} disabled={!values.allDay} invalid={Boolean(fieldErrors.endDate)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /></Input></div>
    {!values.allDay ? <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startTime")}><TimePicker locale={locale} value={values.startTime} onValueChange={(startTime) => setValues({ ...values, ...updateLinkedStartTime(values, startTime, endTimeLinked) })} /></Input><Input label={t("endTime")} error={fieldErrors.endDate}><TimePicker locale={locale} value={values.endTime} onValueChange={(endTime) => { setEndTimeLinked(false); setValues({ ...values, endTime }); }} /></Input></div> : null}
    <Input label={<>{t(requestPresentation.fieldLabelKey)}{reasonRequired ? <span aria-hidden="true" className="text-[var(--ui-danger-text)]"> *</span> : null}</>} error={fieldErrors.privateNote}><textarea className={textareaClassName} rows={5} required={reasonRequired} placeholder={requestPresentation.placeholderKey ? t(requestPresentation.placeholderKey) : undefined} value={values.privateNote} onChange={(event) => setValues({ ...values, privateNote: event.target.value })} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("visibleNote")}</span></Input>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? t("submitting") : t("submit")}</Button></div>
  </form></DetailPanel>;
}

function Input({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) { return <FormField label={label} error={error}>{children}</FormField>; }
