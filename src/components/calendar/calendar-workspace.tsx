"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { Banknote, CakeSlice, CalendarHeart, CalendarOff, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Ellipsis, Filter, Info, LoaderCircle, MapPin, Pencil, PhoneCall, Repeat2, RotateCcw, Settings2, Trash2, TreePalm, Cross, UserRoundMinus, Video, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectNavigationLink } from "@/components/projects/project-navigation-link";
import { DatePicker } from "@/components/ui/date-picker";
import { TaskPriorityIcon } from "@/components/tasks/task-select-presentation";
import { TimePicker } from "@/components/ui/time-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PeoplePicker } from "@/components/ui/people-picker";
import {
  APPLICATION_TIME_ZONE, DEFAULT_CALENDAR_FILTERS, addCalendarDays, filterCalendarItems,
  formatCalendarClockTime, formatCalendarDateTime, formatCalendarTime, formatCalendarWallTime, getCalendarRange, getDayItems, getMonthDesktopWeekCount, getMonthGrid,
  getCurrentWeekTimePosition, getInitialWeekScrollTop, getMonthDateLaneLayout, getMonthItemGeometry, getMonthLaneLayout, getMonthLayoutSegments, getMonthSegmentGeometry,
  getTimedEventHeight, getTimedWeekLayout, getTimedWeekSegments, getWeekAllDaySegments, getMonthMobileDayItems,
  getMonthItemTop, getCalendarItemDisplayTitle, itemOccursOn, mergeCalendarItem, MONTH_EVENT_GEOMETRY, MONTH_LANE_GAP, MONTH_LANE_HEIGHT, parseDateOnly,
  reconcileCalendarItems, removeCalendarItem, startOfMondayWeek, toDateOnly, instantToDateOnly, zonedWallTimeToIso, isKyivTimeZone, WEEK_PIXELS_PER_MINUTE, type TimedWeekLayoutSegment,
} from "@/lib/calendar";
import { getCalendarEventTypeAttendees, createCalendarEventFormValues, getBusinessTripTitle, getSiteVisitTitle, getWorkMakeupTitle, groupCalendarEventProjects, isCalendarEventInviteeSelectable, toCalendarEventMutationPayload, updateEventStartDate, updateEventStartTime, type CalendarEventFormRange } from "@/lib/calendar-event-form";
import { getCalendarPendingCount, resolveCalendarSelection } from "@/lib/calendar-navigation";
import { getWeekCreationRange, getWeekPointerMinute, getWeekSelectionMinutes, isWeekSelectionDrag } from "@/lib/calendar-week-selection";
import { canEditWeekEvent, getWeekEventBounds, getWeekEventEditLayout, getWeekEventUpdate, weekEventBoundsChanged, type WeekEventBounds, type WeekEventEditMode, type WeekEventPreview } from "@/lib/calendar-week-edit";
import { WeekEditPreview, type WeekEditPreviewHandle } from "./calendar-week-edit-preview";
import { WeekCreationPreview, type WeekCreationPreviewHandle } from "./calendar-week-creation-preview";
import { WeekEventContent } from "./calendar-week-event-content";
import { CalendarEventCancelAction } from "./calendar-event-cancel-action";
import { StudioDaysOffPanel } from "./studio-days-off-panel";
import { useWeekColumnMotion } from "./use-week-column-motion";
import { saveCalendarEvent } from "@/lib/calendar-event-client";
import type { CalendarEventRequest } from "@/lib/validation/calendar";
import { updateLinkedStartDate, updateLinkedStartTime } from "@/lib/calendar-form-range";
import { getCreatableCalendarEventTypes, getCreatableTimeOffRequestTypes } from "@/lib/calendar-creation";
import type { RecurrenceRule } from "@/lib/calendar-recurrence";
import { isTimeOffMutationResult, updateTimeOffRequest } from "@/lib/time-off-request-client";
import { getTimeOffStatusBadgeStyle } from "@/lib/semantic-styles";
import { getRequiredDayOffMinutes, getWorkMakeupMinutes } from "@/lib/time-off-compensation";
import { getTimeOffRequestPresentation, timeOffRequestTypeKey, timeOffStatusKey } from "@/lib/time-off-labels";
import { getCalendarEventDetailConfig, getCalendarEventTypeConfig } from "@/lib/calendar-event-types";
import { getCalendarInvitationErrorKey } from "@/lib/calendar-invitation-error";
import type { CalendarCoreData, CalendarDataStreams, CalendarEventInvitationStatus, CalendarEventType, CalendarFilters, CalendarItem, CalendarPageData, CalendarPerson, CalendarProject, CalendarTimeFormat, CalendarView, MeetingMode, TimeOffRequestType } from "@/types/calendar";
import { Tooltip } from "@/components/ui/tooltip";

const CalendarTimeZoneContext = createContext(APPLICATION_TIME_ZONE);

type Drawer = { kind: "day"; date: string } | { kind: "item"; item: CalendarItem } | { kind: "event-form"; item?: Extract<CalendarItem, { source: "calendar_event" }>; date?: string; range?: CalendarEventFormRange; instance?: number } | { kind: "time-off-form"; date?: string } | { kind: "days-off" } | null;

const fieldClass = inputClassName;

