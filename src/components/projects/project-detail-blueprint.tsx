import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProjectStageConfiguration } from "@/data/queries/project-stage-columns";
import { DEFAULT_STAGE_COLUMN_STATUSES } from "@/lib/task-workflow";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import directions from "./work-directions.module.css";
import context from "./project-context-band.module.css";
import type { getProjectById } from "@/data/queries/project-by-id";
import { ProjectFinanceBlueprint } from "@/components/finance/project-finance-loading";
import type { ProjectFinanceTab } from "@/lib/finance-project-view";
import { TASK_STAGES } from "@/lib/task-stages";

function LoadingScope({ children, name, className = "", navigation }: { children: ReactNode; name: string; className?: string; navigation?: ReactNode }) {
  const t = useTranslations("Common");
  return <div data-project-loading={name} className={`instaload-blueprint ${className}`}><span role="status" className="sr-only">{t("loading")}</span>{navigation}<div aria-hidden="true">{children}</div></div>;
}

function Ink({ className }: { className: string }) {
  return <span className={`instaload-mark max-w-full ${className}`}/>;
}

export function ProjectContextBlueprint({ project, backHref = "/projects", configuration, canManage = true }: {
  backHref?: string; project?: NonNullable<Awaited<ReturnType<typeof getProjectById>>>;
  configuration?: ProjectStageConfiguration; canManage?: boolean;
}) {
  const t = useTranslations("Projects");
  const workspace = useTranslations("Workspace");
  const count = configuration?.directions?.length ?? 2;
  const showProgress = configuration?.showProgress ?? true;
  return <LoadingScope name="context" className={context.sheet} navigation={<div className={context.toolbar}>
    <Link href={backHref} className="inline-flex min-h-10 min-w-9 items-center justify-center gap-1.5 rounded-[var(--ui-radius-control)] text-sm font-medium text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft aria-hidden="true" className="size-4"/><span>{workspace("backToProjects")}</span></Link>
    {canManage ? <div aria-hidden="true" className={context.actions}><Ink className="size-9"/><Ink className="size-9"/></div> : null}
  </div>}>
    {project?.status === "paused" && !project.archived_at ? <div className={context.paused}><Ink className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold text-transparent">{t("pausedBannerTitle")}</p><p className="mt-0.5 leading-5 text-transparent">{t("pausedBannerDescription")}</p></div></div> : null}
    <div className={context.identity}>
      <div className={context.heading}>{project ? <span className={`${context.title} instaload-mark max-w-full text-transparent`}>{project.name}</span> : <span className={`${context.title} instaload-mark h-[1.2em] w-72 max-w-full`}/>}<div className={context.statuses}><Ink className="h-4 w-20"/><Ink className="h-6 w-28"/></div></div>
      <div className={context.identityFooter}><div className={context.metadata}>{["w-24", "w-12", "w-36", "w-32"].map(width => <Ink key={width} className={`h-5 ${width}`}/>)}</div><div className={context.projectActions}>{Array.from({ length: canManage ? 3 : 2 }, (_, i) => <div key={i} className={context.projectAction}><Ink className={`h-4 ${i === 2 ? "w-32" : "w-20"}`}/></div>)}</div></div>
    </div>
    <div className={directions.collection}>
      <div className={directions.list}>{Array.from({ length: count }, (_, i) => <div key={i} className={directions.item}>
        <div className={directions.entry}>
          <div className={directions.entrySummary}><div className={directions.focusHeading}><Ink className="size-[38px] shrink-0"/><div className="grid min-w-0 gap-0.5"><Ink className="h-5 w-28"/><Ink className="h-[18px] w-20"/></div></div><div className={directions.areaMetrics}>{[0, 1].map(metric => <div key={metric}><Ink className="h-[17px] w-24"/><Ink className="mt-1 h-6 w-20"/></div>)}</div></div>
          <div className={directions.entryFooter}><Ink className="h-[18px] w-28"/>{showProgress ? <Ink className="h-5 w-10"/> : null}</div>
          {showProgress ? <Ink className="h-[3px] w-full"/> : null}
        </div><div className={directions.directionActions}><Ink className="size-8"/></div>
      </div>)}</div>
      <div className={directions.collectionFooter}><div className={directions.workspaceTabs}>{[0, 1].map(i => <div key={i} className={directions.workspaceTab}><Ink className={`h-5 ${i ? "w-16" : "w-28"}`}/></div>)}</div><div className={directions.collectionActions}><Ink className="h-4 w-64"/>{canManage ? <Ink className="h-8 w-32"/> : null}</div></div>
    </div>
  </LoadingScope>;
}

export function ProjectOverviewBlueprint({ canManage = true }: { canManage?: boolean }) {
  return <LoadingScope name="details" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)]">
    <Ink className="h-6 w-44"/>
    <div className="mt-4 grid gap-5 md:grid-cols-2">{Array.from({ length: 7 }, (_, i) => <div key={i}><Ink className="h-5 w-24"/><Ink className="mt-1 h-5 w-36"/></div>)}</div>
    <div className="mt-5 grid gap-5 border-t border-[var(--ui-border)] pt-5 md:grid-cols-2">{[0, 1].map(column => <div key={column}><Ink className="h-5 w-16"/><div className="mt-3 space-y-4">{[0, 1].map(row => <div key={row}><Ink className="h-5 w-40"/>{canManage && column === 1 && row === 0 ? <div className="mt-2 flex flex-wrap items-start gap-2"><Ink className="h-11 w-full sm:w-52"/><Ink className="h-10 w-36"/></div> : <Ink className="mt-1 h-5 w-36"/>}</div>)}</div></div>)}</div>
  </LoadingScope>;
}

