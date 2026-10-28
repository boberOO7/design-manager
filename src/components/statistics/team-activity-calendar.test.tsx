import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../../messages/uk.json";
import { teamActivityReportSchema, type TeamActivityDay } from "@/lib/team-activity";
import { DailyBreakdown } from "./team-activity-calendar";

function renderDay(items: TeamActivityDay["items"]) {
  // Exercise the same JSON and schema boundary used by the polling client.
  const report = teamActivityReportSchema.parse(JSON.parse(JSON.stringify({
    month: "2026-10", today: "2026-10-28", workdayMinutes: 480,
    people: [{ id: "employee", name: "Працівник", active: true, avatarUrl: null, days: [{
      date: "2026-10-05", kind: "day", weekend: false, recorded: true,
      minutes: items.reduce((sum, item) => sum + item.minutes, 0), items, runningTasks: [],
    }] }],
  })));
  return renderToStaticMarkup(<NextIntlClientProvider locale="uk" timeZone="Europe/Kyiv" messages={messages}>
    <DailyBreakdown day={report.people[0].days[0]} liveAvailable={false} />
  </NextIntlClientProvider>);
}
const calendar = (calendarEvent?: TeamActivityDay["items"][number]["calendarEvent"]): TeamActivityDay["items"][number] => ({
  activityKind: "calendar", internalActivityType: null, task: null, minutes: 60,
  reviewRoundId: null, reviewSessionId: null, ...(calendarEvent ? { calendarEvent } : {}),
});

describe("team activity calendar event details", () => {
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
