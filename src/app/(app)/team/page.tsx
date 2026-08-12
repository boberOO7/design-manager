import { InviteEmployeeForm } from "@/components/team/invite-employee-form";
import { PageHeader } from "@/components/shared/page-header";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getCurrentStudioTeam } from "@/data/queries/team";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import { getLocalizedCityName } from "@/lib/city-provider";
import { getCountryName, isCountryCode } from "@/lib/countries";
import { defaultLocale, isAppLocale } from "@/i18n/config";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Team | StudioFlow",
};

export default async function TeamPage() {
  const [t, roles, locale, teamMembers, adminMembership] = await Promise.all([
    getTranslations("Team"),
    getTranslations("Roles"),
    getLocale(),
    getCurrentStudioTeam(),
    getActiveStudioAdmin(),
  ]);
  const appLocale = isAppLocale(locale) ? locale : defaultLocale;
  const directoryMembers = await Promise.all(teamMembers.map(async (member) => {
    const city = await getLocalizedCityName({ city: member.city, geonamesId: member.city_geonames_id, locale: appLocale });
    return {
      ...member,
      location: city && isCountryCode(member.country_code)
        ? `${city}, ${getCountryName(member.country_code, appLocale)}`
        : null,
    };
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {adminMembership ? <InviteEmployeeForm /> : null}

      <section aria-labelledby="team-directory-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="team-directory-heading" className="text-lg font-semibold text-[var(--ui-text)]">
            {t("directory")}
          </h2>
          <p className="text-sm text-[var(--ui-text-muted)]">
            {t("memberCount", { count: teamMembers.length })}
          </p>
        </div>

        {teamMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface-subtle)] p-8 text-center">
            <p className="font-medium text-[var(--ui-text)]">{t("noMembers")}</p>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
              {t("noMembersDescription")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {directoryMembers.map((member) => (
              <article key={member.id} className="flex h-full flex-col rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 shadow-sm sm:p-5">
                <div className="flex items-center gap-4">
                  <UserAvatar imageUrl={member.avatar_url} name={member.full_name} size="profile" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--ui-text)]">{member.full_name}</p>
                    {member.job_title ? (
                      <p className="mt-1 truncate text-sm text-[var(--ui-text-muted)]">{(() => { const key = getCanonicalRoleTranslationKey(member.job_title); return key ? roles(key) : member.job_title; })()}</p>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--ui-text-subtle)]">{t("jobTitleUnavailable")}</p>
                    )}
                  </div>
                </div>
                {member.location ? <p className="mt-4 flex min-w-0 items-center gap-2 text-sm text-[var(--ui-text-muted)]"><MapPin aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-subtle)]" /><span className="truncate">{member.location}</span></p> : null}
                <div className="mt-4 flex items-center justify-between border-t border-[var(--ui-border-subtle)] pt-3">
                  <span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text-secondary)]">
                    {member.system_role === "admin" ? roles("administrator") : t("employee")}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${member.is_active ? "text-[var(--ui-success-text)]" : "text-[var(--ui-text-muted)]"}`}>
                    <span className={`size-1.5 rounded-full ${member.is_active ? "bg-[var(--ui-success-text)]" : "bg-[var(--ui-text-subtle)]"}`} />
                    {member.is_active ? t("active") : t("inactive")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
