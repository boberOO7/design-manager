"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, FolderKanban, X } from "lucide-react";
import { loadMyTaskDetails } from "@/app/(app)/my-tasks/task-actions";
import { ReviewActionButton } from "./review-action-button";
import { TaskDetailsDrawer } from "./task-details-drawer";
import { TaskReviewWaiting } from "./task-review-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Textarea } from "@/components/ui/form-field";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getPriorityBadgeStyle } from "@/lib/semantic-styles";
import { canWorkOnTaskInProject, isProjectLifecycleStatus } from "@/lib/project-lifecycle";
import { formatReviewElapsed, reviewGroupElapsed, reviewTimerForRound } from "@/lib/review-timer";
import { useReviewTimer } from "@/hooks/use-review-timer";
import type { TaskReviewQueueItem } from "@/data/queries/task-reviews";

const rowGrid = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 @min-[76rem]:grid-cols-[minmax(9.5rem,2fr)_minmax(9.5rem,1fr)_7.5rem_6.5rem_6rem_27rem_2.25rem]";

export function TaskReviewQueue({ rounds, currentUserId, stageNames }: {
  rounds: TaskReviewQueueItem[]; currentUserId: string; stageNames: Record<string, string>;
}) {
  const t = useTranslations("Tasks");
  const timerText = useTranslations("ReviewTimer");
  const priority = useTranslations("Priority");
  const stages = useTranslations("TaskStages");
  const common = useTranslations("Common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedRequest = useRef<string | null>(null);
  const timer = useReviewTimer();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);
  const [rework, setRework] = useState<{ rounds: TaskReviewQueueItem[]; sessionId?: string } | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detailRound, setDetailRound] = useState<TaskReviewQueueItem | null>(null);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof loadMyTaskDetails>>>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const drawerOpenRef = useRef(false);
  const detailRequest = useRef(0);
  const resolutionPending = useRef(false);
  const queueRef = useRef<HTMLUListElement>(null);
  const scopeId = useId();
  const disabled = resolving || timer.pending;
  const groups = new Map<string, TaskReviewQueueItem[]>();
  for (const round of rounds) {
    const key = `${round.task.project.id}:${round.task.stage}`;
    groups.set(key, [...(groups.get(key) ?? []), round]);
  }
  const ownActive = timer.snapshot?.sessions.find(session => session.state === "active" && session.user_id === currentUserId);
  const showReviewer = rounds.some(round => round.reviewer_id !== currentUserId);

  const openDetails = useCallback((round: TaskReviewQueueItem) => {
    const request = ++detailRequest.current;
    drawerOpenRef.current = true;
    setDetailRound(round); setDetails(null); setLoadFailed(false); setDrawerOpen(false);
    void loadMyTaskDetails(round.task.id, round.task.project.id).then(result => {
      if (request !== detailRequest.current || !drawerOpenRef.current) return;
      setDetails(result); setLoadFailed(!result); setDrawerOpen(true);
    }).catch(() => {
      if (request === detailRequest.current && drawerOpenRef.current) { setLoadFailed(true); setDrawerOpen(true); }
    });
  }, []);

  function closeDetails() {
    detailRequest.current += 1; drawerOpenRef.current = false; setDrawerOpen(false);
  }

  function clearDetails() {
    if (!drawerOpenRef.current) { setDetailRound(null); setDetails(null); }
  }

  function projectLink(projectId: string, taskId?: string) {
    return <Link href={`/projects/${projectId}${taskId ? `?task=${taskId}` : ""}`} aria-label={t("goToProject")} title={t("goToProject")}
      className="pointer-events-auto relative z-10 flex size-9 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] @max-[76rem]:col-start-2 @max-[76rem]:row-start-1 @max-[76rem]:justify-self-end">
      <FolderKanban aria-hidden className="size-4" />
    </Link>;
  }

  async function resolve(target: { rounds: TaskReviewQueueItem[]; sessionId?: string }, action: "approved" | "rework") {
    if (disabled || resolutionPending.current || (action === "rework" && !comment.trim())) return;
    resolutionPending.current = true;
    setResolving(true); setError(null);
    const remaining = [...target.rounds];
    try {
      // Account the frozen shared membership once before resolving each current reviewer step.
      if (target.sessionId && !await timer.control({ action: "pause", sessionId: target.sessionId })) throw new Error(t("updateFailed"));
      for (const round of target.rounds) {
        const response = await fetch(`/api/tasks/${round.task.id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, round_id: round.id, reviewer_id: round.reviewer_id, ...(action === "rework" ? { comment: comment.trim() } : {}) }) });
        if (!response.ok) throw new Error(t("updateFailed"));
        remaining.shift();
      }
      setRework(null); setComment("");
    } catch {
      setError(t("updateFailed"));
      if (action === "rework") setRework({ ...target, rounds: remaining });
    } finally {
      // Partial batches retain successful transitions and refresh the unfinished queue.
      await timer.reload().catch(() => setError(timerText("failed")));
      router.refresh(); window.dispatchEvent(new Event("review-timer-change"));
      resolutionPending.current = false; setResolving(false);
    }
  }

  const focusReview = useCallback((roundId: string | null, groupKey: string | null) => {
    if (groupKey) {
      if (!rounds.some(round => `${round.task.project.id}:${round.task.stage}` === groupKey)) return false;
      setExpanded(current => current.includes(groupKey) ? current : [...current, groupKey]);
      const toggle = queueRef.current?.querySelector<HTMLButtonElement>(`[data-review-group="${groupKey}"] [data-review-group-toggle]`);
      toggle?.focus({ preventScroll: true });
      toggle?.scrollIntoView({ block: "start", behavior: "auto" });
      return true;
    }
    const round = rounds.find(round => round.id === roundId);
    if (!round) return false;
    openDetails(round);
    return true;
  }, [rounds, openDetails]);

  useEffect(() => {
    const roundId = searchParams.get("review");
    const groupKey = searchParams.get("reviewGroup");
    const request = groupKey ?? roundId;
    if (request && focusedRequest.current !== request && focusReview(roundId, groupKey)) focusedRequest.current = request;
    const onFocus = () => { focusReview(roundId, groupKey); };
    window.addEventListener("review-queue-focus", onFocus);
    return () => window.removeEventListener("review-queue-focus", onFocus);
  }, [searchParams, focusReview]);

  function renderRound(round: TaskReviewQueueItem) {
    const state = reviewTimerForRound(timer.snapshot, round.id, round.reviewer_id, timer.serverNow);
    const shared = state.state === "active" && (state.session?.members.length ?? 0) > 1;
    const own = round.reviewer_id === currentUserId;
    return <div key={round.id} data-review-row={round.id} className={`${rowGrid} relative border-t border-[var(--ui-border-subtle)] ${state.state === "active" && !shared ? "bg-[var(--ui-info-surface)]" : ""}`}>
      <button type="button" data-review-open aria-label={t("openTask", { name: round.task.title })} onClick={() => openDetails(round)}
        className="absolute inset-0 cursor-pointer transition-colors duration-200 hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none" />
      <div className="pointer-events-none relative min-w-0">
        <p className="truncate text-xs text-[var(--ui-text-muted)]" title={round.task.project.name}>{round.task.project.name}</p>
        <p className="line-clamp-2 text-sm font-medium text-[var(--ui-text)]" title={round.task.title}>{round.task.title}</p>
      </div>
      <div className="pointer-events-none relative flex min-w-0 items-center gap-2 @max-[76rem]:col-start-1 @max-[76rem]:row-start-2">
        <UserAvatar decorative size="boardCard" name={round.task.assignee?.full_name} imageUrl={round.task.assignee?.avatar_url} />
        <span className="min-w-0 break-words text-xs leading-5 text-[var(--ui-text-secondary)]">{round.task.assignee?.full_name ?? t("unassigned")}</span>
      </div>
      <div className="pointer-events-none relative min-w-0 space-y-1 @max-[76rem]:col-start-1 @max-[76rem]:row-start-3">
        <p className="text-xs font-medium text-[var(--ui-info-text)]">{t("reviewRound", { number: round.round_number })}</p>
        <TaskReviewWaiting submittedAt={round.submitted_at} />
        {showReviewer ? <p className="truncate text-xs text-[var(--ui-text-muted)]">{t("reviewer")}: {round.reviewer?.full_name ?? t("unknown")}</p> : null}
      </div>
      <span className={`pointer-events-none relative w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium @max-[76rem]:col-start-2 @max-[76rem]:row-start-2 @max-[76rem]:justify-self-end ${getPriorityBadgeStyle(round.task.priority).className}`}>{priority(round.task.priority)}</span>
      <div className="pointer-events-none relative min-w-0 space-y-1 text-xs @max-[76rem]:col-start-2 @max-[76rem]:row-start-3 @max-[76rem]:text-right">
        <p className={state.state === "active" ? "font-medium text-[var(--ui-info-text)]" : "text-[var(--ui-text-muted)]"}>{timerText(shared ? "inGroup" : state.state)}</p>
        {state.state !== "waiting" && !shared ? <p data-review-elapsed className="tabular-nums">{formatReviewElapsed(state.seconds)}</p> : null}
      </div>
      <div data-review-actions className="pointer-events-none relative z-10 flex min-w-0 flex-nowrap items-center justify-end gap-0.5 @max-[76rem]:col-span-2 @max-[76rem]:row-start-4">
        {own && state.state === "waiting" ? <ReviewActionButton action="start" disabled={disabled || !timer.snapshot || Boolean(ownActive)} onClick={() => void timer.control({ action: "start", roundIds: [round.id] })}>{timerText("start")}</ReviewActionButton> : null}
        {own && state.state === "paused" ? <ReviewActionButton action="start" disabled={disabled || !timer.snapshot || Boolean(ownActive)} onClick={() => void timer.control({ action: "start", roundIds: [round.id] })}>{timerText("resume")}</ReviewActionButton> : null}
        {own && state.state === "active" && state.session ? <ReviewActionButton action="pause" disabled={disabled} onClick={() => { const sessionId = state.session?.id; if (sessionId) void timer.control({ action: "pause", sessionId }); }}>{timerText("pause")}</ReviewActionButton> : null}
        {(state.state === "active" || state.state === "paused" || !own) ? <>
          <ReviewActionButton action="approve" disabled={disabled} onClick={() => void resolve({ rounds: [round] }, "approved")}>{t("reviewApprove")}</ReviewActionButton>
          <ReviewActionButton action="rework" disabled={disabled} onClick={() => { setRework({ rounds: [round] }); setComment(""); setError(null); }}>{t("reviewSendBack")}</ReviewActionButton>
        </> : null}
      </div>
      {projectLink(round.task.project.id, round.task.id)}
    </div>;
  }

  return <div className="@container">
    {timer.error ? <p role="alert" className="mb-3 text-sm text-[var(--ui-danger-text)]">{timerText(timer.error === "conflict" ? "overlap" : "failed")}</p> : null}
    {error && !rework ? <p role="alert" className="mb-3 text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    {!rounds.length ? <p className="py-10 text-center text-sm text-[var(--ui-text-muted)]">{t("reviewQueueEmpty")}</p> : <ul ref={queueRef} aria-label={t("reviewQueue")} className="border-x border-b border-[var(--ui-border)] bg-[var(--ui-surface)]">
      {[...groups].map(([key, items], index) => {
        if (items.length === 1) return <li key={key}>{renderRound(items[0])}</li>;
        const eligible = items.filter(round => round.reviewer_id === currentUserId);
        const session = ownActive?.members.some(member => items.some(round => round.id === member.round_id)) ? ownActive
          : timer.snapshot?.sessions.find(s => s.state === "active" && s.members.some(member => items.some(round => round.id === member.round_id)));
        const sharedTarget = session?.user_id === currentUserId && session.members.length > 1
          ? { sessionId: session.id, rounds: eligible.filter(round => session.members.some(member => member.round_id === round.id && !member.finished_at)) } : null;
        const paused = eligible.some(round => reviewTimerForRound(timer.snapshot, round.id, round.reviewer_id, timer.serverNow).state === "paused");
        const groupState = session ? "active" : paused ? "paused" : "waiting";
        const open = expanded.includes(key);
        const contentId = `${scopeId}-${index}`;
        const stage = stageNames[key] ?? stages(items[0].task.stage);
        return <li key={key} data-review-group={key}>
          <div className={`${rowGrid} relative border-t border-[var(--ui-border)] ${session ? "bg-[var(--ui-info-surface)]" : "bg-[var(--ui-surface-subtle)]"}`}>
            <button type="button" data-review-group-toggle aria-expanded={open} aria-controls={contentId} onClick={() => setExpanded(current => open ? current.filter(value => value !== key) : [...current, key])}
              className="absolute inset-0 scroll-mt-24 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)] motion-reduce:transition-none">
              <span className="sr-only">{items[0].task.project.name} · {stage}</span>
            </button>
            <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
              <ChevronDown aria-hidden className={`size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium" title={items[0].task.project.name}>{items[0].task.project.name}</span><span className="block truncate text-xs text-[var(--ui-text-muted)]">{stage}</span></span>
            </div>
            <span aria-hidden className="hidden @min-[76rem]:block" />
            <span className="pointer-events-none relative text-xs text-[var(--ui-text-muted)] @max-[76rem]:col-start-1 @max-[76rem]:row-start-2">{timerText("reviewCount", { count: items.length })}</span>
            <span aria-hidden className="hidden @min-[76rem]:block" />
            <div className="pointer-events-none relative min-w-0 space-y-1 text-xs @max-[76rem]:col-start-2 @max-[76rem]:row-start-2 @max-[76rem]:text-right">
              <p className={session ? "font-medium text-[var(--ui-info-text)]" : "text-[var(--ui-text-muted)]"}>{timerText(groupState)}</p>
              {session && session.members.length > 1 ? <p data-review-group-elapsed className="tabular-nums">{formatReviewElapsed(reviewGroupElapsed(timer.snapshot, session, timer.serverNow))}</p> : paused ? <p className="tabular-nums">{formatReviewElapsed(eligible.reduce((sum, round) => sum + reviewTimerForRound(timer.snapshot, round.id, round.reviewer_id, timer.serverNow).seconds, 0))}</p> : null}
            </div>
            <div data-review-group-actions className="pointer-events-none relative z-10 flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto sm:justify-end @max-[76rem]:col-span-2 @max-[76rem]:row-start-3">
              {session?.user_id === currentUserId ? <ReviewActionButton action="pause" disabled={disabled} onClick={() => void timer.control({ action: "pause", sessionId: session.id })}>{timerText(session.members.length > 1 ? "pauseGroup" : "pause")}</ReviewActionButton>
                : eligible.length >= 2 ? <ReviewActionButton action="start" disabled={disabled || !timer.snapshot || Boolean(ownActive)} onClick={() => void timer.control({ action: "start", roundIds: eligible.map(round => round.id) })}>{timerText(paused ? "resumeGroup" : "startGroup")}</ReviewActionButton> : null}
              {sharedTarget?.rounds.length ? <>
                <ReviewActionButton action="approve" disabled={disabled} onClick={() => void resolve(sharedTarget, "approved")}>{timerText("approveGroup")}</ReviewActionButton>
                <ReviewActionButton action="rework" disabled={disabled} onClick={() => { setRework(sharedTarget); setComment(""); setError(null); }}>{timerText("sendBackGroup")}</ReviewActionButton>
              </> : null}
            </div>
            {projectLink(items[0].task.project.id)}
          </div>
          <div id={contentId} aria-hidden={!open} inert={!open} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden">{items.map(renderRound)}</div>
          </div>
        </li>;
      })}
    </ul>}
    {detailRound && loadFailed ? <Drawer title={t("taskDetails")} className="w-full max-w-[40rem]" isOpen={drawerOpen} onClose={closeDetails} onExited={clearDetails}>
      <div className="flex items-center justify-between border-b border-[var(--ui-border)] p-4">
        <h2 className="font-semibold">{detailRound.task.title}</h2>
        <Button size="sm" variant="ghost" aria-label={t("closeTaskDetails")} onClick={closeDetails}><X aria-hidden className="size-4" /></Button>
      </div>
      <p className="p-4 text-sm text-[var(--ui-text-muted)]" role={loadFailed ? "alert" : "status"}>{loadFailed ? t("loadFailed") : common("loading")}</p>
      {loadFailed ? <Button variant="outline" className="mx-4" onClick={() => openDetails(detailRound)}>{t("retryLoad")}</Button> : null}
    </Drawer> : null}
    {details ? <TaskDetailsDrawer key={details.task.id} task={details.task} currentUserId={currentUserId} members={details.members}
      canManageTasks={details.canManageTasks} isOpen={drawerOpen} onClose={closeDetails} onExited={clearDetails}
      isProjectReadOnly={!canWorkOnTaskInProject({ projectStatus: details.project.status, archivedAt: details.project.archived_at, stage: details.task.stage })}
      projectStatus={isProjectLifecycleStatus(details.project.status) ? details.project.status : undefined}
      onTaskUpdated={task => setDetails(current => current?.task.id === task.id ? { ...current, task } : current)}
      onTaskDeleted={() => { closeDetails(); router.refresh(); }}
      onProjectStatusUpdated={status => setDetails(current => current ? { ...current, project: { ...current.project, status } } : current)} /> : null}
    <Dialog isOpen={Boolean(rework)} title={rework?.sessionId ? timerText("sendBackGroup") : t("reviewSendBack")} closeLabel={timerText("cancel")} onRequestClose={() => { if (!resolving) setRework(null); }} closeDisabled={resolving} className="max-w-md">
      <form className="space-y-4 p-4" onSubmit={event => { event.preventDefault(); if (rework) void resolve(rework, "rework"); }}>
        <p className="text-sm font-medium">{rework?.sessionId && rework.rounds[0] ? `${rework.rounds[0].task.project.name} · ${stageNames[`${rework.rounds[0].task.project.id}:${rework.rounds[0].task.stage}`] ?? stages(rework.rounds[0].task.stage)} · ${timerText("reviewCount", { count: rework.rounds.length })}` : rework?.rounds[0]?.task.title}</p>
        <FormField label={t("reviewFixComment")}><Textarea autoFocus required maxLength={5000} rows={3} value={comment} onChange={event => setComment(event.target.value)} disabled={resolving} /></FormField>
        {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={resolving} onClick={() => setRework(null)}>{timerText("cancel")}</Button><Button type="submit" size="sm" disabled={resolving || !comment.trim()}>{t("reviewConfirmRework")}</Button></div>
      </form>
    </Dialog>
  </div>;
}
