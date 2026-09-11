"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { EquipmentItem, WorkstationItem } from "@/data/queries/equipment";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_TYPES, isEquipmentType, type EquipmentType } from "@/lib/equipment";
import { CAPACITY_UNITS, CPU_FAMILIES, DRIVE_TYPES, EMPTY_PC_CONFIGURATION, GPU_FAMILIES, MEMORY_TYPES, hasPcConfiguration, pcConfigurationSchema, pcConfigurationSummaries, type PcConfiguration } from "@/lib/pc-configuration";
import { cn } from "@/lib/utils";

type Section = "identification" | "processor" | "graphics" | "memory" | "drives" | "specifications";

// Measure the mounted inner content so both toggles and added drives transition
// actual layout height, including inside a height-constrained dialog.
function AnimatedFormContent({ children, isOpen, id, labelledBy }: { children: ReactNode; isOpen: boolean; id?: string; labelledBy?: string }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div id={id} role={id ? "region" : undefined} aria-labelledby={labelledBy} aria-hidden={!isOpen} inert={!isOpen} style={{ height: isOpen ? height : 0 }} className={cn("shrink-0 overflow-hidden transition-[height,opacity] duration-[220ms] ease-out motion-reduce:transition-none", isOpen ? "opacity-100" : "opacity-0")}><div ref={content} className="flow-root">{children}</div></div>;
}

function AccordionSection({ children, title, summary, isOpen, onOpen }: { children: ReactNode; title: string; summary: string; isOpen: boolean; onOpen: () => void }) {
  const id = useId();
  const t = useTranslations("Equipment");
  const [invalid, setInvalid] = useState(false);
  return <section className="min-w-0 shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)]" onInvalidCapture={(event) => {
    event.preventDefault();
    setInvalid(true);
    if (!isOpen) onOpen();
    const target = event.target;
    if (target instanceof HTMLElement) window.setTimeout(() => target.focus(), 230);
  }} onChange={() => setInvalid(false)}>
    <h3><button id={`${id}-trigger`} type="button" aria-expanded={isOpen} aria-controls={id} onClick={onOpen} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]"><span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span><span className="mt-0.5 block truncate text-xs font-normal text-[var(--ui-text-muted)]" title={summary}>{summary || t("configuration.empty")}</span></span><ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform duration-[220ms] motion-reduce:transition-none", isOpen && "rotate-180")} /></button></h3>
    <AnimatedFormContent id={id} labelledBy={`${id}-trigger`} isOpen={isOpen}><div className="grid gap-4 border-t border-[var(--ui-border-subtle)] p-4">{invalid ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t("configuration.invalid")}</p> : null}{children}</div></AnimatedFormContent>
  </section>;
}

function ConfigurationSelect<T extends string>({ label, value, options, onChange, optionLabel }: { label: string; value: T | null; options: readonly T[]; onChange: (value: T | null) => void; optionLabel?: (value: T) => string }) {
  const t = useTranslations("Equipment");
  return <FormField label={label}><Select value={value ?? "__none"} onValueChange={(value) => onChange(options.find((option) => option === value) ?? null)}><SelectItem value="__none">{t("configuration.empty")}</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{optionLabel?.(option) ?? option}</SelectItem>)}</Select></FormField>;
}

function Segments<T extends string>({ label, value, options, onChange, optionLabel }: { label: string; value: T | null; options: readonly T[]; onChange: (value: T) => void; optionLabel?: (value: T) => string }) {
  const name = useId();
  return <fieldset className="min-w-0"><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{label}</legend><div className="inline-flex flex-wrap gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{options.map((option) => <label key={option} className="relative cursor-pointer"><input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} /><span className="flex min-h-10 items-center rounded-[var(--ui-radius-control)] px-3 text-sm text-[var(--ui-text-secondary)] peer-checked:bg-[var(--ui-surface)] peer-checked:font-semibold peer-checked:text-[var(--ui-text)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)]">{optionLabel?.(option) ?? option}</span></label>)}</div></fieldset>;
}

function CapacityInput({ label, value, onChange, max = 1_000_000, integer = false }: { label: string; value: number | null; onChange: (value: number | null) => void; max?: number; integer?: boolean }) {
  return <FormField label={label}><Input type="number" min={integer ? 1 : 0.01} max={max} step={integer ? 1 : "any"} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.valueAsNumber)} /></FormField>;
}

