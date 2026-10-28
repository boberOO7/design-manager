"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, type DragEndEvent } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Plus, SlidersHorizontal, Trash2, Monitor, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { AnimatedFormContent } from "@/components/ui/animated-form-content";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import styles from "./feedback-template-editor.module.css";
import { FeedbackAppearanceControls } from "./feedback-appearance-controls";
import { SpaceLogoFull } from "@/components/brand/space-logo-full";
import { feedbackTemplateSchema, isBuiltinQuestion, type FeedbackTemplate, type FeedbackQuestion } from "@/lib/feedback-template";
import { createFeedbackEditorDraft, serializeFeedbackEditorDraft } from "@/lib/feedback-template-editor";

const questionSensors = [PointerSensor.configure({}), KeyboardSensor.configure({ offset: 56 })];
const compactField = "h-11 text-base sm:h-9 sm:text-sm";
const section = "px-4 py-4 sm:px-5";
const phoneViewport = { width: 390, height: 844 };
type Initial = { template: FeedbackTemplate; revision: number; version: number; studioName: string };
export function FeedbackTemplateEditor({ initial }: { initial: Initial }) {
  const t = useTranslations("Feedback");
  // Fast Refresh can retain the previous server-provided message bundle.
  const introductionHint = t.has("editor.introductionHint") ? t("editor.introductionHint") : "";
  const thankYouHint = t.has("editor.thankYouHint") ? t("editor.thankYouHint") : "";
  const editorDraft = (template: FeedbackTemplate) => createFeedbackEditorDraft(template, {
    title: t("introTitle"), subtitle: t("introDescription", { studio: initial.studioName }), thankYou: t("thankYouDescription"),
    questions: { satisfaction: t("questions.satisfaction"), communication: t("questions.communication"), timeliness: t("questions.timeliness"), expectations: t("questions.expectations"), recommendation: t("questions.recommendation"), strengths: t("questions.strengths"), improvements: t("questions.improvements") },
  });
  const [config, setConfig] = useState(() => editorDraft(initial.template));
  const [saved, setSaved] = useState({ source: initial.template, draft: config });
  const template = useMemo(() => serializeFeedbackEditorDraft(config, saved), [config, saved]);
  const [revision, setRevision] = useState(initial.revision);
  const [version, setVersion] = useState(initial.version);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"edit" | "desktop" | "mobile">("edit");
  const iframe = useRef<HTMLIFrameElement>(null);
  const previewStage = useRef<HTMLDivElement>(null);
  const [phoneScale, setPhoneScale] = useState(1);
  const [newQuestionType, setNewQuestionType] = useState<"text" | "rating" | "choice">("text");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const activeQuestion = config.questions.find(q => q.id === activeQuestionId);
  const questionLabel = (q: FeedbackQuestion) => q.label || (isBuiltinQuestion(q.id) ? t(`questions.${q.id}`) : t("editor.wording"));
  const dirty = JSON.stringify(config) !== JSON.stringify(saved.draft);
  const preview = () => iframe.current?.contentWindow?.postMessage({ type: "feedback-preview", config: template }, window.location.origin);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === iframe.current?.contentWindow && event.data?.type === "feedback-preview-ready") iframe.current?.contentWindow?.postMessage({ type: "feedback-preview", config: template }, window.location.origin);
    };
    window.addEventListener("message", receive);
    iframe.current?.contentWindow?.postMessage({ type: "feedback-preview", config: template }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [template]);
  useLayoutEffect(() => {
    const stage = previewStage.current;
    if (view !== "mobile" || !stage) return;
    const fit = () => setPhoneScale(Math.min(1, stage.clientWidth / phoneViewport.width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const updateQuestion = (id: string, change: Partial<FeedbackQuestion>) => setConfig(current => ({ ...current, questions: current.questions.map(q => q.id === id ? { ...q, ...change } : q) }));
  function reorder(event: DragEndEvent) {
    setActiveQuestionId(null);
    const source = event.operation.source?.id, target = event.operation.target?.id;
    if (event.canceled || pending || !source || !target || source === target) return;
    setConfig(current => {
      const from = current.questions.findIndex(q => q.id === source);
      const to = current.questions.findIndex(q => q.id === target);
      if (from < 0 || to < 0) return current;
      const questions = [...current.questions];
      const [moved] = questions.splice(from, 1);
      questions.splice(to, 0, moved);
      return { ...current, questions };
    });
  }
  function addQuestion() {
    const id = crypto.randomUUID();
    setConfig(current => ({ ...current, questions: [...current.questions, { id, type: newQuestionType, label: "", visible: true, required: false, options: newQuestionType === "choice" ? ["", ""] : [] }] }));
    setExpandedQuestion(id);
  }
  function showPreview(mode: "desktop" | "mobile") {
    if (!feedbackTemplateSchema.safeParse(template).success) { setError(t("editor.invalid")); return; }
    setError(""); setView(mode);
  }
  function cancel() {
    setConfig(saved.draft);
    setView("edit");
    setExpandedQuestion(null);
    setActiveQuestionId(null);
    setError(""); setNotice("");
  }
  async function save() {
    if (pending) return;
    setNotice(""); setError("");
    const parsed = feedbackTemplateSchema.safeParse(template);
    if (!parsed.success) { setError(t("editor.invalid")); setView("edit"); return; }
    setPending(true);
    try {
      const response = await fetch("/api/feedback/template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: parsed.data, revision, publish: true }) });
      if (!response.ok) { setError(t(response.status === 409 ? "editor.conflict" : "saveError")); return; }
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("revision" in body) || typeof body.revision !== "number") throw new Error("Invalid save response");
      const draft = editorDraft(parsed.data);
      setRevision(body.revision); setConfig(draft); setSaved({ source: parsed.data, draft });
      setVersion(current => current + 1);
      setNotice(t("editor.saved"));
    } catch { setError(t("saveError")); }
    finally { setPending(false); }
  }
  return <div className="space-y-4" data-feedback-editor>
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium text-[var(--ui-text-secondary)]">{t("editor.publishedVersion", { version })}</span>
        <span className="flex items-center gap-1.5 text-[var(--ui-text-muted)]"><span aria-hidden className={cn("size-1.5 rounded-full", dirty ? "bg-[var(--ui-warning-text)]" : "bg-[var(--ui-success-text)]")} />{dirty ? t("editor.unsaved") : t("editor.savedState")}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="compact" variant="outline" disabled={pending || !dirty} onClick={cancel}>{t("editor.cancel")}</Button>
        <Button size="compact" disabled={pending || !dirty} onClick={() => void save()}>{pending ? t("saving") : t("editor.saveChanges")}</Button>
      </div>
    </div>
    <p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.historyHint")}</p>
    {notice && !dirty ? <p role="status" className="text-sm text-[var(--ui-success-text)]">{notice}</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{error}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] pb-3">
      <div className="flex max-w-full flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1" role="group" aria-label={t("editor.view")}>
        <Button size="compact" variant={view === "edit" ? "outline" : "ghost"} aria-pressed={view === "edit"} onClick={() => setView("edit")}>{t("editor.edit")}</Button>
        <Button size="compact" variant={view === "desktop" ? "outline" : "ghost"} aria-label={t("editor.desktop")} aria-pressed={view === "desktop"} onClick={() => showPreview("desktop")}><Monitor size={15} aria-hidden />{t("editor.desktopShort")}</Button>
        <Button size="compact" variant={view === "mobile" ? "outline" : "ghost"} aria-label={t("editor.mobile")} aria-pressed={view === "mobile"} onClick={() => showPreview("mobile")}><Smartphone size={15} aria-hidden />{t("editor.mobileShort")}</Button>
      </div>
    </div>
    {view !== "edit" ? <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="space-y-1"><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.previewHint")}</p>{view === "mobile" ? <p className="text-xs tabular-nums text-[var(--ui-text-secondary)]">{t("editor.phoneViewport", phoneViewport)}</p> : null}</div>
        <FeedbackAppearanceControls accent={config.accent} background={config.background} disabled={pending} onChange={patch => setConfig(current => ({ ...current, ...patch }))} />
      </div>
      <div ref={previewStage} className={styles.previewStage} data-preview-device={view}>
        <div className={cn(styles.previewViewport, view === "mobile" && styles.phoneViewport)} style={view === "mobile" ? { width: phoneViewport.width * phoneScale, height: phoneViewport.height * phoneScale } : undefined}>
          <iframe key={view} ref={iframe} onLoad={preview} src="/survey/preview" title={t("editor.previewTitle")} className={styles.previewFrame} style={view === "mobile" ? { width: phoneViewport.width, height: phoneViewport.height, transform: `scale(${phoneScale})` } : undefined} />
        </div>
      </div>
    </section> : <fieldset disabled={pending} className="min-w-0 divide-y divide-[var(--ui-border)] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <section className={section}>
        <h2 className="mb-3 text-sm font-semibold">{t("editor.content")}</h2>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {(["title", "subtitle"] as const).map(key => <FormField className="text-xs" key={key} label={t(key === "title" ? "editor.heading" : "editor.subtitle")}>
            <Input className={compactField} aria-label={t(key === "title" ? "editor.heading" : "editor.subtitle")} aria-describedby="feedback-default-copy-hint" maxLength={key === "title" ? 200 : 1000} value={config[key]} onChange={event => setConfig(current => ({ ...current, [key]: event.target.value }))} />
          </FormField>)}
          {(["introduction", "thankYou"] as const).map(key => <FormField className="text-xs" key={key} label={t(`editor.${key}`)} optional={key === "introduction"} optionalLabel={t("optional")}>
            <Textarea className={cn(styles.messageText, "text-base sm:text-sm")} ref={node => resizeTextarea(node)} onInput={event => resizeTextarea(event.currentTarget)} aria-label={t(`editor.${key}`)} aria-describedby={key === "introduction" ? (introductionHint ? "feedback-introduction-hint" : undefined) : `${thankYouHint ? "feedback-thank-you-hint " : ""}feedback-default-copy-hint`} rows={2} maxLength={2000} value={config[key]} onChange={event => setConfig(current => ({ ...current, [key]: event.target.value }))} />
            {(key === "introduction" ? introductionHint : thankYouHint) ? <span id={key === "introduction" ? "feedback-introduction-hint" : "feedback-thank-you-hint"} className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{key === "introduction" ? introductionHint : thankYouHint}</span> : null}
          </FormField>)}
        </div>
        <p id="feedback-default-copy-hint" className="mt-3 text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.defaultHint")}</p>
      </section>
      <section className={cn(section, "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-x-4")} aria-label={t("editor.branding")}>
        <SpaceLogoFull className="h-8 w-20 shrink-0" />
        <div className="min-w-0 flex-1"><h2 className="text-sm font-medium [overflow-wrap:anywhere]">{initial.studioName}</h2><p className="mt-0.5 hidden text-xs text-[var(--ui-text-muted)] sm:block">{t("editor.brandHint")}</p></div>
        <div className="col-span-2 justify-self-end"><FeedbackAppearanceControls accent={config.accent} background={config.background} disabled={pending} onChange={patch => setConfig(current => ({ ...current, ...patch }))} /></div>
      </section>
      <section className={section}>
        <h2 className="text-sm font-semibold">{t("editor.questions")}</h2>
        <p className="mb-3 mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.compactHint")}</p>
        <p id="feedback-reorder-hint" className="sr-only">{t("editor.reorderHint")}</p>
        <DragDropProvider sensors={questionSensors} onDragStart={event => setActiveQuestionId(String(event.operation.source?.id ?? ""))} onDragEnd={reorder}>
          <ol className="divide-y divide-[var(--ui-border-subtle)] border-y border-[var(--ui-border)]">
            {config.questions.map((q, index) => <QuestionRow key={q.id} question={q} index={index} label={questionLabel(q)} pending={pending} expanded={expandedQuestion === q.id} onToggle={() => setExpandedQuestion(current => current === q.id ? null : q.id)} onUpdate={change => updateQuestion(q.id, change)} onRemove={() => { setConfig(current => ({ ...current, questions: current.questions.filter(item => item.id !== q.id) })); setExpandedQuestion(null); }} />)}
          </ol>
          <DragOverlay>{activeQuestion ? <div className="flex w-[min(48rem,calc(100vw-2rem))] items-center gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-3 text-sm shadow-[var(--ui-shadow-panel)]"><GripVertical className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden /><span className="min-w-0 truncate">{questionLabel(activeQuestion)}</span></div> : null}</DragOverlay>
        </DragDropProvider>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select aria-label={t("editor.newQuestionType")} size="compact" width="content" className="h-11 text-sm sm:h-9 sm:text-xs" disabled={pending} value={newQuestionType} onValueChange={value => { if (value === "text" || value === "rating" || value === "choice") setNewQuestionType(value); }}>
            <SelectItem value="text">{t("editor.types.text")}</SelectItem><SelectItem value="rating">{t("editor.types.rating")}</SelectItem><SelectItem value="choice">{t("editor.types.choice")}</SelectItem>
          </Select>
          <Button size="compact" variant="outline" disabled={pending} onClick={addQuestion}><Plus size={15} aria-hidden />{t("editor.addQuestion")}</Button>
        </div>
      </section>
    </fieldset>}
  </div>;
}

