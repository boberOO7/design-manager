import { describe, expect, it } from "vitest";
import { allocateReviewMinutes, buildWeeklyWorkLog, groupWorkLogRows, previewWorkLogWeek, summarizeLoggedTime, parseWorkLogDuration, workLogRowKey, type WorkLogRow } from "./work-log";

const review = (round: number, changes: Partial<WorkLogRow> = {}): WorkLogRow => ({
  activity_kind: "review", task_id: "task", review_round_id: `round-${round}`, minutes: 0,
  title: "Drawing", projectId: "project", projectName: "Project", stage: "stage_1", stageName: "Plans", roundNumber: round, ...changes,
});

describe("Work Log grouping and allocation", () => {
  it("parses inline HH:mm without rounding minutes and rejects malformed input", () => {
    expect(parseWorkLogDuration("03:00")).toBe(180);
    expect(parseWorkLogDuration(" 03:01 ")).toBe(181);
    expect(parseWorkLogDuration("00:00")).toBe(0);
    expect(parseWorkLogDuration("13:37")).toBe(817);
    for (const value of ["", "03", "3:00", "03:60", "03:1", "-03:00", "03:00.5", "03:00extra", "9999999999:00"]) {
      expect(parseWorkLogDuration(value)).toBeNull();
    }
  });

  it("groups by project identity and stage, retaining separate rounds, counts and totals", () => {
    const rows = [review(1, { minutes: 20 }), review(2, { minutes: 40 }),
      review(3, { stage: "stage_2", stageName: "Models", minutes: 15 }),
      review(4, { projectId: "same-name-project", minutes: 5 }),
      review(5, { activity_kind: "task", review_round_id: null, minutes: 30 })];
    const groups = groupWorkLogRows(rows);
    expect(groups.map(group => [group.rows.length, group.minutes])).toEqual([[2, 60], [1, 15], [1, 5], [1, 30]]);
    expect(groups[0]).toMatchObject({ projectName: "Project", stage: "stage_1", stageName: "Plans" });
    expect(groups[0].rows.map(workLogRowKey)).toEqual(["review:round-1", "review:round-2"]);
    expect(new Set(groups.map(group => group.key)).size).toBe(4);
  });

  it("retains unavailable project and stage metadata without inventing a stage", () => {
    const groups = groupWorkLogRows([review(1, { projectId: null, projectName: null, stage: null, stageName: null }), review(2, { stage: null, stageName: null })]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ projectName: null, stage: null, stageName: null });
    expect(groups[1]).toMatchObject({ projectName: "Project", stage: null });
  });

  it("allocates 3 hours across ten rounds of the same task without changing identity", () => {
    const rows = Array.from({ length: 10 }, (_, index) => review(index + 1));
    const result = allocateReviewMinutes(rows, rows.map(workLogRowKey), 180);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected allocation");
    expect(result.rows.map(row => row.minutes)).toEqual(Array(10).fill(18));
    expect(result.rows.map(workLogRowKey)).toEqual(rows.map(workLogRowKey));
    expect(summarizeLoggedTime(result.rows).totalMinutes).toBe(180);
    expect(rows.every(row => row.minutes === 0)).toBe(true);
  });

  it.each([181, 2])("distributes every one of %i minutes deterministically to selected reviews only", total => {
    const rows = [review(1), review(2), review(3), review(4, { minutes: 45 }), review(5, { activity_kind: "task", review_round_id: null, minutes: 60 })];
    const keys = rows.slice(0, 3).map(workLogRowKey);
    const result = allocateReviewMinutes(rows, [...keys, keys[0], workLogRowKey(rows[4])], total);
    if (result.status !== "applied") throw new Error("Expected allocation");
    expect(result.rows.slice(0, 3).map(row => row.minutes)).toEqual(total === 181 ? [61, 60, 60] : [1, 1, 0]);
    expect(result.rows.slice(0, 3).reduce((sum, row) => sum + row.minutes, 0)).toBe(total);
    expect(result.rows.slice(3)).toEqual(rows.slice(3));
    expect(allocateReviewMinutes(rows, [...keys].reverse(), total)).toEqual(result);
  });

  it("targets all reviews by default and requires explicit confirmation to replace any entered time", () => {
    const rows = [review(1), review(2, { minutes: 18 }), review(3, { activity_kind: "task", review_round_id: null })];
    expect(allocateReviewMinutes(rows, rows.map(workLogRowKey), 60).status).toBe("confirmationRequired");
    expect(rows.map(row => row.minutes)).toEqual([0, 18, 0]);
    const result = allocateReviewMinutes(rows, rows.map(workLogRowKey), 60, true);
    if (result.status !== "applied") throw new Error("Expected confirmed allocation");
    expect(result.rows.map(row => row.minutes)).toEqual([30, 30, 0]);
    expect(allocateReviewMinutes(result.rows, result.rows.map(workLogRowKey), 90).status).toBe("confirmationRequired");
  });

  it("keeps unselected recorded time intact when editing a partial group total", () => {
    const rows = [review(1, { minutes: 37 }), review(2), review(3)];
    const result = allocateReviewMinutes(rows, rows.slice(1).map(workLogRowKey), 181);
    if (result.status !== "applied") throw new Error("Expected allocation");
    expect(result.rows.map(row => row.minutes)).toEqual([37, 91, 90]);
    expect(groupWorkLogRows(result.rows)[0].minutes).toBe(218);
  });

  it("protects clearing existing time and supports explicitly confirmed zero durations", () => {
    const rows = [review(1, { minutes: 60 }), review(2, { minutes: 65 })];
    expect(allocateReviewMinutes(rows, rows.map(workLogRowKey), 0).status).toBe("confirmationRequired");
    const result = allocateReviewMinutes(rows, rows.map(workLogRowKey), 0, true);
    if (result.status !== "applied") throw new Error("Expected allocation");
    expect(result.rows.map(row => row.minutes)).toEqual([0, 0]);
    expect(groupWorkLogRows(result.rows)[0].minutes).toBe(0);
  });

  it("rejects an empty selection, fractional and invalid durations", () => {
    const rows = [review(1)];
    expect(allocateReviewMinutes(rows, [], 180).status).toBe("invalid");
    for (const minutes of [-1, 1.5, NaN, Infinity, 2147483648]) {
      expect(allocateReviewMinutes(rows, rows.map(workLogRowKey), minutes).status).toBe("invalid");
    }
  });

  it("allows manual adjustment without redistribution and previews daily/weekly totals with Calendar once", () => {
    const date = "2026-10-07", rows = [review(1), review(2), review(3)];
    const result = allocateReviewMinutes(rows, rows.map(workLogRowKey), 180);
    if (result.status !== "applied") throw new Error("Expected allocation");
    const edited = result.rows.map(row => row.review_round_id === "round-2" ? { ...row, minutes: 75 } : row);
    expect(edited.map(row => row.minutes)).toEqual([60, 75, 60]);
    expect(groupWorkLogRows(edited)[0].minutes).toBe(195);
    const week = buildWeeklyWorkLog(date, date, [{ ...review(4, { minutes: 30 }), work_date: "2026-10-06" }],
      [{ work_date: "2026-10-06", submitted_at: "saved" }], new Map([[date, 45]]), { joinedDate: "2026-10-01" });
    const preview = previewWorkLogWeek(week, date, edited, 45);
    expect(preview.days.find(day => day.date === date)).toMatchObject({ reviewMinutes: 195, calendarMinutes: 45, totalMinutes: 240, submittedAt: null });
    expect(preview.totals).toEqual({ taskMinutes: 0, reviewMinutes: 225, calendarMinutes: 45, totalMinutes: 270 });
    expect(preview.days.find(day => day.date === "2026-10-06")).toEqual(week.days.find(day => day.date === "2026-10-06"));
    expect(previewWorkLogWeek(preview, date, edited, 45)).toEqual(preview);
    expect(week.totals.totalMinutes).toBe(75);
  });
});
