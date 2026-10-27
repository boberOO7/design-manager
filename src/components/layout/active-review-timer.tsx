"use client";

import { getStageLabel } from "@/lib/task-stages";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/components/ui/button";
import { useReviewTimer } from "@/hooks/use-review-timer";
import { parseMotionPreference } from "@/lib/motion";
import { currentReviewTimerSession, formatReviewElapsed, reviewGroupElapsed, reviewTimerForRound, type ReviewTimerSession, type ReviewTimerSnapshot } from "@/lib/review-timer";
import { Tooltip } from "@/components/ui/tooltip";

export function ActiveReviewTimer() {
  const timer = useReviewTimer();
  const session = currentReviewTimerSession(timer.snapshot);
  const review = timer.snapshot?.activeReview;
  return session && review ? <ReviewIsland key={session.members.map(member => member.round_id).sort().join(",")} timer={timer} session={session} review={review} /> : null;
}

function ReviewIsland({ timer, session, review }: {
  timer: ReturnType<typeof useReviewTimer>; session: ReviewTimerSession; review: NonNullable<ReviewTimerSnapshot["activeReview"]>;
}) {
  const t = useTranslations("ReviewTimer");
  const stages = useTranslations("TaskStages");
  const locale = useLocale();
  const pathname = usePathname();
  const contentId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const topRow = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const animationContext = useRef<gsap.Context | null>(null);
  const previousExpanded = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [geometry, setGeometry] = useState({ width: 260, height: 36, top: 20, expandedWidth: 360, expandedHeight: 156, expandedTop: 20 });
  const group = session.members.length > 1;
  const paused = session.state === "paused";
  const controlLabel = t(paused ? "resume" : "pause");
  const ControlIcon = paused ? Play : Pause;
  const stage = review.stageName ?? getStageLabel(review.stage, stages);
  const label = group ? review.projectName : review.taskTitle;
  const fullLabel = `${review.projectName} · ${group ? stage : review.taskTitle}`;
  const seconds = group ? reviewGroupElapsed(timer.snapshot, session, timer.serverNow)
    : reviewTimerForRound(timer.snapshot, review.roundId, session.user_id, timer.serverNow).seconds;
  const href = `/my-tasks?view=review&${group ? `reviewGroup=${encodeURIComponent(`${review.projectId}:${review.stage}`)}` : `review=${review.roundId}`}`;

  useLayoutEffect(() => {
    const root = surface.current;
    const header = root?.closest<HTMLElement>("[data-application-header]");
    const body = details.current;
    if (!root || !header || !body) return;
    const identity = header.querySelector<HTMLElement>("[data-header-identity]");
    const actions = header.querySelector<HTMLElement>("[data-header-main-controls]");
    const measure = () => {
      const box = header.getBoundingClientRect();
      const center = box.left + box.width / 2;
      const left = identity?.getBoundingClientRect().right ?? box.left + 12;
      const actionBox = actions?.getBoundingClientRect();
      const right = actionBox?.left ?? box.right - 12;
      const available = 2 * Math.min(center - left - 12, right - center - 12);
      const docked = available < 160;
      const width = docked ? Math.min(260, 2 * (center - left - 8), box.width - 24) : Math.min(260, available);
      const expandedWidth = Math.min(360, box.width - 24);
      body.style.width = `${expandedWidth}px`;
      const next = { width: Math.max(124, width), height: docked ? Math.min(22, actionBox ? Math.floor(actionBox.top - box.top) - 1 : 22) : 36, top: docked ? 0 : (box.height - 36) / 2,
        expandedWidth, expandedHeight: 40 + body.scrollHeight, expandedTop: available >= expandedWidth ? (box.height - 36) / 2 : box.height - 12 };
      setGeometry(current => current.width === next.width && current.height === next.height && current.top === next.top
        && current.expandedWidth === next.expandedWidth && current.expandedHeight === next.expandedHeight && current.expandedTop === next.expandedTop ? current : next);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(header);
    if (identity) resize.observe(identity);
    if (actions) resize.observe(actions);
    measure();
    return () => resize.disconnect();
  }, [review.projectName, review.taskTitle, stage, group, locale]);

  useLayoutEffect(() => {
    const root = surface.current;
    if (!root) return;
    const context = gsap.context(() => {}, root);
    animationContext.current = context;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches || parseMotionPreference(document.documentElement.dataset.motion ?? null) === "off");
    const observer = new MutationObserver(syncMotion);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    media.addEventListener("change", syncMotion);
    syncMotion();
    return () => { observer.disconnect(); media.removeEventListener("change", syncMotion); context.revert(); animationContext.current = null; };
  }, []);

  useLayoutEffect(() => {
    const animate = previousExpanded.current !== expanded && !reducedMotion;
    previousExpanded.current = expanded;
    animationContext.current?.add(() => {
      gsap.to(surface.current, { width: expanded ? geometry.expandedWidth : geometry.width,
        height: expanded ? geometry.expandedHeight : geometry.height, top: expanded ? geometry.expandedTop : geometry.top,
        borderRadius: expanded ? 20 : geometry.height / 2, duration: animate ? 0.25 : 0, ease: "power2.out", overwrite: "auto" });
      gsap.to(topRow.current, { height: expanded ? 40 : geometry.height - 2, duration: animate ? 0.25 : 0, ease: "power2.out", overwrite: "auto" });
      gsap.to(details.current, { autoAlpha: expanded ? 1 : 0, y: expanded ? 0 : 4,
        duration: animate ? 0.18 : 0, delay: expanded && animate ? 0.06 : 0, ease: "power2.out", overwrite: true });
    });
  }, [expanded, geometry, reducedMotion]);

  useLayoutEffect(() => { setExpanded(false); }, [pathname]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !surface.current?.contains(event.target)) setExpanded(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setExpanded(false); toggle.current?.focus({ preventScroll: true });
    };
    const focusOutside = (event: FocusEvent) => { if (event.target instanceof Node && !surface.current?.contains(event.target)) setExpanded(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape); document.addEventListener("focusin", focusOutside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", focusOutside); };
  }, [expanded]);

  const control = () => { void timer.control(paused
    ? { action: "start", roundIds: session.members.filter(member => !member.finished_at).map(member => member.round_id) }
    : { action: "pause", sessionId: session.id }); };
  return <div ref={surface} data-active-review-timer data-review-island data-state={session.state} data-expanded={expanded} className="review-timer-island">
    <Tooltip content={fullLabel}><button ref={toggle} type="button" data-review-island-toggle aria-expanded={expanded} aria-controls={contentId}
      aria-label={`${t(expanded ? "collapseTimer" : "expandTimer")}: ${fullLabel} · ${t(session.state)}`}
      onClick={() => setExpanded(current => !current)} className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]" /></Tooltip>
    <div ref={topRow} className="review-timer-island-row pointer-events-none relative flex items-center gap-2 px-2.5 text-xs">
      <Tooltip content={t(session.state)}><span aria-hidden className={`size-1.5 shrink-0 rounded-full ${paused ? "border border-[#a8a29e]" : "bg-[var(--ui-info-accent)]"}`} /></Tooltip>
      <span className="min-w-0 flex-1 truncate font-medium">{expanded ? t(paused ? group ? "groupPaused" : "reviewPaused" : group ? "groupInProgress" : "reviewInProgress") : label}</span>
      <span data-active-review-elapsed className="shrink-0 whitespace-nowrap tabular-nums">{formatReviewElapsed(seconds)}</span>
      <Tooltip content={timer.error ? t("failed") : controlLabel}><button type="button" aria-label={controlLabel} disabled={timer.pending}
        aria-hidden={expanded} inert={expanded} tabIndex={expanded ? -1 : 0}
        onClick={control} className={`pointer-events-auto relative flex size-5 max-h-full shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-60 ${expanded ? "invisible" : ""} ${timer.error ? "text-[var(--ui-danger-text)]" : ""}`}>
        <ControlIcon aria-hidden className="size-3" />
      </button></Tooltip>
    </div>
    <div ref={details} id={contentId} data-review-island-details aria-hidden={!expanded} inert={!expanded} className="review-timer-island-details pointer-events-none absolute top-10 px-4 pb-4 pt-2">
      <Tooltip content={review.projectName}><p className="truncate text-sm font-medium" tabIndex={0}>{review.projectName}</p></Tooltip>
      <div className="mt-1 text-xs leading-5 text-[#a8a29e]">
        {group ? <p className="flex gap-2"><Tooltip content={stage}><span className="min-w-0 truncate" tabIndex={0}>{stage}</span></Tooltip><span className="shrink-0">· {t("reviewCount", { count: session.members.filter(member => !member.finished_at).length })}</span></p>
          : <Tooltip content={review.taskTitle}><p className="line-clamp-2" tabIndex={0}>{review.taskTitle}</p></Tooltip>}
      </div>
      <div className="pointer-events-auto relative z-10 mt-3 flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" disabled={timer.pending} onClick={control} className="gap-1.5 px-2 text-xs text-[#e7e5e4] hover:bg-white/10 hover:text-white"><ControlIcon aria-hidden className="size-3.5" />{controlLabel}</Button>
        <Button size="sm" variant="ghost" asChild className="gap-1.5 px-2 text-xs text-[#e7e5e4] hover:bg-white/10 hover:text-white">
          <Link href={href} onClick={() => { setExpanded(false); if (`${window.location.pathname}${window.location.search}` === href) window.dispatchEvent(new Event("review-queue-focus")); }}>{t(group ? "openGroup" : "openReview")}<ArrowUpRight aria-hidden className="size-3.5" /></Link>
        </Button>
      </div>
    </div>
    {timer.error ? <span role="alert" className="sr-only">{t("failed")}</span> : null}
  </div>;
}
