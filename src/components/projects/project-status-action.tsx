"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

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
  pendingLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  confirmMessage?: string;
  label: string;
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
      <SubmitButton label={label} pendingLabel={pendingLabel} />
    </form>
  );
}
