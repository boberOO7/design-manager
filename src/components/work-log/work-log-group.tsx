"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { allocateReviewMinutes, parseWorkLogDuration, workLogRowKey, type groupWorkLogRows, type WorkLogRow } from "@/lib/work-log";
import { Tooltip } from "@/components/ui/tooltip";

export function WorkLogGroup({ group, disabled, onChange, onRemove, onAllocate }: {
  group: ReturnType<typeof groupWorkLogRows>[number]; disabled: boolean;
  onChange: (key: string, minutes: number) => void; onRemove: (key: string) => void;
  onAllocate: (rows: WorkLogRow[]) => void;
}) {
  const t = useTranslations("WorkLog");
  const stages = useTranslations("TaskStages");
  const locale = useLocale();
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [partial, setPartial] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [invalid, setInvalid] = useState(false);
  const isReview = group.rows[0]?.activity_kind === "review";
  const selected = partial ? group.rows.filter(row => selectedKeys.includes(workLogRowKey(row))) : group.rows;
  const selectedMinutes = selected.reduce((sum, row) => sum + row.minutes, 0);
  const formatTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const stageName = group.stage ? group.stageName ?? stages(group.stage) : null;

  function commit(value: string) {
    if (disabled) return;
    const minutes = parseWorkLogDuration(value);
    if (minutes === null) { setInvalid(true); return; }
    setInvalid(false);
    if (minutes === selectedMinutes) return;
    const keys = selected.map(workLogRowKey);
    let result = allocateReviewMinutes(group.rows, keys, minutes);
    if (result.status === "confirmationRequired") {
      if (!window.confirm(t("confirmRedistribute", { count: selected.filter(row => row.minutes > 0).length, duration: formatTime(minutes) }))) return;
      result = allocateReviewMinutes(group.rows, keys, minutes, true);
    }
    if (result.status === "applied") onAllocate(result.rows);
  }

  function select(keys: string[]) { setSelectedKeys(keys); setInvalid(false); }

  function renderRow(row: WorkLogRow) {
    const key = workLogRowKey(row);
    const activity = `${isReview ? t("reviewRound", { number: row.roundNumber ?? "?" }) + ": " : ""}${row.title ?? t("unavailableTask")}`;
    return <li key={key} data-work-log-row={key} className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 py-3 sm:gap-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {isReview && partial && group.rows.length > 1 ? <input type="checkbox" aria-label={t("selectReview", { activity })} className="size-4 shrink-0 accent-[var(--ui-action-primary)]"
          disabled={disabled} checked={selectedKeys.includes(key)} onChange={event => select(event.target.checked ? [...selectedKeys, key] : selectedKeys.filter(value => value !== key))} /> : null}
        <div className="min-w-0 flex-1 space-y-1">
          <Tooltip content={row.title ?? t("unavailableTask")}><p className="line-clamp-2 text-sm font-medium" tabIndex={0}>{row.title ?? t("unavailableTask")}</p></Tooltip>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ui-text-muted)]">
            {isReview ? <span className="shrink-0 rounded bg-[var(--ui-info-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ui-info-text)]">{t("reviewRound", { number: row.roundNumber ?? "?" })}</span> : null}
            <span className="truncate">{row.projectName}{stageName ? ` · ${stageName}` : ""}</span>
          </div>
        </div>
      </div>
      <TimePicker mode="duration" locale={locale} className={`w-28 shrink-0 gap-2 tabular-nums ${row.minutes === 0 ? "text-[var(--ui-text-muted)] [&>span]:font-normal" : ""}`} disabled={disabled} data-work-log-duration
        value={formatTime(row.minutes)} aria-label={t("durationFor", { activity })}
        onValueChange={value => { const [hours, minutes] = value.split(":").map(Number); setInvalid(false); onChange(key, hours * 60 + minutes); }} />
      <button type="button" disabled={disabled} aria-label={t("remove", { activity })}
        className="flex size-8 shrink-0 items-center justify-center rounded text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        onClick={() => { setInvalid(false); onRemove(key); }}><X aria-hidden className="size-4" /></button>
    </li>;
  }

  if (group.rows.length === 1) return <ul data-work-log-singleton>{group.rows.map(renderRow)}</ul>;

  return <div data-work-log-group={group.key} className="border-b border-[var(--ui-border-subtle)] last:border-b-0">
    <div className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-2 py-2.5 sm:gap-3">
      <button type="button" disabled={disabled} aria-expanded={expanded} aria-controls={contentId} data-work-log-group-toggle
        onClick={() => setExpanded(value => !value)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--ui-radius-control)] py-1 text-left text-sm transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <Tooltip content={group.projectName ?? t("unavailableProject")}><span className="block truncate font-medium">{group.projectName ?? t("unavailableProject")}</span></Tooltip>
          {stageName ? <span className="block truncate text-xs text-[var(--ui-text-muted)]">{stageName}</span> : null}
        </span>
        <span className="shrink-0 text-xs text-[var(--ui-text-muted)]">{t("entryCount", { count: group.rows.length })}</span>
      </button>
      <TimePicker mode="duration" locale={locale} value={formatTime(selectedMinutes)} onValueChange={commit}
        disabled={disabled || !isReview || !selected.length}
        className={`w-28 shrink-0 gap-2 tabular-nums ${selectedMinutes === 0 ? "text-[var(--ui-text-muted)] [&>span]:font-normal" : ""} ${invalid ? "border-[var(--ui-danger-text)]" : ""}`}
        data-work-log-group-duration
        aria-label={t(partial ? "selectedGroupDuration" : "groupDuration", { project: group.projectName ?? t("unavailableProject"), stage: stageName ?? "" })}
        aria-describedby={partial ? `${contentId}-scope` : undefined} aria-invalid={invalid || undefined}
        tooltip={!isReview ? t("taskGroupDuration") : undefined} />
      <span aria-hidden className="size-8" />
    </div>
    {partial ? <p id={`${contentId}-scope`} className="pb-2 text-right text-xs text-[var(--ui-text-muted)]">{t("selectionScope", { count: selected.length, total: group.rows.length })} · {t("groupTotal", { duration: formatTime(group.minutes) })}</p> : null}
    {invalid ? <p role="alert" className="pb-2 text-xs text-[var(--ui-danger-text)]">{t("groupDurationInvalid")}</p> : null}
    <div id={contentId} aria-hidden={!expanded} inert={!expanded}
      className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="min-h-0 overflow-hidden">
        {isReview ? <div className="flex flex-wrap items-center gap-1 text-xs">
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-pressed={partial}
            onClick={() => { select(group.rows.map(workLogRowKey)); setPartial(value => !value); }}>{t(partial ? "allReviews" : "selectPart")}</Button>
          {partial ? <>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => select(group.rows.map(workLogRowKey))}>{t("selectAll")}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => select([])}>{t("deselectAll")}</Button>
          </> : null}
        </div> : null}
        <ul className="divide-y divide-[var(--ui-border-subtle)]">{group.rows.map(renderRow)}</ul>
      </div>
    </div>
  </div>;
}
