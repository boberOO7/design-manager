"use client";

import { useRef, useState, type ReactNode } from "react";
import type { ProjectFormAction, ProjectFormDefaults } from "@/components/projects/project-form";
import { LazyProjectForm as ProjectForm } from "@/components/projects/lazy-project-form";
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
  triggerIcon,
  triggerLeadingIcon,
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
  triggerIcon?: ReactNode;
  triggerLeadingIcon?: ReactNode;
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
    const intent = getProjectDialogCloseIntent(mode, isDirty, reason);
    if (intent === "ignore") return;
    if (intent === "confirm" && !window.confirm(discardMessage)) return;
    setIsDirty(false);
    setIsOpen(false);
  }

  return <>
    <Button ref={triggerRef} type="button" size={triggerSize} variant={triggerVariant} className={triggerIcon ? "size-9 p-0" : triggerLeadingIcon ? "min-h-11 gap-1.5" : undefined} aria-label={triggerIcon ? triggerLabel : undefined} title={triggerIcon ? triggerLabel : undefined} onClick={() => setIsOpen(true)}>{triggerIcon ?? <>{triggerLeadingIcon}{triggerLabel}</>}</Button>
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
