import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUserProfile } from "@/data/queries";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const access = await resolveActiveStudioMembership();
  const studio = access.status === "ACTIVE_STUDIO" ? access.membership : null;
  const productTitle = "StudioFlow";

  return {
    title: studio
      ? { default: productTitle, template: `%s · ${studio.studioName} · ${productTitle}` }
      : { default: productTitle, template: `%s · ${productTitle}` },
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, access] = await Promise.all([getTranslations("Common"), resolveActiveStudioMembership()]);

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  if (access.status === "NO_ACTIVE_STUDIO") {
    redirect("/access-unavailable");
  }

  if (access.status === "MULTIPLE_ACTIVE_STUDIOS") {
    throw new Error("Authenticated user has multiple active studio memberships.");
  }

  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error("Authenticated user with active studio membership is missing a Profile.");

  const studio = access.membership;

  return (
    <div className="flex min-h-screen bg-[var(--ui-page)] text-[var(--ui-text)]">
      <a href="#main-content" className="sr-only z-[60] rounded-[var(--ui-radius-control)] bg-[var(--ui-action-primary)] px-4 py-3 text-sm font-semibold text-[var(--ui-action-primary-text)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">{t("skipToContent")}</a>
      <AppSidebar profile={profile} studioName={studio?.studioName ?? null} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader profile={profile} />
        <main id="main-content" tabIndex={-1} className="flex-1 p-5 outline-none lg:p-8">{children}</main>
      </div>
    </div>
  );
}
