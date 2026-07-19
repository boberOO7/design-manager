import { cn } from "@/lib/utils";

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
    <div className={cn("rounded-2xl border border-stone-200 bg-white p-5 shadow-sm", className)}>
      <p className="text-sm font-medium text-stone-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-stone-900">{value}</p>
      {hint ? <p className="mt-2 text-sm text-stone-500">{hint}</p> : null}
    </div>
  );
}
