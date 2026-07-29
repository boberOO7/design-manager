"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";
import { getNavigationItems, isNavigationItemActive, navigationIcons } from "@/constants/navigation";

export function AppSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Filter navigation items based on real system_role
  const items = useMemo(() => getNavigationItems(profile), [profile]);

  return (
    <aside className={cn("hidden border-r border-stone-200 bg-stone-50/70 lg:flex lg:flex-col", collapsed ? "w-20" : "w-72")}> 
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-stone-900">StudioFlow</p>
          <p className="text-xs text-stone-500">Interior design ops</p>
        </div>
        <button type="button" onClick={() => setCollapsed((value) => !value)} className="rounded-md p-2 text-stone-500 hover:bg-stone-200">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = navigationIcons[item.href];
          const active = isNavigationItemActive(pathname, item.href);
          return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[var(--ui-radius-control)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", active ? "bg-[var(--ui-action-primary)] text-white" : "text-[var(--ui-text-secondary)] hover:bg-stone-200 hover:text-[var(--ui-text)]", collapsed && "justify-center px-2")}>
              <Icon size={18} />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-stone-200 p-4 text-sm text-stone-600">
        {profile && (
          <>
            <p className="font-semibold text-stone-900">{profile.full_name}</p>
            <p>{profile.job_title}</p>
          </>
        )}
      </div>
    </aside>
  );
}
