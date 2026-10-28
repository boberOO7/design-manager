import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DomainMessages } from "@/i18n/domain-messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackStatus, resolveFeedbackLinkToken } from "@/lib/feedback";
import { feedbackTemplateSchema, type FeedbackTemplate } from "@/lib/feedback-template";
import { ClientSurvey } from "@/components/feedback/client-survey";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("Feedback"))("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const token = resolveFeedbackLinkToken((await params).token);
  let template: FeedbackTemplate | undefined;
  let studioName: string | undefined;
  let initialState: "ready" | "answered" | "unavailable" = "unavailable";
  if (token) {
    const client = createAdminClient();
    // Deliberately exclude all project/client/internal fields and responses.
    const { data, error } = await client.from("project_feedback").select("submitted_at, revoked_at, expires_at, version:feedback_template_versions!inner(config,studio_name)").eq("token", token).maybeSingle();
    if (error) throw new Error("Unable to load feedback invitation");
    const status = data ? feedbackStatus(data) : "expired";
    studioName = data?.version.studio_name;
    if (data) template = feedbackTemplateSchema.parse(data.version.config);
    initialState = status === "pending" ? "ready" : status === "answered" ? "answered" : "unavailable";
  }
  return <DomainMessages scope="feedback"><ClientSurvey token={initialState === "ready" && token ? token : ""} studioName={studioName} template={template} initialState={initialState} /></DomainMessages>;
}
