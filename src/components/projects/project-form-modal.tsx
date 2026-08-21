"use client";

import { useRef, useState } from "react";
import { ProjectForm, type ProjectFormAction, type ProjectFormDefaults } from "@/components/projects/project-form";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { getProjectDialogCloseIntent } from "@/lib/project-dialog";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import type { ProjectTemplate } from "@/lib/project-templates";

export function ProjectFormModal({
  action,
  closeLabel,
  defaultValues,
  description,
  discardMessage,
  mode,
  onSuccess,
  title,
  triggerLabel,
  triggerSize,
  triggerVariant,
  members = [],
  templates = [],
}: {
  action: ProjectFormAction;
  closeLabel: string;
  defaultValues: ProjectFormDefaults;
  description: string;
  discardMessage: string;
  mode: "create" | "edit";
  onSuccess: (projectId: string) => void;
  title: string;
  triggerLabel: string;
  triggerSize?: ButtonProps["size"];
  triggerVariant?: ButtonProps["variant"];
  members?: ActiveStudioAssignee[];
  templates?: ProjectTemplate[];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function requestClose(reason: DialogCloseReason) {
    if (isPending) return;
    const intent = getProjectDialogCloseIntent(isDirty, reason);
    if (intent === "ignore") return;
    if (intent === "confirm" && !window.confirm(discardMessage)) return;
    setIsDirty(false);
    setIsOpen(false);
  }

  return <>
    <Button ref={triggerRef} type="button" size={triggerSize} variant={triggerVariant} onClick={() => setIsOpen(true)}>{triggerLabel}</Button>
    <Dialog
      closeDisabled={isPending}
      closeLabel={closeLabel}
      description={description}
      isOpen={isOpen}
      onRequestClose={requestClose}
      returnFocusRef={triggerRef}
      title={title}
    >
      <ProjectForm
        action={action}
        defaultValues={defaultValues}
        layout="modal"
        members={members}
        mode={mode}
        onCancel={() => requestClose("explicit")}
        onDirtyChange={setIsDirty}
        onPendingChange={setIsPending}
        onSuccess={(projectId) => {
          setIsDirty(false);
          setIsPending(false);
          setIsOpen(false);
          onSuccess(projectId);
        }}
        templates={templates}
      />
    </Dialog>
  </>;
}
