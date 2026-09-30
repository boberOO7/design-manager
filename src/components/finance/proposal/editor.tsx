"use client";
import ProposalPreview from "./preview";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { studioContactDetailsSchema, type StudioContactDetails, proposalPresentation, proposalPresentationSchema, proposalSnapshotSchema, type ProposalPresentation, type ProposalSnapshot } from "@/lib/finance-proposal";

const errorSchema = z.enum(["error", "numberRequired", "agreementRequired", "changed", "noRows"]);
const responseSchema = z.object({ source: proposalSnapshotSchema.nullable(), error: errorSchema.nullable(), history: z.array(z.object({ id: z.uuid(), revision: z.number(), created_at: z.string() })) });
type ProposalData = z.infer<typeof responseSchema>;
export default function ProposalEditor({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations("Finance.proposal");
  const noteId=useId();
  const endpoint = `/api/projects/${projectId}/proposals`;
  const [data, setData] = useState<ProposalData | null>(null);
  const [source, setSource] = useState<ProposalSnapshot | null>(null);
  const [presentation, setPresentation] = useState<ProposalPresentation | null>(null);
  const [contacts, setContacts] = useState<StudioContactDetails | null>(null);
  const [contactsFeedback, setContactsFeedback] = useState<"saved" | "error" | null>(null);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<z.infer<typeof errorSchema> | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const valid = presentation && proposalPresentationSchema.safeParse(presentation).success;

  const contactsDirty = !!contacts && JSON.stringify(contacts) !== JSON.stringify(source?.studioContactDetails);
  const contactsValid = !!contacts && studioContactDetailsSchema.safeParse(contacts).success;

  async function reload(newRevision = false) {
    const loadId=++loadRequest.current;
    setLoading(true); setError(null); setSelected(""); setPreview(""); setSource(null); setPresentation(null);
    try {
      const response = await fetch(newRevision ? `${endpoint}?draft=1` : endpoint);
      if (!response.ok) throw new Error("load");
      const loaded = responseSchema.parse(await response.json());
      if (loadId !== loadRequest.current) return;
      setData(loaded);
      const latest = !newRevision ? loaded.history[0] : undefined;
      if (latest) {
        setSelected(latest.id); setPreview(`${endpoint}?id=${latest.id}`);
      } else {
        setSource(loaded.source); setPresentation(loaded.source ? proposalPresentation(loaded.source) : null);
        setContacts(loaded.source?.studioContactDetails ?? null); setContactsFeedback(null); setError(loaded.error);
      }
      requestId.current = crypto.randomUUID();
    } catch { if(loadId === loadRequest.current) setError("error"); }
    finally { if(loadId === loadRequest.current) setLoading(false); }
  }
  useEffect(() => { void reload(); return () => {loadRequest.current++;}; }, [projectId]);

  useEffect(() => {
    if (selected || !source || !presentation || !valid ) return;
    const controller = new AbortController();
    let objectUrl = "";
    const timer = setTimeout(async () => {
      setLoading(true); setPreview("");
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "preview", requestId: requestId.current, source, presentation }), signal: controller.signal });
        if (!response.ok) { const result = z.object({ error: errorSchema }).parse(await response.json()); setError(result.error); return; }
        objectUrl = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) { URL.revokeObjectURL(objectUrl); return; }
        setPreview(objectUrl); setError(null);
      } catch { if (!controller.signal.aborted) setError("error"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [endpoint, source, presentation, selected, valid]);

  async function saveContacts() {
    if (!contacts || !contactsValid) return;
    setPending(true); setContactsFeedback(null);
    try {
      const response = await fetch("/api/studio/contact-details", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(contacts)});
      if (!response.ok) throw new Error("save");
      const saved = studioContactDetailsSchema.parse(await response.json());
      setContacts(saved); setSource(old=>old ? {...old,studioContactDetails:saved} : old);
      requestId.current=crypto.randomUUID(); setPreview(""); setLoading(true); setContactsFeedback("saved");
    } catch { setContactsFeedback("error"); }
    finally { setPending(false); }
  }
  async function generate() {
    if (!source || !presentation || contactsDirty) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "generate", requestId: requestId.current, source, presentation }) });
      if (!response.ok) { const result = z.object({ error: errorSchema }).parse(await response.json()); setError(result.error); return; }
      const { id } = z.object({ id: z.uuid() }).parse(await response.json());
      setSelected(id); setPreview(`${endpoint}?id=${id}`);
      setData((old) => old ? { ...old, history: [{ id, revision: source.revision, created_at: new Date().toISOString() }, ...old.history.filter((item) => item.id !== id)] } : old);
    } catch { setError("error"); }
    finally { setPending(false); }
  }
  function edit(field: keyof ProposalPresentation, value: string) {
    setLoading(true); setPreview("");
    setPresentation((old) => old ? { ...old, [field]: value } : old);
    requestId.current = crypto.randomUUID();
  }
  return <Dialog isOpen onRequestClose={onClose} closeDisabled={pending} title={t("action")} closeLabel={t("close")} className="sm:!max-w-[70rem] sm:!h-[calc(100dvh-2rem)]">
    <div className="grid min-h-0 flex-1 overflow-y-auto md:overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-4 border-b border-[var(--ui-border)] p-4 md:overflow-y-auto md:border-b-0 md:border-r sm:p-6">
        {data?.history.length ? <section aria-label={t("history")} className="space-y-2"><h3 className="text-sm font-medium">{t("history")}</h3><div className="flex flex-wrap gap-2">{data.history.map((item) => <Button key={item.id} type="button" variant="outline" size="sm" disabled={pending} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setPreview(`${endpoint}?id=${item.id}`); setLoading(false); setError(null); }}>{t("revision", { number: item.revision })}</Button>)}</div></section> : null}
        {selected ? <><p className="text-sm text-[var(--ui-text-secondary)]">{t("saved")}</p><Button variant="outline" onClick={() => void reload(true)} disabled={pending}>{t("newRevision")}</Button></> : presentation && source ? <fieldset disabled={pending} className="space-y-3">
          <p className="text-sm font-medium">№ {source.projectNumber} · {t("revision", { number: source.revision })}</p>
          <p className="text-xs text-[var(--ui-text-muted)]">{t("documentLanguage")}</p>
          {([['projectTitle','title'],['clientName','client'],['contact','contact'],['address','address']] as const).map(([field, label]) => <FormField key={field} label={t(label)}><Input value={presentation[field]} maxLength={field === "contact" || field === "address" ? 1000 : 500} required={field === "projectTitle"} onChange={(event) => edit(field, event.target.value)}/></FormField>)}
          <FormField as="div" label={<label htmlFor={noteId}>{t("intro")}</label>}><Textarea id={noteId} className="resize-none overflow-hidden" ref={element=>{if(element){element.style.height="auto";element.style.height=`${element.scrollHeight}px`;}}} onInput={event=>{event.currentTarget.style.height="auto";event.currentTarget.style.height=`${event.currentTarget.scrollHeight}px`;}} placeholder={t("notePlaceholder")} value={presentation.intro} maxLength={1000} rows={3} onChange={(event) => edit("intro", event.target.value)}/></FormField>
          {contacts ? <section className="space-y-3 border-t border-[var(--ui-border)] pt-3" aria-label={t("studioContacts")}>
            <h3 className="text-sm font-medium">{t("studioContacts")}</h3>
            <p className="text-xs text-[var(--ui-text-secondary)]">{t("contactsHelp")}</p>
            {([['website','website','url',300],['email','email','email',254],['phone','phone','tel',100],['businessAddress','businessAddress','text',500]] as const).map(([field,label,type,maxLength])=><FormField key={field} label={t(label)} error={!studioContactDetailsSchema.shape[field].safeParse(contacts[field]).success ? t("contactsInvalid") : undefined}><Input type={type} value={contacts[field]} maxLength={maxLength} onChange={event=>{setContacts({...contacts,[field]:event.target.value});setContactsFeedback(null);}}/></FormField>)}
            <Button type="button" variant="outline" size="sm" disabled={pending || !contactsDirty || !contactsValid} onClick={saveContacts}>{t("saveContacts")}</Button>
            {contactsFeedback ? <p role={contactsFeedback === "error" ? "alert" : "status"} className="text-xs">{t(contactsFeedback === "saved" ? "contactsSaved" : "contactsError")}</p> : null}
          </section> : null}
          <p className="text-xs text-[var(--ui-text-secondary)]">{t("help")}</p>
        </fieldset> : null}
        {!selected && source && !source.rows.length ? <p role="alert" className="text-sm text-[var(--ui-warning-text)]">{t("noRows")}</p> : null}
        {error ? <div role="alert" className="space-y-2 text-sm text-[var(--ui-danger-text)]"><p>{t(error)}</p><Button variant="outline" onClick={() => void reload(true)}>{t("refresh")}</Button></div> : null}
      </div>
      <div data-proposal-pane className="relative h-[70dvh] min-h-[20rem] overflow-hidden bg-[var(--ui-surface-muted)] p-2 md:h-full md:min-h-0" aria-busy={loading}>
        {loading ? <p role="status" className="absolute inset-x-0 top-0 p-4 text-sm">{t("loading")}</p> : null}
        {preview ? <ProposalPreview url={preview}/> : null}
      </div>
    </div>
    <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
      <Button variant="outline" disabled={pending} onClick={onClose}>{t("close")}</Button>
      {selected ? <a className="inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] bg-[var(--ui-action-primary)] px-4 text-sm font-medium text-[var(--ui-action-primary-text)]" href={`${endpoint}?id=${selected}&download`}>{t("download")}</a> : <Button onClick={generate} disabled={pending || loading || !preview || !valid || !!error || !source || contactsDirty}>{t("generate")}</Button>}
    </footer>
  </Dialog>;
}
