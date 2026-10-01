"use client";
import ProposalPreview from "./preview";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { ChevronDown, Save } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { phoneDisplay } from "@/lib/ukrainian-phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { studioContactDetailsSchema, studioContactDetailsInputSchema, studioWebsiteDisplay, type StudioContactDetails, proposalPresentation, proposalPresentationSchema, proposalSnapshotSchema, type ProposalPresentation, type ProposalSnapshot, proposalDesignVariants, proposalDesignVariantSchema, DEFAULT_PROPOSAL_DESIGN_VARIANT, type ProposalDesignVariant } from "@/lib/finance-proposal";

const errorSchema = z.enum(["error", "numberRequired", "agreementRequired", "changed", "noRows"]);
const responseSchema = z.object({ source: proposalSnapshotSchema.nullable(), error: errorSchema.nullable(), history: z.array(z.object({ id: z.uuid(), revision: z.number(), created_at: z.string(), designVariant: proposalDesignVariantSchema })) });
type ProposalData = z.infer<typeof responseSchema>;
function editableContacts(details: StudioContactDetails) {
  return {...details,website:studioWebsiteDisplay(details.website),phone:phoneDisplay(details.phone),contactPerson:details.contactPerson ?? ""};
}
export default function ProposalEditor({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations("Finance.proposal");
  const noteId=useId();
  const contactsId=useId();
  const endpoint = `/api/projects/${projectId}/proposals`;
  const [data, setData] = useState<ProposalData | null>(null);
  const [source, setSource] = useState<ProposalSnapshot | null>(null);
  const [presentation, setPresentation] = useState<ProposalPresentation | null>(null);
  const [contacts, setContacts] = useState<StudioContactDetails | null>(null);
  const [contactsFeedback, setContactsFeedback] = useState<"saved" | "error" | null>(null);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState("");
  const [designVariant, setDesignVariant] = useState<ProposalDesignVariant>(DEFAULT_PROPOSAL_DESIGN_VARIANT);
  const [designPreviews, setDesignPreviews] = useState<Partial<Record<ProposalDesignVariant, string>>>({});
  const [error, setError] = useState<z.infer<typeof errorSchema> | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const requestId = useRef(crypto.randomUUID());
  const designSelect = useRef<HTMLButtonElement>(null);
  const valid = presentation && proposalPresentationSchema.safeParse(presentation).success;

  const savedContacts = source?.studioContactDetails ? editableContacts(source.studioContactDetails) : null;
  const contactsDirty = !!contacts && JSON.stringify(contacts) !== JSON.stringify(savedContacts);
  // A person can be overridden for this proposal; other studio settings still require saving.
  const contactsRequireSave = !!contacts && (['website','email','phone','businessAddress'] as const).some(field => contacts[field] !== savedContacts?.[field]);
  const contactsValid = !!contacts && studioContactDetailsInputSchema.safeParse(contacts).success;
  const contactsSummary = contacts ? [contacts.contactPerson, contacts.phone, contacts.email].filter(Boolean).join(" · ") : "";

  async function reload(newRevision = false) {
    const loadId=++loadRequest.current;
    setLoading(true); setError(null); setSelected(""); setPreview(""); setDesignPreviews({}); setSource(null); setPresentation(null);
    try {
      const response = await fetch(newRevision ? `${endpoint}?draft=1` : endpoint);
      if (!response.ok) throw new Error("load");
      const loaded = responseSchema.parse(await response.json());
      if (loadId !== loadRequest.current) return;
      setData(loaded);
      setDesignVariant(loaded.history[0]?.designVariant ?? DEFAULT_PROPOSAL_DESIGN_VARIANT);
      const latest = !newRevision ? loaded.history[0] : undefined;
      if (latest) {
        setSelected(latest.id); setPreview(`${endpoint}?id=${latest.id}`);
      } else {
        setSource(loaded.source); setPresentation(loaded.source ? {...proposalPresentation(loaded.source),contact:phoneDisplay(loaded.source.contact)} : null);
        const details = loaded.source?.studioContactDetails;
        setContactsOpen(!details || !studioContactDetailsInputSchema.safeParse(details).success || !Object.values(details).some(value => value?.trim()));
        setContacts(details ? editableContacts(details) : null); setContactsFeedback(null); setError(loaded.error);
      }
      requestId.current = crypto.randomUUID();
    } catch { if(loadId === loadRequest.current) setError("error"); }
    finally { if(loadId === loadRequest.current) setLoading(false); }
  }
  useEffect(() => { void reload(); return () => {loadRequest.current++;}; }, [projectId]);

  useEffect(() => {
    if (selected || !source || !presentation || !valid ) return;
    const controller = new AbortController();
    const objectUrls: string[] = [];
    const timer = setTimeout(async () => {
      setLoading(true); setDesignPreviews({});
      try {
        const previews = await Promise.all([DEFAULT_PROPOSAL_DESIGN_VARIANT, ...proposalDesignVariants.map(item => item.value)].map(async variant => {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "preview", requestId: requestId.current, source, presentation: { ...presentation, designVariant: variant } }), signal: controller.signal });
          if (!response.ok) {
            const result = z.object({ error: errorSchema }).parse(await response.json());
            throw new Error(result.error);
          }
          const blob = await response.blob();
          if (controller.signal.aborted) throw new Error("aborted");
          const url = URL.createObjectURL(blob); objectUrls.push(url);
          return [variant, url];
        }));
        if (!controller.signal.aborted) { setDesignPreviews(Object.fromEntries(previews)); setError(null); }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(errorSchema.safeParse(error instanceof Error ? error.message : null).data ?? "error");
          controller.abort(); objectUrls.forEach(url => URL.revokeObjectURL(url)); setLoading(false);
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); objectUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [endpoint, source, presentation, selected, valid]);

  async function saveContacts() {
    if (!contacts || !contactsValid) return;
    setPending(true); setContactsFeedback(null);
    try {
      const response = await fetch("/api/studio/contact-details", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(contacts)});
      if (!response.ok) throw new Error("save");
      const saved = studioContactDetailsSchema.parse(await response.json());
      setContacts(editableContacts(saved)); setSource(old=>old ? {...old,studioContactDetails:saved} : old);
      requestId.current=crypto.randomUUID(); setDesignPreviews({}); setLoading(true); setContactsFeedback("saved");
    } catch { setContactsFeedback("error"); }
    finally { setPending(false); }
  }
  async function generate() {
    if (!source || !presentation || contactsRequireSave || !contactsValid || loading || !designPreviews[designVariant]) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "generate", requestId: requestId.current, source, presentation: { ...presentation, designVariant } }) });
      if (!response.ok) { const result = z.object({ error: errorSchema }).parse(await response.json()); setError(result.error); return; }
      const { id } = z.object({ id: z.uuid() }).parse(await response.json());
      setSelected(id); setPreview(`${endpoint}?id=${id}`);
      setData((old) => old ? { ...old, history: [{ id, revision: source.revision, created_at: new Date().toISOString(), designVariant }, ...old.history.filter((item) => item.id !== id)] } : old);
    } catch { setError("error"); }
    finally { setPending(false); }
  }
  function edit(field: keyof ProposalPresentation, value: string) {
    setLoading(true); setDesignPreviews({});
    setPresentation((old) => old ? { ...old, [field]: value } : old);
    requestId.current = crypto.randomUUID();
  }
  const previewUrl = selected ? preview : designPreviews[designVariant];
  return <Dialog isOpen onRequestClose={reason => {
    // Dialog captures Escape before the Select can handle it.
    if (reason === "escape" && designSelect.current?.getAttribute("aria-expanded") === "true") {
      designSelect.current.click();
      return;
    }
    onClose();
  }} closeDisabled={pending} title={t("action")} closeLabel={t("close")} className="sm:!max-w-[70rem] sm:!h-[calc(100dvh-2rem)]">
    <div className="grid min-h-0 flex-1 overflow-y-auto md:overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4 border-b border-[var(--ui-border)] p-4 md:overflow-y-auto md:border-b-0 md:border-r sm:p-6">
        {data?.history.length ? <section aria-label={t("history")} className="space-y-2"><h3 className="text-sm font-medium">{t("history")}</h3><div className="flex flex-wrap gap-2">{data.history.map((item) => <Button key={item.id} type="button" variant="outline" size="sm" disabled={pending} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setDesignVariant(item.designVariant); setPreview(`${endpoint}?id=${item.id}`); setLoading(false); setError(null); }}>{t("revision", { number: item.revision })}</Button>)}</div></section> : null}
        {selected ? <><p className="text-sm text-[var(--ui-text-secondary)]">{t("saved")}</p><Button variant="outline" onClick={() => void reload(true)} disabled={pending}>{t("newRevision")}</Button></> : presentation && source ? <fieldset disabled={pending} className="min-w-0 space-y-3">
          <p className="text-sm font-medium">№ {source.projectNumber} · {t("revision", { number: source.revision })}</p>
          {([['projectTitle','title'],['clientName','client'],['contact','contact'],['address','address']] as const).map(([field, label]) => <FormField key={field} label={t(label)}>{field === 'contact' ? <PhoneInput value={presentation.contact} maxLength={1000} onValueChange={value => edit('contact',phoneDisplay(value))}/> : <Input value={presentation[field]} maxLength={field === 'address' ? 1000 : 500} required={field === 'projectTitle'} onChange={event => edit(field,event.target.value)}/>}</FormField>)}
          <FormField as="div" label={<label htmlFor={noteId}>{t("intro")}</label>}><Textarea id={noteId} className="resize-none overflow-hidden" ref={element=>{if(element){element.style.height="auto";element.style.height=`${element.scrollHeight}px`;}}} onInput={event=>{event.currentTarget.style.height="auto";event.currentTarget.style.height=`${event.currentTarget.scrollHeight}px`;}} placeholder={t("notePlaceholder")} value={presentation.intro} maxLength={1000} rows={3} onChange={(event) => edit("intro", event.target.value)}/></FormField>
          {contacts ? <section className="border-t border-[var(--ui-border)] pt-3" aria-label={t("studioContacts")}>
            <h3><Button type="button" variant="ghost" className="h-auto min-h-10 w-full justify-between gap-3 whitespace-normal px-1 py-1.5 text-left font-medium" aria-label={t("studioContacts")} aria-describedby={contactsSummary ? `${contactsId}-summary` : undefined} aria-expanded={contactsOpen} aria-controls={contactsId} onClick={() => setContactsOpen(open => !open)}>
              <span className="min-w-0"><span className="block text-sm">{t("studioContacts")}</span>{contactsSummary ? <span id={`${contactsId}-summary`} title={contactsSummary} className="mt-0.5 line-clamp-2 break-words text-xs font-normal text-[var(--ui-text-muted)]">{contactsSummary}</span> : null}</span>
              <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-[var(--ui-text-muted)] transition-transform duration-200 motion-reduce:transition-none ${contactsOpen ? "rotate-180" : ""}`}/>
            </Button></h3>
            <div id={contactsId} aria-hidden={!contactsOpen} inert={!contactsOpen} className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${contactsOpen ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"}`}>
              <div className="min-h-0 overflow-hidden"><div className="space-y-3 px-1 pb-1 pt-3">
            {([['contactPerson','contactPerson','text',200],['phone','phone','tel',100],['email','email','email',254],['website','website','text',300],['businessAddress','businessAddress','text',500]] as const).map(([field,label,type,maxLength])=><FormField key={field} className={field === 'contactPerson' ? '!mb-2' : undefined} label={t(label)} error={!studioContactDetailsInputSchema.shape[field].safeParse(contacts[field]).success ? t("contactsInvalid") : undefined}>{field === 'phone' ? <PhoneInput value={contacts.phone} maxLength={maxLength} onValueChange={value=>{setContacts({...contacts,phone:phoneDisplay(value)});setContactsFeedback(null);}}/> : <Input type={type} inputMode={field === 'website' ? 'url' : undefined} value={contacts[field] ?? ''} maxLength={maxLength} onBlur={field === 'website' ? ()=>setContacts({...contacts,website:studioWebsiteDisplay(contacts.website)}) : undefined} onChange={event=>{setContacts({...contacts,[field]:event.target.value});if(field==='contactPerson') edit('studioContactPerson',event.target.value);setContactsFeedback(null);}}/>}</FormField>)}
            <Button type="button" variant="outline" size="sm" className="gap-2 bg-[var(--ui-surface-strong)] text-[var(--ui-text)] hover:bg-[var(--ui-border-strong)] disabled:cursor-not-allowed disabled:bg-[var(--ui-surface-muted)] disabled:text-[var(--ui-text-muted)] disabled:opacity-60" disabled={pending || !contactsDirty || !contactsValid} onClick={saveContacts}><Save aria-hidden="true" className="size-3.5"/>{t("saveContacts")}</Button>
            {contactsFeedback ? <p role={contactsFeedback === "error" ? "alert" : "status"} className="text-xs">{t(contactsFeedback === "saved" ? "contactsSaved" : "contactsError")}</p> : null}
              </div></div>
            </div>
          </section> : null}
        </fieldset> : null}
        {!selected && source && !source.rows.length ? <p role="alert" className="text-sm text-[var(--ui-warning-text)]">{t("noRows")}</p> : null}
        {error ? <div role="alert" className="space-y-2 text-sm text-[var(--ui-danger-text)]"><p>{t(error)}</p><Button variant="outline" onClick={() => void reload(true)}>{t("refresh")}</Button></div> : null}
      </div>
      <div data-proposal-pane data-proposal-variant={designVariant} className="flex h-[70dvh] min-h-[20rem] flex-col overflow-hidden bg-[var(--ui-surface-muted)] p-2 md:h-full md:min-h-0" aria-busy={loading}>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-2 pb-2 text-xs text-[var(--ui-text-secondary)]">
          <span>{t("design")}</span>
          <Select ref={designSelect} aria-label={t("design")} size="compact" width="content" contentMinWidth="natural" className="min-w-48 focus-visible:!outline-none focus-visible:ring-1 focus-visible:ring-offset-1 data-[state=open]:ring-1 data-[state=open]:ring-offset-1" value={designVariant} disabled={pending || !!selected || loading || !source} onValueChange={value => {
            const variant = proposalDesignVariantSchema.parse(value);
            setDesignVariant(variant); requestId.current = crypto.randomUUID();
          }}>
            <SelectItem value={DEFAULT_PROPOSAL_DESIGN_VARIANT}>{t("originalDesign")}</SelectItem>
            {proposalDesignVariants.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </Select>
        </div>
        <div className="relative min-h-0 flex-1">
          {loading ? <p role="status" className="absolute inset-x-0 top-0 p-4 text-sm">{t("loading")}</p> : null}
          {previewUrl ? <ProposalPreview url={previewUrl}/> : null}
        </div>
      </div>
    </div>
    <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3 sm:px-6">
      <Button variant="outline" disabled={pending} onClick={onClose}>{t("close")}</Button>
      {selected ? <a className="inline-flex min-h-11 items-center rounded-[var(--ui-radius-control)] bg-[var(--ui-action-primary)] px-4 text-sm font-medium text-[var(--ui-action-primary-text)]" href={`${endpoint}?id=${selected}&download`}>{t("download")}</a> : <Button onClick={generate} disabled={pending || loading || !previewUrl || !valid || !!error || !source || contactsRequireSave || !contactsValid}>{t("generate")}</Button>}
    </footer>
  </Dialog>;
}
