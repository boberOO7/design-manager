import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const focusVisibleClassName = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2";
export const inputClassName = `h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] transition-colors focus-visible:border-[var(--ui-focus)] ${focusVisibleClassName} disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60`;
export const textareaClassName = `w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm leading-6 text-[var(--ui-text)] transition-colors focus-visible:border-[var(--ui-focus)] ${focusVisibleClassName} disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60`;

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...props} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(textareaClassName, className)} {...props} />;
  },
);

export function FormField({ children, className, error, label, optional = false, as = "label" }: { as?: "div" | "label"; children: ReactNode; className?: string; error?: string; label: ReactNode; optional?: boolean }) {
  const Tag = as;
  return <Tag className={cn("grid self-start gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]", className)}>
    <span>{label}{optional ? <span className="ml-1 font-normal text-[var(--ui-text-muted)]">(optional)</span> : null}</span>
    {children}
    {error ? <span className="text-sm text-[var(--ui-danger-text)]">{error}</span> : null}
  </Tag>;
}
