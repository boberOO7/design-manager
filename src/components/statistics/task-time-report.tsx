"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectItem } from "@/components/ui/select";
import { formatStatisticsDuration } from "@/lib/statistics";
import { filterTaskWorkStatistics, type buildWorkStatistics } from "@/lib/work-log";

export function TaskTimeReport({ report }: { report: ReturnType<typeof buildWorkStatistics> }) {
  const t = useTranslations("Statistics");
  const [projectId, setProjectId] = useState("");
  const [directionId, setDirectionId] = useState("");
  const [stage, setStage] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [ascending, setAscending] = useState(false);
  const tasks = report.tasks;
  const projectTasks = tasks.filter(task => !projectId || task.project_id === projectId);
  const directionTasks = projectTasks.filter(task => !directionId || task.directionId === directionId);
  const projects = [...new Map(tasks.map(task => [task.project_id, { id: task.project_id, name: task.projectName ?? t("unavailableProject") }])).values()];
  const directions = [...new Map(projectTasks.flatMap(task => task.directionId && task.directionName ? [[task.directionId, { id: task.directionId, name: task.directionName }] as const] : [])).values()];
  const stages = [...new Map(directionTasks.map(task => [`${task.project_id}:${task.stage}`, { id: `${task.project_id}:${task.stage}`, name: `${task.projectName ?? t("unavailableProject")} · ${task.stageName}` }])).values()];
  const employeeIds = new Set(tasks.flatMap(task => task.employees.map(person => person.id)));
  const employees = report.employees.filter(person => employeeIds.has(person.id)).map(person => ({ id: person.id, name: person.name || t("formerEmployee") }));
  const rows = filterTaskWorkStatistics(tasks, { projectId, directionId, stage, employeeId }, ascending);
  const filter = (label: string, value: string, onChange: (value: string) => void, options: { id: string; name: string }[]) => <Select aria-label={label} value={value} onValueChange={onChange} size="compact" searchPlaceholder={t("taskTimeSearch")} searchEmptyMessage={t("taskTimeEmpty")}>
    <SelectItem value="">{label}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
  </Select>;
  return <div id="stats-work-tasks" role="region" aria-label={t("workByTasks")}>
    <div className="grid grid-cols-1 gap-2 border-t border-[var(--ui-border-subtle)] px-5 py-3 sm:grid-cols-2 xl:grid-cols-4">
      {filter(t("taskTimeAllProjects"), projectId, value => { setProjectId(value); setDirectionId(""); setStage(""); }, projects)}
      {filter(t("taskTimeAllDirections"), directionId, value => { setDirectionId(value); setStage(""); }, directions)}
      {filter(t("taskTimeAllStages"), stage, setStage, stages)}
      {filter(t("taskTimeAllEmployees"), employeeId, setEmployeeId, employees)}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-y border-[var(--ui-border-subtle)] text-[var(--ui-text-muted)]"><tr>
          <th scope="col" className="px-5 py-3 font-medium">{t("taskTimeTask")}</th>
          <th scope="col" className="px-5 py-3 font-medium">{t("taskTimeProject")}</th>
          <th scope="col" className="px-5 py-3 text-right font-medium">{t("taskWork")}</th>
          <th scope="col" className="px-5 py-3 text-right font-medium">{t("reviewWork")}</th>
          <th scope="col" aria-sort={ascending ? "ascending" : "descending"} className="px-5 py-2 text-right font-medium"><button type="button" onClick={() => setAscending(value => !value)} className="inline-flex min-h-9 items-center justify-end gap-1 whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("taskTimeTotal")}{ascending ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />}</button></th>
          <th scope="col" className="px-5 py-3 text-right font-medium">{t("taskTimeEmployees")}</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--ui-border-subtle)]">{rows.map(task => <tr key={task.id}>
          <th scope="row" className="min-w-44 px-5 py-3 font-medium"><Link href={`/projects/${task.project_id}?task=${task.id}`} className="rounded text-[var(--ui-text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{task.title}</Link><p className="mt-1 text-[10px] font-normal text-[var(--ui-text-muted)]">{task.stageName}</p></th>
          <td className="min-w-36 px-5 py-3 text-[var(--ui-text-secondary)]">{task.projectName ?? t("unavailableProject")}{task.directionName ? <p className="mt-1 text-[10px] text-[var(--ui-text-muted)]">{task.directionName}</p> : null}</td>
          <td className={`whitespace-nowrap px-5 py-3 text-right tabular-nums ${task.taskMinutes ? "text-[var(--ui-text-secondary)]" : "text-[var(--ui-text-muted)]"}`}>{formatStatisticsDuration(task.taskMinutes / 60)} <span className="text-[var(--ui-text-muted)]">{t("durationUnit")}</span></td>
          <td className={`whitespace-nowrap px-5 py-3 text-right tabular-nums ${task.reviewMinutes ? "text-[var(--ui-success-text)]" : "text-[var(--ui-text-muted)]"}`}>{formatStatisticsDuration(task.reviewMinutes / 60)} <span className="text-[var(--ui-text-muted)]">{t("durationUnit")}</span></td>
          <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-[var(--ui-text)]">{formatStatisticsDuration(task.totalMinutes / 60)} <span className="font-normal text-[var(--ui-text-muted)]">{t("durationUnit")}</span></td>
          <td className="px-5 py-3 text-right tabular-nums text-[var(--ui-text-secondary)]">{task.employees.length}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length ? <p className="px-5 py-4 text-xs text-[var(--ui-text-muted)]">{t("taskTimeEmpty")}</p> : null}
  </div>;
}
