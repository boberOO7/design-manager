import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), attributions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/data/queries/active-studio-admin", () => ({ getActiveStudioAdmin: mocks.admin }));
vi.mock("@/data/queries/productivity-attributions", () => ({ getCanonicalProductivityAttributions: mocks.attributions }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import { getStatistics, getStatisticsStreams, readStatisticsPages } from "@/data/queries/statistics";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Statistics query access boundary", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    { studioMinutes: 360, capacityMinutes: 450, expected: 450 },
    { studioMinutes: 390, capacityMinutes: null, expected: 390 },
    { studioMinutes: null, capacityMinutes: null, expected: 480 },
  ])("uses Administration's workday precedence: $expected minutes", async ({ studioMinutes, capacityMinutes, expected }) => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const is = vi.fn().mockReturnThis(), lte = vi.fn().mockReturnThis();
    const from = vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is, lte,
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: studioMinutes === null ? null : { standard_workday_minutes: studioMinutes }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: capacityMinutes === null ? null : { daily_minutes: capacityMinutes }, error: null }),
      range: vi.fn().mockResolvedValue({ data: table === "calendar_events" ? [{
        id: "all-day", organizer_id: "admin", event_type: "work_makeup", all_day: true,
        starts_at: "2026-10-01T21:00:00Z", ends_at: "2026-10-02T21:00:00Z", cancelled_at: null,
        recurrence_rule: null, series_id: null, occurrence_start: null, project_id: null,
      }] : [], error: null }),
    }));
    mocks.client.mockResolvedValue({ from });
    const streams = await getStatisticsStreams("3", "2026-10-07", "2026-10-07T12:00:00Z");
    const report = await streams?.attendance;
    expect(report?.workdayMinutes).toBe(expected);
    expect(report?.totals.elapsedMakeupHours).toBe(expected / 60);
    expect(is).toHaveBeenCalledWith("employee_id", null);
    expect(lte).toHaveBeenCalledWith("effective_from", "2026-10-07");
  });

  it("returns before creating a data client or fetching analytics when the active membership is not admin", async () => {
    mocks.admin.mockResolvedValue(null);

    await expect(getStatistics("12", "2025-04-01")).resolves.toBeNull();

    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.attributions).not.toHaveBeenCalled();
  });

  it("fails closed when verified membership resolution fails", async () => {
    mocks.admin.mockRejectedValue(new Error("Authentication unavailable"));
    await expect(getStatistics("all")).rejects.toThrow("Authentication unavailable");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("loads only normalized-workday settings from Finance without payroll sources", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const from = vi.fn((_table: string) => query);
    mocks.client.mockResolvedValue({ from });
    const report = await getStatistics("all", "2026-10-04", "2026-10-04T12:00:00Z");
    expect(from.mock.calls.filter(([table]) => table.startsWith("finance_")).map(([table]) => table)).toEqual(["finance_labor_capacity_revisions"]);
    expect(report).not.toHaveProperty("payroll");
    expect(report?.from).toBe("2026-10-01");
  });

  it("adds review activity without giving the reviewer completed-task or productivity credit", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([{ id: "credit", project_id: "project", task_id: "task", contributor_id: "worker",
      contributor_name: "Worker", contributor_job_title: "Designer", credited_area_m2: 100, source_type: "task",
      task_stage: "stage_2", completed_at: "2026-10-04T10:00:00Z" }]);
    const sources: Record<string, unknown[]> = {
      projects: [{ id: "project", name: "Project", status: "active", archived_at: null, started_at: "2026-09-01",
        completed_at: null, include_in_productivity: true, total_area_m2: 100 }],
      tasks: [{ id: "task", project_id: "project", completed_at: "2026-10-04" }],
      task_review_rounds: [{ id: "round", reviewer_id: "reviewer", completed_at: "2026-10-03T10:00:00Z", result: "approved",
        reviewers: [{ reviewer_id: "reviewer", approved_at: "2026-10-03T10:00:00Z" }] }],
      work_log_entries: [{ id: "entry", user_id: "reviewer", work_date: "2026-10-03", activity_kind: "review", task_id: "task", review_round_id: "round", minutes: 60, task: { project_id: "project" } }],
      calendar_events: [{ id: "meeting", event_type: "meeting", starts_at: "2026-10-03T09:00:00Z", ends_at: "2026-10-03T10:00:00Z",
        all_day: false, project_id: "project", organizer_id: "reviewer", assignee_id: null, cancelled_at: null, recurrence_rule: null,
        series_id: null, occurrence_start: null, compensates_time_off_request_id: null }],
    };
    mocks.client.mockResolvedValue({ from: vi.fn((table: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: sources[table] ?? [], error: null }) })) });
    const withReviews = await getStatistics("3", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(withReviews?.work.totals).toEqual({ internalMinutes: 0, reviewMinutes: 60, taskMinutes: 0, totalMinutes: 60, reviewsCompleted: 1, reviewSessionsCompleted: 0 });
    expect(withReviews?.work.projects).toEqual([{ id: "project", name: "Project", taskMinutes: 0, reviewMinutes: 60, totalMinutes: 60 }]);
    expect(withReviews?.calendar.people[0].hours).toBe(1);
    expect(withReviews?.totals).toMatchObject({ completedTasks: 1, creditedArea: 100, contributors: 1 });
    sources.work_log_entries.push({ id: "internal", user_id: "admin", work_date: "2026-10-03", activity_kind: "internal",
      internal_activity_type: "team_walkthrough", task_id: null, review_round_id: null, minutes: 45, task: null });
    const withInternal = await getStatistics("3", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(withInternal?.work.totals).toMatchObject({ internalMinutes: 45, totalMinutes: 105 });
    expect(withInternal?.work.projects).toEqual(withReviews?.work.projects);
    expect(withInternal?.totals).toEqual(withReviews?.totals);
    expect(withInternal?.calendar).toEqual(withReviews?.calendar);
    sources.task_review_rounds = [];
    sources.work_log_entries = [];
    const withoutReviews = await getStatistics("3", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(withReviews?.totals).toEqual(withoutReviews?.totals);
    expect(withReviews?.months).toEqual(withoutReviews?.months);
    expect(withoutReviews?.work.totals.totalMinutes).toBe(0);
    expect(withoutReviews?.calendar.people[0].hours).toBe(1);
  });

  it("resolves project time from logs for unfinished tasks and retains time if the task join is unavailable", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const sources: Record<string, unknown[]> = {
      projects: [{ id: "project", name: "Active project", status: "active", archived_at: null, started_at: null,
        completed_at: null, include_in_productivity: false, total_area_m2: 0 }],
      tasks: [], // The Overview source contains completed tasks only.
      work_log_entries: [
        { id: "entry", user_id: "worker", work_date: "2026-10-03", activity_kind: "task", task_id: "unfinished", review_round_id: null, minutes: 91, task: { project_id: "project" } },
        { id: "unavailable", user_id: "worker", work_date: "2026-10-03", activity_kind: "task", task_id: "unavailable", review_round_id: null, minutes: 31, task: null },
      ],
    };
    const select = vi.fn().mockReturnThis();
    mocks.client.mockResolvedValue({ from: vi.fn((table: string) => ({ select, eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: sources[table] ?? [], error: null }) })) });
    const report = await getStatistics("3", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("task:tasks!work_log_entries_task_id_fkey(project_id)"));
    expect(report?.work.projects).toEqual([
      { id: "project", name: "Active project", taskMinutes: 91, reviewMinutes: 0, totalMinutes: 91 },
      { id: null, name: null, taskMinutes: 31, reviewMinutes: 0, totalMinutes: 31 },
    ]);
    expect(report?.work.totals.totalMinutes).toBe(122);
    expect(report?.totals.completedTasks).toBeNull(); // No completed-project sample for Overview.
  });

  it.each(["work_log_entries", "task_review_rounds"])("uses %s evidence for the shared all-history boundary", async table => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const sources: Record<string, unknown[]> = {
      work_log_entries: [{ id: "entry", user_id: "reviewer", work_date: "2024-02-10", activity_kind: "review", task_id: "task", review_round_id: "round", minutes: 60 }],
      task_review_rounds: [{ id: "round", reviewer_id: "reviewer", completed_at: "2024-02-10T10:00:00Z", result: "approved",
        reviewers: [{ reviewer_id: "reviewer", approved_at: "2024-02-10T10:00:00Z" }] }],
    };
    mocks.client.mockResolvedValue({ from: vi.fn((name: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: name === table ? sources[name] : [], error: null }) })) });
    const report = await getStatistics("all", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(report?.from).toBe("2024-02-01");
    expect(report?.work.months[0].month).toBe(report?.from);
    expect(report?.work.totals).toMatchObject(table === "work_log_entries" ? { reviewMinutes: 60 } : { reviewsCompleted: 1 });
  });

  it("streams production and attendance while credits and work are delayed, sharing every source read", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    const credits = deferred<[]>();
    const work = deferred<{ data: []; error: null }>();
    mocks.attributions.mockReturnValue(credits.promise);
    const from = vi.fn((table: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnValue(table === "work_log_entries" ? work.promise : Promise.resolve({ data: [], error: null })) }));
    mocks.client.mockResolvedValue({ from });
    const streams = await getStatisticsStreams("3", "2026-10-07", "2026-10-07T12:00:00Z");
    expect(streams).not.toBeNull();
    let creditReady = false, workReady = false;
    void streams?.overview.then(() => { creditReady = true; });
    void streams?.work.then(() => { workReady = true; });
    await expect(streams?.production).resolves.toMatchObject({ from: "2026-08-01", through: "2026-10-07" });
    await expect(streams?.attendance).resolves.toBeDefined();
    expect(creditReady).toBe(false);
    expect(workReady).toBe(false);
    credits.resolve([]);
    work.resolve({ data: [], error: null });
    await Promise.all([streams?.overview, streams?.work, streams?.calendar, streams?.leads]);
    expect(mocks.attributions).toHaveBeenCalledOnce();
    expect(from.mock.calls).toHaveLength(15);
    expect(new Set(from.mock.calls.map(([table]) => table)).size).toBe(15);
  });

  it("waits for the shared all-history range before streaming any dated report", async () => {
    mocks.admin.mockResolvedValue({ studio_id: "studio" });
    mocks.attributions.mockResolvedValue([]);
    const evidence = deferred<{ data: Array<{ id: string; user_id: string; work_date: string; activity_kind: string; minutes: number }>; error: null }>();
    mocks.client.mockResolvedValue({ from: vi.fn((table: string) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnValue(table === "work_log_entries" ? evidence.promise : Promise.resolve({ data: [], error: null })) })) });
    const streams = await getStatisticsStreams("all", "2026-10-07", "2026-10-07T12:00:00Z");
    let ready = false;
    void streams?.production.then(() => { ready = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ready).toBe(false);
    evidence.resolve({ data: [{ id: "old", user_id: "admin", work_date: "2024-02-10", activity_kind: "internal", minutes: 60 }], error: null });
    const [production, overview, work] = await Promise.all([streams?.production, streams?.overview, streams?.work]);
    expect(production?.from).toBe("2024-02-01");
    expect(overview?.from).toBe(production?.from);
    expect(work?.months[0].month).toBe(production?.from);
  });

  it("loads all source rows beyond the API cap, including an exact multiple", async () => {
    const all = Array.from({ length: 2000 }, (_, id) => ({ id }));
    const page = vi.fn(async (offset: number) => ({ data: all.slice(offset, offset + 1000), error: null }));
    expect(await readStatisticsPages(page)).toEqual(all);
    expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 1000, 2000]);
  });

  it("does not return a plausible partial aggregate when a later page fails", async () => {
    await expect(readStatisticsPages(async offset => offset === 0
      ? { data: Array.from({ length: 1000 }, (_, id) => id), error: null }
      : { data: null, error: new Error("Failed page") })).rejects.toThrow("Unable to load Statistics");
  });
});
