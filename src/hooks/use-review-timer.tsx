"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { reviewTimerSnapshotSchema, type ReviewTimerSnapshot } from "@/lib/review-timer";

const ReviewTimerContext = createContext<ReturnType<typeof useReviewTimerState> | null>(null);

export function ReviewTimerProvider({ initialSnapshot, children }: { initialSnapshot: ReviewTimerSnapshot | null; children: ReactNode }) {
  const timer = useReviewTimerState(initialSnapshot);
  return <ReviewTimerContext.Provider value={timer}>{children}</ReviewTimerContext.Provider>;
}

export function useReviewTimer() {
  const timer = useContext(ReviewTimerContext);
  if (!timer) throw new Error("Review timers require the authenticated application provider.");
  return timer;
}

function useReviewTimerState(initialSnapshot: ReviewTimerSnapshot | null) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [serverNow, setServerNow] = useState(initialSnapshot ? Date.parse(initialSnapshot.serverNow) : 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef({ server: 0, local: 0 });
  const signature = useRef("");
  const requestVersion = useRef(0);
  const operationPending = useRef(false);
  const initial = useRef(initialSnapshot);
  const accept = useCallback((data: ReviewTimerSnapshot) => {
    anchor.current = { server: Date.parse(data.serverNow), local: performance.now() };
    setServerNow(anchor.current.server); setSnapshot(data);
    const next = data.sessions.map(session => `${session.id}:${session.state}:${session.members.map(member => member.finished_at).join(",")}`).join("|");
    if (signature.current && signature.current !== next) router.refresh();
    signature.current = next;
  }, [router]);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    const response = await fetch("/api/review-timers", { cache: "no-store" });
    if (!response.ok) throw new Error("Timer unavailable");
    const data = reviewTimerSnapshotSchema.parse(await response.json());
    if (version !== requestVersion.current) return;
    accept(data);
    setError(null);
  }, [accept]);
  useEffect(() => {
    let live = true;
    if (initial.current) anchor.current = { server: Date.parse(initial.current.serverNow), local: performance.now() };
    const refresh = () => { void reload().catch(() => { if (live) setError("load"); }); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("studioflow-review-timer");
    const onChange = () => { refresh(); channel?.postMessage("changed"); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    if (channel) channel.onmessage = refresh;
    refresh();
    const poll = window.setInterval(refresh, 15_000);
    const tick = window.setInterval(() => setServerNow(anchor.current.server + performance.now() - anchor.current.local), 1000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("review-timer-change", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; channel?.close(); window.clearInterval(poll); window.clearInterval(tick); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("review-timer-change", onChange); document.removeEventListener("visibilitychange", onVisible); };
  }, [reload]);
  const control = async (input: { action: "start"; roundIds: string[] } | { action: "pause"; sessionId: string }) => {
    if (operationPending.current) return false;
    operationPending.current = true;
    requestVersion.current += 1;
    setPending(true); setError(null);
    try {
      const body = input.action === "start" ? { ...input, sessionId: crypto.randomUUID() } : input;
      const response = await fetch("/api/review-timers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { await reload(); setError(response.status === 409 ? "conflict" : "save"); return false; }
      const data = reviewTimerSnapshotSchema.parse(await response.json());
      requestVersion.current += 1;
      accept(data);
      window.dispatchEvent(new Event("review-timer-change")); router.refresh(); return true;
    } catch { setError("save"); return false; }
    finally { operationPending.current = false; setPending(false); }
  };
  return { snapshot, serverNow, pending, error, control, reload };
}
