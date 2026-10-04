import { describe, expect, it } from "vitest";
import type { ProductivityContributionAttribution } from "@/lib/productivity";
import {
  buildStatistics,
  recordedPayrollCost,
  recordedProjectDuration,
  type StatisticsActivity,
  type StatisticsPayroll,
  type StatisticsProject,
  type StatisticsSources,
  type StatisticsUnknownCost,
} from "@/lib/statistics";

const project = (overrides: Partial<StatisticsProject> = {}): StatisticsProject => ({
  id: "project-1", name: "Project", status: "completed", archived_at: null, completed_at: "2025-03-12",
  include_in_productivity: true, total_area_m2: 100, ...overrides,
});
const activity = (id: string, from: string, to: string, created_at: string): StatisticsActivity => ({
  project_id: id, created_at, changes: { status: { from, to } },
});
const attribution = (overrides: Partial<ProductivityContributionAttribution> = {}): ProductivityContributionAttribution => ({
  id: "credit-1", project_id: "project-1", task_id: "task-1", contributor_id: "person-1", contributor_name: "Person",
  contributor_job_title: "Designer", credited_area_m2: 100, source_type: "task", task_stage: "stage_2",
  completed_at: "2025-03-12T10:00:00.000Z", ...overrides,
});
const emptySources = (overrides: Partial<StatisticsSources> = {}): StatisticsSources => ({
  projects: [], tasks: [], activities: [], attributions: [], payroll: [], unknownCosts: [], payCoverage: [], ...overrides,
});
const payroll = (id: string, items: StatisticsPayroll["items"], overrides: Partial<StatisticsPayroll> = {}): StatisticsPayroll => ({
  id, schedule_id: "schedule-1", period_start: "2025-02-01", period_end: "2025-02-28",
  terms: { currency: "UAH", employee_deductions: 2_000, employer_cost: 1_000, employer_cost_status: "fixed" }, items, ...overrides,
});
const payItem = (component: string, amount: string, currency = "UAH", managed_active = true, commitment = "agreed") => ({
  component, managed_active,
  expected: { amount, currency, certainty: "fixed", commitment },
});

