import { Bell } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { LanguageSelector } from "@/components/layout/language-selector";
import { ProfileAvatarEditor } from "@/components/layout/profile-avatar-editor";
import { getTranslations } from "next-intl/server";
import { getNotificationData } from "@/data/queries/notifications";
import { getCanonicalRoleTranslationKey } from "@/lib/professional-roles";
import type { Profile } from "@/types";

export async function AppHeader({ leaderboardVisibleToEmployees, profile, systemRole }: { leaderboardVisibleToEmployees: boolean; profile: Profile | null; systemRole: string }) {
  const [t, roles] = await Promise.all([
    getTranslations("Account"),
    getTranslations("Roles"),
  ]);
  if (!profile) {
    return (
      <header className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNavigation leaderboardVisibleToEmployees={leaderboardVisibleToEmployees} systemRole={systemRole} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{t("guest")}</p>
            <p className="truncate text-xs text-[var(--ui-text-muted)]">{t("pleaseLogIn")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeSwitch />
          <div className="inline-flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-[var(--ui-text-secondary)]" aria-label={t("notificationsUnavailable")}>
            <Bell size={16} />
          </div>
          <SignOutButton />
        </div>
      </header>
    );
  }

  const notifications = await getNotificationData();
  const roleKey = getCanonicalRoleTranslationKey(profile.job_title);

  return (
    <header className="flex h-[var(--ui-shell-header-height)] shrink-0 items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation leaderboardVisibleToEmployees={leaderboardVisibleToEmployees} systemRole={systemRole} />
        <ProfileAvatarEditor
          avatarUrl={profile.avatar_url}
          city={profile.city}
          cityGeoNamesId={profile.city_geonames_id}
          countryCode={profile.country_code}
          fullName={profile.full_name}
          userId={profile.id}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{profile.full_name}</p>
          <p className="truncate text-xs text-[var(--ui-text-muted)]">{roleKey ? roles(roleKey) : profile.job_title}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSelector />
        <ThemeSwitch />
        <NotificationBell initialData={notifications} />
        <SignOutButton />
      </div>
    </header>
  );
}
