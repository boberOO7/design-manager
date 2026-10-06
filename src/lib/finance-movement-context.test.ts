import { describe, expect, it } from "vitest";
import type { FinanceMovementContext } from "@/data/queries/finance-movement-context";
import { financeMovementContextLabels } from "./finance-movement-context";

const source: FinanceMovementContext = { id: "item", category_id: "category", description: "", payroll: null, project: null };
const translate = (key: string) => key === "schedules.defaultSalaryName" ? "Зарплата" : key;
const month = (date: string) => date.slice(0, 7);

describe("movement context labels", () => {
  it("shows the payroll employee and period without repeating the category", () => {
    expect(financeMovementContextLabels([{ ...source, description: "Base salary · 2026-09", payroll: { component: "payout", obligation: { kind: "payroll", employee_name: "Олена", period_start: "2026-09-01" } } }], [], "Зарплата", translate, month)).toEqual(["Олена · 2026-09"]);
  });

  it("shows subscription names and distinguishes multiple sources", () => {
    const subscription = { ...source, description: "Adobe · 2026-09", payroll: { component: "recurring", obligation: { kind: "recurring", employee_name: null, period_start: "2026-09-01" } } };
    expect(financeMovementContextLabels([subscription, subscription, { ...subscription, id: "other", description: "Figma · 2026-09" }], [], "Програми та підписки", translate, month)).toEqual(["Adobe · 2026-09", "Figma · 2026-09"]);
  });

  it("shows project, contractor and purpose while keeping generic categories quiet", () => {
    const project = { ...source, description: "Заміри", project: { context_label: "Кухня", project: { name: "Будинок" }, contractor: { name: "Підрядник" } } };
    expect(financeMovementContextLabels([project], [], "Заміри", translate, month)).toEqual(["Будинок · Підрядник · Кухня"]);
    expect(financeMovementContextLabels([{ ...source, description: "Оренда" }], [], "Оренда", translate, month)).toEqual([]);
    expect(financeMovementContextLabels([], [], "Податки", translate, month)).toEqual([]);
  });
});
