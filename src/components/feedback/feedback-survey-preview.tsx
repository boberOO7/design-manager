"use client";
import { useEffect, useState } from "react";
import { feedbackTemplateSchema, type FeedbackTemplate } from "@/lib/feedback-template";
import { ClientSurvey } from "./client-survey";

export function FeedbackSurveyPreview({ initial, studioName }: { initial: FeedbackTemplate; studioName: string }) {
  const [template, setTemplate] = useState(initial);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== "feedback-preview") return;
      const parsed = feedbackTemplateSchema.safeParse(event.data.config);
      if (parsed.success) setTemplate(parsed.data);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "feedback-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return <ClientSurvey token="" studioName={studioName} initialState="ready" template={template} preview />;
}
