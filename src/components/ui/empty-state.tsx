import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ action, className, compact = false, description, title }: { action?: ReactNode; className?: string; compact?: boolean; description?: string; title: string }) {
  return <div className={cn("rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] px-4 text-center", compact ? "py-4" : "py-6", className)}>
    <p className="text-sm font-semibold text-[var(--ui-text)]">{title}</p>
    {description ? <p className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>;
}
