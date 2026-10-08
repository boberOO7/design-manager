import { Check, CornerUpLeft, Pause, Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const icons = { start: Play, pause: Pause, approve: Check, rework: CornerUpLeft };

export function ReviewActionButton({ action, children, className, ...props }: Omit<ButtonProps, "variant" | "size"> & { action: keyof typeof icons }) {
  const Icon = icons[action];
  return <Button type="button" {...props} size="sm" variant="ghost" data-review-action={action}
    className={cn("pointer-events-auto shrink-0 gap-1 px-1.5 text-xs disabled:pointer-events-auto", className)}>
    <Icon aria-hidden className="size-3.5 shrink-0" />{children}
  </Button>;
}
