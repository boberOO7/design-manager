import { Bell, Search } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { getNotificationData } from "@/data/queries/notifications";
import type { Profile } from "@/types";

export async function AppHeader({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return (
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <MobileNavigation profile={profile} />
          <div className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-600">
            <Search size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-900">Guest</p>
            <p className="text-xs text-stone-500">Please log in</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-stone-200 p-2 text-stone-600">
            <Bell size={16} />
          </div>
          <SignOutButton />
        </div>
      </header>
    );
  }

  const notifications = await getNotificationData();

  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 lg:px-8">
      <div className="flex items-center gap-3">
        <MobileNavigation profile={profile} />
        <div className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-600">
          <Search size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">{profile.full_name}</p>
          <p className="text-xs text-stone-500">{profile.job_title}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell initialData={notifications} />
        <SignOutButton />
      </div>
    </header>
  );
}