function recurrenceText(locale: string, rule: RecurrenceRule | null) {
  const uk = locale.startsWith("uk"); if (!rule) return uk ? "Не повторювати" : "Does not repeat";
  const names = uk ? { daily: "Щодня", weekly: "Щотижня", monthly: "Щомісяця", yearly: "Щороку" } : { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  return rule.interval === 1 ? names[rule.frequency] : `${uk ? "Кожні" : "Every"} ${rule.interval} ${uk ? "рази" : rule.frequency}`;
}
function itemTone(item: CalendarItem) {
  if (item.source === "calendar_event") return getCalendarEventTypeConfig(item.eventType).tone;
  if (item.source === "crm_follow_up") return "border-l-[var(--ui-info-accent)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
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
  return (item: CalendarItem) => item.source === "calendar_event" && item.eventType === "business_trip"
    ? t("businessTripEvent", { project: item.project?.name ?? item.title.replace(/^(Business trip|Відрядження)\s*·\s*/, "") })
    : item.source === "crm_follow_up" ? t("crmFollowUpEvent", { name: item.title }) : item.source === "studio_day_off" ? t("studioDayOffEvent", { name: item.title }) : item.source === "birthday" ? t("birthdayEvent", { name: item.member.fullName }) : item.source === "team_anniversary" ? t("teamAnniversaryEvent", { name: item.member.fullName }) : item.source === "salary_payment" ? t("salaryPaymentEvent", { name: item.member.fullName }) : getCalendarItemDisplayTitle(item, {
    outOfOffice: t("outOfOffice"),
    pendingRequest: t("pendingRequest"),
    rejectedRequest: t("rejectedRequest"),
    unknownEmployee: common("unknown"),
  });
}

function useCalendarItemTypeLabel() {
  const t = useTranslations("Calendar");
  return (item: CalendarItem) => item.source === "calendar_event" ? t(getCalendarEventTypeConfig(item.eventType).labelKey) : item.source === "crm_follow_up" ? t("crmFollowUp") : item.source === "project_deadline" ? t("projectDeadline") : item.source === "task_deadline" ? t("taskDeadline") : item.source === "birthday" ? t("birthdays") : item.source === "team_anniversary" ? t("teamAnniversaries") : item.source === "salary_payment" ? t("salaryPayments") : item.source === "studio_day_off" ? t("companyDaysOff") : item.source === "time_off_request_admin" && item.status === "pending" ? t("pendingRequest") : item.source === "time_off_request_admin" && item.status === "rejected" ? t("rejectedRequest") : t("outOfOffice");
}

const monthItemPresentationClassName = "box-border min-w-0 overflow-hidden border-y-0 border-r-0 p-0 text-left text-xs font-medium leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1";

const ABSENCE_ICONS: Partial<Record<TimeOffRequestType, LucideIcon>> = { vacation: TreePalm, day_off: CalendarClock, sick_leave: Cross };

const SYSTEM_CALENDAR_CHIP_ICONS: Partial<Record<CalendarItem["source"], LucideIcon>> = {
  birthday: CakeSlice,
  team_anniversary: CalendarHeart,
  salary_payment: Banknote,
  studio_day_off: CalendarOff,
  time_off: UserRoundMinus,
  time_off_request_admin: UserRoundMinus,
  crm_follow_up: PhoneCall,
};

function timedItemStart(item: CalendarItem) {
  return !item.allDay && (item.source === "calendar_event" || item.source === "crm_follow_up") ? item.startsAt : null;
}

function CalendarChipIcon({ item, size = "size-3" }: { item: CalendarItem; size?: string }) {
  const Icon = item.source === "calendar_event" ? getCalendarEventTypeConfig(item.eventType).Icon : item.source === "time_off_request_admin" ? ABSENCE_ICONS[item.requestType] ?? UserRoundMinus : SYSTEM_CALENDAR_CHIP_ICONS[item.source];
  if (!Icon) return null;
  return <Icon aria-hidden="true" className={`${size} shrink-0 stroke-[1.75]`} />;
}

function CalendarDetailHeaderIcon({ item }: { item: CalendarItem }) {
  return <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${itemTone(item)}`}><CalendarChipIcon item={item} size="size-4" /></span>;
}

function kyivGutterTime(date: string, hour: number, timeZone: string, timeFormat: CalendarTimeFormat): string {
  try { return formatCalendarTime(zonedWallTimeToIso(`${date}T${String(hour).padStart(2, "0")}:00`, timeZone), timeFormat); }
  catch { return "—"; }
}

function CalendarPill({ item, month = false, mobile = false, onClick, timeFormat }: { item: CalendarItem; month?: boolean; mobile?: boolean; onClick: () => void; timeFormat: CalendarTimeFormat }) {
  const timeZone = useContext(CalendarTimeZoneContext);
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  const label = itemTypeLabel(item);
  const monthGeometry = month && !mobile ? getMonthItemGeometry() : undefined;
  const monthStyle = monthGeometry ? { height: monthGeometry.height, paddingInline: monthGeometry.textPaddingInline, paddingBlock: monthGeometry.verticalPadding, borderRadius: monthGeometry.leftRadius, borderLeftWidth: monthGeometry.borderInlineStartWidth } : undefined;
  const title = itemTitle(item);
  const startsAt = timedItemStart(item);
  const accessibleLabel = `${label}: ${!item.allDay && startsAt ? `${formatCalendarTime(startsAt, timeFormat, timeZone)}, ` : ""}${title}`;
  return <Tooltip content={accessibleLabel}><button data-instaload-arrival={item.key} type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} aria-label={accessibleLabel} className={month ? mobile ? `box-border block min-h-8 w-full appearance-none truncate rounded-md border-l-2 px-2 text-left text-xs font-medium leading-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 ${itemTone(item)}` : `block min-h-0 w-full appearance-none ${monthItemPresentationClassName} ${itemTone(item)}` : `min-h-10 w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-xs font-medium ${itemTone(item)}`} style={monthStyle}>
    <span className="sr-only">{label}: </span><span className="flex h-full min-w-0 items-center gap-1"><CalendarChipIcon item={item} /><span className="truncate">{!item.allDay && startsAt ? `${formatCalendarTime(startsAt, timeFormat, timeZone)} ` : ""}{title}</span></span>
  </button></Tooltip>;
}

/** Consume the server's existing promise without a second Suspense reveal delay. */
export function CalendarStream({ streams, initialView, initialDate, preferences }: {
  streams: Pick<CalendarDataStreams, "data" | "projects" | "people">;
  initialView: CalendarView; initialDate: string;
  preferences: Pick<CalendarCoreData, "timeFormat" | "timeZone">;
}) {
  const [snapshot, setSnapshot] = useState<{ data: CalendarCoreData | null; error: unknown }>({ data: null, error: null });
  useEffect(() => {
    let disposed = false;
    void streams.data.then(
      (data) => { if (!disposed) setSnapshot({ data, error: null }); },
      (error: unknown) => { if (!disposed) setSnapshot({ data: null, error }); },
    );
    return () => { disposed = true; };
  }, [streams.data]);
  if (snapshot.error) throw snapshot.error;
  return snapshot.data
    ? <CalendarWorkspace initialData={snapshot.data} initialView={initialView} initialDate={initialDate} projects={streams.projects} people={streams.people} />
    : <CalendarBlueprint initialView={initialView} initialDate={initialDate} {...preferences} />;
}

export function CalendarWorkspace({ initialData, initialView, initialDate, projects, people }: { initialData: CalendarCoreData; initialView: CalendarView; initialDate: string } & Pick<CalendarDataStreams, "projects" | "people">) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = (key: string) => searchParams.getAll(key).length === 1 ? searchParams.get(key) ?? "" : "";
  const { view, date } = resolveCalendarSelection(param("view") || initialView, param("date") || initialDate, initialDate);
  const [itemState, setItemState] = useState<{ snapshot: CalendarItem[]; items: CalendarItem[]; refreshBase: CalendarItem[] | null }>(() => ({ snapshot: initialData.items, items: initialData.items, refreshBase: null }));
  const weekSaveInFlight = useRef(new Set<string>());
  const [weekPending, setWeekPending] = useState(new Map<string, CalendarItem>());
  const items = itemState.items.map((item) => weekPending.get(item.key) ?? item);
  // URL-only changes keep the snapshot. A real refresh owns the collection,
  // except for mutation results that arrived after its request began.
  if (itemState.snapshot !== initialData.items) {
    setItemState({ snapshot: initialData.items, items: itemState.refreshBase ? reconcileCalendarItems(initialData.items, itemState.refreshBase, itemState.items) : initialData.items, refreshBase: null });
  }
  function setItems(update: (current: CalendarItem[]) => CalendarItem[], refresh = false) {
    setItemState((current) => {
      const items = update(current.items);
      return { ...current, items, refreshBase: refresh ? items : current.refreshBase };
    });
  }
  async function saveWeekEvent(item: Extract<CalendarItem, { source: "calendar_event" }>, bounds: WeekEventBounds) {
    if (weekSaveInFlight.current.has(item.key) || !canEditWeekEvent(item, initialData)) return false;
    const current = items.find((candidate) => candidate.key === item.key);
    if (!current || !canEditWeekEvent(current, initialData) || current.startsAt !== item.startsAt || current.endsAt !== item.endsAt) return false;
    const payload = getWeekEventUpdate(current, bounds, timeZone);
    if (!payload) return false;
    if (!weekEventBoundsChanged(current, bounds)) return true;
    weekSaveInFlight.current.add(current.key);
    setWeekPending((pending) => new Map(pending).set(current.key, { ...current, ...bounds, startDate: instantToDateOnly(bounds.startsAt, timeZone), endDate: instantToDateOnly(bounds.endsAt, timeZone) }));
    let message = t("eventScheduleFailed");
    try {
      const { response, result } = await saveCalendarEvent(current.id, { intent: "reschedule", startsAt: bounds.startsAt, endsAt: bounds.endsAt, expectedStartsAt: current.startsAt, expectedEndsAt: current.endsAt });
      if (!response.ok || !isMutationResult(result) || result.item?.source !== "calendar_event" || result.item.id !== current.id) {
        message = response.status === 409 ? t("eventScheduleConflict") : t("eventScheduleFailed");
        throw new Error(message);
      }
      const updated = result.item;
      // Retain this result if an already-running refresh arrives with an older snapshot.
      setItemState((state) => ({ ...state, items: mergeCalendarItem(state.items, updated), refreshBase: state.refreshBase ?? state.items }));
      return true;
    } catch {
      router.refresh();
      throw new Error(message);
    } finally {
      weekSaveInFlight.current.delete(current.key);
      setWeekPending((pending) => { const next = new Map(pending); next.delete(current.key); return next; });
    }
  }
  const [timeFormat, setTimeFormat] = useState<CalendarTimeFormat>(initialData.timeFormat);
  const [timeZone, setTimeZone] = useState(initialData.timeZone);
  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimeZone) return;
    if (!searchParams.has("date")) {
      const localToday = instantToDateOnly(new Date().toISOString(), browserTimeZone);
      if (localToday !== date) router.replace(`/calendar?view=${view}&date=${localToday}`);
    }
    if (browserTimeZone === timeZone) return;
    setTimeZone(browserTimeZone);
    void fetch("/api/calendar/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeFormat, timeZone: browserTimeZone }) });
  }, [timeZone, timeFormat, date, view, router, searchParams]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const [drawer, setDrawer] = useState<Drawer>(() => {
    const eventId = param("event");
    const requestId = param("request");
    const item = initialData.items.find((candidate) => candidate.id === (eventId || requestId) && (eventId ? candidate.source === "calendar_event" : candidate.source === "time_off_request_admin"));
    return item ? { kind: "item", item } : null;
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => drawer !== null);
  const formInstanceRef = useRef(0);
  const filters: CalendarFilters = {
    events: param("events") !== "0",
    projectDeadlines: param("projects") !== "0",
    taskDeadlines: param("tasks") === "1",
    timeOff: param("timeOff") !== "0",
    birthdays: param("birthdays") !== "0",
    teamAnniversaries: param("anniversaries") !== "0",
    salaryPayments: initialData.isAdmin && param("payments") !== "0",
    studioDaysOff: param("daysOff") !== "0",
    projectId: param("project"), personId: param("person"), mine: param("mine") === "1",
  };


  const pendingCount = initialData.isAdmin ? getCalendarPendingCount(items, getCalendarRange(view, date)) : 0;
  const today = instantToDateOnly(new Date().toISOString(), timeZone);
  const visibleItems = filterCalendarItems(items.map((item) => !item.allDay && (item.source === "calendar_event" || item.source === "crm_follow_up") ? { ...item, startDate: instantToDateOnly(item.startsAt, timeZone), endDate: instantToDateOnly(item.endsAt, timeZone) } : item), filters, initialData.currentUserId);

  function openDrawer(nextDrawer: Exclude<Drawer, null>) {
    // A new selection must reinitialize the form even during its previous exit.
    setDrawer(nextDrawer.kind === "event-form" ? { ...nextDrawer, instance: ++formInstanceRef.current } : nextDrawer);
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function clearExitedDrawer() {
    setDrawer(null);
  }

  function navigate(next: { view?: CalendarView; date?: string }, replace = false, filterPatch?: Partial<CalendarFilters>) {
    const nextParams = new URLSearchParams(window.location.search);
    for (const key of ["events", "projects", "tasks", "timeOff", "birthdays", "anniversaries", "payments", "daysOff", "project", "person", "mine"]) nextParams.delete(key);
    if (!replace) for (const key of ["event", "request", "refresh"]) nextParams.delete(key);
    nextParams.set("view", next.view ?? view); nextParams.set("date", next.date ?? date);
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
    if (replace) window.history.replaceState(null, "", `${href}${window.location.hash}`);
    else if ((next.date ?? date) === date) {
      if (href === `${window.location.pathname}${window.location.search}`) return;
      closeDrawer();
      window.history.pushState(null, "", href);
    } else router.push(href);
  }

  return <CalendarTimeZoneContext.Provider value={timeZone}><CalendarShell initialView={view} initialDate={date} today={today} navigate={navigate} actions={
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button size="sm" className="calendar-header-primary min-h-11 gap-2 sm:min-h-0" onClick={() => openDrawer({ kind: "event-form" })}><CalendarPlus aria-hidden="true" className="size-4" />{t("addEvent")}</Button>
        <Tooltip content={t("submitAbsenceRequest")}><Button size="sm" className="min-h-11 gap-2 sm:min-h-0" variant="outline" onClick={() => openDrawer({ kind: "time-off-form" })}><CalendarOff aria-hidden="true" className="size-4" />{t("absence")}</Button></Tooltip>
        {initialData.isAdmin && pendingCount > 0 ? <span className="inline-flex items-center rounded-full bg-[var(--ui-violet-surface)] px-3 text-xs font-semibold text-[var(--ui-violet-text)]">{t("pending", { count: pendingCount })}</span> : null}
      </div>
  } filters={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl className="calendar-toolbar-control calendar-toolbar-views w-full sm:w-auto" ariaLabel={t("view")} items={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "agenda", label: t("agenda") }]} value={view} onValueChange={(nextView) => { if (nextView !== view) navigate({ view: nextView }); }} />
          <Suspense fallback={<CalendarScopePlaceholder scope="project" />}><CalendarProjectFilter stream={projects} value={filters.projectId} onChange={(projectId) => navigate({}, true, { projectId })} /></Suspense>
          <Suspense fallback={<CalendarScopePlaceholder scope="person" />}><CalendarPersonFilter stream={people} value={filters.personId} onChange={(personId) => navigate({}, true, { personId })} /></Suspense>
          <CalendarFilterMenu data={initialData} filters={filters} onChange={(patch) => navigate({}, true, patch)} onReset={() => navigate({}, true, { ...DEFAULT_CALENDAR_FILTERS, salaryPayments: initialData.isAdmin && DEFAULT_CALENDAR_FILTERS.salaryPayments })} />
          <CalendarActionsMenu triggerRef={settingsTriggerRef} isAdmin={initialData.isAdmin} onOpenSettings={() => setSettingsOpen(true)} onOpenDaysOff={() => openDrawer({ kind: "days-off" })} />
        </div>
  } panels={<>
    {drawer?.kind === "day" ? <DetailPanel isOpen={isDrawerOpen} onExited={clearExitedDrawer} title={dateLabel(drawer.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, locale)} eyebrow={t("dayDetails")} onClose={closeDrawer}>
      <DayDetails date={drawer.date} items={getDayItems(visibleItems, drawer.date)} timeFormat={timeFormat} onItem={(item) => openDrawer({ kind: "item", item })} />
      <div className="mt-6 flex flex-wrap gap-2"><Button size="sm" onClick={() => openDrawer({ kind: "event-form", date: drawer.date })}>{t("addEventOnDay")}</Button><Button size="sm" variant="outline" onClick={() => openDrawer({ kind: "time-off-form", date: drawer.date })}>{t("requestTimeOff")}</Button></div>
    </DetailPanel> : null}
    {drawer?.kind === "item" ? <ItemPanel isOpen={isDrawerOpen && items.some((item) => item.key === drawer.item.key)} onExited={clearExitedDrawer} item={items.find((item) => item.key === drawer.item.key) ?? drawer.item} saving={weekPending.has(drawer.item.key)} data={initialData} projects={projects} timeFormat={timeFormat} onClose={closeDrawer} onEdit={(item) => openDrawer({ kind: "event-form", item })} onMutated={(item, removedKey) => { setItems((current) => { const remaining = removedKey ? removeCalendarItem(current, removedKey) : current; return item ? mergeCalendarItem(remaining, item) : remaining; }, true); if (item) openDrawer({ kind: "item", item }); else closeDrawer(); router.refresh(); }} /> : null}
    {drawer?.kind === "event-form" ? <Suspense fallback={<CalendarPanelPlaceholder isOpen={isDrawerOpen} onClose={closeDrawer} onExited={clearExitedDrawer} />}><CalendarSupportedData core={initialData} projects={projects} people={people}>{(data) => <EventForm key={drawer.instance} isOpen={isDrawerOpen} onExited={clearExitedDrawer} data={data} item={drawer.item} initialDate={drawer.date} initialRange={drawer.range} onClose={closeDrawer} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); openDrawer({ kind: "item", item }); }} />}</CalendarSupportedData></Suspense> : null}
    {drawer?.kind === "time-off-form" ? <TimeOffForm isOpen={isDrawerOpen} onExited={clearExitedDrawer} data={initialData} initialDate={drawer.date} onClose={closeDrawer} onSaved={(item) => { setItems((current) => mergeCalendarItem(current, item)); openDrawer({ kind: "item", item }); }} /> : null}
    {drawer?.kind === "days-off" ? <StudioDaysOffPanel isOpen={isDrawerOpen} onExited={clearExitedDrawer} initialDate={date} items={items.filter((item): item is Extract<CalendarItem, { source: "studio_day_off" }> => item.source === "studio_day_off")} onClose={closeDrawer} onChange={(added, removedIds) => { setItems((current) => added.reduce(mergeCalendarItem, current.filter((item) => item.source !== "studio_day_off" || !removedIds.includes(item.id))), true); router.refresh(); }} /> : null}
    {settingsOpen ? <CalendarSettingsDialog isOpen returnFocusRef={settingsTriggerRef} timeFormat={timeFormat} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setTimeFormat(next); setSettingsOpen(false); }} /> : null}
  </>}>
    <div data-instaload-ready="calendar-events" className="contents calendar-events">
      {view === "month" ? <MonthView anchor={date} today={today} items={visibleItems} timeFormat={timeFormat} onDay={(date) => openDrawer({ kind: "day", date })} onItem={(item) => openDrawer({ kind: "item", item })} /> : null}
      {view === "week" ? <WeekView anchor={date} items={visibleItems} timeFormat={timeFormat} onItem={(item) => openDrawer({ kind: "item", item })} onCreate={(range) => openDrawer({ kind: "event-form", date: range.startDate, range })} editAccess={initialData} savingKeys={weekSaveInFlight.current} onEventChange={saveWeekEvent} /> : null}
      {view === "agenda" ? <AgendaView start={date} items={visibleItems} timeFormat={timeFormat} onItem={(item) => openDrawer({ kind: "item", item })} /> : null}
    </div>
  </CalendarShell></CalendarTimeZoneContext.Provider>;
}

function CalendarShell({ initialView, initialDate, today, navigate, actions, filters, children, panels, loading = false }: {
  initialView: CalendarView; initialDate: string; today: string;
  navigate: (next: { view?: CalendarView; date?: string }) => void;
  actions: React.ReactNode; filters: React.ReactNode; children: React.ReactNode; panels?: React.ReactNode; loading?: boolean;
}) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
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

  return <div className="calendar-viewport min-w-0 space-y-3" data-calendar-loading={loading ? "" : undefined} data-calendar-ready={loading ? undefined : ""}>
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--ui-text)]">{t("title")}</h1>
      {actions}
    </header>
    <section className={`${fillsViewport ? "calendar-fill-card " : ""}overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-sm`}>
      <div className="calendar-toolbar flex flex-col gap-3 border-b border-[var(--ui-border)] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><Button size="sm" className="calendar-toolbar-control calendar-toolbar-icon" variant="outline" aria-label={t("previous")} onClick={() => movePeriod(-1)}><ChevronLeft className="size-4" /></Button><Button size="sm" className="calendar-toolbar-control" variant="outline" onClick={() => navigate({ date: today })}>{t("today")}</Button><Button size="sm" className="calendar-toolbar-control calendar-toolbar-icon" variant="outline" aria-label={t("next")} onClick={() => movePeriod(1)}><ChevronRight className="size-4" /></Button></div><h2 className="min-w-0 text-sm font-medium text-[var(--ui-text-secondary)] sm:ml-2">{periodLabel}</h2></div>
        {filters}
      </div>
      {children}
    </section>
    {panels}
  </div>;
}

function CalendarScopePlaceholder({ scope }: { scope: "project" | "person" }) {
  const t = useTranslations("Calendar");
  return <Select disabled size="compact" variant="secondary" data-calendar-support-loading={scope} className={`calendar-toolbar-control w-[min(100%,12rem)] ${scope === "project" ? "sm:w-44" : "sm:w-40"}`} aria-label={t(scope === "project" ? "filterProject" : "filterPerson")} value=""><SelectItem value="">{t(scope === "project" ? "allProjects" : "allPeople")}</SelectItem></Select>;
}

function CalendarProjectFilter({ stream, value, onChange }: { stream: Promise<CalendarProject[]>; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("Calendar"); const projects = use(stream);
  return <Select size="compact" variant="secondary" className="calendar-toolbar-control w-[min(100%,12rem)] sm:w-44" aria-label={t("filterProject")} value={value} onValueChange={onChange}><SelectItem value="">{t("allProjects")}</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</Select>;
}

function CalendarPersonFilter({ stream, value, onChange }: { stream: Promise<CalendarPerson[]>; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("Calendar"); const people = use(stream);
  return <Select size="compact" variant="secondary" className="calendar-toolbar-control w-[min(100%,12rem)] sm:w-40" aria-label={t("filterPerson")} value={value} onValueChange={onChange}><SelectItem value="">{t("allPeople")}</SelectItem>{people.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</Select>;
}

function CalendarSupportedData({ core, projects, people, children }: { core: CalendarCoreData; children: (data: CalendarPageData) => React.ReactNode } & Pick<CalendarDataStreams, "projects" | "people">) {
  return children({ ...core, projects: use(projects), people: use(people) });
}

function CalendarPanelPlaceholder({ isOpen, onClose, onExited }: { isOpen: boolean; onClose: () => void; onExited: () => void }) {
  const t = useTranslations("Common");
  return <DetailPanel isOpen={isOpen} onClose={onClose} onExited={onExited} title={t("loading")} eyebrow=""><div aria-busy="true" className="instaload-blueprint space-y-5"><span className="instaload-mark h-11 w-full" /><span className="instaload-mark h-11 w-full" /><span className="instaload-mark h-28 w-full" /></div></DetailPanel>;
}

export function CalendarBlueprint({ initialView, initialDate, timeFormat, timeZone: initialTimeZone }: { initialView: CalendarView; initialDate: string; timeFormat: CalendarTimeFormat; timeZone: string }) {
  const t = useTranslations("Calendar");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { view, date } = resolveCalendarSelection(
    searchParams.getAll("view").length === 1 ? searchParams.get("view") : initialView,
    searchParams.getAll("date").length === 1 ? searchParams.get("date") : initialDate,
    initialDate,
  );
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || APPLICATION_TIME_ZONE); }, []);
  function navigate(next: { view?: CalendarView; date?: string }) {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["event", "request", "refresh"]) params.delete(key);
    params.set("view", next.view ?? view); params.set("date", next.date ?? date);
    const href = `/calendar?${params}`;
    if (href === `${window.location.pathname}${window.location.search}`) return;
    if ((next.date ?? date) === date) window.history.pushState(null, "", href);
    else router.push(href);
  }
  return <CalendarTimeZoneContext.Provider value={timeZone}><CalendarShell loading initialView={view} initialDate={date} today={instantToDateOnly(new Date().toISOString(), timeZone)} navigate={navigate} actions={
    <div className="flex flex-wrap gap-2 sm:justify-end"><Button disabled size="sm" className="calendar-header-primary min-h-11 gap-2 sm:min-h-0"><CalendarPlus aria-hidden="true" className="size-4" />{t("addEvent")}</Button><Button disabled size="sm" className="min-h-11 gap-2 sm:min-h-0" variant="outline"><CalendarOff aria-hidden="true" className="size-4" />{t("absence")}</Button></div>
  } filters={
    <div className="flex flex-wrap items-center gap-2"><SegmentedControl className="calendar-toolbar-control calendar-toolbar-views w-full sm:w-auto" ariaLabel={t("view")} items={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "agenda", label: t("agenda") }]} value={view} onValueChange={(nextView) => { if (nextView !== view) navigate({ view: nextView }); }} /><CalendarScopePlaceholder scope="project" /><CalendarScopePlaceholder scope="person" /><Button disabled size="sm" className="calendar-toolbar-control gap-2" variant="outline"><Filter aria-hidden="true" className="size-4" />{t("filters")}</Button><Button disabled size="sm" className="calendar-toolbar-control calendar-toolbar-icon" variant="outline" aria-label={t("moreActions")}><Ellipsis aria-hidden="true" className="size-4" /></Button></div>
  }>
    {view === "month" ? <MonthView loading anchor={date} today={instantToDateOnly(new Date().toISOString(), timeZone)} items={[]} timeFormat={timeFormat} onDay={() => {}} onItem={() => {}} /> : null}
    {view === "week" ? <WeekView loading anchor={date} items={[]} timeFormat={timeFormat} onItem={() => {}} /> : null}
    {view === "agenda" ? <AgendaView loading start={date} items={[]} timeFormat={timeFormat} onItem={() => {}} /> : null}
  </CalendarShell></CalendarTimeZoneContext.Provider>;
}

function CalendarActionsMenu({ isAdmin, onOpenDaysOff, onOpenSettings, triggerRef }: { isAdmin: boolean; onOpenDaysOff: () => void; onOpenSettings: () => void; triggerRef: React.RefObject<HTMLButtonElement | null> }) {
  const t = useTranslations("Calendar");
  const [open, setOpen] = useState(false);
  function select(action: () => void) { setOpen(false); action(); }
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><Button ref={triggerRef} size="sm" className="calendar-toolbar-control calendar-toolbar-icon" variant="outline" aria-label={t("moreActions")} aria-haspopup="menu"><Ellipsis aria-hidden="true" className="size-4" /></Button></Popover.Trigger><Popover.Portal><Popover.Content role="menu" align="end" sideOffset={6} collisionPadding={8} className="z-[80] min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
    <button type="button" role="menuitem" onClick={() => select(onOpenSettings)} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-9"><Settings2 aria-hidden="true" className="size-4 text-[var(--ui-text-muted)]" />{t("settings")}</button>
    {isAdmin ? <button type="button" role="menuitem" onClick={() => select(onOpenDaysOff)} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-9"><CalendarOff aria-hidden="true" className="size-4 text-[var(--ui-text-muted)]" />{t("companyDaysOff")}</button> : null}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

function CalendarSettingsDialog({ isOpen, onClose, onSaved, returnFocusRef, timeFormat }: { isOpen: boolean; onClose: () => void; onSaved: (timeFormat: CalendarTimeFormat) => void; returnFocusRef: React.RefObject<HTMLButtonElement | null>; timeFormat: CalendarTimeFormat }) {
  const t = useTranslations("Calendar");
  const [selected, setSelected] = useState(timeFormat);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/calendar/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeFormat: selected }) });
      if (!response.ok) { setError(t("settingsSaveFailed")); return; }
      onSaved(selected);
    } catch {
      setError(t("settingsSaveFailed"));
    } finally {
      setPending(false);
    }
  }
  return <Dialog isOpen={isOpen} onRequestClose={pending ? () => undefined : onClose} returnFocusRef={returnFocusRef} closeDisabled={pending} closeLabel={t("close")} title={t("calendarSettings")} description={t("calendarSettingsDescription")} className="h-auto max-w-md">
    <div className="space-y-5 p-4 sm:p-6">
      {error ? <p role="alert" className="rounded-[var(--ui-radius-control)] border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
      <fieldset><legend className="text-sm font-semibold text-[var(--ui-text)]">{t("timeFormat")}</legend><div className="mt-3 space-y-2">{(["24h", "12h"] as const).map((option) => <label key={option} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-within:ring-2 focus-within:ring-[var(--ui-focus)]"><input data-dialog-initial-focus={option === timeFormat ? "" : undefined} type="radio" name="calendar-time-format" value={option} checked={selected === option} disabled={pending} onChange={() => setSelected(option)} className="size-4 shrink-0 accent-[var(--ui-action-primary)]" /><span className="font-medium">{t(option === "24h" ? "timeFormat24" : "timeFormat12")}</span><span className="ml-auto shrink-0 text-xs tabular-nums text-[var(--ui-text-muted)]">{option === "24h" ? "09:00–17:30" : "9:00 AM–5:30 PM"}</span></label>)}</div></fieldset>
      <div className="flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] pt-4"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="button" disabled={pending || selected === timeFormat} onClick={() => void save()}>{pending ? t("savingSettings") : t("saveSettings")}</Button></div>
    </div>
  </Dialog>;
}

function CalendarFilterMenu({ data, filters, onChange, onReset }: { data: CalendarCoreData; filters: CalendarFilters; onChange: (patch: Partial<CalendarFilters>) => void; onReset: () => void }) {
  const t = useTranslations("Calendar"); const checks: Array<[keyof Pick<CalendarFilters, "events" | "projectDeadlines" | "taskDeadlines" | "timeOff" | "birthdays" | "teamAnniversaries" | "salaryPayments" | "studioDaysOff">, string]> = [["events", t("events")], ["projectDeadlines", t("projectDeadlines")], ["taskDeadlines", t("taskDeadlines")], ["timeOff", t("teamAvailability")], ["birthdays", t("birthdays")], ["teamAnniversaries", t("teamAnniversaries")], ["studioDaysOff", t("companyDaysOff")]];
  if (data.isAdmin) checks.push(["salaryPayments", t("salaryPayments")]);
  return <Popover.Root><Popover.Trigger asChild><Button size="sm" className="calendar-toolbar-control gap-2" variant="outline"><Filter aria-hidden="true" className="size-4" />{t("filters")}</Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} collisionPadding={8} className="z-[80] w-[min(18rem,calc(100vw-1rem))] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] p-2 text-[var(--ui-text)] shadow-[var(--ui-shadow-popover)]">
    <fieldset><legend className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-[.1em] text-[var(--ui-text-muted)]">{t("show")}</legend><div className="space-y-0.5">{checks.map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-sm text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] sm:min-h-9"><input type="checkbox" className="size-4 shrink-0 accent-[var(--ui-action-primary)]" checked={filters[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />{label}</label>)}</div></fieldset>
    <div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-2"><label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-sm font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-surface-muted)] sm:min-h-9"><input type="checkbox" className="size-4 shrink-0 accent-[var(--ui-action-primary)]" checked={filters.mine} onChange={(event) => onChange({ mine: event.target.checked })} />{t("relevantToMe")}</label></div>
    <div className="mt-2 border-t border-[var(--ui-border-subtle)] pt-2"><button type="button" onClick={onReset} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-2 text-left text-sm font-medium text-[var(--ui-text-secondary)] transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:min-h-9"><RotateCcw aria-hidden="true" className="size-4" />{t("resetFilters")}</button></div>
  </Popover.Content></Popover.Portal></Popover.Root>;
}

function MonthView({ anchor, today, items, onDay, onItem, timeFormat, loading = false }: { loading?: boolean; anchor: string; today: string; items: CalendarItem[]; onDay: (date: string) => void; onItem: (item: CalendarItem) => void; timeFormat: CalendarTimeFormat }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const dates = getMonthGrid(anchor); const month = anchor.slice(0, 7);
  const desktopWeekCount = getMonthDesktopWeekCount(anchor);
  const segments = getMonthLayoutSegments(items, dates);
  const visibleLaneCount = 3;
  const allDayItemKeys = new Set(segments.map((segment) => segment.itemId));
  const segmentsByWeek = new Map<number, typeof segments>();
  for (const segment of segments) segmentsByWeek.set(segment.weekIndex, [...(segmentsByWeek.get(segment.weekIndex) ?? []), segment]);

  return <div className="calendar-month-view" aria-busy={loading}><div className="calendar-month-weekdays hidden grid-cols-7 border-b border-[var(--ui-border)] text-center text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)] md:grid">{Array.from({ length: 7 }, (_, index) => dateLabel(addCalendarDays("2024-01-01", index), { weekday: "short" }, locale)).map((day) => <div key={day} className="py-3">{day}</div>)}</div>
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
          return <div key={date} className={`calendar-month-day relative min-h-36 border-b border-r border-[var(--ui-border-subtle)] p-2 text-left align-top transition-colors duration-200 ${loading ? "" : "hover:bg-[var(--ui-surface-subtle)]"} ${date.slice(0, 7) !== month ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text-subtle)]" : ""}`}>
            <button type="button" disabled={loading} onClick={() => onDay(date)} aria-label={t("openDate", { date: dateLabel(date, { month: "long", day: "numeric" }, locale) })}
              className="absolute inset-0 w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] disabled:cursor-default" />
            <span aria-hidden="true" className={`pointer-events-none relative flex size-7 items-center justify-center rounded-full text-xs font-semibold ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : ""}`}>{Number(date.slice(-2))}</span>
            <div className="pointer-events-none relative grid [&_button]:pointer-events-auto" style={{ marginTop: dateLaneLayout.itemOffset, rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>
              {visibleTimedItems.map((item) => <CalendarPill key={item.key} item={item} month timeFormat={timeFormat} onClick={() => onItem(item)} />)}
              {overflow ? <button type="button" disabled={loading} onClick={() => onDay(date)} aria-label={t("moreEvents", { count: overflow, date: dateLabel(date, { month: "long", day: "numeric" }, locale) })} className="calendar-month-overflow min-h-11 px-2 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} {t("more")}</button> : null}
            </div>
          </div>;
        })}
        <div className="pointer-events-none absolute inset-x-0 grid grid-cols-7" style={{ top: getMonthItemTop(), gridTemplateRows: `repeat(${laneLayout.laneCount}, ${MONTH_LANE_HEIGHT}px)`, rowGap: MONTH_LANE_GAP }} aria-label={t("allDayItems")}>
          {weekSegments.filter((segment) => segment.lane < visibleLaneCount).map((segment) => { const geometry = getMonthSegmentGeometry(segment); const title = itemTitle(segment.item); return <Tooltip content={title} key={segment.segmentId}><button data-instaload-arrival={segment.segmentId} type="button" onClick={() => onItem(segment.item)} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}${segment.continuesBefore ? ", continues from the previous week" : ""}${segment.continuesAfter ? ", continues into the next week" : ""}`} className={`pointer-events-auto ${monthItemPresentationClassName} ${itemTone(segment.item)}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1, height: geometry.height, marginLeft: geometry.leftInset, marginRight: geometry.rightInset, paddingInline: geometry.textPaddingInline, paddingBlock: geometry.verticalPadding, borderLeftWidth: geometry.borderInlineStartWidth, borderTopLeftRadius: geometry.leftRadius, borderBottomLeftRadius: geometry.leftRadius, borderTopRightRadius: geometry.rightRadius, borderBottomRightRadius: geometry.rightRadius }}><span className="flex h-full min-w-0 items-center gap-1"><CalendarChipIcon item={segment.item} /><span className="truncate">{segment.showLabel ? title : ""}</span></span></button></Tooltip>; })}
        </div>
      </section>;
    })}</div>
    <div className="divide-y divide-[var(--ui-border-subtle)] md:hidden">{dates.filter((date) => getDayItems(items, date).some((item) => !allDayItemKeys.has(item.key)) || segments.some((segment) => segment.visibleStartDate === date) || date === today).map((date) => {
      const { visible, overflow } = getMonthMobileDayItems(items, segments, date);
      return <div key={date} className={`relative flex w-full gap-3 p-3 text-left transition-colors duration-200 sm:gap-4 sm:p-4 ${loading ? "" : "hover:bg-[var(--ui-surface-subtle)]"}`}>
        <button type="button" disabled={loading} onClick={() => onDay(date)} aria-label={t("openDate", { date: dateLabel(date, { weekday: "long", month: "long", day: "numeric" }, locale) })}
          className="absolute inset-0 w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] disabled:cursor-default" />
        <span aria-hidden="true" className="pointer-events-none relative min-h-11 w-12 shrink-0 text-center"><span className="block text-xs font-semibold uppercase text-[var(--ui-text-subtle)]">{dateLabel(date, { weekday: "short" }, locale)}</span><span className={`mx-auto mt-1 flex size-9 items-center justify-center rounded-full font-semibold ${date === today ? "bg-[var(--ui-action-primary)] text-[var(--ui-action-primary-text)]" : "text-[var(--ui-text)]"}`}>{Number(date.slice(-2))}</span></span>
        <div className="pointer-events-none relative min-w-0 flex-1 [&_button]:pointer-events-auto" style={{ display: "grid", rowGap: MONTH_EVENT_GEOMETRY.laneGap }}>
          {visible.map((item) => <CalendarPill key={item.key} item={item} mobile month timeFormat={timeFormat} onClick={() => onItem(item)} />)}
          {overflow ? <button type="button" disabled={loading} onClick={() => onDay(date)} aria-label={`Show ${overflow} more events on ${dateLabel(date, { month: "long", day: "numeric" })}`} className="min-h-11 text-left text-xs font-semibold text-[var(--ui-text-secondary)]">+{overflow} more</button> : null}
        </div>
      </div>;
    })}</div></div>;
}

