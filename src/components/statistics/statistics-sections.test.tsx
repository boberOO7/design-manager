import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../messages/uk.json";
import { buildAttendanceStatistics } from "@/lib/statistics-attendance";
import { TeamStatistics } from "./statistics-sections";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => createTranslator({ locale: "uk", messages, namespace: "Statistics" }),
  getLocale: async () => "uk",
}));

async function table(compensated: number, otherAbsences = false, future = false, workdayMinutes = 480) {
  const report = buildAttendanceStatistics([], [], [{ id: "employee", name: "Працівник", active: true }],
    { from: "2026-10-01", through: "2026-10-31" }, "2026-10-16T09:00:00Z", workdayMinutes);
  const employee = report.employees[0];
  employee.elapsedLeave.day_off = { days: 1, hours: 1.5 };
  employee.elapsedMakeupHours = compensated;
  if (otherAbsences) {
    employee.elapsedLeave.medical_appointment.hours = 1;
    employee.elapsedLeave.sick_leave.days = 2;
    employee.elapsedLeave.other.hours = 3;
  }
  if (future) employee.plannedMakeupHours = 2;
  const section = await TeamStatistics({ report, today: "2026-10-16" });
  const markup = renderToStaticMarkup(<NextIntlClientProvider locale="uk" messages={messages}>{section}</NextIntlClientProvider>);
  const text = (html: string) => html.replace(/<[^>]*>/g, "").trim();
  const headers = [...markup.matchAll(/<th\b[^>]*scope="col"[^>]*>(.*?)<\/th>/g)].map(match => text(match[1]));
  const body = markup.match(/<tbody>(.*?)<\/tbody>/)?.[1] ?? "";
  const cells = [...body.matchAll(/<t[hd]\b[^>]*>(.*?)<\/t[hd]>/g)].map(match => text(match[1]));
  return { headers, cells, markup };
}

describe("employee time-off statistics table", () => {
  it.each([false, true])("keeps days off, make-up, and debt adjacent with optional columns: %s", async optionalColumns => {
    const { headers, cells, markup } = await table(2.25, optionalColumns, optionalColumns);
    const dayOff = headers.indexOf("Відгули");
    expect(headers.slice(dayOff, dayOff + 3)).toEqual(["Відгули", "Відпрацювання", "Борг"]);
    expect(cells.slice(dayOff, dayOff + 3)).toEqual(["9:30", "2:15", "7:15"]);
    expect(headers.length).toBe(cells.length);
    if (optionalColumns) expect(headers.at(-1)).toContain("Майбутні плани");
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("sticky left-0");
  });

  it.each([
    { compensated: 0, debt: "9:30" },
    { compensated: 2.25, debt: "7:15" },
    { compensated: 9.5, debt: "0:00" },
    { compensated: 12, debt: "0:00" },
  ])("renders the remaining debt with $compensated compensated hours", async ({ compensated, debt }) => {
    const { headers, cells } = await table(compensated);
    expect(cells[headers.indexOf("Борг")]).toBe(debt);
  });

  it("renders every absence and debt with the configured normalized workday and uniform headers", async () => {
    const { headers, cells, markup } = await table(2.25, true, true, 450);
    expect(headers.slice(0, -1)).toEqual(["Працівник", "Відпустка", "Медичні візити", "Лікарняні", "Інші відсутності", "Відгули", "Відпрацювання", "Борг"]);
    expect(cells.slice(1, -1)).toEqual(["0:00", "1:00", "15:00", "3:00", "9:00", "2:15", "6:45"]);
    expect(headers.every(header => !header.includes("год:хв"))).toBe(true);
    expect(markup).toContain("У таблиці — год:хв · 1 день = 7:30");
    expect(cells.every(cell => !cell.includes("кал. дн."))).toBe(true);
    expect(markup).toContain("table-fixed");
    expect([...markup.matchAll(/<col class="w-36"/g)]).toHaveLength(7);
  });
});
