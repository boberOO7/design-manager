import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../../messages/uk.json";
import { vacationRecalculationPreviewSchema } from "@/lib/vacation-policy";
import { VacationPolicySettings } from "./vacation-policy-settings";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

describe("vacation policy confirmation contract", () => {
  it("defaults to future-only changes and never saves or recalculates on render", () => {
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="uk" messages={messages}>
      <VacationPolicySettings studioId="ba000000-0000-0000-0000-000000000001"
        initialPolicy={{ annualDays: 24, carryRule: "carry_all", carryCapDays: null, yearBoundary: "employee" }} initialVisible />
    </NextIntlClientProvider>);
    expect(markup).toContain("Лише майбутні нарахування");
    expect(markup).toMatch(/<button\b[^>]*disabled=""[^>]*>Зберегти політику<\/button>/);
    expect(markup).not.toContain('role="dialog"');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["employee", "calendar"] as const)("renders the saved %s mode as an accessible radio choice", yearBoundary => {
    const markup = renderToStaticMarkup(<NextIntlClientProvider locale="uk" messages={messages}>
      <VacationPolicySettings studioId="ba000000-0000-0000-0000-000000000001"
        initialPolicy={{ annualDays: 24, carryRule: "carry_all", carryCapDays: null, yearBoundary }} initialVisible />
    </NextIntlClientProvider>);
    expect(markup).toContain("Період обліку відпусток");
    expect(markup).toContain("Робочий рік працівника");
    expect(markup).toContain("Календарний рік");
    const radios = [...markup.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map(match => match[0]);
    expect(radios).toHaveLength(2);
    expect(radios.filter(radio => radio.includes('checked=""'))).toHaveLength(1);
    expect(radios.find(radio => radio.includes('checked=""'))).toContain(`value="${yearBoundary}"`);
  });

  it.each([
    { before: 32, after: 16, delta: -16, minimumBalance: 16, shortfallDate: null, hasShortfall: false },
    { before: 27, after: -5, delta: -32, minimumBalance: -5, shortfallDate: "2026-10-16", hasShortfall: true },
    { before: 0, after: 0, delta: 0, minimumBalance: -2, shortfallDate: "2027-06-02", hasShortfall: true },
    { before: null, after: null, delta: null, minimumBalance: null, shortfallDate: null, hasShortfall: false },
  ])("accepts preview balances $before → $after, including future deficits and unknown baselines", ({ hasShortfall, ...balances }) => {
    const response = {
      asOf: "2026-10-16", digest: "c94d6f6e298a85e0660e83e41cd935dc", hasShortfall,
      employees: [{ userId: "ba000000-0000-4000-8000-000000000011", name: "Працівник", accrualFrom: balances.after === null ? null : "2025-06-01",
        openingDays: null, ...balances, changed: balances.before !== balances.after, usedDays: 5, reservedDays: 2 }],
    };
    expect(vacationRecalculationPreviewSchema.safeParse(response).success).toBe(true);
  });
});
