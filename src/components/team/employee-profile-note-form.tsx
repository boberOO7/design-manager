"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { addEmployeeProfileNote } from "@/app/(app)/team/[userId]/actions";

export function EmployeeProfileNoteForm({ userId, currentMonth }: { userId: string; currentMonth: string }) {
  const t = useTranslations("EmployeeProfile");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setIsOpen(false);
    setError(false);
    formRef.current?.reset();
    triggerRef.current?.focus();
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="employee-notes-heading" className="text-lg font-semibold">{t("internalNotes")}</h2><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("notesPrivacy")}</p></div>
      <Button ref={triggerRef} aria-expanded={isOpen} aria-controls="employee-note-composer" className="gap-2" onClick={() => { setIsOpen(true); setSaved(false); requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[name="reviewMonth"]')?.focus()); }} variant="outline"><Plus className="size-4" aria-hidden="true" />{t("addNote")}</Button>
    </div>
    <div id="employee-note-composer" className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
      <div className="min-h-0 overflow-hidden">
        <form ref={formRef} inert={!isOpen} aria-hidden={!isOpen} className="mt-4 space-y-4 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 sm:p-5" onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          const input = new FormData(event.currentTarget);
          setError(false);
          startTransition(async () => {
            try {
              const result = await addEmployeeProfileNote(input);
              if (!result.success) { setError(true); return; }
              close();
              setSaved(true);
            } catch { setError(true); }
          });
        }}>
          <input type="hidden" name="employeeId" value={userId} />
          <FormField label={t("reviewMonth")} className="w-full sm:w-56"><Input type="month" name="reviewMonth" defaultValue={currentMonth} required disabled={isPending} /></FormField>
          <FormField label={t("note")}><Textarea name="note" rows={4} placeholder={t("notePrompt")} required disabled={isPending} /></FormField>
          {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("noteFailed")}</p> : null}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={isPending} aria-busy={isPending} className="gap-2">{isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{t("saveNote")}</Button><Button type="button" variant="ghost" disabled={isPending} onClick={close}>{t("cancel")}</Button></div>
        </form>
      </div>
    </div>
    {saved ? <p role="status" className="mt-3 text-sm text-[var(--ui-text-muted)]">{t("noteSaved")}</p> : null}
  </div>;
}
