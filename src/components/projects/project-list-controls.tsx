"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { getProjectListFilters, getProjectListHref, hasActiveProjectListFilters, PROJECT_LIST_FILTER_KEYS, PROJECT_LIST_HEALTH_FILTERS, PROJECT_LIST_HEALTH_LABEL_KEYS, PROJECT_LIST_LIFECYCLE_FILTERS, PROJECT_LIST_LIFECYCLE_LABEL_KEYS, PROJECT_LIST_PRIORITY_FILTERS, PROJECT_LIST_PRIORITY_LABEL_KEYS, type ProjectListFilters } from "@/lib/project-list-presentation";

export function updateProjectListFilters(filters: ProjectListFilters) {
  const params = new URLSearchParams(window.location.search);
  for (const key of PROJECT_LIST_FILTER_KEYS) params.delete(key);
  new URLSearchParams(getProjectListHref(filters).split("?")[1]).forEach((value, key) => params.set(key, value));
  window.history.replaceState(null, "", `/projects${params.size ? `?${params}` : ""}${window.location.hash}`);
}

export function resetProjectListFilters() {
  const params = new URLSearchParams(window.location.search);
  for (const key of PROJECT_LIST_FILTER_KEYS) params.delete(key);
  window.history.replaceState(null, "", `/projects${params.size ? `?${params}` : ""}${window.location.hash}`);
}

export function ProjectListControls({ filters }: { filters: ProjectListFilters }) {
  const t = useTranslations("Projects");
  const calendar = useTranslations("Calendar");
  const priority = useTranslations("Priority");

  function update(key: keyof ProjectListFilters, value: string) {
    updateProjectListFilters(getProjectListFilters({ ...filters, [key]: value }));
  }

  return <div className="flex flex-wrap items-end gap-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
    <fieldset className="grid gap-1.5"><legend className="text-xs font-semibold text-[var(--ui-text-secondary)]">{calendar("filters")}</legend><div className="flex flex-wrap items-end gap-3">
      <FilterSelect label={t("lifecycle")} value={filters.lifecycle} options={PROJECT_LIST_LIFECYCLE_FILTERS} getOptionLabel={(option) => t(PROJECT_LIST_LIFECYCLE_LABEL_KEYS[option])} onChange={(value) => update("lifecycle", value)} />
      <FilterSelect label={t("health")} value={filters.health} options={PROJECT_LIST_HEALTH_FILTERS} getOptionLabel={(option) => t(PROJECT_LIST_HEALTH_LABEL_KEYS[option])} onChange={(value) => update("health", value)} />
      <FilterSelect label={t("priority")} value={filters.priority} options={PROJECT_LIST_PRIORITY_FILTERS} getOptionLabel={(option) => option === "all" ? t(PROJECT_LIST_PRIORITY_LABEL_KEYS[option]) : priority(PROJECT_LIST_PRIORITY_LABEL_KEYS[option])} onChange={(value) => update("priority", value)} />
    </div></fieldset>
    {hasActiveProjectListFilters(filters) ? <Button type="button" variant="ghost" onClick={resetProjectListFilters}>{t("resetFilters")}</Button> : null}
  </div>;
}

function FilterSelect<T extends string>({ getOptionLabel, label, onChange, options, value }: { getOptionLabel: (option: T) => string; label: string; onChange: (value: string) => void; options: readonly T[]; value: T }) {
  return <label className="grid max-w-full gap-1 text-xs font-medium text-[var(--ui-text-secondary)]">{label}<Select value={value} width="content" onValueChange={onChange} className="font-medium">{options.map((option) => <SelectItem key={option} value={option}>{getOptionLabel(option)}</SelectItem>)}</Select></label>;
}
