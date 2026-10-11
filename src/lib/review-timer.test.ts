import { describe, expect, it } from "vitest";
import { formatReviewElapsed, reviewGroupElapsed, reviewSessionElapsed, reviewTimerForRound, reviewTimerPollingInterval, type ReviewTimerSnapshot } from "./review-timer";

describe("review timer presentation", () => {
  const now = Date.parse("2026-10-08T10:02:00Z");
  const session = { id: "session", user_id: "reviewer", state: "active" as const, started_at: "2026-10-08T10:00:00Z",
    accounted_at: "2026-10-08T10:01:00Z", elapsed_us: 60_000_000,
    members: [{ round_id: "a", finished_at: null }, { round_id: "b", finished_at: null }] };
  const snapshot: ReviewTimerSnapshot = { serverNow: new Date(now).toISOString(), userId: "reviewer", sessions: [session] };
  it("switches between idle, running, paused, resumed, and finished polling cadences", () => {
    const idle = { ...snapshot, sessions: [] };
    const paused: ReviewTimerSnapshot = { ...snapshot, sessions: [{ ...session, state: "paused", accounted_at: null }] };
    const finished: ReviewTimerSnapshot = { ...snapshot, sessions: [{ ...session, state: "completed", accounted_at: null }] };
    expect([idle, snapshot, paused, snapshot, finished].map(reviewTimerPollingInterval)).toEqual([120_000, 15_000, 60_000, 15_000, 120_000]);
    expect(reviewTimerPollingInterval(null)).toBe(120_000);
  });
  it("keeps active accounting cadence when an admin observes another reviewer's timer", () => {
    const paused: ReviewTimerSnapshot = { ...snapshot, sessions: [{ ...session, state: "paused" }] };
    expect(reviewTimerPollingInterval({ ...paused, sessions: [...paused.sessions, { ...session, user_id: "another-reviewer" }] })).toBe(15_000);
    expect(reviewTimerPollingInterval({ ...paused, userId: "admin" })).toBe(60_000);
  });
  it("does not treat completed paused members as unfinished review work", () => {
    expect(reviewTimerPollingInterval({ ...snapshot, sessions: [{ ...session, state: "paused", accounted_at: null,
      members: session.members.map(member => ({ ...member, finished_at: snapshot.serverNow })) }] })).toBe(120_000);
  });
  it("extrapolates from the authoritative checkpoint and counts group time once", () => {
    expect(reviewSessionElapsed(session, now)).toBe(120);
    expect(reviewTimerForRound(snapshot, "a", "reviewer", now).seconds).toBe(60);
    expect(reviewTimerForRound(snapshot, "b", "reviewer", now).seconds).toBe(60);
  });
  it("accumulates resumed intervals, distinguishes reviewer steps, and excludes pause time", () => {
    const resumed: ReviewTimerSnapshot = { ...snapshot, sessions: [
      { ...session, state: "completed", accounted_at: null },
      { ...session, id: "next", started_at: "2026-10-08T10:01:30Z", accounted_at: "2026-10-08T10:01:30Z", elapsed_us: 0 },
    ] };
    expect(reviewTimerForRound(resumed, "a", "reviewer", now)).toMatchObject({ state: "active", seconds: 45 });
    expect(reviewTimerForRound(resumed, "a", "another-reviewer", now).state).toBe("waiting");
    expect(reviewTimerForRound({ ...snapshot, sessions: [{ ...session, state: "paused", accounted_at: null }] }, "a", "reviewer", now).seconds).toBe(30);
  });
  it("keeps finished group members completed and remaining members paused", () => {
    const paused: ReviewTimerSnapshot = { ...snapshot, sessions: [{ ...session, state: "paused", accounted_at: null,
      members: [{ round_id: "a", finished_at: "2026-10-08T10:01:00Z" }, { round_id: "b", finished_at: null }] }] };
    expect(reviewTimerForRound(paused, "a", "reviewer", now).state).toBe("completed");
    expect(reviewTimerForRound(paused, "b", "reviewer", now).state).toBe("paused");
  });
  it("keeps shared resumes cumulative without adding prior individual review work", () => {
    const history: ReviewTimerSnapshot = { ...snapshot, sessions: [
      { ...session, id: "single", state: "completed", accounted_at: null, elapsed_us: 3_600_000_000, members: [{ round_id: "a", finished_at: null }] },
      { ...session, state: "completed", accounted_at: null },
      { ...session, id: "resumed", started_at: "2026-10-08T10:01:30Z", accounted_at: "2026-10-08T10:01:30Z", elapsed_us: 0 },
    ] };
    expect(reviewGroupElapsed(history, history.sessions[2], now)).toBe(90);
  });
  it("formats accumulated hours without wrapping and floors seconds", () => {
    expect(formatReviewElapsed(90_061.9)).toBe("25:01:01");
    expect(formatReviewElapsed(-1)).toBe("00:00:00");
  });
});
