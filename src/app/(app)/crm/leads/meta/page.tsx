import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getMetaLeadTarget } from "@/lib/meta-leads/config";
import { MetaLeadsWorkspace } from "@/components/crm/meta-leads-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Crm.meta");
  return { title: t("title") };
}
export default async function MetaLeadsPage() {
  const admin = await getActiveStudioAdmin();
  if (!admin)
    notFound();
  let target;
  try {
    target = getMetaLeadTarget();
  }
  catch { /* The UI explains missing configuration without exposing secrets. */ }
  if (target && target.studioId !== admin.studio_id)
    notFound();
  const t = await getTranslations("Crm.meta");
  return <div className="space-y-6"><PageHeader title={t("title")} description={t("description")} action={<Button asChild variant="outline"><Link href="/crm/leads">{t("backToCrm")}</Link></Button>}/><MetaLeadsWorkspace /></div>;
}
