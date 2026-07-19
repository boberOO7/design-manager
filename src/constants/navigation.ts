export const navigationItems = [
  { href: "/dashboard", label: "Dashboard", adminOnly: false },
  { href: "/projects", label: "Projects", adminOnly: false },
  { href: "/my-tasks", label: "My Tasks", adminOnly: false },
  { href: "/team", label: "Team", adminOnly: false },
  { href: "/leaderboard", label: "Leaderboard", adminOnly: false },
  { href: "/archive", label: "Archive", adminOnly: false },
  { href: "/admin", label: "Administration", adminOnly: true },
] as const;
