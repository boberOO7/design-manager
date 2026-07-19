import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
