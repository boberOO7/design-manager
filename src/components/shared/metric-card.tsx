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
      <p className="text-sm font-medium text-stone-500">{title}</p>
      <p className="ui-numeric mt-3 text-2xl font-semibold text-stone-900">{value}</p>
      {hint ? <p className="mt-2 text-sm text-stone-500">{hint}</p> : null}
    </Panel>
  );
}
