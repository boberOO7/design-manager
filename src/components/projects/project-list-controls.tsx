"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { PROJECT_LIST_HEALTH_FILTERS, PROJECT_LIST_HEALTH_LABEL_KEYS, PROJECT_LIST_LIFECYCLE_FILTERS, PROJECT_LIST_LIFECYCLE_LABEL_KEYS, PROJECT_LIST_PRIORITY_FILTERS, PROJECT_LIST_PRIORITY_LABEL_KEYS, PROJECT_LIST_SORTS, PROJECT_LIST_SORT_LABEL_KEYS, type ProjectListFilters } from "@/lib/project-list-presentation";

export function ProjectListControls({ filters }: { filters: ProjectListFilters }) {
  const t = useTranslations("Projects");
  const priority = useTranslations("Priority");
  const router = useRouter();

  function update(key: keyof ProjectListFilters, value: string) {
    const params = new URLSearchParams();
    const lifecycle = key === "lifecycle" ? value : filters.lifecycle;
    const health = key === "health" ? value : filters.health;
    const priority = key === "priority" ? value : filters.priority;
    const sort = key === "sort" ? value : filters.sort;
    if (lifecycle !== "all") params.set("lifecycle", lifecycle);
    if (health !== "all") params.set("health", health);
    if (priority !== "all") params.set("priority", priority);
    if (sort !== "operational") params.set("sort", sort);
    const query = params.toString();
    router.replace(query ? `/projects?${query}` : "/projects");
  }

  function reset() {
    router.replace("/projects");
  }

  return <div className="flex flex-wrap items-end gap-3 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
    <FilterSelect label={t("lifecycle")} value={filters.lifecycle} options={PROJECT_LIST_LIFECYCLE_FILTERS} getOptionLabel={(option) => t(PROJECT_LIST_LIFECYCLE_LABEL_KEYS[option])} onChange={(value) => update("lifecycle", value)} />
    <FilterSelect label={t("health")} value={filters.health} options={PROJECT_LIST_HEALTH_FILTERS} getOptionLabel={(option) => t(PROJECT_LIST_HEALTH_LABEL_KEYS[option])} onChange={(value) => update("health", value)} />
    <FilterSelect label={t("priority")} value={filters.priority} options={PROJECT_LIST_PRIORITY_FILTERS} getOptionLabel={(option) => option === "all" ? t(PROJECT_LIST_PRIORITY_LABEL_KEYS[option]) : priority(PROJECT_LIST_PRIORITY_LABEL_KEYS[option])} onChange={(value) => update("priority", value)} />
    <FilterSelect label={t("sortBy")} value={filters.sort} options={PROJECT_LIST_SORTS} getOptionLabel={(option) => t(PROJECT_LIST_SORT_LABEL_KEYS[option])} onChange={(value) => update("sort", value)} />
    {(filters.lifecycle !== "all" || filters.health !== "all" || filters.priority !== "all" || filters.sort !== "operational") ? <Button type="button" variant="ghost" onClick={reset}>{t("resetFilters")}</Button> : null}
  </div>;
}

function FilterSelect<T extends string>({ getOptionLabel, label, onChange, options, value }: { getOptionLabel: (option: T) => string; label: string; onChange: (value: string) => void; options: readonly T[]; value: T }) {
  return <label className="grid max-w-full gap-1 text-xs font-medium text-[var(--ui-text-secondary)]">{label}<Select value={value} width="content" onValueChange={onChange} className="font-medium">{options.map((option) => <SelectItem key={option} value={option}>{getOptionLabel(option)}</SelectItem>)}</Select></label>;
}
