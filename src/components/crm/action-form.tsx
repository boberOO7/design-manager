"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { CrmActionState } from "@/lib/validation/crm";

type Action = (state: CrmActionState, formData: FormData) => Promise<CrmActionState>;

export function CrmActionForm({ action, cancelLabel, children, onCancel, onSuccess, submitLabel }: {
  action: Action;
  cancelLabel?: string;
  children: (state: CrmActionState) => React.ReactNode;
  onCancel?: () => void;
  onSuccess?: () => void;
  submitLabel: string;
}) {
  const t = useTranslations("Crm");
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [onSuccess, state.success]);
  return <form action={formAction} autoComplete="off" className="contents" noValidate>
    <div className="grid gap-4">{children(state)}</div>
    {state.error ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.error}</p> : null}
    <div className="mt-6 flex justify-end gap-2 border-t border-[var(--ui-border)] pt-4">
      {onCancel && cancelLabel ? <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{cancelLabel}</Button> : null}
      <Button type="submit" disabled={pending}>{pending ? t("saving") : submitLabel}</Button>
    </div>
  </form>;
}
