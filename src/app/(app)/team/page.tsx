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
import { TeamDirectory } from "@/components/team/team-directory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Team");
  return { title: t("title") };
}

export default async function TeamPage() {
  const [t, roles, locale, adminMembership] = await Promise.all([
    getTranslations("Team"),
    getTranslations("Roles"),
    getLocale(),
    getActiveStudioAdmin(),
  ]);
  const teamMembers = await getCurrentStudioTeam(Boolean(adminMembership));
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

  const isAdmin = Boolean(adminMembership);
  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {adminMembership ? <InviteEmployeeForm /> : null}

      <TeamDirectory isAdmin={isAdmin} members={directoryMembers.map((member) => ({ ...member, jobTitle: member.job_title ? (() => { const key = getCanonicalRoleTranslationKey(member.job_title); return key ? roles(key) : member.job_title; })() : null, roleLabel: member.system_role === "admin" ? roles("administrator") : t("employee") }))} />
    </div>
  );
}
