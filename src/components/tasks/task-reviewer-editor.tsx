"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { TaskPersonSelect } from "./task-person-select";
import type { ProjectTask } from "@/types/tasks";

export function TaskReviewerEditor({ reviewers, selectedIds, disabled, onChange }: {
  reviewers: Array<Pick<NonNullable<ProjectTask["reviewer"]>, "id" | "full_name"> & Partial<Pick<NonNullable<ProjectTask["reviewer"]>, "avatar_url">>>;
  selectedIds: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("Tasks");
  const available = reviewers.filter((reviewer) => !selectedIds.includes(reviewer.id));
  const buttonClass = "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-40";
  function move(index: number, direction: -1 | 1) {
    const next = [...selectedIds];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return <div className="space-y-2">
    {selectedIds.length ? <ol aria-label={t("reviewSequence")} className="space-y-2">
      {selectedIds.map((id, index) => {
        const name = reviewers.find((reviewer) => reviewer.id === id)?.full_name ?? t("unknown");
        return <li key={id} className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-1 @md:grid-cols-[1.25rem_minmax(0,1fr)_auto]">
          <span className="ui-numeric text-xs text-[var(--ui-text-muted)]">{index + 1}.</span>
          <TaskPersonSelect label={t("reviewSequenceReviewer", { number: index + 1 })} value={id} disabled={disabled} onChange={(reviewerId) => onChange(selectedIds.map((current, position) => position === index ? reviewerId : current))} people={reviewers.filter((reviewer) => reviewer.id === id || !selectedIds.includes(reviewer.id))} />
          <div className="col-start-2 flex justify-end @md:col-start-3">
            <button type="button" className={buttonClass} disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={t("reviewMoveUp", { name })}><ArrowUp aria-hidden="true" className="size-3.5" /></button>
            <button type="button" className={buttonClass} disabled={disabled || index === selectedIds.length - 1} onClick={() => move(index, 1)} aria-label={t("reviewMoveDown", { name })}><ArrowDown aria-hidden="true" className="size-3.5" /></button>
            <button type="button" className={buttonClass} disabled={disabled} onClick={() => onChange(selectedIds.filter((current) => current !== id))} aria-label={t("reviewRemoveReviewer", { name })}><X aria-hidden="true" className="size-3.5" /></button>
          </div>
        </li>;
      })}
    </ol> : null}
    {!selectedIds.length || available.length ? <TaskPersonSelect label={t("reviewAddReviewer")} value="" disabled={disabled} onChange={(reviewerId) => { if (reviewerId) onChange([...selectedIds, reviewerId]); }} emptyLabel={t(selectedIds.length ? "reviewAddReviewer" : "reviewNotRequired")} people={available} /> : null}
  </div>;
}
