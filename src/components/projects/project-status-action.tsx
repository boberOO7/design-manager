"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function SubmitButton({ label, menuItem, pendingLabel }: { label: string; menuItem: boolean; pendingLabel: string }) {
  const { pending } = useFormStatus();

  if (menuItem) {
    return <button type="submit" role="menuitem" className="w-full rounded-[var(--ui-radius-control)] px-2.5 py-2 text-left text-sm font-medium text-[var(--ui-danger-text)] transition-colors hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-60" disabled={pending}>{pending ? pendingLabel : label}</button>;
  }

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ProjectStatusAction({
  action,
  confirmMessage,
  label,
  menuItem = false,
  pendingLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  confirmMessage?: string;
  label: string;
  menuItem?: boolean;
  pendingLabel: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton label={label} menuItem={menuItem} pendingLabel={pendingLabel} />
    </form>
  );
}
