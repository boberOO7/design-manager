import Link from "next/link";
import { ProjectStatusAction } from "@/components/projects/project-status-action";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getArchivedProjects } from "@/data/queries/archived-projects";
import { formatDate } from "@/lib/utils";
import { getProjectLifecycleBadgeStyle } from "@/lib/semantic-styles";
import { restoreProject } from "@/app/(app)/projects/[projectId]/actions";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Archive | StudioFlow",
};

export default async function ArchivePage() {
  const t = await getTranslations("Archive");
  const locale = await getLocale();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} description={t("loginDescription")} />
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-6 text-center">
          <p className="text-sm text-[var(--ui-text-secondary)]">{t("loginRequired")}</p>
        </div>
      </div>
    );
  }

  const [result, membership] = await Promise.all([
    getArchivedProjects(),
    profile.is_active ? getActiveStudioMembership() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      {result.error ? (
        <div className="rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-surface)] p-6 text-center">
          <p className="text-sm text-[var(--ui-danger-text)]">{t("loadFailed")}</p>
        </div>
      ) : result.projects.length === 0 ? (
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-6 text-center">
          <p className="text-sm text-[var(--ui-text-secondary)]">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {result.projects.map((project) => {
            const canRestore =
              membership?.system_role === "admin" && membership.studio_id === project.studio_id;
            const lifecycleStyle = getProjectLifecycleBadgeStyle(project.status);

            return (
              <div key={project.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/projects/${project.id}`} className="font-semibold text-[var(--ui-text)] hover:underline">
                      {project.name}
                    </Link>
                    <p className="text-sm text-[var(--ui-text-muted)]">{project.project_code || project.client_name || t("archivedProject")}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${lifecycleStyle.className}`}>{lifecycleStyle.label}</span>
                </div>
                {project.description ? <p className="mt-3 text-sm text-[var(--ui-text-secondary)]">{project.description}</p> : null}
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--ui-border-subtle)] pt-4">
                  <p className="text-sm text-[var(--ui-text-muted)]">
                    {t("archivedOn", { date: project.archived_at ? formatDate(project.archived_at, locale) : t("dateUnavailable") })}
                  </p>
                  {canRestore ? (
                    <ProjectStatusAction
                      action={restoreProject.bind(null, project.id)}
                      label={t("restore")}
                      pendingLabel={t("restoring")}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