export function ProjectBoardBlueprint({ configuration, directionId }: { configuration?: ProjectStageConfiguration; directionId?: string | null }) {
  const stages = configuration ? configuration.stages.filter(stage => stage.isEnabled && (!directionId || stage.directionId === directionId)).map(stage => stage.stage) : TASK_STAGES;
  return <LoadingScope name="board"><div className="mb-4 flex min-h-10 items-center justify-between gap-4"><div className="space-y-1"><span className="instaload-mark h-5 w-28" />{!directionId ? <span className="instaload-mark h-5 w-80 max-w-full"/> : null}</div><span className="instaload-mark h-9 w-28" /></div><div className="space-y-3">{stages.map((stage, index) => <section key={stage} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface-muted)]"><div className="flex min-h-12 items-center justify-between gap-2 px-4"><span className="instaload-mark h-5 w-36" /><span className="instaload-mark h-6 w-24" /></div>{index === 0 ? <div className="overflow-x-auto border-t border-t-transparent p-3"><div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${(configuration?.columns[stage] ?? DEFAULT_STAGE_COLUMN_STATUSES).length}, minmax(12rem, 1fr))` }}>{(configuration?.columns[stage] ?? DEFAULT_STAGE_COLUMN_STATUSES).map(column => <div key={column} className="min-h-72 rounded-xl border border-[var(--ui-border)] p-3"><span className="instaload-mark mb-2 h-11 w-full" /><div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3"><span className="instaload-mark h-4 w-3/4" /><span className="instaload-mark mt-3 h-3 w-1/2" /></div></div>)}</div></div> : null}</section>)}</div></LoadingScope>;
}

export function ProjectSectionBlueprint({ view, financeTab, direction, financeNavigation, stream }: { financeNavigation?: ReactNode; stream?: string; view: "details" | "team" | "activity" | "finance" | "feedback"; financeTab?: ProjectFinanceTab; direction?: boolean }) {
  if (view === "details" && direction) return <LoadingScope name="details" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><span className="instaload-mark h-6 w-44"/><span className="instaload-mark h-9 w-28"/></div><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-3">{Array.from({ length: 7 }, (_, i) => <div key={i}><span className="instaload-mark h-4 w-24"/><span className="instaload-mark mt-1 h-5 w-36 max-w-full"/></div>)}</div><div className="mt-5 border-t border-[var(--ui-border)] pt-3"><span className="instaload-mark h-5 w-96 max-w-full"/></div></LoadingScope>;
  if (view === "activity") return <LoadingScope name="activity" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]"><div className="border-b border-[var(--ui-border)] px-4 py-4 sm:px-5"><span className="instaload-mark h-7 w-44"/><span className="instaload-mark mt-1 h-5 w-72 max-w-full"/></div><div className="px-4 py-4 sm:px-5"><span className="instaload-mark mb-3 h-4 w-24"/><div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="flex gap-3"><span className="instaload-mark size-9 shrink-0 rounded-full"/><div className="min-w-0 flex-1"><span className="instaload-mark h-5 w-64 max-w-full"/><span className="instaload-mark mt-1 h-4 w-40 max-w-full"/></div><span className="instaload-mark h-4 w-16"/></div>)}</div></div></LoadingScope>;
  if (view === "feedback") return <LoadingScope name="feedback" className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 sm:p-6"><div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="instaload-mark h-7 w-44"/><span className="instaload-mark mt-1 h-5 w-80 max-w-full"/></div><span className="instaload-mark h-11 w-36"/><span className="instaload-mark h-11 w-36"/></div><div className="border-y border-[var(--ui-border)] py-5"><span className="instaload-mark mb-2 h-5 w-32"/><div className="flex flex-wrap gap-3"><span className="instaload-mark h-11 w-44"/><span className="instaload-mark h-11 w-40"/></div><span className="instaload-mark mt-3 h-4 w-96 max-w-full"/></div><div className="py-5"><span className="instaload-mark h-5 w-64 max-w-full"/><span className="instaload-mark mt-2 h-4 w-40"/></div></div></LoadingScope>;
  if (view === "details") return <ProjectOverviewBlueprint/>;
  if (view === "finance") return <ProjectFinanceBlueprint tab={financeTab} direction={direction} navigation={financeNavigation} stream={stream}/>;
  return <LoadingScope name={view} className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 shadow-[var(--ui-shadow-panel)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="instaload-mark h-7 w-44"/><span className="instaload-mark mt-1 h-5 w-72 max-w-full"/></div><span className="instaload-mark h-11 w-40"/></div><div className="mt-5">{[0, 1, 2].map(i => <div key={i} className="flex items-center gap-3 border-b border-[var(--ui-border-subtle)] py-4 last:border-0"><span className="instaload-mark size-10 shrink-0 rounded-full" /><div className="min-w-0 flex-1 space-y-2"><span className="instaload-mark h-5 w-40 max-w-full" /><span className="instaload-mark h-4 w-64 max-w-full" /></div><span className="instaload-mark h-5 w-20" /></div>)}</div></LoadingScope>;
}

