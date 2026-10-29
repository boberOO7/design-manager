"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectWorkspaceLink as Link, useProjectWorkspaceNavigation } from "@/components/projects/project-workspace-navigation";
import styles from "./project-feedback.module.css";
import { Check, Copy, MessageSquare, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-field";
import { DatePicker } from "@/components/ui/date-picker";
import { addCalendarDays, APPLICATION_TIME_ZONE, instantToDateOnly } from "@/lib/calendar";
import { feedbackTemplateSchema, isBuiltinQuestion } from "@/lib/feedback-template";
import { feedbackRatingKeys, feedbackStatus, getFeedbackExpiryAt, getFeedbackSurveyPath, type FeedbackInvitation } from "@/lib/feedback";

function defaultExpiry() {
  return addCalendarDays(instantToDateOnly(new Date().toISOString()), 30);
}

export function ProjectFeedback({ projectId, invitations, hasNext, page }: { projectId: string; invitations: FeedbackInvitation[]; hasNext: boolean; page: number }) {
  const t = useTranslations("Feedback");
  const locale = useLocale();
  const router = useRouter();
  const navigation = useProjectWorkspaceNavigation();
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const expiryDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: APPLICATION_TIME_ZONE }).format(new Date(Date.parse(value) - 1));
  const change = (method: "POST" | "DELETE", body: object) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/feedback`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) { setError(t("saveError")); return; }
        if (navigation) navigation.refresh(method === "POST" && page !== 1 ? `/projects/${projectId}?view=feedback&workDirection=all` : undefined);
        else { if (method === "POST" && page !== 1) router.push(`/projects/${projectId}?view=feedback`); router.refresh(); }
      } catch { setError(t("saveError")); }
    });
  };
  const copy = async (invitation: FeedbackInvitation) => {
    const link = `${window.location.origin}${getFeedbackSurveyPath(invitation.token)}`;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const anchor = document.createElement("a");
        anchor.href = link;
        anchor.textContent = t("shareLinkLabel");
        try {
          await navigator.clipboard.write([new ClipboardItem({
            "text/plain": new Blob([link], { type: "text/plain" }),
            "text/html": new Blob([anchor.outerHTML], { type: "text/html" }),
          })]);
        } catch { await navigator.clipboard.writeText(link); }
      } else { await navigator.clipboard.writeText(link); }
      setCopied(invitation.id); setManualLink(null);
    }
    catch { setManualLink(link); setCopied(null); }
  };
  return <section className="space-y-5 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-5 shadow-[var(--ui-shadow-panel)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="mt-1 max-w-2xl text-sm text-[var(--ui-text-muted)]">{t("projectDescription")}</p></div><Link href="/admin/client-survey" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t("editor.title")}</Link><Link href="/statistics?section=feedback" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t("studioAnalytics")}</Link></div>
    <form className="flex flex-wrap items-end gap-3 border-y border-[var(--ui-border)] py-5" onSubmit={event => { event.preventDefault(); const value = getFeedbackExpiryAt(expiry); if (!value || Date.parse(value) <= Date.now()) { setError(t("invalidExpiry")); return; } change("POST", { expiresAt: value }); }}>
      <fieldset className="grid min-w-0 gap-2"><legend className="mb-2 text-sm font-medium">{t("expiresAt")}</legend><div className="flex flex-wrap gap-2">
        <DatePicker required name="expiryDate" locale={locale} aria-label={t("expiryDate")} value={expiry} onValueChange={setExpiry} className="w-44" />
      </div></fieldset>
      <Button type="submit" disabled={pending} size="lg" className="gap-2"><Plus className="size-4" aria-hidden />{pending ? t("saving") : t("createLink")}</Button>
      <p className="basis-full text-xs text-[var(--ui-text-muted)]">{t("expiryHint")} {t("linkPrivacy")}</p>
    </form>
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <p role="status" className="sr-only">{copied ? t("copied") : ""}</p>
    {manualLink ? <label className="grid gap-2 text-sm">{t("manualCopy")}<Input readOnly value={manualLink} onFocus={event => event.currentTarget.select()} /></label> : null}
    {!invitations.length ? <div className="py-10 text-center"><MessageSquare className="mx-auto mb-3 size-7 text-[var(--ui-text-muted)]" aria-hidden /><p className="font-medium">{t("noInvitations")}</p><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("noInvitationsHint")}</p></div> : <ul className="divide-y divide-[var(--ui-border)]">{invitations.map(invitation => {
      const status = feedbackStatus(invitation);
      const template = invitation.version ? feedbackTemplateSchema.parse(invitation.version.config) : undefined;
      const additional = template?.questions.filter(q => !isBuiltinQuestion(q.id) && q.visible) ?? [];
      return <li key={invitation.id} className="py-5 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{t("invitation", { date: date(invitation.created_at) })}</h3><span className={`rounded-full border px-2.5 py-1 text-xs ${status === "active" ? "border-[var(--ui-success-border)] bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]" : "border-[var(--ui-border)] text-[var(--ui-text-secondary)]"}`}>{t(`status.${status}`)}</span><span className="text-xs text-[var(--ui-text-muted)]">{t("answeredCount", { count: invitation.responses.length })}</span></div><p className="mt-2 text-xs text-[var(--ui-text-muted)]">{invitation.version ? `${t("editor.publishedVersion", { version: invitation.version.version })} · ` : ""}{t("expiresOn", { date: expiryDate(invitation.expires_at) })}</p></div>
          {status === "active" ? <div className="flex gap-2"><Button variant="outline" size="lg" className="gap-2" onClick={() => void copy(invitation)}>{copied === invitation.id ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}{copied === invitation.id ? t("copied") : t("copyLink")}</Button><Button variant="ghost" size="lg" disabled={pending} onClick={() => change("DELETE", { invitationId: invitation.id })} aria-label={t("revoke")} title={t("revoke")}><X className="size-4" aria-hidden /></Button></div> : null}
        </div>
        {invitation.responses.map(response => { const answers = response.additional_answers; return <details key={response.id} className={`${styles.response} group mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)]`}><summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]">{t("viewResponse")} · {date(response.submitted_at)}<span className="ml-3 font-normal text-[var(--ui-text-muted)]">{t("scoreSummary", { score: response.satisfaction ?? "—", nps: response.recommendation ?? "—" })}</span></summary><div className="space-y-5 border-t border-[var(--ui-border)] p-4"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{feedbackRatingKeys.map(key => <div key={key}><dt className="text-xs text-[var(--ui-text-muted)]">{t(`metrics.${key}`)}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{response[key] ?? "—"}<span className="ml-1 text-xs font-normal text-[var(--ui-text-muted)]">/ {key === "recommendation" ? 10 : 5}</span></dd></div>)}</dl>{(["strengths", "improvements"] as const).filter(key => !template || template.questions.some(q => q.id === key && q.visible)).map(key => <div key={key}><h4 className="text-sm font-medium">{template?.questions.find(q => q.id === key)?.label || t(`questions.${key}`)}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--ui-text-secondary)]">{response[key] || t("noComment")}</p></div>)}{additional.map(q => <div key={q.id}><h4 className="text-sm font-medium">{q.label}</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--ui-text-secondary)]">{answers && typeof answers === "object" && !Array.isArray(answers) && answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "" ? String(answers[q.id]) : t("noComment")}{q.type === "rating" ? " / 5" : ""}</p></div>)}</div></details>; })}
      </li>;
    })}</ul>}
    {page > 1 || hasNext ? <nav aria-label={t("pagination")} className="flex items-center justify-between border-t border-[var(--ui-border)] pt-4">{page > 1 ? <Link className="p-3 text-sm underline" href={`/projects/${projectId}?view=feedback&feedbackPage=${page - 1}`}>{t("previous")}</Link> : <span />}{hasNext ? <Link className="p-3 text-sm underline" href={`/projects/${projectId}?view=feedback&feedbackPage=${page + 1}`}>{t("next")}</Link> : null}</nav> : null}
  </section>;
}
