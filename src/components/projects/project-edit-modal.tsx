"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ProjectFormModal } from "@/components/projects/project-form-modal";
import type { ProjectFormAction, ProjectFormDefaults } from "@/components/projects/project-form";

export function ProjectEditModal({ action, defaultValues, projectName }: {
  action: ProjectFormAction;
  defaultValues: ProjectFormDefaults;
  projectName: string;
}) {
  const t = useTranslations("Projects");
  const form = useTranslations("ProjectForm");
  const workspace = useTranslations("ProjectWorkspace");
  const router = useRouter();

  return <ProjectFormModal
    action={action}
    closeLabel={form("cancel")}
    defaultValues={defaultValues}
    description={t("editProjectDescription", { projectName })}
    discardMessage={form("discardChanges")}
    mode="edit"
    onSuccess={() => router.refresh()}
    title={t("editProject")}
    triggerLabel={workspace("edit")}
    triggerSize="sm"
    triggerVariant="outline"
  />;
}
