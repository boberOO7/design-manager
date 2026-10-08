import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createTaskReviewFixture, reviewSql, sqlId, type TaskReviewFixture } from "../../../tests/helpers/task-review-fixture";

describe("persistent review timers", () => {
  let fixture: TaskReviewFixture;
  const extraFixtures: TaskReviewFixture[] = [];
  beforeAll(async () => { fixture = await createTaskReviewFixture(); }, 60_000);
  afterAll(async () => { if (fixture) await Promise.all([fixture.dispose(), ...extraFixtures.map((testFixture) => testFixture.dispose())]); });
  afterEach(async () => {
    if (!fixture) return;
    const active = await fixture.reviewer.client.from("review_timer_sessions").select("id").eq("state", "active");
    for (const session of active.data ?? []) await control(fixture.reviewer.client, "pause", session.id);
  });

  async function createRounds(count: number, stage = "stage_1") {
    const { admin, assignee, reviewer, projectId } = fixture;
    const taskIds = Array.from({ length: count }, () => randomUUID());
    reviewSql(`insert into public.tasks(id,project_id,title,stage,status,priority,assignee_id,reviewer_id,requires_review,created_by) values
      ${taskIds.map((id, index) => `(${sqlId(id)},${sqlId(projectId)},'Timer test ${id}','${stage}','in_progress','normal',${sqlId(assignee.id)},${sqlId(reviewer.id)},true,${sqlId(admin.id)})`).join(",")};
      insert into public.task_reviewers(task_id,reviewer_id,position) values
      ${taskIds.map((id) => `(${sqlId(id)},${sqlId(reviewer.id)},0)`).join(",")};`);
    const rounds: Array<{ id: string; taskId: string }> = [];
    for (const taskId of taskIds) {
      await assignee.client.rpc("update_task_review", { p_task_id: taskId, p_action: "submit" }).throwOnError();
      const round = await reviewer.client.from("task_review_rounds").select("id").eq("task_id", taskId).single().throwOnError();
      rounds.push({ id: round.data.id, taskId });
    }
    return rounds;
  }

  const start = (client: TaskReviewFixture["reviewer"]["client"], roundIds: string[], id = randomUUID()) =>
    client.rpc("control_review_timer", { p_action: "start", p_session_id: id, p_round_ids: roundIds });
  const control = (client: TaskReviewFixture["reviewer"]["client"], action: string, sessionId?: string) =>
    client.rpc("control_review_timer", { p_action: action, ...(sessionId ? { p_session_id: sessionId } : {}) });
  const setAccountedAt = (sessionId: string, interval: string) => reviewSql(`update public.review_timer_sessions set accounted_at=clock_timestamp()-interval '${interval}' where id=${sqlId(sessionId)};`);
  function reviewSqlAsync(statement: string) {
    return new Promise<string>((resolve, reject) => {
      execFile("docker", ["exec", "supabase_db_design-manager", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement],
        (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
    });
  }

  it("starts, pauses, resumes as a new interval, checkpoints idempotently, and denies other users", async () => {
    const [{ id: roundId }] = await createRounds(1);
    const { reviewer, outsider } = fixture;
    const sessionId = randomUUID();
    expect((await start(outsider.client, [roundId])).error).not.toBeNull();
    const created = await start(reviewer.client, [roundId], sessionId).throwOnError();
    expect(created.data).toBe(sessionId);
    const originalSession = (await reviewer.client.from("review_timer_sessions").select("id,started_at").eq("id", sessionId).single().throwOnError()).data;
    expect(originalSession.id).toBe(sessionId);
    expect((await outsider.client.from("review_timer_sessions").select("id").eq("id", sessionId)).data).toEqual([]);
    expect((await outsider.client.from("review_timer_sessions").insert({ id: randomUUID(), studio_id: fixture.studioId, user_id: reviewer.id, state: "active" })).error).not.toBeNull();

    setAccountedAt(sessionId, "2 minutes");
    await control(reviewer.client, "sync").throwOnError();
    const checkpoint = (await reviewer.client.from("review_timer_sessions").select("elapsed_us,accounted_at,state").eq("id", sessionId).single().throwOnError()).data;
    await control(reviewer.client, "sync").throwOnError();
    const retried = (await reviewer.client.from("review_timer_sessions").select("elapsed_us").eq("id", sessionId).single().throwOnError()).data.elapsed_us;
    expect(retried).toBeGreaterThanOrEqual(checkpoint.elapsed_us);
    expect(retried - checkpoint.elapsed_us).toBeLessThan(1_000_000);
    expect((await start(reviewer.client, [roundId], sessionId).throwOnError()).data).toBe(sessionId);
    expect((await reviewer.client.from("review_timer_sessions").select("started_at").eq("id", sessionId).single().throwOnError()).data.started_at).toBe(originalSession.started_at);
    await control(reviewer.client, "pause", sessionId).throwOnError();
    const pausedSession = (await reviewer.client.from("review_timer_sessions").select("state,elapsed_us,paused_at").eq("id", sessionId).single().throwOnError()).data;
    expect(pausedSession.state).toBe("paused");
    expect(pausedSession.paused_at).not.toBeNull();
    expect((await control(reviewer.client, "pause", sessionId)).error).toBeNull();
    const resumedId = randomUUID();
    await start(reviewer.client, [roundId], resumedId).throwOnError();
    expect((await reviewer.client.from("review_timer_sessions").select("state,started_at,paused_at").eq("id", sessionId).single().throwOnError()).data).toMatchObject({ state: "completed", started_at: originalSession.started_at });
    expect((await reviewer.client.from("review_timer_sessions").select("state,started_at,paused_at").eq("id", resumedId).single().throwOnError()).data).toMatchObject({ state: "active", paused_at: null });
    await control(reviewer.client, "pause", resumedId).throwOnError();
  });

  it("accepts one concurrent active timer across independently authenticated clients", async () => {
    const rounds = await createRounds(2);
    const { reviewer, createAuthenticatedClient } = fixture;
    const secondTab = await createAuthenticatedClient(reviewer);
    const firstId = randomUUID(), secondId = randomUUID();
    const results = await Promise.all([
      start(reviewer.client, [rounds[0]!.id], firstId),
      start(secondTab, [rounds[1]!.id], secondId),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
    expect((await reviewer.client.from("review_timer_sessions").select("id").eq("state", "active").throwOnError()).data).toHaveLength(1);
    const winner = results[0]?.error ? secondId : firstId;
    await control(reviewer.client, "pause", winner).throwOnError();
  });

  it("allocates a three-hour group exactly across ten rounds and carries sub-minute time across sessions", async () => {
    const rounds = await createRounds(10);
    const { reviewer } = fixture;
    const group = randomUUID();
    await start(reviewer.client, rounds.map((round) => round.id), group).throwOnError();
    setAccountedAt(group, "3 hours");
    await control(reviewer.client, "pause", group).throwOnError();
    const daily = await reviewer.client.from("review_timer_daily").select("round_id,elapsed_us,minutes").in("round_id", rounds.map((round) => round.id)).throwOnError();
    const groupSession = (await reviewer.client.from("review_timer_sessions").select("elapsed_us").eq("id", group).single().throwOnError()).data;
    expect(daily.data).toHaveLength(10);
    expect(daily.data.reduce((sum, row) => sum + row.elapsed_us, 0)).toBe(groupSession.elapsed_us);
    expect(groupSession.elapsed_us - 3 * 60 * 60 * 1_000_000).toBeGreaterThanOrEqual(0);
    expect(groupSession.elapsed_us - 3 * 60 * 60 * 1_000_000).toBeLessThan(2 * 1_000_000);
    expect(daily.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(180);
    expect(daily.data.map((row) => row.minutes)).toEqual(Array(10).fill(18));

    const single = rounds[0]!.id;
    const first = randomUUID();
    await start(reviewer.client, [single], first).throwOnError();
    setAccountedAt(first, "30 seconds");
    await control(reviewer.client, "pause", first).throwOnError();
    const second = randomUUID();
    await start(reviewer.client, [single], second).throwOnError();
    setAccountedAt(second, "40 seconds");
    await control(reviewer.client, "pause", second).throwOnError();
    const total = await reviewer.client.from("review_timer_daily").select("elapsed_us,minutes").eq("round_id", single).throwOnError();
    expect(total.data.reduce((sum, row) => sum + row.elapsed_us, 0)).toBeGreaterThanOrEqual(19 * 60 * 1_000_000 + 10 * 1_000_000);
    expect(total.data.reduce((sum, row) => sum + row.elapsed_us, 0) - (19 * 60 * 1_000_000 + 10 * 1_000_000)).toBeLessThan(2 * 1_000_000);
    expect(total.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(19);
  });

  it("keeps a prior unrelated fraction out of a ten-review eleven-minute group", async () => {
    const rounds = await createRounds(11);
    const { reviewer } = fixture;
    const unrelated = randomUUID();
    await start(reviewer.client, [rounds[0]!.id], unrelated).throwOnError();
    setAccountedAt(unrelated, "30 seconds");
    await control(reviewer.client, "pause", unrelated).throwOnError();

    const group = randomUUID();
    const groupRoundIds = rounds.slice(1).map((round) => round.id);
    await start(reviewer.client, groupRoundIds, group).throwOnError();
    setAccountedAt(group, "11 minutes");
    await control(reviewer.client, "pause", group).throwOnError();

    const allocations = await reviewer.client.from("review_timer_daily").select("round_id,minutes").in("round_id", rounds.map((round) => round.id)).throwOnError();
    const byRound = new Map(allocations.data.map((row) => [row.round_id, row.minutes]));
    expect(byRound.get(rounds[0]!.id) ?? 0).toBe(0);
    expect(groupRoundIds.reduce((sum, roundId) => sum + (byRound.get(roundId) ?? 0), 0)).toBe(11);
  });

  it("carries group fractions into a later single-review session and records one Work Log minute", async () => {
    const rounds = await createRounds(10);
    const { reviewer } = fixture;
    const group = randomUUID();
    await start(reviewer.client, rounds.map((round) => round.id), group).throwOnError();
    setAccountedAt(group, "30 seconds");
    await control(reviewer.client, "pause", group).throwOnError();

    const selected = rounds[0]!;
    const solo = randomUUID();
    await start(reviewer.client, [selected.id], solo).throwOnError();
    setAccountedAt(solo, "57 seconds");
    await control(reviewer.client, "pause", solo).throwOnError();

    const workDate = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    const daily = await reviewer.client.from("review_timer_daily").select("elapsed_us,minutes").eq("round_id", selected.id).eq("work_date", workDate).throwOnError();
    expect(daily.data.reduce((sum, row) => sum + row.elapsed_us, 0)).toBeGreaterThanOrEqual(60_000_000);
    expect(daily.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(1);
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", selected.id).eq("work_date", workDate).single().throwOnError()).data.minutes).toBe(1);
  });

  it("keeps fractional carry scoped to a changed shared membership", async () => {
    const rounds = await createRounds(2);
    const { reviewer } = fixture;
    const shared = randomUUID();
    await start(reviewer.client, rounds.map((round) => round.id), shared).throwOnError();
    setAccountedAt(shared, "30 seconds");
    await control(reviewer.client, "pause", shared).throwOnError();

    const changedMembership = randomUUID();
    await start(reviewer.client, [rounds[0]!.id], changedMembership).throwOnError();
    setAccountedAt(changedMembership, "45 seconds");
    await control(reviewer.client, "pause", changedMembership).throwOnError();

    const first = await reviewer.client.from("review_timer_daily").select("elapsed_us,minutes").eq("round_id", rounds[0]!.id).throwOnError();
    const second = await reviewer.client.from("review_timer_daily").select("elapsed_us,minutes").eq("round_id", rounds[1]!.id).throwOnError();
    expect(first.data.reduce((sum, row) => sum + row.elapsed_us, 0)).toBeGreaterThanOrEqual(60_000_000);
    expect(first.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(1);
    expect(second.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(0);
  });

  it("carries two separate half-minute reviews into one daily Work Log minute", async () => {
    const rounds = await createRounds(2);
    const { reviewer } = fixture;
    for (const round of rounds) {
      const session = randomUUID();
      await start(reviewer.client, [round.id], session).throwOnError();
      setAccountedAt(session, "30 seconds");
      await control(reviewer.client, "pause", session).throwOnError();
    }

    const allocations = await reviewer.client.from("review_timer_daily").select("round_id,elapsed_us,minutes,carry_minutes")
      .in("round_id", rounds.map((round) => round.id)).throwOnError();
    const entries = await reviewer.client.from("work_log_entries").select("review_round_id,minutes")
      .in("review_round_id", rounds.map((round) => round.id)).throwOnError();
    expect(allocations.data.reduce((sum, row) => sum + row.elapsed_us, 0)).toBeGreaterThanOrEqual(60_000_000);
    expect(allocations.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(1);
    expect(allocations.data.reduce((sum, row) => sum + row.carry_minutes, 0)).toBe(1);
    expect(entries.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(1);
  });

  it("separates prior individual carry from a new shared group's five-minute allocation", async () => {
    const sharedFixture = await createTaskReviewFixture();
    extraFixtures.push(sharedFixture);
    const previousFixture = fixture;
    fixture = sharedFixture;
    try {
    const rounds = await createRounds(10);
    const { reviewer } = fixture;
    const workDate = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    for (const round of rounds) {
      const individual = randomUUID();
      await start(reviewer.client, [round.id], individual).throwOnError();
      setAccountedAt(individual, "30 seconds");
      await control(reviewer.client, "pause", individual).throwOnError();
    }

    const group = randomUUID();
    const groupRoundIds = rounds.map((round) => round.id);
    await start(reviewer.client, groupRoundIds, group).throwOnError();
    setAccountedAt(group, "5 minutes");
    await control(reviewer.client, "pause", group).throwOnError();

    const sortedRoundIds = [...groupRoundIds].sort();
    const membershipKey = createHash("sha256").update(sortedRoundIds.join(",")).digest("hex");
    const bucket = (await reviewer.client.from("review_timer_buckets").select("elapsed_us,minutes,allocation")
      .eq("membership_key", membershipKey).eq("work_date", workDate).single().throwOnError()).data;
    const session = (await reviewer.client.from("review_timer_sessions").select("elapsed_us").eq("id", group).single().throwOnError()).data;
    const allocation = z.record(z.string(), z.number()).parse(bucket.allocation);
    const daily = await reviewer.client.from("review_timer_daily").select("round_id,minutes,carry_minutes").in("round_id", groupRoundIds).eq("work_date", workDate).throwOnError();
    const entries = await reviewer.client.from("work_log_entries").select("minutes").in("review_round_id", groupRoundIds).eq("work_date", workDate).throwOnError();

    expect(bucket.elapsed_us).toBe(session.elapsed_us);
    expect(bucket.elapsed_us - 5 * 60_000_000).toBeGreaterThanOrEqual(0);
    expect(bucket.elapsed_us - 5 * 60_000_000).toBeLessThan(2_000_000);
    expect(bucket.minutes).toBe(5);
    expect(Object.values(allocation).reduce((sum, minutes) => sum + minutes, 0)).toBe(5);
    expect(Object.keys(allocation).every((roundId) => groupRoundIds.includes(roundId))).toBe(true);
    expect(daily.data.every((row) => row.carry_minutes >= 0 && row.carry_minutes <= row.minutes)).toBe(true);
    expect(daily.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(10);
    expect(entries.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(10);
    } finally {
      fixture = previousFixture;
    }
  });

  it("returns a consistent Work Log snapshot while a review timer is active", async () => {
    const [{ id: roundId, taskId }] = await createRounds(1);
    const { reviewer } = fixture;
    const workDate = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    const session = randomUUID();
    await start(reviewer.client, [roundId], session).throwOnError();
    setAccountedAt(session, "60 minutes");

    const snapshotResult = await reviewer.client.rpc("get_work_log_timer_snapshot", { p_work_date: workDate }).throwOnError();
    const snapshot = z.object({
      entries: z.array(z.object({ activity_kind: z.string(), task_id: z.string(), review_round_id: z.string(), minutes: z.number() })),
      timerSnapshot: z.record(z.string(), z.number()),
      changed: z.boolean(),
      studioId: z.string(),
    }).parse(snapshotResult.data);
    expect(snapshot.studioId).toBe(fixture.studioId);
    expect(snapshot.timerSnapshot[roundId]).toBe(60);
    expect(snapshot.entries.find((entry) => entry.review_round_id === roundId)).toMatchObject({ task_id: taskId, minutes: 60 });
    await control(reviewer.client, "pause", session).throwOnError();
  });

  it("pauses active time immediately when reviewer access is revoked and does not resume it on reactivation", async () => {
    const { reviewer, admin, studioId, projectId } = fixture;
    async function startBackdatedSession() {
      const [{ id: roundId }] = await createRounds(1);
      const sessionId = randomUUID();
      await start(reviewer.client, [roundId], sessionId).throwOnError();
      setAccountedAt(sessionId, "5 minutes");
      return sessionId;
    }
    async function assertPausedAndNotResumed(sessionId: string, revoke: () => void, restore: () => void) {
      revoke();
      const paused = (await admin.client.from("review_timer_sessions").select("state,elapsed_us,paused_at").eq("id", sessionId).single().throwOnError()).data;
      expect(paused.state).toBe("paused");
      expect(paused.paused_at).not.toBeNull();
      expect(paused.elapsed_us - 5 * 60_000_000).toBeGreaterThanOrEqual(0);
      expect(paused.elapsed_us - 5 * 60_000_000).toBeLessThan(2_000_000);
      restore();
      await control(reviewer.client, "sync").throwOnError();
      expect((await admin.client.from("review_timer_sessions").select("state,elapsed_us").eq("id", sessionId).single().throwOnError()).data)
        .toMatchObject({ state: "paused", elapsed_us: paused.elapsed_us });
    }

    const profileSession = await startBackdatedSession();
    await assertPausedAndNotResumed(profileSession,
      () => reviewSql(`update public.profiles set is_active=false where id=${sqlId(reviewer.id)};`),
      () => reviewSql(`update public.profiles set is_active=true where id=${sqlId(reviewer.id)};`));

    const projectSession = await startBackdatedSession();
    await assertPausedAndNotResumed(projectSession,
      () => reviewSql(`update public.projects set status='archived',archived_at=clock_timestamp() where id=${sqlId(projectId)};`),
      () => reviewSql(`update public.projects set archived_at=null,status='paused' where id=${sqlId(projectId)};
        update public.projects set status='active' where id=${sqlId(projectId)};`));

    const membershipSession = await startBackdatedSession();
    await assertPausedAndNotResumed(membershipSession,
      () => reviewSql(`update public.project_members set is_active=false where project_id=${sqlId(projectId)} and user_id=${sqlId(reviewer.id)};`),
      () => reviewSql(`update public.project_members set is_active=true where project_id=${sqlId(projectId)} and user_id=${sqlId(reviewer.id)};`));
    expect((await admin.client.from("studio_members").select("is_active").eq("studio_id", studioId).eq("user_id", reviewer.id).single().throwOnError()).data.is_active).toBe(true);
  });

  it("cannot leave a timer active when Start races with profile deactivation or project archive", async () => {
    const { reviewer, service, projectId } = fixture;
    const [profileRound] = await createRounds(1);
    if (!profileRound) throw new Error("Missing profile race review");
    const profileSession = randomUUID();
    const [profileStart, profileDeactivate] = await Promise.all([
      start(reviewer.client, [profileRound.id], profileSession),
      service.from("profiles").update({ is_active: false }).eq("id", reviewer.id),
    ]);
    expect(profileDeactivate.error).toBeNull();
    expect((await service.from("review_timer_sessions").select("id").eq("user_id", reviewer.id).eq("state", "active").throwOnError()).data).toEqual([]);
    await service.from("profiles").update({ is_active: true }).eq("id", reviewer.id).throwOnError();
    if (!profileStart.error) expect((await service.from("review_timer_sessions").select("state").eq("id", profileSession).single().throwOnError()).data.state).toBe("paused");

    const [projectRound] = await createRounds(1);
    if (!projectRound) throw new Error("Missing project race review");
    const projectSession = randomUUID();
    const [projectStart, archive] = await Promise.all([
      start(reviewer.client, [projectRound.id], projectSession),
      reviewSqlAsync(`update public.projects set status='archived',archived_at=clock_timestamp() where id=${sqlId(projectId)};`),
    ]);
    expect(archive).toBeDefined();
    expect((await service.from("review_timer_sessions").select("id").eq("user_id", reviewer.id).eq("state", "active").throwOnError()).data).toEqual([]);
    await reviewSqlAsync(`update public.projects set status='paused',archived_at=null where id=${sqlId(projectId)};
      update public.projects set status='active' where id=${sqlId(projectId)};`);
    await control(reviewer.client, "sync").throwOnError();
    if (!projectStart.error) expect((await service.from("review_timer_sessions").select("state").eq("id", projectSession).single().throwOnError()).data.state).toBe("paused");
  });

  it("splits elapsed time at the Studio timezone midnight boundary", async () => {
    const [{ id: roundId }] = await createRounds(1);
    const { reviewer } = fixture;
    const session = randomUUID();
    await start(reviewer.client, [roundId], session).throwOnError();
    reviewSql(`do $$declare boundary timestamptz; begin
      boundary := ((clock_timestamp() at time zone 'Europe/Kyiv')::date::timestamp at time zone 'Europe/Kyiv');
      update public.review_timer_sessions set started_at=boundary-interval '30 seconds', accounted_at=boundary-interval '30 seconds', running_since=boundary-interval '30 seconds' where id=${sqlId(session)};
      perform private.account_review_timer(${sqlId(session)},boundary+interval '30 seconds',false);
      update public.review_timer_sessions set state='paused',accounted_at=null,running_since=null,paused_at=boundary+interval '30 seconds' where id=${sqlId(session)};
    end $$;`);
    const daily = await reviewer.client.from("review_timer_daily").select("work_date,elapsed_us,minutes").eq("round_id", roundId).order("work_date").throwOnError();
    expect(daily.data).toHaveLength(2);
    expect(daily.data.map((row) => row.elapsed_us)).toEqual([30_000_000, 30_000_000]);
    expect(daily.data.reduce((sum, row) => sum + row.minutes, 0)).toBe(1);
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", roundId).single().throwOnError()).data.minutes).toBe(1);
  });

  it("safely pauses a shared group when one member is approved or returned for rework", async () => {
    const rounds = await createRounds(3);
    const { reviewer, assignee } = fixture;
    const session = randomUUID();
    await start(reviewer.client, rounds.map((round) => round.id), session).throwOnError();
    setAccountedAt(session, "1 hour");
    await reviewer.client.rpc("update_task_review", { p_task_id: rounds[0]!.taskId, p_action: "approved", p_round_id: rounds[0]!.id }).throwOnError();
    const paused = (await reviewer.client.from("review_timer_sessions").select("state,elapsed_us").eq("id", session).single().throwOnError()).data;
    expect(paused.state).toBe("paused");
    expect(paused.elapsed_us - 60 * 60 * 1_000_000).toBeGreaterThanOrEqual(0);
    expect(paused.elapsed_us - 60 * 60 * 1_000_000).toBeLessThan(2 * 1_000_000);
    const members = await reviewer.client.from("review_timer_members").select("round_id,finished_at").eq("session_id", session).order("round_id").throwOnError();
    expect(members.data.filter((member) => member.finished_at !== null)).toHaveLength(1);
    expect(members.data.filter((member) => member.finished_at === null)).toHaveLength(2);
    expect((await assignee.client.from("tasks").select("status").eq("id", rounds[0]!.taskId).single().throwOnError()).data.status).toBe("review");
    const resume = randomUUID();
    await start(reviewer.client, [rounds[1]!.id, rounds[2]!.id], resume).throwOnError();
    await reviewer.client.rpc("update_task_review", { p_task_id: rounds[1]!.taskId, p_action: "rework", p_round_id: rounds[1]!.id, p_comment: "Adjust the plan" }).throwOnError();
    expect((await assignee.client.from("tasks").select("status").eq("id", rounds[1]!.taskId).single().throwOnError()).data.status).toBe("in_progress");
    expect((await reviewer.client.from("review_timer_sessions").select("state").eq("id", resume).single().throwOnError()).data.state).toBe("paused");
    await assignee.client.rpc("update_task_review", { p_task_id: rounds[1]!.taskId, p_action: "submit" }).throwOnError();
    const next = await reviewer.client.from("task_review_rounds").select("id,round_number").eq("task_id", rounds[1]!.taskId).order("round_number").throwOnError();
    expect(next.data.map((round) => round.round_number)).toEqual([1, 2]);
    expect((await start(reviewer.client, [rounds[0]!.id])).error).not.toBeNull();
    const remainingResume = randomUUID();
    await start(reviewer.client, [rounds[2]!.id], remainingResume).throwOnError();
    await control(reviewer.client, "pause", remainingResume).throwOnError();
  });

  it("merges manual Work Log edits with later timer minutes without marking the day submitted", async () => {
    const [{ id: roundId, taskId }] = await createRounds(1);
    const { reviewer } = fixture;
    const workDate = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    const first = randomUUID();
    await start(reviewer.client, [roundId], first).throwOnError();
    setAccountedAt(first, "60 minutes");
    await control(reviewer.client, "pause", first).throwOnError();
    expect((await reviewer.client.from("work_log_days").select("submitted_at").eq("work_date", workDate)).data).toEqual([]);
    const oldClientSave = await reviewer.client.rpc("save_daily_work_log", {
      p_work_date: workDate,
      p_entries: [{ activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 80 }],
    });
    expect(oldClientSave.error).not.toBeNull();
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", roundId).eq("work_date", workDate).single().throwOnError()).data.minutes).toBe(60);
    const snapshot = { [roundId]: 60 };
    await reviewer.client.rpc("save_daily_work_log", {
      p_work_date: workDate,
      p_entries: [{ activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 90 }],
      p_timer_snapshot: snapshot,
    }).throwOnError();
    const second = randomUUID();
    await start(reviewer.client, [roundId], second).throwOnError();
    setAccountedAt(second, "30 minutes");
    await control(reviewer.client, "pause", second).throwOnError();
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("work_date", workDate).eq("review_round_id", roundId).single().throwOnError()).data.minutes).toBe(120);
    const submissionBeforeFutureTimer = (await reviewer.client.from("work_log_days").select("submitted_at").eq("work_date", workDate).single().throwOnError()).data.submitted_at;
    expect((await reviewer.client.rpc("save_daily_work_log", {
      p_work_date: workDate,
      p_entries: [{ activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 90 }],
      p_timer_snapshot: { [roundId]: 121 },
    })).error).not.toBeNull();
    expect((await reviewer.client.from("work_log_days").select("submitted_at").eq("work_date", workDate).single().throwOnError()).data.submitted_at).toBe(submissionBeforeFutureTimer);
  });

  it("merges a stale Work Log snapshot once and preserves timer minutes when the stale row is removed", async () => {
    const [{ id: roundId, taskId }] = await createRounds(1);
    const { reviewer } = fixture;
    const workDate = reviewSql("select (clock_timestamp() at time zone 'Europe/Kyiv')::date;");
    const first = randomUUID();
    await start(reviewer.client, [roundId], first).throwOnError();
    setAccountedAt(first, "60 minutes");
    await control(reviewer.client, "pause", first).throwOnError();
    const staleSnapshot = { [roundId]: 60 };

    const later = randomUUID();
    await start(reviewer.client, [roundId], later).throwOnError();
    setAccountedAt(later, "30 minutes");
    await control(reviewer.client, "pause", later).throwOnError();

    const staleSave = () => reviewer.client.rpc("save_daily_work_log", {
      p_work_date: workDate,
      p_entries: [{ activity_kind: "review", task_id: taskId, review_round_id: roundId, minutes: 90 }],
      p_timer_snapshot: staleSnapshot,
    });
    await staleSave().throwOnError();
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", roundId).eq("work_date", workDate).single().throwOnError()).data.minutes).toBe(120);
    await staleSave().throwOnError();
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", roundId).eq("work_date", workDate).single().throwOnError()).data.minutes).toBe(120);

    const removed = await createRounds(1);
    const removedRound = removed[0]!;
    const removedDate = workDate;
    const removedTimer = randomUUID();
    await start(reviewer.client, [removedRound.id], removedTimer).throwOnError();
    setAccountedAt(removedTimer, "60 minutes");
    await control(reviewer.client, "pause", removedTimer).throwOnError();
    const additional = randomUUID();
    await start(reviewer.client, [removedRound.id], additional).throwOnError();
    setAccountedAt(additional, "30 minutes");
    await control(reviewer.client, "pause", additional).throwOnError();
    await reviewer.client.rpc("save_daily_work_log", { p_work_date: removedDate, p_entries: [], p_timer_snapshot: { [removedRound.id]: 60 } }).throwOnError();
    expect((await reviewer.client.from("work_log_entries").select("minutes").eq("review_round_id", removedRound.id).eq("work_date", removedDate).single().throwOnError()).data.minutes).toBe(30);
  });
});
