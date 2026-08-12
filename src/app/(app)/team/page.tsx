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
import { TeamMemberCard } from "@/components/team/team-member-card";

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
          <div className="grid grid-cols-1 justify-items-start gap-4 sm:grid-cols-[repeat(auto-fill,minmax(16.25rem,18.75rem))]">
            {directoryMembers.map((member) => (
              <TeamMemberCard avatarUrl={member.avatar_url} fullName={member.full_name} isActive={member.is_active} jobTitle={member.job_title ? (() => { const key = getCanonicalRoleTranslationKey(member.job_title); return key ? roles(key) : member.job_title; })() : null} key={member.id} location={member.location} roleLabel={member.system_role === "admin" ? roles("administrator") : t("employee")} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