export function EquipmentFormFields({ item, initialType, workstations }: { item?: EquipmentItem; initialType?: EquipmentType; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const [type, setType] = useState<EquipmentType>(item?.equipmentType ?? initialType ?? "other");
  const [recurring, setRecurring] = useState(item?.recurringMaintenanceEnabled ?? false);
  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [config, setConfig] = useState<PcConfiguration>(item?.pcConfiguration ?? EMPTY_PC_CONFIGURATION);
  const [identity, setIdentity] = useState({ manufacturer: item?.manufacturer ?? "", model: item?.model ?? "", serialNumber: item?.serialNumber ?? "", assetTag: item?.assetTag ?? "" });
  const [legacy, setLegacy] = useState({ cpu: item?.cpu ?? "", gpu: item?.gpu ?? "", ram: item?.ram ?? "", storage: item?.storage ?? "" });
  const hasSavedSpecs = Boolean(item && (item.pcConfiguration || item.cpu || item.gpu || item.ram || item.storage));
  const pc = type === "pc";
  const computer = pc || type === "laptop";
  const cpu = config.processor;
  const gpu = config.graphics?.mode === "discrete" ? config.graphics.details : null;
  const familyLabel = (value: string) => value === "Other" ? t("configuration.other") : value === "Professional" ? t("configuration.professional") : value;
  const summaries = pcConfigurationSummaries(config, { integrated: t("configuration.integrated"), other: t("configuration.other"), professional: t("configuration.professional"), gb: t("configuration.gb"), tb: t("configuration.tb"), modules: (count) => t("configuration.modules", { count }), drive: (value) => t(`configuration.driveTypes.${value}`) });
  const section = (key: Section, title: string, summary: string, children: ReactNode) => <AccordionSection key={key} title={title} summary={summary} isOpen={openSection === key} onOpen={() => setOpenSection(openSection === key ? null : key)}>{children}</AccordionSection>;
  const savedText = (key: keyof typeof legacy) => legacy[key] ? <p className="break-words rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-xs leading-5 text-[var(--ui-text-secondary)]"><span className="font-semibold">{t("configuration.savedText")}: </span>{legacy[key]}<span className="mt-1 block text-[var(--ui-text-muted)]">{t("configuration.savedTextHint")}</span></p> : null;
  return <>
    <div className="grid shrink-0 gap-4 sm:grid-cols-2"><FormField label={t("form.type")}><Select name="equipmentType" value={type} onValueChange={(value) => { if (isEquipmentType(value)) { setType(value); setOpenSection(null); } }}>{EQUIPMENT_TYPES.map((value) => <SelectItem key={value} value={value} disabled={hasSavedSpecs && value !== item?.equipmentType}>{t(`types.${value}`)}</SelectItem>)}</Select>{hasSavedSpecs ? <span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("configuration.typePreserved")}</span> : null}</FormField><FormField label={t("form.state")}>{item?.lifecycleState === "in_service" ? <><input type="hidden" name="lifecycleState" value="in_service" /><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 text-sm">{t("states.in_service")}</div></> : <Select name="lifecycleState" defaultValue={item?.lifecycleState ?? "active"}>{EQUIPMENT_LIFECYCLE_STATES.filter((value) => value !== "in_service").map((value) => <SelectItem key={value} value={value}>{t(`states.${value}`)}</SelectItem>)}</Select>}</FormField></div>
    <div className="grid shrink-0 gap-4 sm:grid-cols-2"><FormField className="w-full" label={t("form.displayName")} optional optionalLabel={t("optional")}><Input data-dialog-initial-focus={!item || undefined} name="displayName" maxLength={160} defaultValue={item?.displayName} /></FormField>
    <FormField className="w-full" label={t("form.workstation")} optional optionalLabel={t("optional")}><Select name="workstationId" defaultValue={item?.workstationId ?? "__none"}><SelectItem value="__none">{t("location.unattached")}</SelectItem>{workstations.map((workstation) => <SelectItem key={workstation.id} value={workstation.id}>{t("workstation.numberLabel", { number: workstation.number })}{workstation.name ? ` · ${workstation.name}` : ""}</SelectItem>)}</Select></FormField></div>
    {section("identification", t("form.identification"), Object.values(identity).filter(Boolean).join(" · "), <><div className="grid gap-4 sm:grid-cols-2">{(["manufacturer", "model", "serialNumber", "assetTag"] as const).map((key) => pc && (key === "manufacturer" || key === "model") && !item?.[key] ? <input key={key} type="hidden" name={key} value={identity[key]} /> : <FormField key={key} label={t(`form.${key}`)} optional optionalLabel={t("optional")}><Input name={key} value={identity[key]} maxLength={160} onChange={(event) => setIdentity({ ...identity, [key]: event.target.value })} />{key === "assetTag" ? <span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("form.assetTagDescription")}</span> : null}</FormField>)}</div>{pc && (item?.manufacturer || item?.model) ? <p className="text-xs text-[var(--ui-text-muted)]">{t("configuration.savedIdentity")}</p> : null}</>)}
    <input type="hidden" name="pcConfiguration" value={pc && hasPcConfiguration(config) ? JSON.stringify(config) : ""} />
    {pc ? <>
      {(["cpu", "gpu", "ram", "storage"] as const).map((key) => <input key={key} type="hidden" name={key} value={legacy[key]} />)}
      {section("processor", t("form.cpu"), summaries.processor || legacy.cpu, <>
        <Segments label={t("form.manufacturer")} value={cpu?.manufacturer ?? null} options={["AMD", "Intel"] as const} onChange={(manufacturer) => setConfig({ ...config, processor: { manufacturer, family: null, model: null } })} />
        {cpu ? <div className="grid gap-4 sm:grid-cols-2"><ConfigurationSelect label={t("configuration.family")} value={cpu.family} options={CPU_FAMILIES[cpu.manufacturer]} optionLabel={familyLabel} onChange={(family) => setConfig({ ...config, processor: pcConfigurationSchema.shape.processor.parse({ ...cpu, family }) })} /><FormField label={t("form.model")} optional optionalLabel={t("optional")}><Input maxLength={160} value={cpu.model ?? ""} onChange={(event) => setConfig({ ...config, processor: { ...cpu, model: event.target.value || null } })} /></FormField></div> : null}
        {savedText("cpu")}
      </>)}
      {section("graphics", t("form.gpu"), summaries.graphics || legacy.gpu, <>
        <Segments label={t("configuration.graphicsMode")} value={config.graphics?.mode ?? null} options={["integrated", "discrete"] as const} optionLabel={(value) => t(`configuration.${value}`)} onChange={(mode) => setConfig({ ...config, graphics: mode === "integrated" ? { mode } : { mode, details: { vendor: "NVIDIA", family: null, model: null, vramGb: null } } })} />
        {gpu ? <><Segments label={t("configuration.vendor")} value={gpu.vendor} options={["NVIDIA", "AMD", "Intel", "Other"] as const} optionLabel={familyLabel} onChange={(vendor) => setConfig({ ...config, graphics: { mode: "discrete", details: { vendor, family: null, model: null, vramGb: null } } })} /><div className="grid gap-4 sm:grid-cols-2"><ConfigurationSelect label={t("configuration.family")} value={gpu.family} options={GPU_FAMILIES[gpu.vendor]} optionLabel={familyLabel} onChange={(family) => setConfig({ ...config, graphics: pcConfigurationSchema.shape.graphics.parse({ mode: "discrete", details: { ...gpu, family } }) })} /><FormField label={t("form.model")} optional optionalLabel={t("optional")}><Input maxLength={160} value={gpu.model ?? ""} onChange={(event) => setConfig({ ...config, graphics: { mode: "discrete", details: { ...gpu, model: event.target.value || null } } })} /></FormField><CapacityInput label={t("configuration.vram")} value={gpu.vramGb} onChange={(vramGb) => setConfig({ ...config, graphics: { mode: "discrete", details: { ...gpu, vramGb } } })} /></div></> : null}
        {savedText("gpu")}
      </>)}
      {section("memory", t("form.ram"), summaries.memory || legacy.ram, <><div className="grid gap-4 sm:grid-cols-2"><CapacityInput label={t("configuration.totalMemory")} value={config.memory.capacityGb} onChange={(capacityGb) => setConfig({ ...config, memory: { ...config.memory, capacityGb } })} /><ConfigurationSelect label={t("configuration.memoryType")} value={config.memory.generation} options={MEMORY_TYPES} optionLabel={familyLabel} onChange={(generation) => setConfig({ ...config, memory: { ...config.memory, generation } })} /><CapacityInput label={t("configuration.moduleCount")} value={config.memory.moduleCount} max={128} integer onChange={(moduleCount) => setConfig({ ...config, memory: { ...config.memory, moduleCount } })} /></div>{savedText("ram")}</>)}
      {section("drives", t("form.storage"), summaries.drives || legacy.storage, <><div className="grid gap-3">{config.drives.map((drive, index) => <fieldset key={index} className="min-w-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3"><legend className="px-1 text-xs font-medium">{t("configuration.driveNumber", { number: index + 1 })}</legend><div className="grid grid-cols-[minmax(0,1fr)_5rem_2.75rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_2.75rem]"><div className="col-span-3 sm:col-span-1"><ConfigurationSelect label={t("configuration.driveType")} value={drive.type} options={DRIVE_TYPES} optionLabel={(value) => t(`configuration.driveTypes.${value}`)} onChange={(value) => { if (value) setConfig({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, type: value } : entry) }); }} /></div><FormField label={t("configuration.capacity")}><Input type="number" min={0.01} max={1_000_000} step="any" required value={drive.capacity || ""} onChange={(event) => setConfig({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, capacity: event.target.value === "" ? 0 : event.target.valueAsNumber } : entry) })} /></FormField><FormField label={t("configuration.unit")}><Select value={drive.unit} onValueChange={(value) => { const unit = CAPACITY_UNITS.find((unit) => unit === value); if (unit) setConfig({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, unit } : entry) }); }}>{CAPACITY_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit === "TB" ? t("configuration.tb") : t("configuration.gb")}</SelectItem>)}</Select></FormField><Button type="button" variant="ghost" className="h-11 w-11 p-0" aria-label={t("configuration.removeDrive", { number: index + 1 })} onClick={() => setConfig({ ...config, drives: config.drives.filter((_, i) => i !== index) })}><Trash2 aria-hidden="true" className="size-4" /></Button></div></fieldset>)}</div><Button type="button" variant="outline" className="justify-self-start" disabled={config.drives.length >= 32} onClick={() => setConfig({ ...config, drives: [...config.drives, { type: "nvme_ssd", capacity: 1, unit: "TB" }] })}><Plus aria-hidden="true" className="mr-2 size-4" />{t("configuration.addDrive")}</Button>{savedText("storage")}</>)}
    </> : type === "laptop" ? section("specifications", t("form.specifications"), Object.values(legacy).filter(Boolean).join(" · "), <div className="grid gap-4 sm:grid-cols-2">{(["cpu", "gpu", "ram", "storage"] as const).map((key) => <FormField key={key} label={t(`form.${key}`)} optional optionalLabel={t("optional")}><Input name={key} value={legacy[key]} maxLength={500} onChange={(event) => setLegacy({ ...legacy, [key]: event.target.value })} /></FormField>)}</div>) : null}
    {!computer ? (["cpu", "gpu", "ram", "storage"] as const).map((key) => <input key={key} type="hidden" name={key} value="" />) : null}
    <fieldset className="shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-4"><legend className="px-1 text-sm font-semibold text-[var(--ui-text)]">{t("maintenance.recurringTitle")}</legend><label className="flex min-h-11 cursor-pointer items-start gap-3"><input className="mt-0.5 size-5 accent-[var(--ui-action-primary)]" type="checkbox" name="recurringMaintenanceEnabled" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span><span className="block text-sm font-medium">{t("maintenance.enabled")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{t("maintenance.enabledDescription")}</span></span></label><AnimatedFormContent isOpen={recurring}><div className="grid gap-4 pt-4 sm:grid-cols-2"><FormField label={t("maintenance.interval")}><Input type="number" name="maintenanceIntervalMonths" min={1} max={120} disabled={!recurring} required={recurring} defaultValue={item?.maintenanceIntervalMonths ?? 12} /></FormField><FormField label={t("maintenance.nextDueDate")}><Input type="date" name="nextMaintenanceDueDate" disabled={!recurring} required={recurring} defaultValue={item?.nextMaintenanceDueDate ?? ""} /></FormField></div></AnimatedFormContent></fieldset>
    <FormField className="w-full" label={t("form.notes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} defaultValue={item?.notes ?? ""} /></FormField>
  </>;
}