function WeekView({ anchor, items, onItem, onCreate, onEventChange, editAccess, savingKeys, timeFormat, loading = false }: { loading?: boolean; anchor: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void; onCreate?: (range: CalendarEventFormRange) => void; onEventChange?: (item: Extract<CalendarItem, { source: "calendar_event" }>, bounds: WeekEventBounds) => Promise<boolean>; editAccess?: Pick<CalendarCoreData, "currentUserId" | "isAdmin">; savingKeys?: ReadonlySet<string>; timeFormat: CalendarTimeFormat }) {
  const timeZone = useContext(CalendarTimeZoneContext);
  const showUkraineTime = !isKyivTimeZone(timeZone);
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const itemTitle = useCalendarItemTitle();
  const start = startOfMondayWeek(anchor);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index)), [start]);
  const allDaySegments = useMemo(() => getWeekAllDaySegments(items, dates), [items, dates]);
  const allDayLanes = Math.max(1, ...allDaySegments.map((segment) => segment.lane + 1));
  const [layoutColumns, setLayoutColumns] = useState<ReadonlyMap<string, number>>(() => new Map());
  const timedSegments = useMemo(() => getTimedWeekLayout(getTimedWeekSegments(items, dates, timeZone), { columns: layoutColumns }), [items, dates, timeZone, layoutColumns]);
  const [previewColumns, setPreviewColumns] = useState<ReadonlyMap<string, Pick<TimedWeekLayoutSegment, "column" | "columnCount">> | null>(null);
  const updatePreviewLayout = useCallback((layout: TimedWeekLayoutSegment[] | null) => {
    setPreviewColumns((current) => {
      if (!layout) return null;
      if (current?.size === layout.length && layout.every((segment) => {
        const previous = current.get(segment.segmentId);
        return previous?.column === segment.column && previous?.columnCount === segment.columnCount;
      })) return current;
      return new Map(layout.map((segment) => [segment.segmentId, { column: segment.column, columnCount: segment.columnCount }]));
    });
  }, []);
  const timedByDate = new Map<string, typeof timedSegments>();
  for (const segment of timedSegments) timedByDate.set(segment.date, [...(timedByDate.get(segment.date) ?? []), segment]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const initialCurrentDayIndexRef = useRef<number | undefined>(undefined);
  const [now, setNow] = useState<Date | null>(null);
  const pixelsPerMinute = WEEK_PIXELS_PER_MINUTE;
  const currentTime = now ? getCurrentWeekTimePosition(dates, now, timeZone) : null;
  const gestureRef = useRef<{ pointerId: number; date: string; startX: number; startY: number; anchorMinute: number; dragging: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const cardPointerDownRef = useRef(false);
  const [selection, setSelection] = useState<{ date: string; startMinute: number; endMinute: number } | null>(null);
  const eventGestureRef = useRef<{ pointerId: number; item: Extract<CalendarItem, { source: "calendar_event" }>; mode: WeekEventEditMode; date: string; pointerMinute: number; startX: number; startY: number; dragging: boolean; previewStarted?: boolean; preview?: Pick<WeekEventPreview, "item" | "valid"> } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  useWeekColumnMotion(scrollRef, timedSegments, previewColumns, editingKey);
  const editPreviewRef = useRef<WeekEditPreviewHandle>(null);
  const creationPreviewRef = useRef<WeekCreationPreviewHandle>(null);
  const eventFrameRef = useRef<number | null>(null);
  const eventPointerRef = useRef<Pick<ReactPointerEvent<HTMLElement>, "pointerId" | "clientX" | "clientY"> | null>(null);
  const [eventError, setEventError] = useState("");

  function clearCreationPreview() { creationPreviewRef.current?.update(null); }

  function clearEventPreview() {
    if (eventFrameRef.current !== null) cancelAnimationFrame(eventFrameRef.current);
    eventFrameRef.current = null;
    eventPointerRef.current = null;
    editPreviewRef.current?.update(null);
    setEditingKey(null);
    setPreviewColumns(null);
  }

  function cancelEventEdit() {
    if (!eventGestureRef.current) return;
    eventGestureRef.current = null;
    suppressClickRef.current = true;
    clearEventPreview();
  }

  function eventTarget(event: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY">) {
    const container = scrollRef.current;
    const viewport = container?.getBoundingClientRect();
    const horizontal = horizontalScrollRef.current?.getBoundingClientRect();
    if (!container || !viewport || !horizontal || event.clientY < viewport.top || event.clientY > viewport.bottom || event.clientX < horizontal.left || event.clientX > horizontal.right) return null;
    for (const column of container.querySelectorAll<HTMLElement>("[data-week-date]")) {
      const rect = column.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX < rect.right && column.dataset.weekDate) return { date: column.dataset.weekDate, minute: getWeekPointerMinute(event.clientY - rect.top) };
    }
    return null;
  }

  function startEventEdit(event: ReactPointerEvent<HTMLElement>, item: CalendarItem, date: string, mode: WeekEventEditMode) {
    clearCreationPreview();
    cardPointerDownRef.current = true;
    suppressClickRef.current = false;
    if (loading || savingKeys?.has(item.key) || !onEventChange || !editAccess || !canEditWeekEvent(item, editAccess) || event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    const target = eventTarget(event);
    if (!target) return;
    event.stopPropagation();
    setEventError("");
    eventGestureRef.current = { pointerId: event.pointerId, item, mode, date, pointerMinute: target.minute, startX: event.clientX, startY: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function readEventPreview(event: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY">): WeekEventPreview | null {
    const gesture = eventGestureRef.current;
    const target = eventTarget(event);
    if (!gesture || !target) return null;
    const deltaMinutes = target.minute - gesture.pointerMinute;
    const bounds = getWeekEventBounds(gesture.item, gesture.mode, gesture.date, target.date, deltaMinutes, timeZone);
    let preview = gesture.preview;
    if (!bounds) preview = { item: gesture.item, valid: false };
    else if (!preview || preview.item.startsAt !== bounds.startsAt || preview.item.endsAt !== bounds.endsAt) {
      preview = { item: { ...gesture.item, ...bounds, startDate: instantToDateOnly(bounds.startsAt, timeZone), endDate: instantToDateOnly(bounds.endsAt, timeZone) }, valid: Boolean(getWeekEventUpdate(gesture.item, bounds, timeZone)) };
    }
    gesture.preview = bounds ? preview : undefined;
    return { ...preview, original: gesture.item, mode: gesture.mode, sourceDate: gesture.date, targetDate: target.date, deltaMinutes };
  }

  function moveEventEdit(event: ReactPointerEvent<HTMLElement>) {
    const gesture = eventGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging) {
      if (!isWeekSelectionDrag(gesture.startX, gesture.startY, event.clientX, event.clientY)) return;
      gesture.dragging = true;
    }
    eventPointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (eventFrameRef.current !== null) return;
    eventFrameRef.current = requestAnimationFrame(() => {
      eventFrameRef.current = null;
      const pointer = eventPointerRef.current;
      const activeGesture = eventGestureRef.current;
      if (!pointer || activeGesture?.pointerId !== pointer.pointerId) return;
      const preview = readEventPreview(pointer);
      if (preview && !activeGesture.previewStarted) {
        activeGesture.previewStarted = true;
        setEditingKey(activeGesture.item.key);
      }
      editPreviewRef.current?.update(preview);
    });
  }

  async function finishEventEdit(event: ReactPointerEvent<HTMLElement>) {
    const gesture = eventGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dragging = gesture.dragging || isWeekSelectionDrag(gesture.startX, gesture.startY, event.clientX, event.clientY);
    const preview = dragging ? readEventPreview(event) : null;
    clearEventPreview();
    eventGestureRef.current = null;
    if (!dragging) return;
    event.stopPropagation();
    suppressClickRef.current = true;
    if (!preview?.valid || !onEventChange || !weekEventBoundsChanged(gesture.item, preview.item)) {
      if (preview && !preview.valid) setEventError(t("invalidDateRange"));
      return;
    }
    const committedColumns = new Map(getWeekEventEditLayout(timedSegments, getTimedWeekSegments([preview.item], dates, timeZone), gesture.item.key, gesture.date).map((segment) => [segment.segmentId, segment.column]));
    setLayoutColumns(committedColumns);
    const restoreColumns = () => setLayoutColumns((current) => current === committedColumns ? layoutColumns : current);
    try {
      if (!await onEventChange(gesture.item, { startsAt: preview.item.startsAt, endsAt: preview.item.endsAt })) { restoreColumns(); setEventError(t("eventSaveFailed")); }
    } catch (error) { restoreColumns(); setEventError(`${gesture.item.title}: ${error instanceof Error ? error.message : t("eventScheduleFailed")}`); }
  }

  function cancelSelection() {
    if (!gestureRef.current) return;
    suppressClickRef.current = true;
    gestureRef.current = null;
    setSelection(null);
  }

  function startSelection(event: ReactPointerEvent<HTMLDivElement>, date: string) {
    clearCreationPreview();
    if (!onCreate || loading || event.target !== event.currentTarget || event.button !== 0 || !event.isPrimary) return;
    cardPointerDownRef.current = false;
    suppressClickRef.current = false;
    // Native touch scrolling owns the gesture; a tap is handled by onClick.
    if (event.pointerType !== "mouse") return;
    gestureRef.current = { pointerId: event.pointerId, date, startX: event.clientX, startY: event.clientY, anchorMinute: getWeekPointerMinute(event.clientY - event.currentTarget.getBoundingClientRect().top), dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) {
      const date = event.currentTarget.dataset.weekDate;
      if (onCreate && !loading && !eventGestureRef.current && event.pointerType === "mouse" && event.buttons === 0 && event.target === event.currentTarget && date) {
        creationPreviewRef.current?.update({ date, minute: getWeekPointerMinute(event.clientY - event.currentTarget.getBoundingClientRect().top) });
      } else clearCreationPreview();
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    gesture.dragging ||= isWeekSelectionDrag(gesture.startX, gesture.startY, event.clientX, event.clientY);
    if (gesture.dragging) setSelection({ date: gesture.date, ...getWeekSelectionMinutes(gesture.anchorMinute, getWeekPointerMinute(event.clientY - event.currentTarget.getBoundingClientRect().top)) });
  }

  function finishSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dragging = gesture.dragging || isWeekSelectionDrag(gesture.startX, gesture.startY, event.clientX, event.clientY);
    gestureRef.current = null;
    suppressClickRef.current = true;
    setSelection(null);
    if (!loading) onCreate?.(getWeekCreationRange(gesture.date, gesture.anchorMinute, dragging ? getWeekPointerMinute(event.clientY - event.currentTarget.getBoundingClientRect().top) : undefined));
  }

  useEffect(() => {
    function cancel() { clearCreationPreview(); cancelSelection(); cancelEventEdit(); }
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearCreationPreview();
        if (gestureRef.current || eventGestureRef.current) { event.preventDefault(); cancel(); }
      }
    }
    clearCreationPreview();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("blur", cancel); cancel(); };
  }, [dates, timeZone]);
  useEffect(() => {
    const initialNow = new Date();
    initialCurrentDayIndexRef.current = getCurrentWeekTimePosition(dates, initialNow, timeZone)?.dayIndex;
    const frame = window.requestAnimationFrame(() => setNow(initialNow));
    const horizontalContainer = horizontalScrollRef.current;
    if (horizontalContainer && window.matchMedia("(max-width: 767px)").matches && initialCurrentDayIndexRef.current !== undefined) {
      horizontalContainer.scrollLeft = Math.max(0, initialCurrentDayIndexRef.current * 112 - 56);
    }
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [dates, timeZone]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = getInitialWeekScrollTop(dates, new Date(), timeZone);
  }, [dates, timeZone]);

  return <div className="calendar-week-view relative" aria-busy={loading}>{eventError ? <p role="alert" className="absolute right-2 top-2 z-30 max-w-sm rounded-md border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] px-3 py-2 text-sm text-[var(--ui-danger-text)]">{eventError}</p> : null}<p id="week-scroll-hint" className="border-b border-[var(--ui-border-subtle)] px-3 py-2 text-xs text-[var(--ui-text-muted)] md:hidden">{t("weekScrollHint")}</p><div ref={horizontalScrollRef} onScroll={clearCreationPreview} aria-describedby="week-scroll-hint" aria-label={t("weeklyCalendar")} className="calendar-week-horizontal overflow-x-auto overscroll-x-contain"><div className={`calendar-week-content min-w-[840px] sm:min-w-[900px] ${showUkraineTime ? "[--calendar-hour-width:4.5rem]" : ""}`}>
    <div className="calendar-week-fixed-row calendar-week-grid border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border)]" />
      {dates.map((date, dayIndex) => <div key={date} className={`border-r border-[var(--ui-border)] px-2 py-3 text-center text-xs font-semibold ${currentTime?.dayIndex === dayIndex ? "bg-[var(--ui-surface-subtle)] text-[var(--ui-text)]" : "text-[var(--ui-text-muted)]"}`}><span className="block uppercase tracking-wide">{dateLabel(date, { weekday: "short" }, locale)}</span><span className="mt-1 block text-sm">{dateLabel(date, { month: "short", day: "numeric" }, locale)}</span></div>)}
    </div>
    <div className="calendar-week-fixed-row calendar-week-grid border-b border-[var(--ui-border)]">
      <div className="border-r border-[var(--ui-border)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-subtle)]">{t("allDay")}</div>
      <div className="relative col-span-7 grid grid-cols-7 gap-y-1 px-1 py-1" style={{ minHeight: allDayLanes * 22 + 8, gridTemplateRows: `repeat(${allDayLanes}, 20px)` }}>
        {allDaySegments.map((segment) => { const title = itemTitle(segment.item); return <Tooltip content={title} key={segment.segmentId}><button data-instaload-arrival={segment.segmentId} type="button" onClick={() => onItem(segment.item)} aria-label={`${title}, ${dateLabel(segment.visibleStartDate)} to ${dateLabel(segment.visibleEndDate)}`} className={`calendar-week-all-day min-w-0 border-l-2 px-2 text-left text-xs font-medium leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--ui-focus)] focus:ring-offset-1 ${itemTone(segment.item)} ${segment.continuesBefore ? "rounded-l-none" : "rounded-l-sm"} ${segment.continuesAfter ? "rounded-r-none" : "rounded-r-sm"}`} style={{ gridColumn: `${segment.startColumn} / span ${segment.columnSpan}`, gridRow: segment.lane + 1 }}><span className="flex min-w-0 items-center gap-1"><CalendarChipIcon item={segment.item} /><span className="truncate">{title}</span></span></button></Tooltip>; })}
      </div>
    </div>
    <div ref={scrollRef} onScroll={clearCreationPreview} className="calendar-week-timeline max-h-[36rem] overflow-y-auto">
      <div className="calendar-week-grid">
        <div className="sticky left-0 z-20 bg-[var(--ui-surface)]">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="border-r border-b border-[var(--ui-border)] pr-2 pt-1 text-right text-[10px] text-[var(--ui-text-secondary)]" style={{ height: 60 * pixelsPerMinute }}>{formatCalendarClockTime(hour, 0, timeFormat)}{showUkraineTime ? <span className="block text-[9px] font-normal text-[var(--ui-text-secondary)]">UA {kyivGutterTime(dates[0], hour, timeZone, timeFormat)}</span> : null}</div>)}</div>
        {dates.map((date, dayIndex) => <div key={date} data-week-date={date} className={`relative border-r border-[var(--ui-border)] ${onCreate && !loading ? "cursor-crosshair select-none" : ""} ${dayIndex === currentTime?.dayIndex ? "bg-[var(--ui-surface-subtle)]" : ""}`} style={{ height: 24 * 60 * pixelsPerMinute, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * pixelsPerMinute - 1}px, var(--ui-calendar-gridline) ${60 * pixelsPerMinute}px)`, backgroundSize: `100% ${60 * pixelsPerMinute}px` }} onPointerDown={(event) => startSelection(event, date)} onPointerMove={moveSelection} onPointerLeave={clearCreationPreview} onPointerUp={finishSelection} onPointerCancel={cancelSelection} onLostPointerCapture={cancelSelection} onClick={(event) => {
          if (event.target !== event.currentTarget || event.button !== 0 || loading || !onCreate) return;
          if (cardPointerDownRef.current) { cardPointerDownRef.current = false; return; }
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          onCreate(getWeekCreationRange(date, getWeekPointerMinute(event.clientY - event.currentTarget.getBoundingClientRect().top)));
        }}>
          {(timedByDate.get(date) ?? []).map((segment) => {
            const title = itemTitle(segment.item);
            const placement = previewColumns?.get(segment.segmentId) ?? segment;
            const timeLabel = segment.item.source === "calendar_event" || segment.item.source === "crm_follow_up"
              ? `${formatCalendarTime(segment.item.startsAt, timeFormat, timeZone)}–${formatCalendarTime(segment.item.endsAt, timeFormat, timeZone)}`
              : `${formatCalendarWallTime(segment.item.startTime ?? "00:00", timeFormat)}–${formatCalendarWallTime(segment.item.endTime ?? "00:00", timeFormat)}`;
            const location = segment.item.source === "calendar_event" ? segment.item.location : null;
            const details = [title, timeLabel, location].filter(Boolean).join("\n");
            const saving = savingKeys?.has(segment.item.key) ?? false;
            const editable = Boolean(!saving && onEventChange && editAccess && canEditWeekEvent(segment.item, editAccess));
            const lastSegment = segment.item.source === "calendar_event" && !getTimedWeekSegments([segment.item], [addCalendarDays(date, 1)], timeZone).length;
            return <div key={segment.segmentId} data-week-segment={segment.segmentId} className={`calendar-week-event-shell absolute ${itemTone(segment.item)}`} data-editable={editable || undefined} data-saving={saving || undefined} data-editing={editingKey === segment.item.key ? eventGestureRef.current?.mode : undefined} data-short={getTimedEventHeight(segment.startMinute, segment.endMinute, pixelsPerMinute) < 16 || undefined} style={{ top: segment.startMinute * pixelsPerMinute, height: getTimedEventHeight(segment.startMinute, segment.endMinute, pixelsPerMinute), left: `calc(${(placement.column / placement.columnCount) * 100}% + 2px)`, width: `calc(${100 / placement.columnCount}% - 4px)` }}><Tooltip content={editingKey ? "" : details}><button data-instaload-arrival={segment.segmentId} type="button" onPointerDown={(event) => startEventEdit(event, segment.item, date, "move")} onPointerMove={moveEventEdit} onPointerUp={(event) => { void finishEventEdit(event); }} onPointerCancel={cancelEventEdit} onLostPointerCapture={cancelEventEdit} onClick={(event) => { event.stopPropagation(); if (event.detail && suppressClickRef.current) { suppressClickRef.current = false; return; } onItem(segment.item); }} aria-busy={saving} aria-label={`${details.replaceAll("\n", ", ")}${saving ? `, ${t("saving")}` : ""}`} className={`calendar-week-event absolute inset-0 w-full overflow-hidden border-l-2 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${itemTone(segment.item)}`}>
              <WeekEventContent title={title} timeLabel={timeLabel} location={location} icon={<CalendarChipIcon item={segment.item} />} />
            </button></Tooltip>{saving ? <span role="status" className="calendar-week-saving" aria-label={`${title}: ${t("saving")}`}><LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" /></span> : null}{editable && lastSegment ? <button type="button" aria-label={`${t("endTime")}: ${title}`} className={`calendar-week-resize-handle text-current`} onPointerDown={(event) => startEventEdit(event, segment.item, date, "resize")} onPointerMove={moveEventEdit} onPointerUp={(event) => { void finishEventEdit(event); }} onPointerCancel={cancelEventEdit} onLostPointerCapture={cancelEventEdit} onClick={(event) => { event.stopPropagation(); if (event.detail && suppressClickRef.current) { suppressClickRef.current = false; return; } onItem(segment.item); }}><span aria-hidden="true" /></button> : null}</div>;
          })}
          {selection?.date === date ? <div role="status" className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-sm border border-[var(--ui-info-border)] bg-[var(--ui-info-surface)]/60 px-1 text-xs font-medium text-[var(--ui-info-text)]" style={{ top: selection.startMinute * pixelsPerMinute, height: (selection.endMinute - selection.startMinute) * pixelsPerMinute }}><span className="sticky top-0 block truncate">{formatCalendarClockTime(Math.floor(selection.startMinute / 60), selection.startMinute % 60, timeFormat)}–{formatCalendarClockTime(Math.floor(selection.endMinute / 60) % 24, selection.endMinute % 60, timeFormat)}</span></div> : null}
          {currentTime?.dayIndex === dayIndex ? <div className="calendar-now-indicator" style={{ top: currentTime.minute * pixelsPerMinute }} aria-label={t("currentTime", { time: formatCalendarClockTime(Math.floor(currentTime.minute / 60), currentTime.minute % 60, timeFormat) })} /> : null}
        </div>)}
      </div>
    </div>
  </div></div><WeekEditPreview ref={editPreviewRef} onLayoutChange={updatePreviewLayout} segments={timedSegments} dates={dates} timeZone={timeZone} timeFormat={timeFormat} container={scrollRef} /><WeekCreationPreview ref={creationPreviewRef} container={scrollRef} dates={dates} /></div>;
}

function AgendaView({ start, items, onItem, timeFormat, loading = false }: { loading?: boolean; start: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void; timeFormat: CalendarTimeFormat }) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const dates = Array.from({ length: 30 }, (_, index) => addCalendarDays(start, index)).filter((date) => items.some((item) => itemOccursOn(item, date)));
  if (loading) return <div aria-busy="true" className="min-h-36" />;
  if (!dates.length) return <p className="p-10 text-center text-sm text-[var(--ui-text-muted)]">{t("agendaEmpty")}</p>;
  return <div className="grid gap-x-8 p-3 sm:p-4 lg:grid-cols-2">{dates.map((date) => <section key={date} className="border-b border-[var(--ui-border-subtle)] py-3 sm:py-4"><h3 className="mb-2 text-sm font-semibold text-[var(--ui-text)]">{dateLabel(date, { weekday: "long", month: "long", day: "numeric" }, locale)}</h3><div className="space-y-2">{getDayItems(items, date).map((item) => <CalendarPill key={item.key} item={item} timeFormat={timeFormat} onClick={() => onItem(item)} />)}</div></section>)}</div>;
}

function DetailPanel({ isOpen, onExited, title, eyebrow, item, onClose, children }: { isOpen: boolean; onExited: () => void; title: string; eyebrow: string; item?: CalendarItem; onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("Calendar"); return <Drawer isOpen={isOpen} focusKey={`${eyebrow}:${title}`} onClose={onClose} onExited={onExited} title={title} className="w-full max-w-[34rem] sm:w-[min(34rem,calc(100%-1rem))]"><header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border-subtle)] px-4 py-4 sm:px-5"><div className="flex min-w-0 items-start gap-3">{item ? <CalendarDetailHeaderIcon item={item} /> : null}<div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--ui-text-muted)]">{eyebrow}</p><h2 className="mt-1 break-words text-xl font-semibold text-[var(--ui-text)]">{title}</h2></div></div><Button size="sm" variant="ghost" className="size-11 shrink-0 p-0" onClick={onClose} aria-label={t("close")}><X className="size-4" /></Button></header><main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</main></Drawer>;
}

function DayDetails({ items, onItem, timeFormat }: { date: string; items: CalendarItem[]; onItem: (item: CalendarItem) => void; timeFormat: CalendarTimeFormat }) {
  const t = useTranslations("Calendar");
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  if (!items.length) return <p className="rounded-xl border border-dashed border-[var(--ui-border-strong)] p-6 text-center text-sm text-[var(--ui-text-muted)]">{t("nothingScheduled")}</p>;
  const timeZone = useContext(CalendarTimeZoneContext);
  return <div className="space-y-2">{items.map((item) => <button key={item.key} type="button" onClick={() => onItem(item)} className={`w-full rounded-xl border-l-4 p-3 text-left ${itemTone(item)}`}><p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-70"><CalendarChipIcon item={item} size="size-3.5" />{itemTypeLabel(item)}</p><p className="mt-1 font-semibold">{itemTitle(item)}</p>{timedItemStart(item) ? <p className="mt-1 text-sm">{formatCalendarTime(timedItemStart(item) ?? "", timeFormat, timeZone)}{item.source === "calendar_event" ? `–${formatCalendarTime(item.endsAt, timeFormat, timeZone)}` : ""}</p> : null}</button>)}</div>;
}

function ItemPanel({ saving = false, isOpen, onExited, item, data, projects, onClose, onEdit, onMutated, timeFormat }: { saving?: boolean; isOpen: boolean; onExited: () => void; item: CalendarItem; data: CalendarCoreData; projects: Promise<CalendarProject[]>; onClose: () => void; onEdit: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void; onMutated: (item: CalendarItem | null, removedKey: string | null) => void; timeFormat: CalendarTimeFormat }) {
  const timeZone = useContext(CalendarTimeZoneContext);
  const t = useTranslations("Calendar"); const locale = useLocale(); const timeOff = useTranslations("TimeOff"); const status = useTranslations("Status"); const priority = useTranslations("Priority");
  const itemTitle = useCalendarItemTitle();
  const itemTypeLabel = useCalendarItemTypeLabel();
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [reviewNote, setReviewNote] = useState("");
  const timeOffMutationInFlight = useRef(false);
  const eventCancellationInFlight = useRef(false);
  const notifications = useTranslations("Notifications");
  const itemEyebrow = itemTypeLabel(item);
  async function cancelEvent(scope: "this" | "series") {
    if (item.source !== "calendar_event" || eventCancellationInFlight.current || pending || saving || !isOpen || (scope === "this" && !item.occurrenceStart)) return;
    eventCancellationInFlight.current = true;
    setPending(true); setError("");
    const suffix = scope === "this" ? `?scope=this&occurrenceStart=${encodeURIComponent(item.occurrenceStart ?? "")}` : "";
    try {
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(item.id)}${suffix}`, { method: "DELETE" });
      if (response.ok) onMutated(null, item.key);
      else setError(t("eventCancelFailed"));
    } catch { setError(t("eventCancelFailed")); }
    finally { eventCancellationInFlight.current = false; setPending(false); }
  }
  async function respondToInvitation(inviteId: string, invitationStatus: "accepted" | "declined") {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/calendar/invitations/${encodeURIComponent(inviteId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: invitationStatus }) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "calendar_event") onMutated(result.item, null);
      else setError(notifications(getCalendarInvitationErrorKey(result)));
    } catch { setError(notifications("invitationResponseFailed")); } finally { setPending(false); }
  }
  async function timeOffAction(action: "approve" | "reject" | "cancel") { if (item.source !== "time_off_request_admin" || timeOffMutationInFlight.current) return; if (action === "cancel" && !window.confirm(t("cancelRequestConfirm"))) return; timeOffMutationInFlight.current = true; setPending(true); setError(""); try { const result = await updateTimeOffRequest(item.id, action, reviewNote); if (isTimeOffMutationResult(result)) onMutated(result.item ?? null, result.removedKey ?? null); else setError(timeOff("requestUpdateFailed")); } catch { setError(timeOff("requestUpdateFailed")); } finally { timeOffMutationInFlight.current = false; setPending(false); } }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={itemTitle(item)} eyebrow={itemEyebrow} item={item} onClose={pending ? () => undefined : onClose}>{error ? <p role="alert" className="mb-4 rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}<div className="space-y-6 text-sm">
    <section><h3 className="font-semibold text-[var(--ui-text)]">{t("when")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.source === "calendar_event" ? item.allDay ? `${dateLabel(item.startDate, { month: "long", day: "numeric", year: "numeric" }, locale)}${item.endDate !== item.startDate ? ` – ${dateLabel(item.endDate, { month: "long", day: "numeric", year: "numeric" }, locale)}` : ""}` : `${formatCalendarDateTime(item.startsAt, locale, timeFormat, timeZone)} – ${formatCalendarDateTime(item.endsAt, locale, timeFormat, timeZone)}` : item.source === "crm_follow_up" ? formatCalendarDateTime(item.startsAt, locale, timeFormat, timeZone) : `${dateLabel(item.startDate, item.source === "birthday" || item.source === "team_anniversary" ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" })}${item.endDate !== item.startDate ? ` – ${dateLabel(item.endDate, { month: "long", day: "numeric", year: "numeric" })}` : ""}`}</p></section>
    {item.source === "birthday" || item.source === "team_anniversary" || item.source === "salary_payment" ? <section className="flex items-center gap-3 border-t border-[var(--ui-border-subtle)] pt-4"><UserAvatar decorative imageUrl={item.member.avatarUrl} name={item.member.fullName} size="sm" /><div><h3 className="font-semibold text-[var(--ui-text)]">{item.member.fullName}</h3><p className="text-sm text-[var(--ui-text-secondary)]">{item.source === "team_anniversary" ? t("teamAnniversaryDuration", { count: item.anniversaryYears }) : itemTypeLabel(item)}</p></div></section> : null}
    {item.source === "calendar_event" ? <><CalendarEventDetails item={item} data={data} projects={projects} pending={pending} onRespond={(inviteId, invitationStatus) => void respondToInvitation(inviteId, invitationStatus)} />{(data.isAdmin || item.organizer.id === data.currentUserId) ? <div className="flex flex-wrap items-start gap-2"><Button disabled={pending || saving} onClick={() => onEdit(item)}>{t("editEvent")}</Button><CalendarEventCancelAction key={item.key} disabled={pending || saving || !isOpen} occurrence={Boolean(item.occurrenceStart)} onConfirm={(scope) => { void cancelEvent(scope); }} /></div> : null}</> : null}
    {item.source === "project_deadline" ? <><p className="text-[var(--ui-text-secondary)]">{item.project.clientName ?? t("projectMilestone")} · {status(item.project.status)}</p><ProjectNavigationLink href={`/projects/${item.project.id}`} label={t("openProject")} name={item.project.name} /></> : null}
    {item.source === "task_deadline" ? <><p className="whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.task.description || t("taskDescription")}</p><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("assignee")}</dt><dd>{item.task.assigneeName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("status")}</dt><dd>{status(item.task.status)}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("priority")}</dt><dd className="inline-flex items-center gap-1.5"><TaskPriorityIcon priority={item.task.priority} />{priority(item.task.priority)}</dd></div></dl><ProjectNavigationLink href={`/projects/${item.task.projectId}`} label={t("openTask", { project: item.task.projectName })} name={item.task.projectName} /></> : null}
    {item.source === "crm_follow_up" ? <Button asChild><Link href={`/crm/leads?lead=${item.id}`}><PhoneCall className="size-4" aria-hidden="true" />{t("openLead")}</Link></Button> : null}
    {item.source === "time_off" ? <p className="text-[var(--ui-text-secondary)]">{t("privateDetails", { name: item.subjectName })}</p> : null}
    {item.source === "studio_day_off" ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold text-[var(--ui-text)]">{item.title}</h3><p className="mt-2 whitespace-pre-wrap leading-6 text-[var(--ui-text-secondary)]">{item.note || t("noNote")}</p></section> : null}
    {item.source === "time_off_request_admin" ? <><dl className="grid grid-cols-2 gap-4"><div><dt className="text-[var(--ui-text-muted)]">{t("employee")}</dt><dd>{item.subjectName}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("status")}</dt><dd><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTimeOffStatusBadgeStyle(item.status).className}`}>{timeOff(timeOffStatusKey[item.status])}</span></dd></div><div><dt className="text-[var(--ui-text-muted)]">{timeOff("requestType")}</dt><dd>{timeOff(timeOffRequestTypeKey[item.requestType])}</dd></div><div><dt className="text-[var(--ui-text-muted)]">{t("time")}</dt><dd>{item.allDay ? timeOff("allDay") : `${formatCalendarWallTime(item.startTime ?? "00:00", timeFormat)}–${formatCalendarWallTime(item.endTime ?? "00:00", timeFormat)}`}</dd></div></dl>{item.compensation ? <section className="border-t border-[var(--ui-border-subtle)] pt-4"><h3 className="font-semibold">{t("compensation")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.compensation.compensatedMinutes === 0 ? t("notCompensated") : item.compensation.remainingMinutes === 0 ? t("compensated") : t("partiallyCompensated")} · {t("compensationProgress", { compensated: item.compensation.compensatedMinutes / 60, required: item.compensation.requiredMinutes / 60 })}</p></section> : null}<section><h3 className="font-semibold">{timeOff("reason")}</h3><p className="mt-2 whitespace-pre-wrap text-[var(--ui-text-secondary)]">{item.privateNote || timeOff("noReason")}</p></section>{item.reviewNote ? <section><h3 className="font-semibold">{timeOff("reviewNote")}</h3><p className="mt-2 text-[var(--ui-text-secondary)]">{item.reviewNote}</p></section> : null}{data.isAdmin && item.status === "pending" ? <section className="space-y-3 border-t border-[var(--ui-border-subtle)] pt-5"><label className="grid gap-1.5 font-medium">{timeOff("reviewNote")}<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={2000} rows={3} className="ui-form-control rounded-xl border border-[var(--ui-border)] p-3 font-normal" /></label><div className="flex gap-2"><Button disabled={pending} onClick={() => void timeOffAction("approve")}>{pending ? timeOff("updating") : timeOff("approve")}</Button><Button disabled={pending} variant="outline" onClick={() => void timeOffAction("reject")}>{timeOff("reject")}</Button></div></section> : null}{((item.isOwn && item.status === "pending") || (data.isAdmin && item.status !== "cancelled")) ? <Button disabled={pending} variant="outline" onClick={() => void timeOffAction("cancel")}>{timeOff("cancelRequest")}</Button> : null}</> : null}
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

function CalendarPersonDetail({ person }: { person: CalendarPerson }) {
  return <div className="flex min-w-0 items-center gap-3"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} size="sm" /><span className="min-w-0"><span className="block truncate font-medium text-[var(--ui-text)]">{person.full_name}</span>{person.job_title ? <span className="block truncate text-xs text-[var(--ui-text-muted)]">{person.job_title}</span> : null}</span></div>;
}

function CalendarEventDetails({ item, data, projects, pending, onRespond }: { item: Extract<CalendarItem, { source: "calendar_event" }>; data: CalendarCoreData; projects: Promise<CalendarProject[]>; pending: boolean; onRespond: (inviteId: string, status: "accepted" | "declined") => void }) {
  const t = useTranslations("Calendar");
  const notifications = useTranslations("Notifications");
  const locale = useLocale();
  const config = getCalendarEventDetailConfig(item.eventType);
  const sections = new Set(config.sections);
  const currentInvite = item.invitees.find((invitee) => invitee.id === data.currentUserId);

  return <>
    {sections.has("project") && item.project ? <section><h3 className="mb-2 font-semibold text-[var(--ui-text)]">{t("project")}</h3><ProjectNavigationLink href={`/projects/${item.project.id}`} label={t("openProject")} name={item.project.name} /></section> : null}
    {item.eventType==="business_trip" && data.isAdmin ? <Link className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4" href={`/finance/trips?calendar=${item.id}`}><Banknote className="size-4" aria-hidden="true"/>{t("tripFinance")}</Link> : null}
    {sections.has("destination") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("destination")}</h3><p className="mt-2 flex items-center gap-2 text-[var(--ui-text-secondary)]"><MapPin aria-hidden="true" className="size-4 shrink-0" /><Suspense fallback={<span className="instaload-blueprint"><span className="instaload-mark h-5 w-40" /></span>}><CalendarDestination projects={projects} projectId={item.project?.id} /></Suspense></p></section> : null}
    {sections.has("assignee") && item.assignee ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t(config.assigneeLabel ?? "assignee")}</h3><div className="mt-2"><CalendarPersonDetail person={item.assignee} /></div></section> : null}
    {sections.has("participants") ? <section><h3 className="font-semibold text-[var(--ui-text)]">{t("participants")}</h3>{item.participants.length ? <ul className="mt-2 space-y-2">{item.participants.map((participant) => <li key={participant.id}><CalendarPersonDetail person={participant} /></li>)}</ul> : <p className="mt-2 text-[var(--ui-text-secondary)]">{t("noAttendees")}</p>}</section> : null}
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

function CalendarDestination({ projects, projectId }: { projects: Promise<CalendarProject[]>; projectId?: string }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  return projectDestination(use(projects).find((project) => project.id === projectId), locale) ?? t("destinationUnavailable");
}

export function InviteePicker({ people, selectedIds, onChange }: { people: CalendarPerson[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("Calendar");
  return <PeoplePicker people={people.map((person) => ({ id: person.id, name: person.full_name, avatarUrl: person.avatar_url }))} selectedIds={selectedIds} onChange={onChange} label={t("invitees")} placeholder={t("addInvitees")} searchPlaceholder={t("searchInvitees")} emptyMessage={t("noInviteeResults")} removeLabel={(name) => t("removeInvitee", { name })} />;
}

function MeetingModeControl({ ariaLabel, offlineLabel, onlineLabel, value, onValueChange }: { ariaLabel: string; offlineLabel: string; onlineLabel: string; value: MeetingMode; onValueChange: (value: MeetingMode) => void }) {
  const online = value === "online";
  return <button type="button" role="switch" aria-label={ariaLabel} aria-checked={online} onClick={() => onValueChange(online ? "offline" : "online")} className="ui-form-control relative inline-grid min-h-11 w-44 grid-cols-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] p-0.5 text-sm font-medium transition-colors">
    <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[calc(var(--ui-radius-control)-0.125rem)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-panel)] transition-transform duration-200 ease-out ${online ? "translate-x-full" : ""}`} />
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
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">{allDayControl}<div className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium max-sm:w-full max-sm:justify-between"><span className="flex shrink-0 items-center gap-2"><Repeat2 className="size-4" aria-hidden="true" /><span className="whitespace-nowrap">{label}</span></span><Select className="w-48 max-w-full" value={selected} onValueChange={(next) => { if (next === "none") onChange(null); else if (next === "custom") onChange(value ?? { frequency: "weekly", interval: 2, weekdays: [], endsOn: null, occurrenceCount: null }); else onChange({ frequency: next as RecurrenceRule["frequency"], interval: 1, weekdays: [], endsOn: null, occurrenceCount: null }); }}><SelectItem value="none">{options[0][0]}</SelectItem>{options.slice(1).map(([name, rule]) => <SelectItem key={rule?.frequency} value={rule?.frequency ?? "none"}>{name}</SelectItem>)}<SelectItem value="custom">{uk ? "Власний графік" : "Custom schedule"}</SelectItem></Select></div></div>{value ? <><p className="text-xs text-[var(--ui-text-secondary)]">{recurrenceText(locale, value)}</p>{custom ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">{uk ? "Інтервал" : "Interval"}<input min="1" max="99" type="number" className={`${fieldClass} mt-1`} value={value.interval} onChange={(event) => onChange({ ...value, interval: Number(event.target.value) || 1 })} /></label><label className="text-sm font-medium">{uk ? "Завершити після" : "End after"}<input min="1" max="999" type="number" className={`${fieldClass} mt-1`} value={value.occurrenceCount ?? ""} placeholder={uk ? "Ніколи" : "Never"} onChange={(event) => onChange({ ...value, occurrenceCount: event.target.value ? Number(event.target.value) : null })} /></label>{value.frequency === "weekly" ? <div className="sm:col-span-2"><p className="text-sm font-medium">{uk ? "Дні тижня" : "Days of week"}</p><div className="mt-1 flex flex-wrap gap-2">{(uk ? ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((day, index) => <label key={day} className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" checked={value.weekdays.includes(index)} onChange={() => onChange({ ...value, weekdays: value.weekdays.includes(index) ? value.weekdays.filter((item) => item !== index) : [...value.weekdays, index] })} />{day}</label>)}</div></div> : null}<div className="text-sm font-medium sm:col-span-2"><p>{uk ? "До дати" : "End date"}</p><DatePicker className="mt-1" aria-label={uk ? "До дати" : "End date"} locale={locale} value={value.endsOn ?? ""} onValueChange={(endsOn) => onChange({ ...value, endsOn: endsOn || null })} /></div></div> : null}</> : null}</section>;
}

