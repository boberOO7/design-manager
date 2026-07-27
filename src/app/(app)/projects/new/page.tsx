import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = {
  title: "New Project | StudioFlow",
};

export default async function NewProjectPage() {
  const membership = await getActiveStudioMembership();

  if (membership?.system_role !== "admin") {
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
