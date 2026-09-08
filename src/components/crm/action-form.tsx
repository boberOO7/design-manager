"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { CrmActionState } from "@/lib/validation/crm";

type Action = (state: CrmActionState, formData: FormData) => Promise<CrmActionState>;

export function CrmActionForm({ action, children, onSuccess, submitLabel }: {
  action: Action;
  children: (state: CrmActionState) => React.ReactNode;
  onSuccess?: () => void;
  submitLabel: string;
}) {
  const t = useTranslations("Crm");
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [onSuccess, state.success]);
  return <form action={formAction} className="contents">
    <div className="grid gap-4">{children(state)}</div>
    {state.error ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.error}</p> : null}
    <div className="mt-6 flex justify-end border-t border-[var(--ui-border)] pt-4">
      <Button type="submit" disabled={pending}>{pending ? t("saving") : submitLabel}</Button>
    </div>
  </form>;
}
