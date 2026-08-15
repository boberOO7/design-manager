import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUserProfile } from "@/data/queries";
import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const studio = await getActiveStudioMembership();
  const productTitle = "StudioFlow";

  return {
    title: studio
      ? { default: productTitle, template: `%s · ${studio.studioName} · ${productTitle}` }
      : { default: productTitle, template: `%s · ${productTitle}` },
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, studio] = await Promise.all([getTranslations("Common"), getActiveStudioMembership()]);
  // Obtain the real profile once on the server
  let profile = null;
  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    // If profile fetch fails, redirect to login
    console.error("Failed to fetch user profile:", error);
    redirect("/login");
  }

  // Redirect if no authenticated user exists
  if (!profile) {
    redirect("/login");
  }

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
