"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createProject } from "@/app/(app)/projects/new/actions";
import { ProjectFormModal } from "@/components/projects/project-form-modal";

export function ProjectCreationModal({ defaultStartDate }: { defaultStartDate: string }) {
  const t = useTranslations("Projects");
  const formMessages = useTranslations("ProjectForm");
  const router = useRouter();
  return <ProjectFormModal
    action={createProject}
    closeLabel={formMessages("close")}
    defaultValues={{ country_code: "UA", priority: "normal", start_date: defaultStartDate }}
    description={t("newProjectDescription")}
    discardMessage={formMessages("discardChanges")}
    mode="create"
    onSuccess={(projectId) => router.push(`/projects/${projectId}`)}
    title={t("newProject")}
    triggerLabel={t("newProject")}
  />;
}
