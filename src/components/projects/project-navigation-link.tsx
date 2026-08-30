import Link from "next/link";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectNavigationLink({ href, label, name, className }: { href: string; label: string; name: string; className?: string }) {
  return <Link href={href} aria-label={`${label}: ${name}`} className={cn("group flex min-h-12 w-full items-center gap-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2", className)}>
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-surface)] text-[var(--ui-text-secondary)]"><FolderKanban className="size-4" strokeWidth={1.8} /></span>
    <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-[var(--ui-text-muted)]">{label}</span><span className="block truncate font-semibold text-[var(--ui-text)]">{name}</span></span>
    <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.8} />
  </Link>;
}
