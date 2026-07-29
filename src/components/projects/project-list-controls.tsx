"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PROJECT_LIST_HEALTH_FILTERS, PROJECT_LIST_LIFECYCLE_FILTERS, PROJECT_LIST_PRIORITY_FILTERS, PROJECT_LIST_SORTS, type ProjectListFilters } from "@/lib/project-list-presentation";

const labels = {
  lifecycle: { all: "All lifecycles", planned: "Planned", active: "Active", paused: "Paused", completed: "Completed" },
  health: { all: "All health", overdue: "Overdue", needs_attention: "Needs attention", deadline_soon: "Deadline soon", on_track: "On track", completed: "Completed" },
  priority: { all: "All priorities", urgent: "Urgent", high: "High", normal: "Normal", low: "Low" },
  sort: { operational: "Operational priority", deadline: "Deadline", name: "Name", health: "Health", progress: "Progress" },
} as const;

export function ProjectListControls({ filters }: { filters: ProjectListFilters }) {
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
    <FilterSelect label="Lifecycle" value={filters.lifecycle} options={PROJECT_LIST_LIFECYCLE_FILTERS} labels={labels.lifecycle} onChange={(value) => update("lifecycle", value)} />
    <FilterSelect label="Health" value={filters.health} options={PROJECT_LIST_HEALTH_FILTERS} labels={labels.health} onChange={(value) => update("health", value)} />
    <FilterSelect label="Priority" value={filters.priority} options={PROJECT_LIST_PRIORITY_FILTERS} labels={labels.priority} onChange={(value) => update("priority", value)} />
    <FilterSelect label="Sort by" value={filters.sort} options={PROJECT_LIST_SORTS} labels={labels.sort} onChange={(value) => update("sort", value)} />
    {(filters.lifecycle !== "all" || filters.health !== "all" || filters.priority !== "all" || filters.sort !== "operational") ? <Button type="button" variant="ghost" onClick={reset}>Reset filters</Button> : null}
  </div>;
}

function FilterSelect<T extends string>({ label, labels: optionLabels, onChange, options, value }: { label: string; labels: Record<T, string>; onChange: (value: string) => void; options: readonly T[]; value: T }) {
  return <label className="grid min-w-32 gap-1 text-xs font-medium text-[var(--ui-text-secondary)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm font-medium text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{options.map((option) => <option key={option} value={option}>{optionLabels[option]}</option>)}</select></label>;
}
