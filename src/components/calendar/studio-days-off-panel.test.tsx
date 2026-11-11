import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import type { CalendarItem } from "@/types/calendar";
import { StudioDaysOffPanel } from "./studio-days-off-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/drawer", () => ({ Drawer: ({ children }: { children: ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) => isOpen ? children : null }));
const period = (id: string, title: string, startDate: string, endDate: string): Extract<CalendarItem, { source: "studio_day_off" }> => ({
  id, key: id, source: "studio_day_off", title, startDate, endDate, note: null, allDay: true, personIds: [], projectId: null,
});
const items = [period("winter", "Winter break", "2027-01-07", "2027-01-10"), period("cross-year", "New year break", "2026-12-29", "2027-01-03")];
function render(locale: "uk" | "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Kyiv" messages={locale === "uk" ? uk : en} onError={(error) => { throw error; }}>
    <StudioDaysOffPanel isOpen onClose={() => {}} onExited={() => {}} onChange={() => {}} initialDate="2027-01-08" items={items} />
  </NextIntlClientProvider>);
}

describe("Company days off annual manager", () => {
  it("shows a period as one row with its inclusive date range and duration", () => {
    const html = render("en");
    expect(html.split('>Winter break</span>')).toHaveLength(2);
    expect(html).toContain("January 7 — January 10 · 4 days");
    expect(html).toContain('aria-label="Edit Winter break, January 7 — January 10"');
  });
  it("keeps a cross-year period visible in the following year and localizes its controls", () => {
    const html = render("uk");
    expect(html).toContain("New year break");
    expect(html).toContain("2026");
    expect(html).toContain("2027");
    expect(html).toContain("7 січня — 10 січня · 4 дні");
    expect(html).toContain("Додати вихідні");
  });
});
