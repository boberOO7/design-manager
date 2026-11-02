"use client";

import { directionEquivalentArea, areaComponentsSchema } from "@/lib/work-direction-components";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectTemplate } from "@/lib/project-templates";
import { type DirectionPreset, type ProjectWorkDirection } from "@/lib/work-directions";
import { formatDateOnly, formatNumber } from "@/lib/utils";
import { directionWorkspaceHeaderClass, directionWorkspaceHeadingClass } from "./direction-workspace-layout";
import { WorkDirectionEditor } from "./work-direction-editor";

export function WorkDirectionDetails({ direction, version, templates, presets, canManage }: {
  direction: ProjectWorkDirection; version: number; templates: ProjectTemplate[]; presets: DirectionPreset[]; canManage: boolean;
}) {
  const t = useTranslations("ProjectWorkspace.directions"), status = useTranslations("Status"), locale = useLocale();
  const [editing, setEditing] = useState(false);
  const components = areaComponentsSchema.safeParse(direction.area_components).data ?? [];
  const fields = [
    [t("kind"), direction.kind ? t(`kinds.${direction.kind}`) : t("unknownKind")],
    [t("status"), status(direction.status)],
    [t(areaComponentsSchema.safeParse(direction.area_components).success ? "components.primaryArea" : "area"), `${formatNumber(direction.area_m2, locale)} м²`],
    [t(components.length ? "components.primaryCoefficient" : "coefficient"), formatNumber(direction.complexity_coefficient, locale)],
    [t("equivalent"), `${formatNumber(directionEquivalentArea(direction), locale)} ${t("unitShort")}`],
    [t("startDate"), direction.start_date ? formatDateOnly(direction.start_date, locale) : "—"],
    [t("dueDate"), direction.due_date ? formatDateOnly(direction.due_date, locale) : "—"],
  ];
  return <section className="space-y-4" data-direction-details={direction.id}>
    <div className={directionWorkspaceHeaderClass}><h2 className={directionWorkspaceHeadingClass}>{t("detailsTitle")}</h2>{canManage ? <Button type="button" size="compact" variant="outline" className="gap-2" onClick={() => setEditing(true)}><Pencil aria-hidden="true" className="size-3.5"/>{t("edit")}</Button> : null}</div>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm lg:grid-cols-3">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[var(--ui-text-muted)]">{label}</dt><dd className="ui-numeric mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      {components.length ? <div className="mt-4 space-y-2 border-t border-[var(--ui-border)] pt-3 text-sm">{components.map((item, index) => <div key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span>{item.name}</span><span className="ui-numeric text-xs text-[var(--ui-text-secondary)]">{formatNumber(Number(item.actualArea), locale)} м² × {formatNumber(Number(item.coefficient), locale)} = {formatNumber(Number(item.actualArea) * Number(item.coefficient), locale)} {t("unitShort")}</span></div>)}</div> : null}
      <p className="mt-5 border-t border-[var(--ui-border)] pt-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("historyHelp")}</p>
    </div>
    {editing ? <WorkDirectionEditor key={`${direction.id}-${version}`} projectId={direction.project_id} version={version} direction={direction} templates={templates} presets={presets} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); }}/> : null}
  </section>;
}
