"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createProject } from "@/app/(app)/projects/new/actions";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { getProjectDialogCloseIntent } from "@/lib/project-dialog";

export function ProjectCreationModal({ defaultStartDate }: { defaultStartDate: string }) {
  const t = useTranslations("Projects");
  const formMessages = useTranslations("ProjectForm");
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function requestClose(reason: DialogCloseReason) {
    if (isPending) return;
    const intent = getProjectDialogCloseIntent(isDirty, reason);
    if (intent === "ignore") return;
    if (intent === "confirm") {
      if (!window.confirm(formMessages("discardChanges"))) return;
    }
    setIsDirty(false);
    setIsOpen(false);
  }

  return <>
    <Button ref={triggerRef} type="button" onClick={() => setIsOpen(true)}>{t("newProject")}</Button>
    <Dialog
      closeDisabled={isPending}
      closeLabel={formMessages("close")}
      description={t("newProjectDescription")}
      isOpen={isOpen}
      onRequestClose={requestClose}
      returnFocusRef={triggerRef}
      title={t("newProject")}
    >
      <ProjectForm
        action={createProject}
        defaultValues={{ country_code: "UA", priority: "normal", start_date: defaultStartDate }}
        layout="modal"
        mode="create"
        onCancel={() => requestClose("explicit")}
        onDirtyChange={setIsDirty}
        onPendingChange={setIsPending}
        onSuccess={(projectId) => {
          setIsDirty(false);
          setIsPending(false);
          setIsOpen(false);
          router.push(`/projects/${projectId}`);
        }}
      />
    </Dialog>
  </>;
}
