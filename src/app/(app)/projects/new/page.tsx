import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/project-form";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getTranslations } from "next-intl/server";
import { createProject } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("newProjectMetadata") };
}

export default async function NewProjectPage() {
  const [membership, t] = await Promise.all([
    getActiveStudioMembership(),
    getTranslations("Projects"),
  ]);

  if (membership?.system_role !== "admin") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("newProject")} description={t("newProjectDescription")} />
      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-6 shadow-sm lg:p-8">
        <ProjectForm action={createProject} cancelHref="/projects" mode="create" />
      </div>
    </div>
  );
}
