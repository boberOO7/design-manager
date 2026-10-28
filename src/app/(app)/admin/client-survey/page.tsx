import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFeedbackTemplate } from "@/data/queries/feedback";
import { DomainMessages } from "@/i18n/domain-messages";
import { PageHeader } from "@/components/shared/page-header";
import { FeedbackTemplateEditor } from "@/components/feedback/feedback-template-editor";

export async function generateMetadata() { return { title: (await getTranslations("Feedback"))("editor.title") }; }
export default async function ClientSurveySettingsPage() {
  const data = await getFeedbackTemplate();
  if (!data) notFound();
  const t = await getTranslations("Feedback");
  const administration = await getTranslations("Administration");
  return <DomainMessages scope="feedback"><div className="mx-auto w-full max-w-7xl space-y-5"><Link href="/admin" className="inline-flex min-h-9 items-center gap-2 rounded-sm text-sm text-[var(--ui-text-muted)] transition-colors duration-200 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><ArrowLeft className="size-4" aria-hidden="true" />{administration("title")}</Link><PageHeader title={t("editor.title")} description={t("editor.description")} /><FeedbackTemplateEditor initial={data} /></div></DomainMessages>;
}
