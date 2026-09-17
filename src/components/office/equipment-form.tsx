"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CircuitBoard, Cpu, Fingerprint, Gpu, HardDrive, MemoryStick, Power, ChevronDown, Plus, Trash2, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { BinarySwitch } from "@/components/ui/binary-switch";
import { EquipmentCatalogCombobox } from "@/components/office/equipment-catalog-combobox";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { EquipmentItem, WorkstationItem } from "@/data/queries/equipment";
import { EQUIPMENT_LIFECYCLE_STATES, EQUIPMENT_TYPES, isEquipmentType, type EquipmentType } from "@/lib/equipment";
import { CAPACITY_UNITS, CPU_FAMILIES, DRIVE_TYPES, GPU_FAMILIES, MEMORY_TYPES, POWER_SUPPLY_EFFICIENCIES, computerConfigurationSchema, computerConfigurationSummaries, hasComputerConfiguration, normalizeComputerConfiguration, type ComputerConfiguration } from "@/lib/pc-configuration";
import type { EquipmentFieldUpdate } from "@/lib/validation/equipment";
import { cn } from "@/lib/utils";

type Section = "identification" | "processor" | "graphics" | "memory" | "drives" | "motherboard" | "powerSupply";

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
  return <div id={id} role={id ? "region" : undefined} aria-labelledby={labelledBy} aria-hidden={!isOpen} inert={!isOpen} style={{ height: isOpen ? height : 0 }} className={cn("shrink-0 overflow-hidden transition-[height,opacity] duration-[220ms] ease-out", isOpen ? "opacity-100" : "opacity-0")}><div ref={content} className="flow-root">{children}</div></div>;
}

function AccordionSection({ children, title, summary, isOpen, onOpen, Icon }: { Icon: LucideIcon; children: ReactNode; title: string; summary: string; isOpen: boolean; onOpen: () => void }) {
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
    <h3><button id={`${id}-trigger`} type="button" aria-expanded={isOpen} aria-controls={id} onClick={onOpen} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--ui-radius-control)] px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)]"><Icon className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span><span className="mt-0.5 block truncate text-xs font-normal text-[var(--ui-text-muted)]" title={summary}>{summary || t("configuration.empty")}</span></span><ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform duration-[220ms]", isOpen && "rotate-180")} /></button></h3>
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

function CapacityInput({ label, value, onChange, onBlur, max = 1_000_000, integer = false }: { label: string; value: number | null; onChange: (value: number | null) => void; onBlur?: () => void; max?: number; integer?: boolean }) {
  return <FormField label={label}><Input type="number" min={integer ? 1 : 0.01} max={max} step={integer ? 1 : "any"} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.valueAsNumber)} onBlur={onBlur} /></FormField>;
}

