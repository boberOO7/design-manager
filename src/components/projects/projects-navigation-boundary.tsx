"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CachedNavigationBoundary } from "@/components/shared/cached-navigation-boundary";
import { verifyProjectsNavigationScope } from "@/app/(app)/projects/navigation-actions";

async function verifyScope() { return { scope: await verifyProjectsNavigationScope() }; }

export function ProjectsNavigationBoundary({ children, fallback, snapshot }: {
  children: ReactNode; fallback: ReactNode; snapshot: { scope: string | null; prefetched: boolean; renderId: string };
}) {
  const t = useTranslations("Tasks");
  return <CachedNavigationBoundary path="/projects" snapshot={snapshot} verifyScope={verifyScope} fallback={fallback} failure={t("loadFailed")} retryLabel={t("retryLoad")}>{children}</CachedNavigationBoundary>;
}
