import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ShellControlProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Shared compact control treatment for persistent shell actions. */
export const ShellControl = forwardRef<HTMLButtonElement, ShellControlProps>(function ShellControl(
  { className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)] transition-colors duration-200 ease-out hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-focus-offset)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

ShellControl.displayName = "ShellControl";
