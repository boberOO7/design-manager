
import { Tooltip } from "@/components/ui/tooltip";export function LifecycleDot({ label, status }: { label: string; status: string }) {
  const className = status === "active" ? "bg-[var(--ui-success-accent)]" : status === "paused" ? "bg-[var(--ui-info-accent)]" : status === "completed" ? "bg-[var(--ui-violet-text)]" : "bg-[var(--ui-text-muted)]";
  return <Tooltip content={label}><span role="img" aria-label={label} tabIndex={0} className={`size-2 shrink-0 rounded-full ${className}`}><span className="sr-only">{label}</span></span></Tooltip>;
}
