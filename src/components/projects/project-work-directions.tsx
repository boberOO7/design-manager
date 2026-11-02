"use client";

import { directionEquivalentArea, areaComponentsSchema } from "@/lib/work-direction-components";

import { ProjectWorkspaceTabs } from "./project-workspace-tab";
import { ProjectWorkspaceMotion } from "./project-workspace-motion";
import { ProjectWorkspaceLink as Link, useProjectWorkspaceNavigation } from "./project-workspace-navigation";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { saveProjectDirection, setDirectionStatus } from "@/app/(app)/projects/[projectId]/direction-actions";
import type { ProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { calculateProjectSummary, type ProjectTaskForProgress } from "@/lib/project-progress";
import { directionName, type DirectionPreset, type DirectionStatus, type ProjectWorkDirection } from "@/lib/work-directions";
import { projectWorkspaceHref, type ProjectWorkspaceView } from "@/lib/project-workspace-navigation";
import type { ProjectTemplate } from "@/lib/project-templates";
import { formatDateOnly, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";
import { WorkDirectionEditor } from "./work-direction-editor";
import styles from "./work-directions.module.css";
import { WorkDirectionIcon } from "./work-direction-icon";
import { getStageLabel } from "@/lib/task-stages";
import { useProjectLifecycle } from "./project-lifecycle-context";
import { ProjectNavigationProgress } from "./project-navigation-progress";

export function ProjectWorkDirections({ projectId, configuration, tasks, selected, view = "board", backHref, canManage, canViewFinance = canManage, templates, presets = [], onNavigatingChange }: {
  projectId: string; configuration: ProjectStageConfiguration; tasks: readonly ProjectTaskForProgress[]; selected: string | null;
  view?: ProjectWorkspaceView; backHref?: string; onNavigatingChange?: (pending: boolean) => void; canManage: boolean; canViewFinance?: boolean; templates: ProjectTemplate[]; presets?: DirectionPreset[];
}) {
  const t = useTranslations("ProjectWorkspace.directions"), statusLabels = useTranslations("Status"), locale = useLocale(), router = useRouter();
  const navigation = useProjectWorkspaceNavigation();
  const projects = useTranslations("Projects"), stageLabels = useTranslations("TaskStages");
  const { status: projectStatus } = useProjectLifecycle();
  const [editor, setEditor] = useState<ProjectWorkDirection | "new" | null>(null);
  const [expanded, setExpanded] = useState(false), [error, setError] = useState<string | null>(null), [pending, startTransition] = useTransition();
  const disclosureId = useId();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const directions = configuration.directions ?? [];
  const wide = useSyncExternalStore(subscribeWidth, isWide, () => false);
  const compact = wide ? directions : directions.slice(0, 2);
  const remaining = directions.filter(direction => !compact.includes(direction));
  const directionView = view === "finance" || view === "details" ? view : "board";
  const href = (id: string) => projectWorkspaceHref(projectId, directionView, id, backHref);
  const format = (value: number) => formatNumber(value, locale);
  function mutate(direction: ProjectWorkDirection, intent: "remove" | "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await saveProjectDirection(projectId, configuration.version, { intent, id: direction.id }).catch(() => ({ success: false, error: "failed" } as const));
      if (!result.success) { setError(t(result.error === "conflict" ? "conflict" : result.error === "hasWork" ? "hasWork" : "saveFailed")); return; }
      navigation?.refresh(intent === "remove" && selected === direction.id ? projectWorkspaceHref(projectId, "overview", null, backHref) : undefined);
    });
  }
  function lifecycle(direction: ProjectWorkDirection, status: DirectionStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setDirectionStatus(projectId, direction.id, status, configuration.version).catch(() => ({ success: false, error: "saveFailed" } as const));
      if (!result.success) { setError(t(result.error === "unavailable" || result.error === "invalid" ? "saveFailed" : result.error)); return; }
      navigation?.refresh();
    });
  }
  function actions(direction: ProjectWorkDirection) {
    if (!canManage) return null;
    const stageIds = new Set<string>(configuration.stages.filter(stage => stage.directionId === direction.id && stage.kind === "work").map(stage => stage.stage));
    const status = direction.status === "planned" && tasks.some(task => task.stage !== undefined && stageIds.has(task.stage) && task.status !== "todo" && task.status !== "cancelled") ? "active" : direction.status;
    const controls: Array<{ status: DirectionStatus; label: string; icon: typeof Play }> = status === "planned" ? [{ status: "active", label: "startDirection", icon: Play }]
      : status === "active" ? [{ status: "paused", label: "pauseDirection", icon: Pause }, { status: "completed", label: "completeDirection", icon: Check }]
      : status === "paused" ? [{ status: "active", label: "resumeDirection", icon: Play }, { status: "completed", label: "completeDirection", icon: Check }]
      : [{ status: "active", label: "reopenDirection", icon: RotateCcw }];
    return <Popover.Root><Popover.Trigger asChild><Button type="button" variant="ghost" className="size-10 shrink-0 p-0" aria-label={t("actions", { name: directionName(direction, t) })}><MoreHorizontal aria-hidden="true" className="size-4"/></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-[80] w-60 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1.5 shadow-[var(--ui-shadow-popover)]">
      <Popover.Close asChild><Button type="button" variant="ghost" className="w-full justify-start gap-2 text-sm" onClick={() => setEditor(direction)}><Pencil aria-hidden="true" className="size-4"/>{t("edit")}</Button></Popover.Close>
      {controls.map(action => <Popover.Close key={action.status} asChild><Button type="button" variant="ghost" className="w-full justify-start gap-2 text-sm" disabled={pending} onClick={() => lifecycle(direction, action.status)}><action.icon aria-hidden="true" className="size-4"/>{t(action.label)}</Button></Popover.Close>)}
      {!selected && directions.length > 1 ? <div className="mt-1 flex items-center border-t border-[var(--ui-border)] px-3 pt-1"><span className="flex-1 text-xs text-[var(--ui-text-muted)]">{t("order")}</span>{([{ intent: "up", icon: ArrowUp, label: "moveUp" }, { intent: "down", icon: ArrowDown, label: "moveDown" }] as const).map(({ intent, icon: Icon, label }) => <Popover.Close key={intent} asChild><Button type="button" variant="ghost" className="size-10 p-0" aria-label={t(label)} title={t(label)} disabled={pending || (intent === "up" ? directions[0]?.id === direction.id : directions.at(-1)?.id === direction.id)} onClick={() => mutate(direction, intent)}><Icon aria-hidden="true" className="size-4"/></Button></Popover.Close>)}</div> : null}
      {directions.length > 1 && !direction.is_default ? <div className="mt-1 border-t border-[var(--ui-border)] pt-1"><Popover.Close asChild><Button type="button" variant="ghost" className="w-full justify-start gap-2 text-sm text-[var(--ui-danger-text)]" disabled={pending} onClick={() => mutate(direction, "remove")}><Trash2 aria-hidden="true" className="size-4"/>{t("remove")}</Button></Popover.Close></div> : null}
    </Popover.Content></Popover.Portal></Popover.Root>;
  }
  function directionData(direction: ProjectWorkDirection) {
    const stages = configuration.stages.filter(stage => stage.directionId === direction.id);
    const ids = new Set<string>(stages.map(stage => stage.stage));
    const directionTasks = tasks.filter(task => task.stage !== undefined && ids.has(task.stage));
    const summary = calculateProjectSummary(directionTasks, undefined, configuration.progressMethods, stages);
    const workIds = new Set<string>(stages.filter(stage => stage.kind === "work").map(stage => stage.stage));
    const status = direction.status === "planned" && directionTasks.some(task => task.stage !== undefined && workIds.has(task.stage) && task.status !== "todo" && task.status !== "cancelled") ? "active" : direction.status;
    return { stages, summary, status };
  }
  function taskCounts(summary: ReturnType<typeof calculateProjectSummary>, paused: boolean) {
    return <div className={styles.taskCounts} data-direction-task-counts>
      <span data-count="open">{projects("openCount", { count: summary.progress.openTaskCount })}</span>
      <span data-count="completed">{projects("completedCount", { count: summary.progress.completedTaskCount })}</span>
      {!paused ? <span data-count="overdue" data-overdue={summary.progress.overdueTaskCount > 0}>{projects("overdueCount", { count: summary.progress.overdueTaskCount })}</span> : null}
    </div>;
  }
  function track(label: string, percent: number) {
    return <span className={styles.progress} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ transform: `scaleX(${percent / 100})` }}/></span>;
  }
  function measurements(direction: ProjectWorkDirection) {
    return <dl className={styles.areaMetrics}>
      <div><dt>{t(areaComponentsSchema.safeParse(direction.area_components).success ? "components.primaryArea" : "area")}</dt><dd>{format(direction.area_m2)} <small>м²</small></dd></div>
      <div><dt>{t("equivalent")}</dt><dd>{format(directionEquivalentArea(direction))} <small>{t("unitShort")}</small></dd></div>
    </dl>;
  }
  function directionPicker(direction: ProjectWorkDirection) {
    const name = directionName(direction, t);
    if (directions.length === 1) return <h2 className={styles.focusName}>{name}</h2>;
    return <Popover.Root open={switcherOpen} onOpenChange={setSwitcherOpen}>
      <h2 className={styles.focusName}><Popover.Trigger asChild><button type="button" className={styles.directionPicker} aria-label={`${t("choose")}: ${name}`}><span>{name}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0"/></button></Popover.Trigger></h2>
      <Popover.Portal><Popover.Content align="start" sideOffset={8} collisionPadding={16} aria-label={t("choose")} className={styles.directionMenu}>
        <nav aria-label={t("choose")}>{directions.map(option => {
          const optionName = directionName(option, t), { status } = directionData(option);
          return <Link key={option.id} data-direction-option={option.id} href={href(option.id)} prefetch={false} scroll={false} aria-current={selected === option.id ? "page" : undefined} className={styles.directionOption} onClick={() => setSwitcherOpen(false)}>
            <WorkDirectionIcon kind={option.kind} className="size-4 shrink-0"/><span className="grid min-w-0 gap-0.5"><span className="break-words font-medium">{optionName}</span><span className={styles.status} data-status={status}>{statusLabels(status)}</span></span><span className="ml-auto flex shrink-0 items-center gap-1"><ProjectNavigationProgress/>{selected === option.id ? <Check aria-hidden="true" className="size-4"/> : null}</span>
          </Link>;
        })}</nav>
      </Popover.Content></Popover.Portal>
    </Popover.Root>;
  }
  function row(direction: ProjectWorkDirection) {
    const { summary, status } = directionData(direction);
    const name = directionName(direction, t);
    const heading = <div className={styles.focusHeading}><span className={styles.directionIcon}><WorkDirectionIcon kind={direction.kind} className="size-5"/></span><div className="grid min-w-0 gap-0.5"><span className={styles.focusName}>{name}</span><span className={styles.status} data-status={status}>{statusLabels(status)}</span></div><ProjectNavigationProgress/></div>;
    if (directions.length === 1) return <div key={direction.id} className={styles.singleOverview} data-direction-id={direction.id}>
      <Link href={href(direction.id)} prefetch={false} scroll={false} className={styles.singleEntry}>
        {heading}
        {measurements(direction)}
        {direction.due_date ? <div className={styles.singleMeasurements}><span>{t("dueDate")}</span><time dateTime={direction.due_date}>{formatDateOnly(direction.due_date, locale)}</time></div> : null}
        {configuration.showProgress ? <div className={styles.singleProgress}><span>{projects("progress")}</span><strong>{summary.progress.progressPercent}<small>%</small></strong>{track(name, summary.progress.progressPercent)}</div> : null}
        <ChevronRight aria-hidden="true" className={styles.entryArrow}/>
      </Link><div className={styles.directionActions}>{actions(direction)}</div>
    </div>;
    return <div key={direction.id} className={styles.item} data-direction-id={direction.id}>
      <Link href={href(direction.id)} prefetch={false} scroll={false} className={styles.entry}>
        <div className={styles.entrySummary}>{heading}{measurements(direction)}</div>
        <div className={styles.entryFooter}>{direction.due_date ? <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="size-3.5"/><time dateTime={direction.due_date}>{formatDateOnly(direction.due_date, locale)}</time></span> : configuration.showProgress ? <span>{projects("progress")}</span> : null}{configuration.showProgress ? <strong>{summary.progress.progressPercent}<small>%</small></strong> : null}</div>
        {configuration.showProgress ? track(name, summary.progress.progressPercent) : null}
      </Link><div className={styles.directionActions}>{actions(direction)}</div>
    </div>;
  }
  const active = directions.find(direction => direction.id === selected);
  function focused(direction: ProjectWorkDirection) {
    const { stages, summary, status } = directionData(direction);
    const name = directionName(direction, t);
    const visibleStages = stages.filter(stage => stage.kind === "work" && stage.isEnabled).sort((a, b) => a.displayOrder - b.displayOrder);
    return <div className={styles.focused} data-active="true" data-focused-direction={direction.id} data-direction-id={direction.id}>
      <div className={styles.focusIdentity}>
        <div className={styles.focusHeading}>
          <span className={styles.directionIcon}><WorkDirectionIcon kind={direction.kind} className="size-5"/></span>
          <div className="min-w-0 flex-1">
            <div className={styles.focusTitle}>
              <Link href={projectWorkspaceHref(projectId, "overview", null, backHref)} className={styles.overviewLink}>{t("projectOverview")}<ProjectNavigationProgress/></Link>
              <ChevronRight aria-hidden="true" className={styles.breadcrumbSeparator}/>
              {directionPicker(direction)}
            </div>
            <div className={styles.identityCaption}><span className={styles.status} data-status={status}>{statusLabels(status)}</span>
              {direction.start_date || direction.due_date ? <span className={styles.focusSchedule}><CalendarDays aria-hidden="true" className="size-3.5 shrink-0"/><span className="sr-only">{t("schedule")}: </span><span>{direction.start_date ? <time dateTime={direction.start_date}>{formatDateOnly(direction.start_date, locale)}</time> : null}{direction.start_date && direction.due_date ? " — " : null}{direction.due_date ? <time dateTime={direction.due_date}>{formatDateOnly(direction.due_date, locale)}</time> : null}</span></span> : null}
            </div>
          </div>
        </div>
        {measurements(direction)}
        <div className={styles.directionActions}>{actions(direction)}</div>
      </div>
      <div className={styles.focusWork}>
        {configuration.showProgress ? <div className={styles.stageMetrics}>
          <div className={styles.overallMetric}><span>{projects("progress")}</span><strong>{summary.progress.progressPercent}<small>%</small></strong>{track(name, summary.progress.progressPercent)}</div>
          {visibleStages.length ? <div className={styles.stages}>{visibleStages.map(stage => { const percent = summary.stageProgress[stage.stage]?.progressPercent ?? 0; const label = getStageLabel(stage.stage, stageLabels, stage.displayName); return <div key={stage.stage} className={styles.stageMetric}><span title={label}>{label}</span><strong>{percent}<small>%</small></strong>{track(label, percent)}</div>; })}</div> : null}
        </div> : null}
      </div>
    </div>;
  }
  return <section className={styles.collection} aria-label={t("title")} data-work-directions data-focused={Boolean(active)} data-single={directions.length === 1}>
    <ProjectWorkspaceMotion motionKey={active?.id ?? "overview"}>
    {!active ? <>
      <div className={styles.list}>{compact.map(row)}</div>
      {remaining.length ? <><AnimatedFormContent id={disclosureId} labelledBy={`${disclosureId}-toggle`} isOpen={expanded}><div className={`${styles.list} pt-1.5`}>{remaining.map(row)}</div></AnimatedFormContent><button id={`${disclosureId}-toggle`} type="button" aria-expanded={expanded} aria-controls={disclosureId} onClick={() => setExpanded(value => !value)} className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ui-radius-control)] px-1 text-xs font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t(expanded ? "showLess" : "showMore", { count: remaining.length })}<ChevronDown aria-hidden="true" className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}/></button></> : null}
    </> : null}
    {active ? focused(active) : null}
    </ProjectWorkspaceMotion>
    <div className={styles.collectionFooter}>
      <ProjectWorkspaceTabs projectId={projectId} backHref={backHref} canViewFinance={canViewFinance} selected={selected}/>
      <div className={styles.collectionActions}>
        {taskCounts(active ? directionData(active).summary : calculateProjectSummary(tasks, undefined, configuration.progressMethods, configuration.stages), projectStatus === "paused" || Boolean(active && directionData(active).status === "paused"))}
        {canManage ? <Button type="button" size="compact" variant="ghost" disabled={pending} className={styles.addDirection} aria-label={t("addShort")} title={t("addShort")} onClick={() => setEditor("new")}><Plus aria-hidden="true" className="size-4"/><span className={styles.addDirectionLabel}>{t("addShort")}</span></Button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-text)]">{error}</p> : null}
    {editor ? <WorkDirectionEditor key={`${editor === "new" ? "new" : editor.id}-${configuration.version}`} projectId={projectId} version={configuration.version} direction={editor === "new" ? undefined : directions.find(item => item.id === editor.id) ?? editor} templates={templates} presets={presets} onClose={() => setEditor(null)} onSaved={id => { const creating = editor === "new"; setEditor(null); if (creating) { onNavigatingChange?.(true); router.push(projectWorkspaceHref(projectId, "board", id, backHref), { scroll: false }); } }}/>: null}
  </section>;
}

function isWide() { return window.matchMedia("(min-width: 640px)").matches; }
function subscribeWidth(onChange: () => void) {
  const query = window.matchMedia("(min-width: 640px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
