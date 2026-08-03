import { Bell, Search } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { getNotificationData } from "@/data/queries/notifications";
import type { Profile } from "@/types";

export async function AppHeader({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return (
      <header className="flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNavigation profile={profile} />
          <div className="hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-2 text-[var(--ui-text-secondary)] sm:block">
            <Search size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ui-text)]">Guest</p>
            <p className="truncate text-xs text-[var(--ui-text-muted)]">Please log in</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeSwitch />
          <div className="rounded-full border border-[var(--ui-border)] p-2 text-[var(--ui-text-secondary)]">
            <Bell size={16} />
          </div>
          <SignOutButton />
        </div>
      </header>
    );
  }

  const notifications = await getNotificationData();

  return (
    <header className="flex items-center justify-between border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-5 py-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation profile={profile} />
        <div className="hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-2 text-[var(--ui-text-secondary)] sm:block">
          <Search size={16} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{profile.full_name}</p>
          <p className="truncate text-xs text-[var(--ui-text-muted)]">{profile.job_title}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeSwitch />
        <NotificationBell initialData={notifications} />
        <SignOutButton />
      </div>
    </header>
  );
}