function EventForm({ isOpen, onExited, data, item, initialDate, initialRange, onClose, onSaved }: { isOpen: boolean; onExited: () => void; data: CalendarPageData; item?: Extract<CalendarItem, { source: "calendar_event" }>; initialDate?: string; initialRange?: CalendarEventFormRange; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "calendar_event" }>) => void }) {
  const t = useTranslations("Calendar"); const locale = useLocale();
  const timeZone = useContext(CalendarTimeZoneContext);
  const baseDate = initialDate ?? instantToDateOnly(new Date().toISOString(), timeZone);
  const allowedEventTypes = getCreatableCalendarEventTypes(data.isAdmin ? "admin" : "employee");
  const rawInitial = createCalendarEventFormValues(item, baseDate, timeZone, initialRange);
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
  const projectGroups = groupCalendarEventProjects(isSiteVisit ? siteVisitProjects : isBusinessTrip ? businessTripProjects : data.projects);
  const projectParticipants = values.projectId ? data.people.filter((person) => person.projectIds.includes(values.projectId) && (data.isAdmin || person.id === data.currentUserId)) : [];
  const interviewers = data.people.filter((person) => person.systemRole === "admin");
  const currentUserInterviewer = interviewers.find((person) => person.id === data.currentUserId);
  const remainingInterviewers = interviewers.filter((person) => person.id !== data.currentUserId);
  const appropriatePeople = (values.projectId && values.eventType !== "meeting" && values.eventType !== "presentation" && values.eventType !== "interview" ? data.people.filter((person) => person.projectIds.includes(values.projectId)) : data.people).filter((person) => isCalendarEventInviteeSelectable(values.eventType, person.id, organizerId));
  function updateContext(patch: Partial<typeof values>) {
    const next = {
      ...values,
      ...patch,
      ...(patch.eventType && patch.eventType !== values.eventType ? { attendeeIds: getCalendarEventTypeAttendees(patch.eventType, values.attendeeIds, organizerId) } : {}),
      ...(patch.eventType === "work_makeup" ? { attendeeIds: [], participantIds: [], location: "", meetingUrl: "", projectId: "", recurrenceRule: null, assigneeId: "" } : {}),
      ...(patch.eventType === "meeting" || patch.eventType === "presentation" ? { allDay: false, endDate: values.startDate, recurrenceRule: null, meetingMode: values.meetingMode ?? "offline" } : {}),
      ...(patch.eventType === "interview" ? { attendeeIds: [], participantIds: [], projectId: "", location: "", allDay: false, endDate: values.startDate, recurrenceRule: null, assigneeId: "" } : {}),
      ...(patch.eventType === "site_visit" ? { attendeeIds: [], participantIds: data.isAdmin ? [] : [data.currentUserId], meetingUrl: "", allDay: false, recurrenceRule: null, assigneeId: "", endDate: values.startDate } : {}),
      ...(patch.eventType === "business_trip" ? { attendeeIds: [], assigneeId: "", meetingUrl: "", location: "", recurrenceRule: null, allDay: true, participantIds: data.isAdmin ? [] : [data.currentUserId] } : {}),
      ...(patch.eventType && patch.eventType !== "site_visit" && patch.eventType !== "interview" ? { assigneeId: "" } : {}),
      ...(patch.eventType && patch.eventType !== "work_makeup" ? { compensatesTimeOffRequestId: "" } : {}),
    };
    const eligible = (next.projectId && next.eventType !== "meeting" && next.eventType !== "presentation" && next.eventType !== "interview" ? data.people.filter((person) => person.projectIds.includes(next.projectId)) : data.people).filter((person) => isCalendarEventInviteeSelectable(next.eventType, person.id, organizerId));
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
      const payload: CalendarEventRequest = {
        ...toCalendarEventMutationPayload(values, timeZone),
        title: isWorkMakeup ? getWorkMakeupTitle(values, locale, selectedDayOff ? { ...selectedDayOff, previousContributionMinutes } : null, timeZone) : isSiteVisit ? getSiteVisitTitle(data.projects.find((project) => project.id === values.projectId)?.name ?? "", locale) : isBusinessTrip ? getBusinessTripTitle(data.projects.find((project) => project.id === values.projectId)?.name ?? "", locale) : values.title,
        assigneeId: isInterview ? values.assigneeId || null : null,
        scope: item?.occurrenceStart ? scope : "series",
        occurrenceStart: item?.occurrenceStart ?? undefined,
      };
      const { response, result } = await saveCalendarEvent(item?.id, payload);
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
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={item ? t("editEventTitle") : t("addEventTitle")} eyebrow={t("eventForm")} onClose={requestClose}><form autoComplete="off" className="calendar-event-form space-y-4" aria-busy={pending} onSubmit={(event) => event.preventDefault()}>
    <FormField label={t("type")} error={fieldErrors.eventType}><Select value={values.eventType} onValueChange={(eventType) => updateContext({ eventType: eventType as CalendarEventType })}>{[...new Set([...allowedEventTypes, item?.eventType].filter((type): type is CalendarEventType => Boolean(type)))].map((type) => { const { Icon, labelKey, color } = getCalendarEventTypeConfig(type); return <SelectItem key={type} value={type}><span className="flex items-center gap-2"><Icon aria-hidden="true" className="size-4" style={{ color }} />{t(labelKey)}</span></SelectItem>; })}</Select></FormField>
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip ? <FormField label={t("titleLabel")} error={fieldErrors.title}><input className={fieldClass} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></FormField> : null}
    {!isWorkMakeup && !isInterview ? <FormField label={t("project")} optional={!isSiteVisit && !isBusinessTrip} error={fieldErrors.projectId}><Select placeholder={t("selectProject")} value={values.projectId || "no-project"} onValueChange={(projectId) => updateContext({ projectId: projectId === "no-project" ? "" : projectId, ...((isSiteVisit || isBusinessTrip) && !data.isAdmin ? { participantIds: [data.currentUserId] } : {}) })}>{!isSiteVisit && !isBusinessTrip ? <SelectItem value="no-project">{t("noProject")}</SelectItem> : null}{projectGroups.current.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}{projectGroups.completed.length ? <><div role="presentation" className="mx-2 mt-1 border-t border-[var(--ui-border-subtle)] px-1 pb-1 pt-3 text-xs font-medium text-[var(--ui-text-muted)]">{t("completedProjects")}</div>{projectGroups.completed.map((project) => <SelectItem key={project.id} value={project.id} className="text-[var(--ui-text-muted)]">{project.name}</SelectItem>)}</> : null}</Select></FormField> : null}
    {isSiteVisit || isBusinessTrip ? <FormField as="div" label={t("participants")} error={fieldErrors.participantIds}><PeoplePicker people={projectParticipants.map((person) => ({ id: person.id, name: person.full_name, avatarUrl: person.avatar_url }))} selectedIds={values.participantIds} onChange={(participantIds) => setValues({ ...values, participantIds })} label={t("participants")} placeholder={values.projectId ? t("selectParticipants") : t("selectProjectFirst")} searchPlaceholder={t("searchInvitees")} emptyMessage={t("noInviteeResults")} removeLabel={(name) => t("removeInvitee", { name })} disabled={!values.projectId || pending} invalid={Boolean(fieldErrors.participantIds)} /></FormField> : null}
    {isInterview ? <FormField label={t("interviewer")} error={fieldErrors.assigneeId}><Select placeholder={t("selectInterviewer")} value={values.assigneeId || undefined} onValueChange={(assigneeId) => setValues({ ...values, assigneeId })}>{currentUserInterviewer ? <SelectItem textValue={currentUserInterviewer.full_name} value={currentUserInterviewer.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={currentUserInterviewer.avatar_url} name={currentUserInterviewer.full_name} size="boardCard" /><span className="truncate">{currentUserInterviewer.full_name}</span><span className="shrink-0 text-xs font-normal text-[var(--ui-text-muted)]">{t("assignToMe")}</span></span></SelectItem> : null}{remainingInterviewers.map((person) => <SelectItem key={person.id} textValue={person.full_name} value={person.id}><span className="flex min-w-0 items-center gap-2"><UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} size="boardCard" /><span className="truncate">{person.full_name}</span></span></SelectItem>)}</Select></FormField> : null}
    {isBusinessTrip ? <FormField label={t("destination")}><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-3 text-sm text-[var(--ui-text-secondary)]">{projectDestination(data.projects.find((project) => project.id === values.projectId), locale) ?? t("destinationUnavailable")}</div></FormField> : null}
    {isWorkMakeup ? <FormField label={t("compensatesDayOff")} optional error={fieldErrors.compensatesTimeOffRequestId}><Select disabled={data.compensableDayOffs.length === 0} placeholder={data.compensableDayOffs.length === 0 ? t("noOutstandingDayOffs") : t("selectDayOff")} value={values.compensatesTimeOffRequestId || undefined} onValueChange={selectCompensatedDayOff}>{data.compensableDayOffs.map((request) => <SelectItem key={request.id} value={request.id}>{`${dateLabel(request.startDate, { month: "long", day: "numeric" }, locale)} · ${request.allDay ? t("allDay") : `${request.startTime}–${request.endTime}`} · ${t("remainingHours", { hours: request.remainingMinutes / 60 })}`}</SelectItem>)}</Select>{values.compensatesTimeOffRequestId ? <button type="button" onClick={() => setValues({ ...values, compensatesTimeOffRequestId: "" })} className="mt-2 text-left text-xs font-medium text-[var(--ui-text-secondary)] underline">{t("removeDayOffLink")}</button> : null}</FormField> : null}
    {isWorkMakeup || isBusinessTrip ? <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />{t("allDayEvent")}</label> : !isSiteVisit && !isMeetingPresentation && !isInterview ? <RecurrenceControl allDayControl={<label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => setValues({ ...values, allDay: event.target.checked })} />{t("allDayEvent")}</label>} locale={locale} value={values.recurrenceRule ?? null} onChange={(recurrenceRule) => setValues({ ...values, recurrenceRule })} /> : null}
    {isSiteVisit || isMeetingPresentation || isInterview ? <><FormField label={t("date")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues({ ...values, startDate, endDate: startDate })} /></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField label={isMeetingPresentation || isInterview ? t("startTime") : t("starts")}><TimePicker data-calendar-field locale={locale} value={values.startTime} onValueChange={(startTime) => { const next = updateEventStartTime(values, startTime, endTimeLinked); setValues({ ...next, endDate: values.startDate, ...(next.endDate !== values.startDate ? { endTime: "23:59" } : {}) }); }} /></FormField><FormField label={isMeetingPresentation || isInterview ? t("endTime") : t("ends")} error={fieldErrors.endsAt}><TimePicker data-calendar-field locale={locale} value={values.endTime} onValueChange={(endTime) => setValues({ ...values, endTime })} /></FormField></div></> : <div className={values.allDay ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>{values.allDay ? <><FormField label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /></FormField><FormField label={t("endDate")} error={fieldErrors.endsAt}><DatePicker locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /></FormField></> : <><FormField label={t("starts")}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("startDate")} locale={locale} value={values.startDate} onValueChange={(startDate) => setValues(updateEventStartDate(values, startDate, endDateLinked))} /><TimePicker data-calendar-field aria-label={t("startTime")} className="min-w-0" locale={locale} value={values.startTime} onValueChange={(startTime) => setValues(updateEventStartTime(values, startTime, endTimeLinked))} /></div></FormField><FormField label={t("ends")} error={fieldErrors.endsAt}><div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]"><DatePicker aria-label={t("endDate")} locale={locale} min={values.startDate} value={values.endDate} invalid={Boolean(fieldErrors.endsAt)} onValueChange={(endDate) => { setEndDateLinked(false); setValues({ ...values, endDate }); }} /><TimePicker data-calendar-field aria-label={t("endTime")} className="min-w-0" locale={locale} value={values.endTime} onValueChange={(endTime) => { setEndTimeLinked(false); setValues({ ...values, endTime }); }} /></div></FormField></>}</div>}
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip && item?.occurrenceStart ? <FormField label={locale.startsWith("uk") ? "Застосувати зміни до" : "Apply changes to"}><Select value={scope} onValueChange={(nextScope) => setScope(nextScope as "this" | "series")}><SelectItem value="this">{locale.startsWith("uk") ? "Лише ця подія" : "Only this event"}</SelectItem><SelectItem value="series">{locale.startsWith("uk") ? "Уся серія" : "Entire series"}</SelectItem></Select></FormField> : null}
    {!isWorkMakeup && !isSiteVisit && !isBusinessTrip && !isInterview ? <><FormField as="div" label={<span className="inline-flex items-center gap-1">{isMeetingPresentation ? t("participants") : t("invitees")}<Tooltip content={t("inviteesHelp")} openOnClick><button type="button" aria-label={t("inviteesHelpLabel")} className="inline-flex size-6 items-center justify-center rounded text-[var(--ui-text-muted)] transition-colors duration-150 hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none"><Info aria-hidden="true" className="size-3.5" /></button></Tooltip></span>} error={fieldErrors.attendeeIds}><InviteePicker people={appropriatePeople} selectedIds={values.attendeeIds} onChange={(attendeeIds) => setValues({ ...values, attendeeIds })} /></FormField>{isMeetingPresentation ? <><FormField as="div" label={t("meetingMode")}><MeetingModeControl ariaLabel={t("meetingMode")} offlineLabel={t("offline")} onlineLabel={t("online")} value={values.meetingMode} onValueChange={(meetingMode) => setValues({ ...values, meetingMode, location: meetingMode === "online" ? "" : values.location, meetingUrl: meetingMode === "offline" ? "" : values.meetingUrl })} /></FormField>{values.meetingMode === "offline" ? <FormField label={t("location")} optional><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField> : <FormField label={t("meetingUrl")} optional error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField>}</> : <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("location")}><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField><FormField label={t("meetingUrl")} error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField></div>}</> : isInterview ? <FormField label={t("meetingUrl")} optional error={fieldErrors.meetingUrl}><input type="url" className={fieldClass} value={values.meetingUrl} onChange={(event) => setValues({ ...values, meetingUrl: event.target.value })} /></FormField> : isSiteVisit ? <FormField label={t("location")} optional><input className={fieldClass} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></FormField> : null}
    <FormField label={t("descriptionLabel")}><textarea className={textareaClassName} rows={5} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></FormField>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? t("saving") : t("saveEvent")}</Button></div>
  </form></DetailPanel>;
}

