import type { LucideIcon } from "lucide-react";
import {
  Archive,
  CalendarDays,
  CheckSquare,
  ContactRound,
  FolderKanban,
  LayoutGrid,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import type { Profile } from "@/types";

export const navigationItems = [
  { href: "/dashboard", label: "Dashboard", messageKey: "dashboard", adminOnly: false },
  { href: "/projects", label: "Projects", messageKey: "projects", adminOnly: false },
  { href: "/my-tasks", label: "My Tasks", messageKey: "myTasks", adminOnly: false },
  { href: "/calendar", label: "Calendar", messageKey: "calendar", adminOnly: false },
  { href: "/team", label: "Team", messageKey: "team", adminOnly: false },
  { href: "/contractors", label: "Contractors", messageKey: "contractors", adminOnly: false },
  { href: "/leaderboard", label: "Leaderboard", messageKey: "leaderboard", adminOnly: false },
  { href: "/archive", label: "Archive", messageKey: "archive", adminOnly: false },
  { href: "/admin", label: "Administration", messageKey: "administration", adminOnly: true },
] as const;

export type NavigationItem = (typeof navigationItems)[number];

export const navigationIcons: Record<NavigationItem["href"], LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/projects": FolderKanban,
  "/my-tasks": CheckSquare,
  "/calendar": CalendarDays,
  "/team": Users,
  "/contractors": ContactRound,
  "/leaderboard": Trophy,
  "/archive": Archive,
  "/admin": ShieldCheck,
};

/** The single role-aware navigation source for desktop and mobile application chrome. */
export function getNavigationItems(profile: Profile | null): NavigationItem[] {
  if (!profile) return [...navigationItems];
  return navigationItems.filter((item) => !item.adminOnly || profile.system_role === "admin");
}

export function isNavigationItemActive(pathname: string, href: NavigationItem["href"]): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
