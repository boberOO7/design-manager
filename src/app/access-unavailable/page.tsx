import { SignOutButton } from "@/components/auth/sign-out-button";
import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AccessUnavailable");
  return { title: t("title") };
}

export default async function AccessUnavailablePage() {
  const [access, t] = await Promise.all([
    resolveActiveStudioMembership(),
    getTranslations("AccessUnavailable"),
  ]);

  if (access.status === "UNAUTHENTICATED" || access.status === "AUTH_ERROR") redirect("/login");
  if (access.status === "ACTIVE_STUDIO") redirect("/dashboard");
  if (access.status === "MULTIPLE_ACTIVE_STUDIOS") {
    throw new Error("Authenticated user has multiple active studio memberships.");
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--ui-surface-muted)] px-4 py-10">
      <section aria-labelledby="access-unavailable-title" className="w-full max-w-md rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ui-text-muted)]">StudioFlow</p>
        <h1 id="access-unavailable-title" className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ui-text-secondary)]">{t("description")}</p>
        {access.email ? <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("account", { email: access.email })}</p> : null}
        <div className="mt-6"><SignOutButton /></div>
      </section>
    </main>
  );
}