function TimeOffForm({ isOpen, onExited, data, initialDate, onClose, onSaved }: { isOpen: boolean; onExited: () => void; data: CalendarCoreData; initialDate?: string; onClose: () => void; onSaved: (item: Extract<CalendarItem, { source: "time_off_request_admin" }>) => void }) {
  const t = useTranslations("TimeOff");
  const calendar = useTranslations("Calendar"); const locale = useLocale();
  const date = initialDate ?? data.today; const initial = { requestType: "vacation" as TimeOffRequestType, startDate: date, endDate: date, allDay: true, startTime: "09:00", endTime: "10:00", privateNote: "" }; const [values, setValues] = useState(initial); const [endDateLinked, setEndDateLinked] = useState(true); const [endTimeLinked, setEndTimeLinked] = useState(true); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<number | null>(null);
  const [projection, setProjection] = useState<{ remaining: number; exceeds: boolean } | null>(null);
  const [balanceError, setBalanceError] = useState<"load" | "unconfigured" | null>(null);
  const [datesSelected, setDatesSelected] = useState(Boolean(initialDate));
  const balanceAsOf = values.startDate < data.today ? data.today : values.startDate;
  const validVacationRange = Boolean(values.startDate && values.endDate && values.endDate >= values.startDate);
  useEffect(() => {
    if (!isOpen || values.requestType !== "vacation") return;
    const controller = new AbortController();
    setAvailable(null); setProjection(null); setBalanceError(null);
    const params = validVacationRange
      ? new URLSearchParams({ startDate: values.startDate, endDate: values.endDate })
      : new URLSearchParams({ asOf: balanceAsOf });
    void fetch(`/api/calendar/time-off?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 422) throw new Error("unconfigured");
        if (!response.ok) throw new Error("balance");
        const result: unknown = await response.json();
        if (typeof result !== "object" || result === null || !("available" in result) || typeof result.available !== "number") throw new Error("balance");
        setAvailable(result.available);
        if ("remaining" in result && typeof result.remaining === "number" && "exceeds" in result && typeof result.exceeds === "boolean") setProjection({ remaining: result.remaining, exceeds: result.exceeds });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setBalanceError(error instanceof Error && error.message === "unconfigured" ? "unconfigured" : "load"); });
    return () => controller.abort();
  }, [isOpen, balanceAsOf, validVacationRange, values.requestType, values.startDate, values.endDate]);
  const requestedDays = values.startDate && values.endDate && values.endDate >= values.startDate
    ? getRequiredDayOffMinutes({ id: "", startDate: values.startDate, endDate: values.endDate, startTime: null, endTime: null, allDay: true }) / 480
    : 0;
  const insufficient = values.requestType === "vacation" && projection?.exceeds === true;
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
    if (insufficient || (values.requestType === "vacation" && (available === null || balanceError))) { setPending(false); return; }
    if (reasonRequired && !values.privateNote.trim()) {
      setFieldErrors({ privateNote: t("reasonRequired") }); setPending(false); return;
    }
    try {
      const response = await fetch("/api/calendar/time-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, startTime: values.allDay ? null : values.startTime, endTime: values.allDay ? null : values.endTime }) });
      const result: unknown = await response.json();
      if (response.ok && isMutationResult(result) && result.item?.source === "time_off_request_admin") onSaved(result.item);
      else if (typeof result === "object" && result !== null) {
        if ("formError" in result && typeof result.formError === "string") setError(t("requestCreateFailed"));
        if ("fieldErrors" in result && typeof result.fieldErrors === "object" && result.fieldErrors !== null) setFieldErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([field, message]) => [field, message === "vacation_balance_exceeded" ? t("insufficientVacation") : requestFieldError(field)])));
      }
    } catch { setError(t("requestCreateFailed")); }
    finally { setPending(false); }
  }
  return <DetailPanel isOpen={isOpen} onExited={onExited} title={calendar("requestTimeOffTitle")} eyebrow={t("privateRequest")} onClose={requestClose}><form autoComplete="off" className="space-y-4" aria-busy={pending} onSubmit={(event) => event.preventDefault()}>
    <Input label={t("requestType")} error={fieldErrors.requestType || (values.requestType === "vacation" && balanceError ? t(balanceError === "unconfigured" ? "balanceUnconfigured" : "balanceUnavailable") : undefined)}><Select value={values.requestType} endAdornment={values.requestType === "vacation" && (data.isAdmin || data.vacationVisibleToEmployees) && available !== null ? datesSelected && requestedDays > 0 && projection ? t("vacationProjection", { remaining: projection.remaining }) : t("vacationAvailable", { count: available }) : undefined} onValueChange={(requestType) => updateRequestType(requestType as TimeOffRequestType)}>{getCreatableTimeOffRequestTypes(data.isAdmin ? "admin" : "employee").map((type) => { const Icon = ABSENCE_ICONS[type]; return <SelectItem key={type} value={type} textValue={t(timeOffRequestTypeKey[type])} endAdornment={type === "vacation" && (data.isAdmin || data.vacationVisibleToEmployees) && available !== null ? t("vacationAvailable", { count: available }) : undefined}><span className="inline-flex min-w-0 items-center gap-2">{Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" /> : null}<span className="truncate">{t(timeOffRequestTypeKey[type])}</span></span></SelectItem>; })}</Select></Input>
    {requestPresentation.supportsPartialDay ? <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={values.allDay} onChange={(event) => { const allDay = event.target.checked; if (!allDay) setEndDateLinked(true); setValues({ ...values, allDay, endDate: allDay ? values.endDate : values.startDate }); }} />{t("allDay")}</label> : null}
    <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startDate")}><DatePicker locale={locale} value={values.startDate} onValueChange={(startDate) => { setDatesSelected(true); setValues({ ...values, ...updateLinkedStartDate(values, startDate, endDateLinked) }); }} /></Input><Input label={t("endDate")} error={insufficient ? t("insufficientVacation") : fieldErrors.endDate}><DatePicker locale={locale} min={values.startDate} value={values.endDate} disabled={!values.allDay} invalid={Boolean(fieldErrors.endDate) || insufficient} onValueChange={(endDate) => { setDatesSelected(true); setEndDateLinked(false); setValues({ ...values, endDate }); }} /></Input></div>

    {!values.allDay ? <div className="grid gap-4 sm:grid-cols-2"><Input label={t("startTime")}><TimePicker locale={locale} value={values.startTime} onValueChange={(startTime) => setValues({ ...values, ...updateLinkedStartTime(values, startTime, endTimeLinked) })} /></Input><Input label={t("endTime")} error={fieldErrors.endDate}><TimePicker locale={locale} value={values.endTime} onValueChange={(endTime) => { setEndTimeLinked(false); setValues({ ...values, endTime }); }} /></Input></div> : null}
    <Input label={<>{t(requestPresentation.fieldLabelKey)}{reasonRequired ? <span aria-hidden="true" className="text-[var(--ui-danger-text)]"> *</span> : null}</>} error={fieldErrors.privateNote}><textarea className={textareaClassName} rows={5} required={reasonRequired} placeholder={requestPresentation.placeholderKey ? t(requestPresentation.placeholderKey) : undefined} value={values.privateNote} onChange={(event) => setValues({ ...values, privateNote: event.target.value })} /><span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("visibleNote")}</span></Input>
    {error ? <p role="alert" className="rounded-xl bg-[var(--ui-danger-surface)] p-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ui-border-subtle)] bg-[var(--ui-surface)] py-4"><Button variant="outline" disabled={pending} onClick={requestClose}>{t("cancel")}</Button><Button disabled={pending || (values.requestType === "vacation" && (insufficient || available === null || Boolean(balanceError)))} onClick={() => void submit()}>{pending ? t("submitting") : t("submit")}</Button></div>
  </form></DetailPanel>;
}

function Input({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) { return <FormField label={label} error={error}>{children}</FormField>; }
