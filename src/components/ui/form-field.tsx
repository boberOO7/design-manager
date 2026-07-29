import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputClassName = "h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] outline-none transition-colors focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60";
export const textareaClassName = "w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm leading-6 text-[var(--ui-text)] outline-none transition-colors focus:border-[var(--ui-focus)] focus:ring-2 focus:ring-stone-200 disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:opacity-60";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(textareaClassName, className)} {...props} />;
}

export function FormField({ children, className, error, label, optional = false }: { children: ReactNode; className?: string; error?: string; label: ReactNode; optional?: boolean }) {
  return <label className={cn("grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]", className)}>
    <span>{label}{optional ? <span className="ml-1 font-normal text-[var(--ui-text-muted)]">(optional)</span> : null}</span>
    {children}
    {error ? <span className="text-sm text-red-700">{error}</span> : null}
  </label>;
}
