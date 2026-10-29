"use client";

import { useRef, useState, type FormEvent, type CSSProperties } from "react";
import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { getFeedbackAppearance } from "@/lib/feedback-appearance";
import { SpaceLogoFull } from "@/components/brand/space-logo-full";
import { ArchitecturalScale } from "./architectural-scale";
import { defaultFeedbackTemplate, isBuiltinQuestion, type FeedbackTemplate, type FeedbackAnswers } from "@/lib/feedback-template";
import styles from "./client-survey.module.css";

type SurveyState = "ready" | "unavailable" | "success";

function resizeComment(element: HTMLTextAreaElement | null) {
  if (!element || CSS.supports("field-sizing", "content")) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
}

export function ClientSurvey({ token, studioName, initialState, template = defaultFeedbackTemplate, preview = false }: { token: string; studioName?: string; initialState: Exclude<SurveyState, "success">; template?: FeedbackTemplate; preview?: boolean }) {
  const t = useTranslations("Feedback");
  const [state, setState] = useState<SurveyState>(initialState);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const questions = template.questions.filter(q => q.visible);
  const ratingQuestions = questions.filter(q => q.type === "rating" || q.type === "nps");
  const count = ratingQuestions.filter(q => ratings[q.id] !== undefined).length;
  const questionLabel = (q: FeedbackTemplate["questions"][number]) => q.label || (isBuiltinQuestion(q.id) ? t(`questions.${q.id}`) : "");
  const customAccent = template.accent.toLowerCase() !== defaultFeedbackTemplate.accent;
  const background = template.background ?? "original";
  const palette = getFeedbackAppearance(template.accent, background);
  const accentStyle: CSSProperties & { [key: `--survey-${string}`]: string } = {
    "--survey-accent": template.accent,
    "--survey-accent-ink": palette.ink,
    "--survey-glow": palette.glow,
    "--survey-on-accent": palette.onAccent,
    "--survey-bg": palette.bg, "--survey-surface": palette.surface,
    "--survey-text": palette.text, "--survey-muted": palette.muted,
    "--survey-line": palette.line, "--survey-rule": palette.rule,
    "--survey-tick": palette.tick, "--survey-number": palette.number,
    ...(background !== "original" ? { "--survey-clay": palette.muted, "--survey-ivory": palette.ink } : {}),
    colorScheme: background === "paper" ? "light" : "dark",
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || preview) return;
    const form = new FormData(event.currentTarget);
    const answers: FeedbackAnswers = {};
    for (const q of questions) answers[q.id] = q.type === "rating" || q.type === "nps" ? ratings[q.id] ?? null : String(form.get(q.id) ?? "");
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/feedback/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, website: form.get("website") }),
      });
      if (response.status === 410) { setState("unavailable"); window.scrollTo({ top: 0 }); return; }
      if (response.status === 429) {
        const remaining = Number(response.headers.get("Retry-After"));
        setError(t("rateLimited", { seconds: Number.isInteger(remaining) && remaining > 0 && remaining <= 300 ? remaining : 300 }));
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      if (!response.ok) { setError(t("submitError")); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      setState("success");
      window.scrollTo({ top: 0 });
    } catch { setError(t("submitError")); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { setPending(false); }
  };
  return <main className={styles.page} style={accentStyle} data-custom-accent={customAccent || undefined} data-custom-appearance={customAccent || background !== "original" || undefined} data-background={background} data-survey-preview={preview || undefined}>
    <div className={styles.container}>
      <header className={styles.brand}><div><span role="img" aria-label="SPACE"><SpaceLogoFull className="h-12 w-28" /></span>{studioName && studioName.trim().toUpperCase() !== "SPACE" ? <p className={styles.studio}>{studioName}</p> : null}</div><span className={styles.headerLabel}>{t("title")}</span></header>
      {state === "ready" ? <>
        <div className={styles.intro}><h1>{template.title || t("introTitle")}</h1><p className={styles.lead}>{template.subtitle || t("introDescription", { studio: studioName || "StudioFlow" })}</p>{template.introduction ? <p className={styles.lead}>{template.introduction}</p> : null}<p className={styles.privacy}><LockKeyhole size={14} aria-hidden />{t("privacy")}</p></div>
        <div className={styles.progress}><div className={styles.progressLabel}><span>{t("yourExperience")}</span><span role="status" aria-live="polite">{ratingQuestions.length === 5 ? t("progress", { count }) : t("dynamicProgress", { count, total: ratingQuestions.length })}</span></div><div className={styles.track} role="progressbar" aria-label={t("progressLabel")} aria-valuemin={0} aria-valuemax={ratingQuestions.length} aria-valuenow={count}><span style={{ transform: `scaleX(${ratingQuestions.length ? count / ratingQuestions.length : 0})` }} /></div></div>
        <form onSubmit={submit}>
          <fieldset disabled={pending} className={styles.fields}>
            <legend className="sr-only">{t("yourExperience")}</legend>
            {questions.map((q, index) => {
              if (q.type === "text") {
                if (questions[index - 1]?.type === "text") return null;
                const end = questions.findIndex((next, i) => i > index && next.type !== "text");
                const group = questions.slice(index, end === -1 ? undefined : end);
                return <section key={q.id} className={styles.comments}><div className={styles.commentsHeading}><h2>{t("aLittleMore")}</h2>{group.every(item => !item.required) ? <span>{t("optional")}</span> : null}</div>
                  {group.map(item => <label key={item.id} className={styles.textField}><span>{questionLabel(item)}{item.required ? ` · ${t("required")}` : ""}</span><textarea ref={resizeComment} onInput={event => resizeComment(event.currentTarget)} name={item.id} rows={3} maxLength={2000} required={item.required} placeholder={item.id === "strengths" || item.id === "improvements" ? t(`placeholders.${item.id}`) : undefined} /></label>)}
                </section>;
              }
              return <fieldset key={q.id} className={styles.question}><legend>{questionLabel(q)}{!q.required ? <span className={styles.optional}> · {t("optional")}</span> : null}</legend>
                {q.type === "choice" ? <div className={styles.choiceOptions}>{q.options.map(option => <label key={option}><input type="radio" name={q.id} value={option} required={q.required} />{option}</label>)}</div>
                  : <ArchitecturalScale name={q.id} value={ratings[q.id]} required={q.required} disabled={pending} onChange={value => setRatings(current => ({ ...current, [q.id]: value }))} />}
              </fieldset>;
            })}
            <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
            {error ? <p ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</p> : null}
            <button type="submit" className={styles.submit} disabled={pending || preview}>{preview ? t("previewOnly") : pending ? t("sending") : t("submit")}<ArrowUpRight size={20} aria-hidden /></button>
            <p className={styles.submitHint}>{t("submitHint")}</p>
          </fieldset>
        </form>
      </> : <section className={styles.ending} tabIndex={-1} ref={node => { if (node && state !== initialState) node.focus(); }}>
        <div className={styles.seal}>{state === "success" ? <Check size={32} strokeWidth={1.3} aria-hidden /> : <LockKeyhole size={28} strokeWidth={1.3} aria-hidden />}</div>
        <p className={styles.eyebrow}>{studioName || "StudioFlow"}</p>
        <h1>{t(state === "success" ? "thankYouTitle" : "unavailableTitle")}</h1>
        <p className={styles.lead}>{state === "success" && template.thankYou ? template.thankYou : t(state === "success" ? "thankYouDescription" : "unavailableDescription")}</p>
        <div className={styles.signature}><span />{t(state === "unavailable" ? "contactStudio" : "warmRegards")}</div>
      </section>}
      <footer className={styles.footer}>{t("poweredBy")}</footer>
    </div>
  </main>;
}
