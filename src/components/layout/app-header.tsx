import { Bell, Menu, Search } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Profile } from "@/types";

export function AppHeader({ profile }: { profile: Profile | null }) {
  if (!profile) {
    return (
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button type="button" className="rounded-md border border-stone-200 p-2 text-stone-600 lg:hidden">
            <Menu size={18} />
          </button>
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

  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4 lg:px-8">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md border border-stone-200 p-2 text-stone-600 lg:hidden">
          <Menu size={18} />
        </button>
        <div className="rounded-full border border-stone-200 bg-stone-50 p-2 text-stone-600">
          <Search size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">{profile.full_name}</p>
          <p className="text-xs text-stone-500">{profile.job_title}</p>
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
