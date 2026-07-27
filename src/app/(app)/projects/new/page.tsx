import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveAdminStudioId, getCurrentUserProfile } from "@/data/queries";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = {
  title: "New Project | StudioFlow",
};

export default async function NewProjectPage() {
  const profile = await getCurrentUserProfile();

  if (!profile || !profile.is_active || profile.system_role !== "admin") {
    notFound();
  }

  const studioId = await getActiveAdminStudioId(profile.id);

  if (!studioId) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New project" description="Create a project for your studio." />
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:p-8">
        <ProjectForm />
      </div>
    </div>
  );
}