describe("Statistics metric definitions", () => {
  it("keeps 100 physical m² separate from 200 legitimate discipline credits and deduplicates repeated source IDs", () => {
    const designer = attribution();
    const architect = attribution({ id: "credit-2", task_id: "task-2", contributor_id: "architect", credited_area_m2: 100 });
    const task = { id: "task-1", project_id: "project-1", completed_at: "2025-03-12" };
    const report = buildStatistics(emptySources({ projects: [project(), project()],
      tasks: [task, task, { ...task, id: "task-2" }], attributions: [designer, architect, designer],
    }), "all", "2025-04-30");
    expect(report.totals).toMatchObject({ physicalArea: 100, creditedArea: 200, completedProjects: 1, completedTasks: 2, contributors: 2 });
  });

  it("preserves canonical snapshot credits after deletion and on unfinished projects", () => {
    const report = buildStatistics(emptySources({ projects: [project({ status: "active", completed_at: null })],
      attributions: [attribution({ task_id: null }), attribution({ id: "deleted-project-credit", project_id: "deleted", task_id: null })],
    }), "all", "2025-04-30");
    expect(report.totals.creditedArea).toBe(200);
    expect(report.totals.physicalArea).toBeNull();
  });

  it("rejects administrative zero-day activation contradicted by earlier work, retaining genuine same-day completion", () => {
    const subject = project();
    const events = [activity(subject.id, "planned", "active", "2025-03-12T10:00:00Z"), activity(subject.id, "active", "completed", "2025-03-12T12:00:00Z")];
    expect(recordedProjectDuration(subject, events, "2025-04-01", [{ id: "task", project_id: subject.id, completed_at: "2025-02-10" }])).toBeNull();
    expect(recordedProjectDuration(subject, events, "2025-04-01", [{ id: "task", project_id: subject.id, completed_at: "2025-03-12" }])?.days).toBe(0);
  });

  it("counts completed physical project area once, including archived production projects, and excludes non-production projects", () => {
    const report = buildStatistics(emptySources({ projects: [
      project({ id: "done", total_area_m2: 80 }),
      project({ id: "archived", status: "archived", archived_at: "2025-04-01", completed_at: "2025-04-01", total_area_m2: 120 }),
      project({ id: "admin", include_in_productivity: false, total_area_m2: 900 }),
    ] }), "all", "2025-04-30");
    expect(report.totals.physicalArea).toBe(200);
    expect(report.totals.completedProjects).toBe(2);
  });

  it("keeps pre-coverage months unavailable and excludes future completion and attribution dates", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-03-12" }), project({ id: "future", completed_at: "2025-05-01", total_area_m2: 50 })],
      tasks: [{ id: "task-1", project_id: "project-1", completed_at: "2025-03-12" },
        { id: "future-task", project_id: "future", completed_at: "2025-05-01" }],
      attributions: [attribution({ completed_at: "2025-03-12T10:00:00.000Z" }),
        attribution({ id: "future-credit", task_id: "future-task", project_id: "future", completed_at: "2025-05-01T10:00:00.000Z" })],
    }), "3", "2025-04-30");
    expect(report.months.find(month => month.month === "2025-02-01")?.physicalArea).toBeNull();
    expect(report.months.find(month => month.month === "2025-02-01")?.creditedArea).toBeNull();
    expect(report.totals.physicalArea).toBe(100);
    expect(report.totals.creditedArea).toBe(100);
  });

  it("uses task completion dates and canonical attribution shares, counting a task once even with multiple contributors", () => {
    const report = buildStatistics(emptySources({
      projects: [project()],
      tasks: [
        { id: "task-1", project_id: "project-1", completed_at: "2025-03-12" },
        { id: "legacy", project_id: "project-1", completed_at: null },
      ],
      attributions: [
        attribution({ contributor_id: "a", credited_area_m2: 40 }),
        attribution({ id: "credit-2", contributor_id: "b", credited_area_m2: 60 }),
        attribution({ id: "legacy-credit", task_id: "legacy", credited_area_m2: 50 }),
      ],
    }), "all", "2025-04-30");
    expect(report.months.find(month => month.month === "2025-03-01")?.completedTasks).toBe(1);
    expect(report.months.find(month => month.month === "2025-03-01")?.creditedArea).toBe(100);
    expect(report.coverage.excludedCredits).toBe(1);
  });

  it("places UTC timestamps in the Kyiv calendar day", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-03-01" })],
      tasks: [{ id: "task-1", project_id: "project-1", completed_at: "2025-03-01" }],
      attributions: [attribution({ completed_at: "2025-02-28T22:30:00.000Z" })],
    }), "3", "2025-03-31");
    expect(report.months.find(month => month.month === "2025-03-01")?.creditedArea).toBe(100);
    expect(report.months.find(month => month.month === "2025-02-01")?.creditedArea).toBeNull();
  });

  it("measures elapsed completion duration from logged planned-to-active transition, including pause time", () => {
    const subject = project({ completed_at: "2025-03-12" });
    expect(recordedProjectDuration(subject, [
      activity(subject.id, "planned", "active", "2025-03-01T10:00:00.000Z"),
      activity(subject.id, "active", "paused", "2025-03-03T10:00:00.000Z"),
      activity(subject.id, "paused", "active", "2025-03-10T10:00:00.000Z"),
      activity(subject.id, "active", "completed", "2025-03-12T10:00:00.000Z"),
    ], "2025-04-01")?.days).toBe(11);
  });

  it("does not infer project starts from planned dates, updated state, legacy resumes, or contradictory project chronology", () => {
    const subject = project({ completed_at: "2025-03-12" });
    expect(recordedProjectDuration(subject, [], "2025-04-01")).toBeNull();
    expect(recordedProjectDuration(subject, [activity(subject.id, "paused", "active", "2025-03-01T10:00:00.000Z")], "2025-04-01")).toBeNull();
    expect(recordedProjectDuration(subject, [
      activity(subject.id, "planned", "active", "2025-03-13T10:00:00.000Z"),
      activity(subject.id, "active", "completed", "2025-03-14T10:00:00.000Z"),
    ], "2025-04-01")).toBeNull();
    expect(recordedProjectDuration(subject, [
      activity(subject.id, "planned", "active", "2025-03-01T10:00:00.000Z"),
      activity(subject.id, "active", "completed", "2025-03-15T10:00:00.000Z"),
    ], "2025-04-01")?.days).toBe(11);
  });

  it("builds payroll cost from persisted service-period components without adding salary terms or inactive rows", () => {
    const result = recordedPayrollCost(payroll("feb", [
      payItem("payout", "10000"), payItem("payout", "5000", "UAH", false),
      payItem("deductions", "2000"), payItem("employer_cost", "1000"),
    ]), []);
    expect(result).toEqual({ currency: "UAH", units: BigInt(130_000_000), incomplete: false, estimated: false });
  });

  it("retains active deductions and employer cost when payout is canceled, but ignores fully canceled obligations", () => {
    const partial = recordedPayrollCost(payroll("canceled-payout", [
      payItem("payout", "10000", "UAH", true, "cancelled"),
      payItem("deductions", "2000"),
      payItem("employer_cost", "1000"),
    ]), []);
    expect(partial).toEqual({ currency: "UAH", units: BigInt(30_000_000), incomplete: true, estimated: false });

    const canceled = recordedPayrollCost(payroll("all-canceled", [
      payItem("payout", "10000", "UAH", true, "cancelled"),
      payItem("deductions", "2000", "UAH", true, "cancelled"),
      payItem("employer_cost", "1000", "UAH", true, "cancelled"),
    ]), []);
    expect(canceled).toBeNull();
  });

  it("distinguishes explicit zero components from unknown costs", () => {
    const explicitZero = payroll("zero", [payItem("payout", "10000")], {
      terms: { currency: "UAH", employee_deductions: 0, employer_cost: 0, employer_cost_status: "fixed" },
    });
    expect(recordedPayrollCost(explicitZero, [])?.incomplete).toBe(false);
    expect(recordedPayrollCost(payroll("unknown", [payItem("payout", "10000")], {
      terms: { currency: "UAH", employee_deductions: null, employer_cost: null, employer_cost_status: "unknown" },
    }), [{ obligation_id: "unknown", component: "deductions", status: "unknown", amount: null }])?.incomplete).toBe(true);
  });

  it("does not treat a completed positive cost revision without its linked item as zero", () => {
    const result = recordedPayrollCost(payroll("missing-item", [payItem("payout", "10000")], {
      terms: { currency: "UAH", employee_deductions: null, employer_cost: null, employer_cost_status: "unknown" },
    }), [{ obligation_id: "missing-item", component: "deductions", status: "fixed", amount: "2500" },
      { obligation_id: "missing-item", component: "employer_cost", status: "unknown", amount: null }]);
    expect(result?.units).toBe(BigInt(100_000_000));
    expect(result?.incomplete).toBe(true);
  });

  it("accepts a latest fixed zero revision when its prior positive employer-cost item is canceled", () => {
    const result = recordedPayrollCost(payroll("revised-zero", [
      payItem("payout", "10000"), payItem("employer_cost", "2500", "UAH", true, "cancelled"),
    ], { terms: { currency: "UAH", employee_deductions: 0, employer_cost: null, employer_cost_status: "unknown" } }), [
      { obligation_id: "revised-zero", component: "employer_cost", status: "fixed", amount: "0" },
    ]);
    expect(result).toEqual({ currency: "UAH", units: BigInt(100_000_000), incomplete: false, estimated: false });
  });

  it("accepts a fixed zero revision without an expected item and marks estimated revisions", () => {
    const fixedZero = recordedPayrollCost(payroll("zero-revision", [payItem("payout", "10000")], {
      terms: { currency: "UAH", employee_deductions: null, employer_cost: null, employer_cost_status: "unknown" },
    }), [{ obligation_id: "zero-revision", component: "deductions", status: "fixed", amount: "0" },
      { obligation_id: "zero-revision", component: "employer_cost", status: "fixed", amount: "0" }]);
    expect(fixedZero?.incomplete).toBe(false);

    const estimated = recordedPayrollCost(payroll("estimated", [payItem("payout", "10000"),
      { ...payItem("deductions", "0"), expected: { ...payItem("deductions", "0").expected, certainty: "fixed" } },
      { ...payItem("employer_cost", "1200"), expected: { ...payItem("employer_cost", "1200").expected, certainty: "estimated" } }], {
      terms: { currency: "UAH", employee_deductions: 0, employer_cost: 1200, employer_cost_status: "estimated" },
    }), [{ obligation_id: "estimated", component: "employer_cost", status: "estimated", amount: "1200" }]);
    expect(estimated?.estimated).toBe(true);
    expect(estimated?.incomplete).toBe(false);
  });

  it("keeps payroll months and currencies separate, and excludes current/future service periods", () => {
    const obligation = (id: string, period_start: string, period_end: string, currency: string) => payroll(id,
      [payItem("payout", "10000", currency), payItem("deductions", "0", currency), payItem("employer_cost", "0", currency)],
      { period_start, period_end, terms: { currency, employee_deductions: 0, employer_cost: 0, employer_cost_status: "fixed" } });
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-01-15" }), project({ id: "p2", completed_at: "2025-02-15" })],
      tasks: [{ id: "task-jan", project_id: "project-1", completed_at: "2025-01-15" }, { id: "task-feb", project_id: "p2", completed_at: "2025-02-15" }],
      attributions: [attribution({ task_id: "task-jan", completed_at: "2025-01-15T10:00:00.000Z" }),
        attribution({ id: "c2", task_id: "task-feb", project_id: "p2", completed_at: "2025-02-15T10:00:00.000Z" })],
      payroll: [obligation("jan", "2025-01-01", "2025-01-31", "UAH"), obligation("feb-eur", "2025-02-01", "2025-02-28", "EUR"),
        obligation("current", "2025-03-01", "2025-03-31", "UAH"), obligation("future", "2025-04-01", "2025-04-30", "UAH")],
      payCoverage: [
        { schedule_id: "schedule-1", effective_from: "2025-01-01", valid_through: null },
      ],
    }), "all", "2025-03-15");
    expect(report.payroll.map(row => [row.month, row.currency])).toEqual([["2025-01-01", "UAH"], ["2025-02-01", "EUR"]]);
    expect(report.payroll[0]?.costPerCreditedM2).toBe(100);
    expect(report.payroll[1]?.costPerCreditedM2).toBe(100); // EUR service-period cost / 100 credited m²
  });

  it("withholds the cost-per-m² ratio when an effective payroll schedule has no generated obligation", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-01-15" }), project({ id: "p2", completed_at: "2025-02-15" })],
      tasks: [{ id: "task-jan", project_id: "project-1", completed_at: "2025-01-15" }, { id: "task-feb", project_id: "p2", completed_at: "2025-02-15" }],
      attributions: [attribution({ task_id: "task-jan", completed_at: "2025-01-15T10:00:00.000Z" }),
        attribution({ id: "c2", task_id: "task-feb", project_id: "p2", completed_at: "2025-02-15T10:00:00.000Z" })],
      payroll: [payroll("feb", [payItem("payout", "10000"), payItem("deductions", "0"), payItem("employer_cost", "0")], {
        period_start: "2025-02-01", period_end: "2025-02-28", terms: { currency: "UAH", employee_deductions: 0, employer_cost: 0, employer_cost_status: "fixed" },
      })],
      payCoverage: [{ schedule_id: "schedule-1", effective_from: "2025-01-01", valid_through: null },
        { schedule_id: "missing-schedule", effective_from: "2025-01-01", valid_through: null }],
    }), "all", "2025-03-15");
    expect(report.payroll.find(row => row.month === "2025-02-01")?.incomplete).toBe(true);
    expect(report.payroll.find(row => row.month === "2025-02-01")?.costPerCreditedM2).toBeNull();
  });

  it("keeps complete same-month payroll schedules complete across currencies but withholds the mixed-currency ratio", () => {
    const report = buildStatistics(emptySources({
      projects: [project({ completed_at: "2025-01-15" }), project({ id: "p2", completed_at: "2025-02-15" })],
      tasks: [{ id: "task-jan", project_id: "project-1", completed_at: "2025-01-15" },
        { id: "task-feb", project_id: "p2", completed_at: "2025-02-15" }],
      attributions: [attribution({ task_id: "task-jan", completed_at: "2025-01-15T10:00:00.000Z" }),
        attribution({ id: "c2", task_id: "task-feb", project_id: "p2", completed_at: "2025-02-15T10:00:00.000Z" })],
      payroll: [
        payroll("feb-uah", [payItem("payout", "10000"), payItem("deductions", "0"), payItem("employer_cost", "0")], {
          period_start: "2025-02-01", period_end: "2025-02-28", schedule_id: "uah-schedule",
          terms: { currency: "UAH", employee_deductions: 0, employer_cost: 0, employer_cost_status: "fixed" },
        }),
        payroll("feb-eur", [payItem("payout", "8000", "EUR"), payItem("deductions", "0", "EUR"), payItem("employer_cost", "0", "EUR")], {
          period_start: "2025-02-01", period_end: "2025-02-28", schedule_id: "eur-schedule",
          terms: { currency: "EUR", employee_deductions: 0, employer_cost: 0, employer_cost_status: "fixed" },
        }),
      ],
      payCoverage: [
        { schedule_id: "uah-schedule", effective_from: "2025-01-01", valid_through: null },
        { schedule_id: "eur-schedule", effective_from: "2025-01-01", valid_through: null },
      ],
    }), "all", "2025-03-15");
    const february = report.payroll.filter(row => row.month === "2025-02-01");
    expect(february.map(row => [row.currency, row.incomplete, row.costPerCreditedM2])).toEqual([
      ["EUR", false, null], ["UAH", false, null],
    ]);
  });
});
