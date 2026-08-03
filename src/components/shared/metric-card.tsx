import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";

export function MetricCard({
  title,
  value,
  hint,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Panel className={cn("p-5", className)}>
      <p className="text-sm font-medium text-[var(--ui-text-muted)]">{title}</p>
      <p className="ui-numeric mt-3 text-2xl font-semibold text-[var(--ui-text)]">{value}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{hint}</p> : null}
    </Panel>
  );
}