function resizeTextarea(node: HTMLTextAreaElement | null) {
  if (!node || CSS.supports("field-sizing", "content")) return;
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
}

function QuestionRow({ question: q, index, label, pending, expanded, onToggle, onUpdate, onRemove }: {
  question: FeedbackQuestion; index: number; label: string; pending: boolean; expanded: boolean;
  onToggle: () => void; onUpdate: (change: Partial<FeedbackQuestion>) => void; onRemove: () => void;
}) {
  const t = useTranslations("Feedback");
  const { ref, handleRef, isDragging } = useSortable({ id: q.id, index, group: "feedback-questions", type: "feedback-question", accept: "feedback-question", disabled: pending, plugins: [] });
  const builtin = isBuiltinQuestion(q.id);
  const typeLabel = q.type === "nps" ? "NPS" : q.type === "rating" ? "1–5" : t(q.type === "text" ? "editor.textShort" : "editor.choiceShort");
  const detailsId = `feedback-question-${q.id}`;
  return <li ref={ref} data-question-id={q.id} data-dragging={isDragging || undefined} className={cn(styles.question, isDragging && styles.dragging)}>
    <div className={styles.row}>
      <Tooltip content={isDragging ? undefined : t("editor.dragQuestion", { name: label })}><button ref={handleRef} type="button" disabled={pending} aria-label={t("editor.dragQuestion", { name: label })} aria-describedby="feedback-reorder-hint" className={cn(styles.iconButton, styles.handle)}><GripVertical size={16} aria-hidden /></button></Tooltip>
      <Textarea ref={resizeTextarea} rows={1} autoFocus={!builtin && expanded && !q.label} className={styles.questionText} aria-label={t("editor.wording")} maxLength={500} value={q.label} placeholder={t("editor.wording")} onInput={event => resizeTextarea(event.currentTarget)} onChange={event => onUpdate({ label: event.target.value })} />
      <span className={styles.type} title={builtin ? t("editor.standard") : t("editor.custom")}>{typeLabel}</span>
      <Tooltip content={t("editor.visible")}><button type="button" role="switch" aria-label={t("editor.visible")} aria-checked={q.visible} disabled={pending} className={cn(styles.iconButton, styles.visibility)} onClick={() => onUpdate({ visible: !q.visible })}>
        <span aria-hidden className={styles.switchTrack} data-checked={q.visible}><span /></span>
      </button></Tooltip>
      {!builtin ? <Tooltip content={t("editor.questionSettings")}><button id={`${detailsId}-toggle`} type="button" disabled={pending} aria-label={t("editor.questionSettings")} aria-expanded={expanded} aria-controls={detailsId} className={cn(styles.iconButton, styles.settings)} onClick={onToggle}><SlidersHorizontal size={15} aria-hidden /></button></Tooltip> : <span className={styles.settings} />}
    </div>
    {!builtin ? <AnimatedFormContent id={detailsId} labelledBy={`${detailsId}-toggle`} isOpen={expanded}>
      <div className="mb-2 space-y-3 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-subtle)] p-3 sm:ml-10">
        <div className="flex items-center justify-between gap-3"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs sm:min-h-9"><input type="checkbox" disabled={pending} checked={q.required} onChange={event => onUpdate({ required: event.target.checked })} className="size-4 accent-[var(--ui-action-primary)]" />{t("required")}</label><Button size="compact" variant="ghost" disabled={pending} className="text-[var(--ui-danger-text)]" aria-label={t("editor.remove")} onClick={onRemove}><Trash2 size={14} aria-hidden />{t("editor.remove")}</Button></div>
        {q.type === "choice" ? <div className="max-w-md space-y-2"><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("editor.choicesHint")}</p>{q.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-center gap-1"><Input aria-label={t("editor.option", { number: optionIndex + 1 })} className={compactField} value={option} maxLength={200} placeholder={t("editor.option", { number: optionIndex + 1 })} onChange={event => onUpdate({ options: q.options.map((value, i) => i === optionIndex ? event.target.value : value) })} /><Button variant="ghost" size="compact" disabled={pending} className="size-11 shrink-0 px-0 sm:size-9" aria-label={t("editor.removeOption")} onClick={() => onUpdate({ options: q.options.filter((_, i) => i !== optionIndex) })}><Trash2 size={14} aria-hidden /></Button></div>)}<Button size="compact" variant="ghost" disabled={pending} onClick={() => onUpdate({ options: [...q.options, ""] })}><Plus size={14} aria-hidden />{t("editor.addOption")}</Button></div> : null}
      </div>
    </AnimatedFormContent> : null}
  </li>;
}
