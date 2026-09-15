"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

export const LazyProjectForm = dynamic(
  () => import("@/components/projects/project-form").then((module) => module.ProjectForm),
  { loading: ProjectFormLoading },
);

function ProjectFormLoading() {
  const t = useTranslations("Common");
  return <p className="p-4 text-sm text-[var(--ui-text-muted)] sm:p-6" role="status">{t("loading")}</p>;
}
