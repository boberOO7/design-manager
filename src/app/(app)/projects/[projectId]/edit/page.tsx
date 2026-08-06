import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getProjectById } from "@/data/queries/project-by-id";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("editProjectMetadata") };
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [profile, membership, project] = await Promise.all([
    getCurrentUserProfile(),
    getActiveStudioMembership(),
    getProjectById(projectId),
  ]);

  if (
    !profile ||
    !profile.is_active ||
    profile.system_role !== "admin" ||
    !membership ||
    membership.system_role !== "admin" ||
    membership.authenticatedUserId !== profile.id ||
    !project ||
    project.studio_id !== membership.studio_id ||
    project.status === "archived" ||
    project.status === "completed" ||
    project.archived_at
  ) {
    notFound();
  }

  redirect(`/projects/${project.id}`);
}
