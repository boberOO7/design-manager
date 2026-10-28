import { notFound } from "next/navigation";
import { getFeedbackTemplate } from "@/data/queries/feedback";
import { DomainMessages } from "@/i18n/domain-messages";
import { FeedbackSurveyPreview } from "@/components/feedback/feedback-survey-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Survey preview", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function PreviewPage() {
  const data = await getFeedbackTemplate();
  if (!data) notFound();
  return <DomainMessages scope="feedback"><FeedbackSurveyPreview initial={data.template} studioName={data.studioName} /></DomainMessages>;
}