export function EquipmentFormFields({ item, initialType, showMaintenanceFields = true, workstations, onSave }: { onSave?: (patch: EquipmentFieldUpdate) => void; item?: EquipmentItem; initialType?: EquipmentType; showMaintenanceFields?: boolean; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const requestedText = useRef(new Map<string, string>());
  const [type, setType] = useState<EquipmentType>(item?.equipmentType ?? initialType ?? "other");
  const [recurring, setRecurring] = useState(item?.recurringMaintenanceEnabled ?? false);
  const [openSection, setOpenSection] = useState<Section | null>(null);
  const savedConfiguration = normalizeComputerConfiguration(item?.pcConfiguration);
  const [config, setConfig] = useState<ComputerConfiguration>(savedConfiguration);
  const [identity, setIdentity] = useState({ manufacturer: item?.manufacturer ?? "", model: item?.model ?? "", serialNumber: item?.serialNumber ?? "" });
  const [legacy] = useState({ cpu: item?.cpu ?? "", gpu: item?.gpu ?? "", ram: item?.ram ?? "", storage: item?.storage ?? "" });
  function saveText(field: "displayName" | "manufacturer" | "model" | "serialNumber" | "notes" | "cpu" | "gpu" | "ram" | "storage", value: string) {
    if (!item || !onSave) return;
    const normalized = value.trim();
    if (normalized === (requestedText.current.get(field) ?? item[field] ?? "")) return;
    requestedText.current.set(field, normalized);
    onSave({ equipmentId: item.id, field, value: normalized });
  }
  const pc = type === "pc";
  const computer = pc || type === "laptop";
  const requestedConfiguration = useRef(JSON.stringify(hasComputerConfiguration(savedConfiguration) ? (pc ? savedConfiguration : { ...savedConfiguration, motherboard: undefined, powerSupply: undefined }) : null));
  function persistConfiguration(next: ComputerConfiguration) {
    if (!item || !onSave) return;
    const candidate = pc ? next : { ...next, motherboard: undefined, powerSupply: undefined };
    const parsed = computerConfigurationSchema.safeParse(candidate);
    if (!parsed.success) return;
    const value = hasComputerConfiguration(parsed.data) ? parsed.data : null;
    const serialized = JSON.stringify(value);
    if (serialized === requestedConfiguration.current) return;
    requestedConfiguration.current = serialized;
    onSave({ equipmentId: item.id, field: "pcConfiguration", value });
  }
  function updateConfiguration(next: ComputerConfiguration, save = true) {
    setConfig(next);
    if (save) persistConfiguration(next);
  }
  const cpu = config.processor;
  const gpu = config.graphics?.mode === "discrete" ? config.graphics.details : null;
  const familyLabel = (value: string) => value === "Other" ? t("configuration.other") : value === "Professional" ? t("configuration.professional") : value;
  const summaries = computerConfigurationSummaries(config, { integrated: t("configuration.integrated"), other: t("configuration.other"), professional: t("configuration.professional"), gb: t("configuration.gb"), tb: t("configuration.tb"), watts: t("configuration.watts"), modules: (count) => t("configuration.modules", { count }), drive: (value) => t(`configuration.driveTypes.${value}`) });
  const sectionIcons: Record<Section, LucideIcon> = { identification: Fingerprint, processor: Cpu, graphics: Gpu, memory: MemoryStick, drives: HardDrive, motherboard: CircuitBoard, powerSupply: Power };
  const section = (key: Section, title: string, summary: string, children: ReactNode) => <AccordionSection Icon={sectionIcons[key]} key={key} title={title} summary={summary} isOpen={openSection === key} onOpen={() => setOpenSection(openSection === key ? null : key)}>{children}</AccordionSection>;
  const structured = item?.pcConfiguration;
  const hasStructured = { cpu: Boolean(structured?.processor), gpu: Boolean(structured?.graphics), ram: Boolean(structured && Object.values(structured.memory).some((value) => value !== null)), storage: Boolean(structured?.drives.length) };
  const savedText = (key: keyof typeof legacy) => legacy[key] && !hasStructured[key] ? <p className="break-words rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-3 text-xs leading-5 text-[var(--ui-text-secondary)]"><span className="font-semibold">{t("configuration.savedText")}: </span>{legacy[key]}<span className="mt-1 block text-[var(--ui-text-muted)]">{t("configuration.savedTextHint")}</span></p> : null;
  const autocomplete = { createLabel: (value: string) => t("autocomplete.useValue", { value }), emptyLabel: t("autocomplete.empty"), showLabel: t("autocomplete.show") };
  const submittedConfig = pc ? config : { ...config, motherboard: undefined, powerSupply: undefined };
  return <>
    <div className="grid shrink-0 gap-4 sm:grid-cols-2"><FormField as={item ? "div" : "label"} label={t("form.type")}>{item ? <><input type="hidden" name="equipmentType" value={type} /><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 text-sm font-medium text-[var(--ui-text)]">{t(`types.${type}`)}</div></> : <Select name="equipmentType" value={type} onValueChange={(value) => { if (isEquipmentType(value)) { setType(value); setOpenSection(null); } }}>{EQUIPMENT_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`types.${value}`)}</SelectItem>)}</Select>}</FormField><FormField label={t("form.state")}>{item?.lifecycleState === "in_service" ? <><input type="hidden" name="lifecycleState" value="in_service" /><div className="flex min-h-11 items-center rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 text-sm">{t("states.in_service")}</div></> : <Select name="lifecycleState" defaultValue={item?.lifecycleState ?? "active"} onValueChange={(value) => { if (item && onSave && (value === "active" || value === "spare" || value === "retired")) void onSave({ equipmentId: item.id, field: "lifecycleState", value }); }}>{EQUIPMENT_LIFECYCLE_STATES.filter((value) => value !== "in_service").map((value) => <SelectItem key={value} value={value}>{t(`states.${value}`)}</SelectItem>)}</Select>}</FormField></div>
    <div className="grid shrink-0 gap-4 sm:grid-cols-2"><FormField className="w-full" label={t("form.displayName")} optional optionalLabel={t("optional")}><Input data-dialog-initial-focus={!item || undefined} name="displayName" maxLength={160} defaultValue={item?.displayName ?? ""} onBlur={(event) => saveText("displayName", event.target.value)} /></FormField>
    <FormField className="w-full" label={t("form.workstation")} optional optionalLabel={t("optional")}><Select name="workstationId" defaultValue={item?.workstationId ?? "__none"} onValueChange={(value) => { if (item && onSave) void onSave({ equipmentId: item.id, field: "workstationId", value }); }}><SelectItem value="__none">{t("location.unattached")}</SelectItem>{workstations.map((workstation) => <SelectItem key={workstation.id} value={workstation.id}>{t("workstation.numberLabel", { number: workstation.number })}{workstation.name ? ` · ${workstation.name}` : ""}</SelectItem>)}</Select></FormField></div>
    {!pc || Object.values(identity).some(Boolean) ? section("identification", t("form.identification"), Object.values(identity).filter(Boolean).join(" · "), <><div className="grid gap-4 sm:grid-cols-2">{(["manufacturer", "model", "serialNumber"] as const).map((key) => {
      if (pc && !item?.[key]) return <input key={key} type="hidden" name={key} value={identity[key]} />;
      if (key === "manufacturer") return <FormField key={key} label={t("form.manufacturer")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} name={key} type={type} field="manufacturer" value={identity.manufacturer} onValueChange={(manufacturer) => setIdentity({ ...identity, manufacturer })} onBlur={(value) => saveText(key, value)} /></FormField>;
      if (key === "model") return <FormField key={key} label={t("form.model")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} name={key} type={type} manufacturer={identity.manufacturer} value={identity.model} onValueChange={(model) => setIdentity({ ...identity, model })} onBlur={(value) => saveText(key, value)} /></FormField>;
      return <FormField key={key} label={t(`form.${key}`)} optional optionalLabel={t("optional")}><Input name={key} value={identity[key]} maxLength={160} onChange={(event) => setIdentity({ ...identity, [key]: event.target.value })} onBlur={(event) => saveText(key, event.target.value)} /></FormField>;
    })}</div>{pc ? <p className="text-xs text-[var(--ui-text-muted)]">{t("configuration.savedIdentity")}</p> : null}</>) : null}
    <input type="hidden" name="assetTag" value={item?.assetTag ?? ""} />
    <input type="hidden" name="pcConfiguration" value={computer && hasComputerConfiguration(submittedConfig) ? JSON.stringify(submittedConfig) : ""} />
    {computer ? <>
      {(["cpu", "gpu", "ram", "storage"] as const).map((key) => <input key={key} type="hidden" name={key} value={legacy[key]} />)}
      {section("processor", t("form.cpu"), summaries.processor || legacy.cpu, <>
        <BinarySwitch emptyLabel={t("configuration.empty")} label={t("form.manufacturer")} value={cpu?.manufacturer ?? null} options={["AMD", "Intel"]} onChange={(manufacturer) => updateConfiguration({ ...config, processor: { manufacturer, family: null, model: null } })} />
        {cpu ? <div className="grid gap-4 sm:grid-cols-2"><ConfigurationSelect label={t("configuration.family")} value={cpu.family} options={CPU_FAMILIES[cpu.manufacturer]} optionLabel={familyLabel} onChange={(family) => updateConfiguration({ ...config, processor: computerConfigurationSchema.shape.processor.parse({ ...cpu, family }) })} /><FormField label={t("form.model")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="cpu" manufacturer={cpu.manufacturer} family={cpu.family ?? ""} value={cpu.model ?? ""} onValueChange={(model) => updateConfiguration({ ...config, processor: { ...cpu, model: model || null } }, false)} onBlur={(model) => persistConfiguration({ ...config, processor: { ...cpu, model: model || null } })} /></FormField></div> : null}
        {savedText("cpu")}
      </>)}
      {section("graphics", t("form.gpu"), summaries.graphics || legacy.gpu, <>
        <BinarySwitch emptyLabel={t("configuration.empty")} label={t("configuration.graphicsMode")} value={config.graphics?.mode ?? null} options={["integrated", "discrete"]} optionLabel={(value) => t(`configuration.${value}`)} onChange={(mode) => updateConfiguration({ ...config, graphics: mode === "integrated" ? { mode } : { mode, details: { vendor: "NVIDIA", family: null, model: null, vramGb: null } } })} />
        {gpu ? <><Segments label={t("configuration.vendor")} value={gpu.vendor} options={["NVIDIA", "AMD", "Intel", "Other"] as const} optionLabel={familyLabel} onChange={(vendor) => updateConfiguration({ ...config, graphics: { mode: "discrete", details: { vendor, family: null, model: null, vramGb: null } } })} /><div className="grid gap-4 sm:grid-cols-2"><ConfigurationSelect label={t("configuration.family")} value={gpu.family} options={GPU_FAMILIES[gpu.vendor]} optionLabel={familyLabel} onChange={(family) => updateConfiguration({ ...config, graphics: computerConfigurationSchema.shape.graphics.parse({ mode: "discrete", details: { ...gpu, family } }) })} /><FormField label={t("form.model")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="gpu" manufacturer={gpu.vendor} family={gpu.family ?? ""} value={gpu.model ?? ""} onValueChange={(model) => updateConfiguration({ ...config, graphics: { mode: "discrete", details: { ...gpu, model: model || null } } }, false)} onBlur={(model) => persistConfiguration({ ...config, graphics: { mode: "discrete", details: { ...gpu, model: model || null } } })} /></FormField><CapacityInput label={t("configuration.vram")} value={gpu.vramGb} onChange={(vramGb) => updateConfiguration({ ...config, graphics: { mode: "discrete", details: { ...gpu, vramGb } } }, false)} onBlur={() => persistConfiguration(config)} /></div></> : null}
        {savedText("gpu")}
      </>)}
      {section("memory", t("form.ram"), summaries.memory || legacy.ram, <><div className="grid gap-4 sm:grid-cols-2"><CapacityInput label={t("configuration.totalMemory")} value={config.memory.capacityGb} onChange={(capacityGb) => updateConfiguration({ ...config, memory: { ...config.memory, capacityGb } }, false)} onBlur={() => persistConfiguration(config)} /><ConfigurationSelect label={t("configuration.memoryType")} value={config.memory.generation} options={MEMORY_TYPES} optionLabel={familyLabel} onChange={(generation) => updateConfiguration({ ...config, memory: { ...config.memory, generation } })} /><CapacityInput label={t("configuration.moduleCount")} value={config.memory.moduleCount} max={128} integer onChange={(moduleCount) => updateConfiguration({ ...config, memory: { ...config.memory, moduleCount } }, false)} onBlur={() => persistConfiguration(config)} /></div>{savedText("ram")}</>)}
      {section("drives", t("form.storage"), summaries.drives || legacy.storage, <><div className="grid gap-3">{config.drives.map((drive, index) => <fieldset key={index} className="min-w-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-3"><legend className="px-1 text-xs font-medium">{t("configuration.driveNumber", { number: index + 1 })}</legend><div className="grid grid-cols-[minmax(0,1fr)_5rem_2.75rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_2.75rem]"><div className="col-span-3 sm:col-span-1"><ConfigurationSelect label={t("configuration.driveType")} value={drive.type} options={DRIVE_TYPES} optionLabel={(value) => t(`configuration.driveTypes.${value}`)} onChange={(value) => { if (value) updateConfiguration({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, type: value } : entry) }); }} /></div><FormField label={t("configuration.capacity")}><Input type="number" min={0.01} max={1_000_000} step="any" required value={drive.capacity || ""} onChange={(event) => updateConfiguration({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, capacity: event.target.value === "" ? 0 : event.target.valueAsNumber } : entry) }, false)} onBlur={() => persistConfiguration(config)} /></FormField><FormField label={t("configuration.unit")}><Select value={drive.unit} onValueChange={(value) => { const unit = CAPACITY_UNITS.find((unit) => unit === value); if (unit) updateConfiguration({ ...config, drives: config.drives.map((entry, i) => i === index ? { ...entry, unit } : entry) }); }}>{CAPACITY_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit === "TB" ? t("configuration.tb") : t("configuration.gb")}</SelectItem>)}</Select></FormField><Button type="button" variant="ghost" className="h-11 w-11 p-0" aria-label={t("configuration.removeDrive", { number: index + 1 })} onClick={() => updateConfiguration({ ...config, drives: config.drives.filter((_, i) => i !== index) })}><Trash2 aria-hidden="true" className="size-4" /></Button></div></fieldset>)}</div><Button type="button" variant="outline" className="justify-self-start" disabled={config.drives.length >= 32} onClick={() => updateConfiguration({ ...config, drives: [...config.drives, { type: "nvme_ssd", capacity: 1, unit: "TB" }] })}><Plus aria-hidden="true" className="mr-2 size-4" />{t("configuration.addDrive")}</Button>{savedText("storage")}</>)}
      {pc ? <>
        {section("motherboard", t("configuration.motherboard"), summaries.motherboard, <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("form.manufacturer")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="motherboard" field="manufacturer" value={config.motherboard?.manufacturer ?? ""} onValueChange={(manufacturer) => updateConfiguration({ ...config, motherboard: { manufacturer: manufacturer || null, model: config.motherboard?.model ?? null, chipset: config.motherboard?.chipset ?? null } }, false)} onBlur={(manufacturer) => persistConfiguration({ ...config, motherboard: { manufacturer: manufacturer || null, model: config.motherboard?.model ?? null, chipset: config.motherboard?.chipset ?? null } })} /></FormField><FormField label={t("form.model")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="motherboard" manufacturer={config.motherboard?.manufacturer ?? ""} value={config.motherboard?.model ?? ""} onValueChange={(model) => updateConfiguration({ ...config, motherboard: { manufacturer: config.motherboard?.manufacturer ?? null, model: model || null, chipset: config.motherboard?.chipset ?? null } }, false)} onBlur={(model) => persistConfiguration({ ...config, motherboard: { manufacturer: config.motherboard?.manufacturer ?? null, model: model || null, chipset: config.motherboard?.chipset ?? null } })} /></FormField><FormField label={t("configuration.chipset")} optional optionalLabel={t("optional")}><Input maxLength={160} value={config.motherboard?.chipset ?? ""} onChange={(event) => updateConfiguration({ ...config, motherboard: { manufacturer: config.motherboard?.manufacturer ?? null, model: config.motherboard?.model ?? null, chipset: event.target.value || null } }, false)} onBlur={() => persistConfiguration(config)} /></FormField></div>)}
        {section("powerSupply", t("configuration.powerSupply"), summaries.powerSupply, <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("form.manufacturer")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="power_supply" field="manufacturer" value={config.powerSupply?.manufacturer ?? ""} onValueChange={(manufacturer) => updateConfiguration({ ...config, powerSupply: { manufacturer: manufacturer || null, model: config.powerSupply?.model ?? null, wattage: config.powerSupply?.wattage ?? null, efficiency: config.powerSupply?.efficiency ?? null } }, false)} onBlur={(manufacturer) => persistConfiguration({ ...config, powerSupply: { manufacturer: manufacturer || null, model: config.powerSupply?.model ?? null, wattage: config.powerSupply?.wattage ?? null, efficiency: config.powerSupply?.efficiency ?? null } })} /></FormField><FormField label={t("form.model")} optional optionalLabel={t("optional")}><EquipmentCatalogCombobox {...autocomplete} type="power_supply" manufacturer={config.powerSupply?.manufacturer ?? ""} value={config.powerSupply?.model ?? ""} onValueChange={(model) => updateConfiguration({ ...config, powerSupply: { manufacturer: config.powerSupply?.manufacturer ?? null, model: model || null, wattage: config.powerSupply?.wattage ?? null, efficiency: config.powerSupply?.efficiency ?? null } }, false)} onBlur={(model) => persistConfiguration({ ...config, powerSupply: { manufacturer: config.powerSupply?.manufacturer ?? null, model: model || null, wattage: config.powerSupply?.wattage ?? null, efficiency: config.powerSupply?.efficiency ?? null } })} /></FormField><CapacityInput label={t("configuration.wattage")} value={config.powerSupply?.wattage ?? null} max={100_000} integer onChange={(wattage) => updateConfiguration({ ...config, powerSupply: { manufacturer: config.powerSupply?.manufacturer ?? null, model: config.powerSupply?.model ?? null, wattage, efficiency: config.powerSupply?.efficiency ?? null } }, false)} onBlur={() => persistConfiguration(config)} /><ConfigurationSelect label={t("configuration.efficiency")} value={config.powerSupply?.efficiency ?? null} options={POWER_SUPPLY_EFFICIENCIES} optionLabel={familyLabel} onChange={(efficiency) => updateConfiguration({ ...config, powerSupply: { manufacturer: config.powerSupply?.manufacturer ?? null, model: config.powerSupply?.model ?? null, wattage: config.powerSupply?.wattage ?? null, efficiency } })} /></div>)}
      </> : null}
    </> : null}
    {!computer ? (["cpu", "gpu", "ram", "storage"] as const).map((key) => <input key={key} type="hidden" name={key} value="" />) : null}
    {showMaintenanceFields ? <fieldset className="shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-4"><legend className="px-1 text-sm font-semibold text-[var(--ui-text)]">{t("maintenance.recurringTitle")}</legend><label className="flex min-h-11 cursor-pointer items-start gap-3"><input className="mt-0.5 size-5 accent-[var(--ui-action-primary)]" type="checkbox" name="recurringMaintenanceEnabled" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span><span className="block text-sm font-medium">{t("maintenance.enabled")}</span></span></label><AnimatedFormContent isOpen={recurring}><div className="grid gap-4 pt-4 sm:grid-cols-2"><FormField label={t("maintenance.interval")}><Input type="number" name="maintenanceIntervalMonths" min={1} max={120} disabled={!recurring} required={recurring} defaultValue={item?.maintenanceIntervalMonths ?? 12} /></FormField><FormField label={t("maintenance.nextDueDate")}><DatePicker name="nextMaintenanceDueDate" aria-label={t("maintenance.nextDueDate")} disabled={!recurring} required={recurring} defaultValue={item?.nextMaintenanceDueDate ?? ""} locale={locale} /></FormField></div></AnimatedFormContent></fieldset> : <><input type="hidden" name="recurringMaintenanceEnabled" value={item?.recurringMaintenanceEnabled ? "on" : ""} /><input type="hidden" name="maintenanceIntervalMonths" value={item?.maintenanceIntervalMonths ?? ""} /><input type="hidden" name="nextMaintenanceDueDate" value={item?.nextMaintenanceDueDate ?? ""} /></>}
    <FormField className="w-full" label={t("form.notes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} defaultValue={item?.notes ?? ""} onBlur={(event) => saveText("notes", event.target.value)} /></FormField>
  </>;
}
