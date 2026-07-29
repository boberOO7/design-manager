import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { focusVisibleClassName } from "@/components/ui/form-field";

const buttonVariants = cva(
  `inline-flex items-center justify-center whitespace-nowrap rounded-[var(--ui-radius-control)] text-sm font-semibold transition-colors ${focusVisibleClassName} disabled:pointer-events-none disabled:opacity-60`,
  {
    variants: {
      variant: {
        default: "bg-[var(--ui-action-primary)] text-white hover:bg-stone-800",
        outline: "border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]",
        ghost: "bg-transparent text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
