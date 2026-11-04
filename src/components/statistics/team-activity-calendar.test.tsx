import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../messages/uk.json";
import { teamActivityReportSchema, type TeamActivityDay } from "@/lib/team-activity";
import { ActivityCell, ActivityDayDetails, DailyBreakdown } from "./team-activity-calendar";
import en from "../../../messages/en.json";
import { selectMessages } from "@/i18n/message-scopes";

function renderDay(items: TeamActivityDay["items"], absences: TeamActivityDay["absences"] = [], locale: "uk" | "en" = "uk") {
  // Exercise the same JSON and schema boundary used by the polling client.
  const report = teamActivityReportSchema.parse(JSON.parse(JSON.stringify({
    month: "2026-10", today: "2026-10-28", workdayMinutes: 480,
    people: [{ id: "employee", name: "Працівник", active: true, avatarUrl: null, days: [{
      date: "2026-10-05", kind: "day", weekend: false, recorded: true,
      minutes: items.reduce((sum, item) => sum + item.minutes, 0), items, runningTasks: [], absences,
    }] }],
  })));
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Kyiv" messages={selectMessages(locale === "uk" ? messages : en, "statistics")} onError={error => { throw error; }}>
    <DailyBreakdown day={report.people[0].days[0]} liveAvailable={false} />
  </NextIntlClientProvider>);
}
const calendar = (calendarEvent?: TeamActivityDay["items"][number]["calendarEvent"]): TeamActivityDay["items"][number] => ({
  activityKind: "calendar", internalActivityType: null, task: null, minutes: 60,
  reviewRoundId: null, reviewSessionId: null, ...(calendarEvent ? { calendarEvent } : {}),
});

describe("team activity calendar event details", () => {
  const partialAbsence: TeamActivityDay["absences"][number] = {
    id: "absence", requestType: "day_off", allDay: false, startTime: "14:00", endTime: "18:00", minutes: 240,
  };

  it("shows approved leave type, duration and hours separately from work, in both locales", () => {
    const html = renderDay([{ ...calendar(), activityKind: "task", minutes: 240 }], [partialAbsence]);
    expect(html).toContain('data-activity-category="absence"');
    expect(html).toContain("Погоджена відсутність");
    expect(html).toContain("Відгул");
    expect(html).toContain("4:00 год");
    expect(html).toContain("14:00–18:00");
    expect(html).toContain('data-activity-category="task"');
    const english = renderDay([], [partialAbsence], "en");
    expect(english).toContain(en.TimeOff.dayOff);
    expect(english).toContain("14:00–18:00");
  });

  it("uses existing labels for every absence type and full-day leave without fabricating work hours", () => {
    const html = renderDay([], [
      { ...partialAbsence, id: "medical", requestType: "medical_appointment" },
      { ...partialAbsence, id: "sick", requestType: "sick_leave" },
      { ...partialAbsence, id: "other", requestType: "other" },
      { ...partialAbsence, id: "vacation", requestType: "vacation", allDay: true, startTime: null, endTime: null, minutes: null },
    ]);
    for (const label of [messages.TimeOff.medicalAppointment, messages.TimeOff.sickLeave, messages.TimeOff.other, messages.TimeOff.vacation, messages.TimeOff.allDay]) expect(html).toContain(label);
    expect(html).not.toContain('data-activity-category="task"');
    expect(html).not.toContain(">8:00 год<");
    expect(renderDay([])).not.toContain('data-activity-category="absence"');
  });

  it("marks partial absence visually and in the accessible label while retaining the recorded-work color", () => {
    const day: TeamActivityDay = { date: "2026-10-16", kind: "day", weekend: false, recorded: true, minutes: 240, items: [], runningTasks: [], absences: [partialAbsence] };
    const cell = (value: TeamActivityDay) => renderToStaticMarkup(<NextIntlClientProvider locale="uk" timeZone="Europe/Kyiv" messages={selectMessages(messages, "statistics")} onError={error => { throw error; }}>
      <ActivityCell day={value} name="Працівник" workday={480} liveAvailable={false} />
    </NextIntlClientProvider>);
    const html = cell(day);
    expect(html).toContain('data-testid="activity-partial-absence"');
    expect(html).toContain('data-activity-state="under"');
    expect(html).toContain("Часткова погоджена відсутність");
    expect(html).toContain("4:00 год роботи");
    expect(html).toContain("Відгул · 14:00–18:00");
    expect(html).not.toContain("repeating-linear-gradient");
    expect(html).not.toContain("Менше норми");
    expect(cell({ ...day, absences: [] })).not.toContain('data-testid="activity-partial-absence"');
    const fullDay = cell({ ...day, kind: "time_off", recorded: false, minutes: 0, absences: [{ ...partialAbsence, allDay: true, startTime: null, endTime: null, minutes: null }] });
    expect(fullDay).toContain('data-activity-state="excused"');
    expect(fullDay).toContain("border-dashed");
    expect(fullDay).not.toContain('data-testid="activity-partial-absence"');
  });

  it.each(["uk", "en"] as const)("renders compact popup details with the actual statistics dictionary in %s", locale => {
    const dictionary = locale === "uk" ? messages : en;
    const day: TeamActivityDay = { date: "2026-10-16", kind: "day", weekend: false, recorded: true, minutes: 240, items: [], runningTasks: [], absences: [partialAbsence] };
    const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Kyiv" messages={selectMessages(dictionary, "statistics")} onError={error => { throw error; }}>
      <ActivityDayDetails day={day} name="Володимир Феркалюк" workday={480} liveAvailable={false} />
    </NextIntlClientProvider>);
    expect(html).toContain("Володимир Феркалюк");
    expect(html).toMatch(/<time datetime="2026-10-16"/i);
    expect(html).toContain(locale === "uk" ? "4:00 год роботи" : "4:00 h worked");
    expect(html).toContain(locale === "uk" ? "Норма · 8:00 год" : "Workday · 8:00 h");
    expect(html).toContain(dictionary.TimeOff.dayOff);
    expect(html).toContain("14:00–18:00");
    expect(html).not.toContain("TimeOff.");
    expect(html).not.toContain("Робочий день з частковою відсутністю");
    expect(html).not.toContain("Записано роботи:");
  });

  it("keeps event titles, links and project names through the API response boundary", () => {
    const html = renderDay([
      calendar({ id: "meeting", title: "Обговорення планування", project: { id: "project", name: "311 Мельника" } }),
      calendar({ id: "team", title: "Командна зустріч", project: null }),
    ]);
    expect(html).toContain("Обговорення планування");
    expect(html).toContain("311 Мельника");
    expect(html).toContain("Командна зустріч");
    expect(html).toContain("Без проєкту");
    expect(html).toContain('href="/calendar?date=2026-10-05&amp;event=meeting"');
    expect(html).not.toContain(messages.Statistics.activityUnavailableTask);
    expect(html).not.toContain(messages.Statistics.unavailableProject);
  });

  it("never describes a calendar item without metadata as an inaccessible task or project", () => {
    const html = renderDay([calendar()]);
    expect(html).toContain(messages.Statistics.activityCalendar);
    expect(html).not.toContain(messages.Statistics.activityUnavailableTask);
    expect(html).not.toContain(messages.Statistics.unavailableProject);
    expect(html).not.toContain(messages.Statistics.activityNoProject);
  });

  it("preserves the genuine missing-task fallback for work log entries", () => {
    const html = renderDay([{ ...calendar(), activityKind: "task" }]);
    expect(html).toContain(messages.Statistics.activityUnavailableTask);
  });
});
