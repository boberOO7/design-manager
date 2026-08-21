"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createProject } from "@/app/(app)/projects/new/actions";
import { ProjectFormModal } from "@/components/projects/project-form-modal";
import type { ActiveStudioAssignee } from "@/data/queries/project-members";
import type { ProjectTemplate } from "@/lib/project-templates";

export function ProjectCreationModal({ defaultStartDate, members, templates }: { defaultStartDate: string; members: ActiveStudioAssignee[]; templates: ProjectTemplate[] }) {
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
    members={members}
    onSuccess={(projectId) => router.push(`/projects/${projectId}`)}
    title={t("newProject")}
    templates={templates}
    triggerLabel={t("newProject")}
  />;
}
