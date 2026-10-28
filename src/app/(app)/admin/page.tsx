import Link from "next/link";
import { ArrowUpRight, MessageSquare, Users } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { AdministrationWorkspace } from "@/components/administration/administration-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAdministrationData } from "@/data/queries/administration";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Administration");
  return { title: t("title") };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  const t = await getTranslations("Administration");
  const feedback = await getTranslations("Feedback");
  const data = await getAdministrationData();
  if (!data) redirect("/dashboard");
  const params = await searchParams;
  const requestId = typeof params.request === "string" ? params.request : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7">
      <PageHeader title={t("title")} description={t("pageDescription")} />
      <AdministrationWorkspace initialData={data} requestId={requestId} settingsLinks={
        <Panel className="divide-y divide-[var(--ui-border)] overflow-hidden shadow-none">
          {[
            { href: "/team", title: t("teamAccess"), description: t("teamAccessSummary", { active: data.team.activeMembers, admins: data.team.administrators, inactive: data.team.inactiveMembers }), icon: Users },
            { href: "/admin/client-survey", title: feedback("editor.title"), description: feedback("editor.description"), icon: MessageSquare },
          ].map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="group flex items-start gap-3 p-4 transition-colors duration-200 hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:p-5">
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)]" />
              <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-[var(--ui-text)]">{title}</h3><p className="mt-1 text-sm leading-5 text-[var(--ui-text-muted)]">{description}</p></div>
              <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--ui-text-muted)] transition-colors duration-200 group-hover:text-[var(--ui-text)]" />
            </Link>
          ))}
        </Panel>
      } />
    </div>
  );
}
