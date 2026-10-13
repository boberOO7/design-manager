"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

// Native visited-page reuse is sufficient. Shell prefetch added two requests and
// increased cold latency in the pilot; full prefetch cannot safely identify speculation.
export function ProjectsListLink(props: Omit<ComponentProps<typeof Link>, "prefetch">) {
  return <Link {...props} prefetch={false} />;
}
