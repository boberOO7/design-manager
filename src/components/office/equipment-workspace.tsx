"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AirVent,
  Boxes,
  Coffee,
  Computer,
  Headphones,
  Keyboard,
  Laptop,
  LayoutGrid,
  Map as MapIcon,
  Monitor,
  MonitorCog,
  MoreHorizontal,
  Mouse,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Unplug,
  UserRound,
  Video,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { flushSync } from "react-dom";
import {
  assignEquipment,
  completeEquipmentService,
  createEquipment,
  createWorkstations,
  deleteEquipment,
  deleteWorkstation,
  recordEquipmentHistory,
  startEquipmentService,
  updateEquipmentField,
  updateEquipmentMaintenance,
  updateWorkstation,
} from "@/app/(app)/office/equipment/actions";
import { EquipmentFormFields } from "@/components/office/equipment-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { NumericStepper } from "@/components/ui/numeric-stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { EquipmentItem, EquipmentMember, WorkstationItem } from "@/data/queries/equipment";
import type { FloorPlanPlacement } from "@/lib/office-floor-plan";
import { CRM_BUDGET_CURRENCIES, formatCrmBudget, isCrmBudgetCurrency } from "@/lib/crm-budget";
import {
  EQUIPMENT_TYPES,
  EQUIPMENT_LIFECYCLE_STATES,
  OTHER_EQUIPMENT_TYPES,
  equipmentDisplayName,
  equipmentInventoryNumber,
  equipmentInventoryPrefix,
  equipmentSpecificationSummary,
  getMaintenanceUrgency,
  isComputerEquipment,
  isOtherEquipment,
  isPeripheralEquipment,
  maintenanceDayOffset,
  type EquipmentLifecycleState,
  type EquipmentType,
} from "@/lib/equipment";
import { pcConfigurationSummaries, type PcConfiguration } from "@/lib/pc-configuration";
import { formatDateOnly } from "@/lib/utils";
import type { EquipmentActionState, EquipmentFieldUpdate } from "@/lib/validation/equipment";
import { cn } from "@/lib/utils";

type EquipmentView = "inventory" | "workstations" | "maintenance";
type WorkstationView = "cards" | "floorPlan";
type CreateKind = "workstation" | "equipment";
const initialActionState: EquipmentActionState = {};
const FloorPlanView = dynamic(() => import("@/components/office/floor-plan-view"));

const equipmentIcons: Record<EquipmentType, LucideIcon> = {
  pc: Computer,
  laptop: Laptop,
  monitor: Monitor,
  mouse: Mouse,
  keyboard: Keyboard,
  headphones: Headphones,
  webcam: Video,
  air_conditioner: AirVent,
  printer: Printer,
  coffee_machine: Coffee,
  other: Package,
};

function configurationLabels(t: ReturnType<typeof useTranslations<"Equipment">>) {
  return { integrated: t("configuration.integrated"), other: t("configuration.other"), professional: t("configuration.professional"), gb: t("configuration.gb"), tb: t("configuration.tb"), modules: (count: number) => t("configuration.modules", { count }), drive: (value: PcConfiguration["drives"][number]["type"]) => t(`configuration.driveTypes.${value}`) };
}

function lifecycleStyle(state: EquipmentLifecycleState) {
  if (state === "active") return "bg-[var(--ui-success-surface)] text-[var(--ui-success-text)]";
  if (state === "in_service") return "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]";
  if (state === "retired") return "bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]";
  return "bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
}

function equipmentModelIdentity(item: Pick<EquipmentItem, "manufacturer" | "model">) {
  return [item.manufacturer, item.model].filter(Boolean).join(" ");
}

function workstationTypeStyle(type: WorkstationItem["workstationType"]) {
  return type === "office"
    ? "border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"
    : "border-[var(--ui-info-border)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]";
}

function WorkstationTypeBadge({ type }: { type: WorkstationItem["workstationType"] }) {
  const t = useTranslations("Equipment");
  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", workstationTypeStyle(type))}>{t(`workstation.types.${type}`)}</span>;
}

function useEquipmentRouting() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createValue = searchParams.get("create");
  const createKind: CreateKind | null = createValue === "workstation" || createValue === "equipment" ? createValue : null;
  const selectedItemId = createKind ? null : searchParams.get("item");
  const nestedEquipmentId = selectedItemId ? searchParams.get("equipment") : null;

  function updateSearchParams(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    const query = next.toString();
    router.replace(query ? `/office/equipment?${query}` : "/office/equipment", { scroll: false });
  }

  return {
    createKind,
    nestedEquipmentId,
    selectedItemId,
    closeCreate: () => updateSearchParams((next) => next.delete("create")),
    closeEquipment: () => updateSearchParams((next) => nestedEquipmentId ? next.delete("equipment") : next.delete("item")),
    closeItem: () => updateSearchParams((next) => { next.delete("equipment"); next.delete("item"); }),
    openEquipment: (id: string) => updateSearchParams((next) => next.set("equipment", id)),
    openItem: (id: string) => updateSearchParams((next) => { next.delete("create"); next.delete("equipment"); next.set("item", id); }),
  };
}

export function EquipmentWorkspace({ equipment, floorPlanPlacements, initialView, initialWorkstationView, members, today, workstations }: { equipment: EquipmentItem[]; floorPlanPlacements: FloorPlanPlacement[]; initialView: EquipmentView; initialWorkstationView: WorkstationView; members: EquipmentMember[]; today: string; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const routing = useEquipmentRouting();
  const selectedWorkstation = workstations.find((item) => item.id === routing.selectedItemId) ?? null;
  const selectedEquipment = equipment.find((item) => item.id === (selectedWorkstation ? routing.nestedEquipmentId : routing.selectedItemId)) ?? null;
  const workstationNames = useMemo(() => new Map(workstations.map((item) => [item.id, `${t("workstation.numberLabel", { number: item.number })}${item.name ? ` · ${item.name}` : ""}`])), [t, workstations]);


  return <div className="min-w-0 space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2></div>
      <div className="flex flex-wrap gap-2">
        {initialView === "workstations" ? <Button asChild><Link href={`/office/equipment?view=${initialView}&layout=${initialWorkstationView === "floorPlan" ? "floor-plan" : "cards"}&create=workstation`}><Plus className="mr-2 size-4" aria-hidden="true" />{t("actions.addWorkstation")}</Link></Button> : null}
        <Button asChild variant={initialView === "workstations" ? "outline" : "default"}><Link href={`/office/equipment?view=${initialView}&create=equipment`}><Plus className="mr-2 size-4" aria-hidden="true" />{t("actions.addEquipment")}</Link></Button>
      </div>
    </div>

    <nav aria-label={t("views.label")} className="flex gap-1 overflow-x-auto rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">
      {(["inventory", "workstations", "maintenance"] as const).map((view) => <Link key={view} href={`/office/equipment?view=${view}`} aria-current={initialView === view ? "page" : undefined} className={cn("flex min-h-11 shrink-0 flex-1 items-center justify-center gap-1 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:flex-none", initialView === view ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>
        {view === "workstations" ? <MonitorCog className="size-4" aria-hidden="true" /> : view === "inventory" ? <Boxes className="size-4" aria-hidden="true" /> : <Wrench className="size-4" aria-hidden="true" />}{t(`views.${view}`)}
      </Link>)}
    </nav>

    {initialView === "workstations" ? <div className="space-y-4"><nav aria-label={t("floorPlan.viewLabel")} className="inline-flex rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["cards", "floorPlan"] as const).map((view) => <Link key={view} href={`/office/equipment?view=workstations&layout=${view === "floorPlan" ? "floor-plan" : "cards"}`} aria-current={initialWorkstationView === view ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]", initialWorkstationView === view ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-panel)]" : "text-[var(--ui-text-secondary)] hover:text-[var(--ui-text)]")}>{view === "cards" ? <LayoutGrid className="size-4" aria-hidden="true" /> : <MapIcon className="size-4" aria-hidden="true" />}{t(`floorPlan.views.${view}`)}</Link>)}</nav>{initialWorkstationView === "floorPlan" ? <FloorPlanView equipment={equipment} placements={floorPlanPlacements} today={today} workstations={workstations} onOpenEquipment={routing.openItem} onOpenWorkstation={routing.openItem} /> : <WorkstationList items={workstations} onOpen={routing.openItem} />}</div>
      : initialView === "inventory" ? <EquipmentInventory items={equipment} workstationNames={workstationNames} onOpen={routing.openItem} />
      : <MaintenanceQueue items={equipment} workstationNames={workstationNames} today={today} onOpen={routing.openItem} />}

    <CreateWorkstationDialog key={`create-workstation-${routing.createKind === "workstation"}`} isOpen={routing.createKind === "workstation"} members={members} workstations={workstations} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <CreateEquipmentDialog key={`create-equipment-${routing.createKind === "equipment"}`} isOpen={routing.createKind === "equipment"} workstations={workstations} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <WorkstationDrawer key={selectedWorkstation?.id ?? "workstation-closed"} item={selectedWorkstation} allEquipment={equipment} isTopLayer={!selectedEquipment} members={members} workstations={workstations} onClose={routing.closeItem} onOpenEquipment={routing.openEquipment} />
    <EquipmentDrawer key={selectedEquipment?.id ?? "equipment-closed"} item={selectedEquipment} maintenanceMode={initialView === "maintenance" && !selectedWorkstation} today={today} workstations={workstations} onClose={routing.closeEquipment} />
  </div>;
}

function WorkstationList({ items, onOpen }: { items: WorkstationItem[]; onOpen: (id: string) => void }) {
  const t = useTranslations("Equipment");
  if (!items.length) return <EmptyState Icon={MonitorCog} title={t("empty.workstationsTitle")} description={t("empty.workstationsDescription")} />;
  return <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => {
    const computer = item.equipment.find((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
    const monitorCount = item.equipment.filter((equipmentItem) => equipmentItem.equipmentType === "monitor").length;
    const peripheralCount = item.equipment.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType)).length;
    const specs = computer ? equipmentSpecificationSummary(computer, (config) => pcConfigurationSummaries(config, configurationLabels(t))) : "";
    return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="min-h-44 cursor-pointer rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-left shadow-[var(--ui-shadow-panel)] transition-colors hover:border-[var(--ui-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:p-5">
      <span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><span className="min-w-0"><strong className="block truncate text-base text-[var(--ui-text)]">{t("workstation.numberLabel", { number: item.number })}</strong>{item.name ? <span className="mt-0.5 block truncate text-sm text-[var(--ui-text-secondary)]">{item.name}</span> : null}</span></span><WorkstationTypeBadge type={item.workstationType} /></span>
      <span className="mt-4 flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]">{item.assignedEmployee ? <><UserAvatar decorative imageUrl={item.assignedEmployee.avatarUrl} name={item.assignedEmployee.fullName} size="boardCard" /><span className="truncate font-medium">{item.assignedEmployee.fullName}</span></> : <><UserRound className="size-4" aria-hidden="true" /><span>{t("workstation.unassigned")}</span></>}</span>
      <span className="mt-4 block border-t border-[var(--ui-border-subtle)] pt-3"><span className="block truncate text-sm font-semibold text-[var(--ui-text)]">{computer ? equipmentDisplayName(computer) : t("workstation.noComputer")}</span>{specs ? <span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]" title={specs}>{specs}</span> : null}<span className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ui-text-muted)]"><span>{t("workstation.monitorCount", { count: monitorCount })}</span><span aria-hidden="true">·</span><span>{t("workstation.peripheralCount", { count: peripheralCount })}</span></span></span>
    </button>;
  })}</div>;
}

function EquipmentInventory({ items, workstationNames, onOpen }: { items: EquipmentItem[]; workstationNames: Map<string, string>; onOpen: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [state, setState] = useState("all");
  const [location, setLocation] = useState("all");
  const visible = items.filter((item) => {
    if (group === "computers" && !isComputerEquipment(item.equipmentType)) return false;
    if (group === "peripherals" && item.equipmentType !== "monitor" && !isPeripheralEquipment(item.equipmentType)) return false;
    if (group === "office" && !isOtherEquipment(item.equipmentType)) return false;
    if (type !== "all" && type !== item.equipmentType) return false;
    if (state !== "all" && state !== item.lifecycleState) return false;
    if (location === "unattached" ? Boolean(item.workstationId) : location !== "all" && location !== item.workstationId) return false;
    return [item.displayName, item.assetTag, item.serialNumber, item.manufacturer, item.model, t(`types.${item.equipmentType}`), item.workstationId ? workstationNames.get(item.workstationId) : ""].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-1" aria-label={t("inventory.categories")}>{(["all", "computers", "peripherals", "office"] as const).map((value) => <Button key={value} variant="ghost" aria-pressed={group === value} className={cn(group === value && "bg-[var(--ui-surface-muted)] text-[var(--ui-text)]")} onClick={() => { setGroup(value); setType("all"); }}>{t(`inventory.${value}`)}</Button>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_11rem_10rem_14rem]">
      <label className="relative"><span className="sr-only">{t("inventory.search")}</span><Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-[var(--ui-text-muted)]" /><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("inventory.search")} className="pl-9" /></label>
      <Select aria-label={t("form.type")} value={type} onValueChange={setType}><SelectItem value="all">{t("inventory.allTypes")}</SelectItem>{EQUIPMENT_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`types.${value}`)}</SelectItem>)}</Select>
      <Select aria-label={t("form.state")} value={state} onValueChange={setState}><SelectItem value="all">{t("inventory.allStates")}</SelectItem>{EQUIPMENT_LIFECYCLE_STATES.map((value) => <SelectItem key={value} value={value}>{t(`states.${value}`)}</SelectItem>)}</Select>
      <Select aria-label={t("form.workstation")} value={location} onValueChange={setLocation}><SelectItem value="all">{t("inventory.allLocations")}</SelectItem><SelectItem value="unattached">{t("location.unattached")}</SelectItem>{Array.from(workstationNames, ([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</Select>
    </div>
    <p role="status" className="text-xs text-[var(--ui-text-muted)]">{t("inventory.count", { count: visible.length })}</p>
    {!visible.length ? <EmptyState Icon={Boxes} title={t("inventory.noMatches")} description={t("inventory.noMatchesDescription")} /> : group === "office" ? OTHER_EQUIPMENT_TYPES.map((value) => {
      const grouped = visible.filter((item) => item.equipmentType === value);
      return grouped.length ? <section key={value} aria-label={t(`types.${value}`)} className="space-y-2"><h3 className="text-sm font-semibold text-[var(--ui-text-secondary)]">{t(`types.${value}`)} <span className="ml-1 font-normal text-[var(--ui-text-muted)]">{grouped.length}</span></h3><EquipmentRows items={grouped} workstationNames={workstationNames} onOpen={onOpen} /></section> : null;
    }) : <EquipmentRows items={visible} workstationNames={workstationNames} onOpen={onOpen} />}
  </div>;
}

function EquipmentRows({ items, workstationNames, onOpen }: { items: EquipmentItem[]; workstationNames: Map<string, string>; onOpen: (id: string) => void }) {
  const t = useTranslations("Equipment");
  if (!items.length) return <EmptyState Icon={Boxes} title={t("empty.equipmentTitle")} description={t("empty.equipmentDescription")} />;
  return <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{items.map((item) => {
    const Icon = equipmentIcons[item.equipmentType];
    const location = item.workstationId ? workstationNames.get(item.workstationId) ?? t("location.unknown") : t("location.unattached");
    return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="grid min-h-16 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-5">
      <span className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-[1.125rem]" aria-hidden="true" /></span>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2">{item.displayName ? <span className="shrink-0 font-mono text-xs text-[var(--ui-text-muted)]">{item.assetTag}</span> : null}<strong className="truncate text-sm text-[var(--ui-text)]">{equipmentDisplayName(item)}</strong><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lifecycleStyle(item.lifecycleState))}>{t(`states.${item.lifecycleState}`)}</span></span><span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]">{[t(`types.${item.equipmentType}`), equipmentModelIdentity(item), location].filter(Boolean).join(" · ")}</span></span>
      <Pencil className="size-4 text-[var(--ui-text-subtle)]" aria-hidden="true" />
    </button>;
  })}</div>;
}

function MaintenanceQueue({ items, onOpen, today, workstationNames }: { items: EquipmentItem[]; onOpen: (id: string) => void; today: string; workstationNames: Map<string, string> }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const queue = items.flatMap((item) => {
    const urgency = getMaintenanceUrgency(item.recurringMaintenanceEnabled, item.nextMaintenanceDueDate, today);
    if (!showAll && (item.lifecycleState === "retired" || (item.lifecycleState !== "in_service" && !urgency))) return [];
    return [{ item, urgency, priority: item.lifecycleState === "in_service" ? 0 : urgency === "overdue" ? 1 : 2 }];
  }).sort((a, b) => a.priority - b.priority || (a.item.nextMaintenanceDueDate ?? "9999").localeCompare(b.item.nextMaintenanceDueDate ?? "9999") || equipmentDisplayName(a.item).localeCompare(equipmentDisplayName(b.item)));

  return <section aria-labelledby="maintenance-queue-heading">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 id="maintenance-queue-heading" className="font-semibold text-[var(--ui-text)]">{t("maintenance.queueTitle")}</h3><div className="flex gap-1"><Button variant="ghost" aria-pressed={!showAll} onClick={() => setShowAll(false)}>{t("maintenance.needsAttention")}</Button><Button variant="ghost" aria-pressed={showAll} onClick={() => setShowAll(true)}>{t("inventory.all")}</Button></div></div>
    {!queue.length ? <EmptyState Icon={Wrench} title={t("maintenance.emptyTitle")} description={t("maintenance.emptyDescription")} /> : null}
    <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{queue.map(({ item, urgency }) => {
      const Icon = equipmentIcons[item.equipmentType];
      const location = item.workstationId ? workstationNames.get(item.workstationId) ?? t("location.unknown") : t("location.unattached");
      const due = item.nextMaintenanceDueDate ? formatDateOnly(item.nextMaintenanceDueDate, locale) : null;
      const offset = item.nextMaintenanceDueDate ? maintenanceDayOffset(item.nextMaintenanceDueDate, today) : null;
      const timing = offset === null ? (item.lifecycleState === "in_service" ? t("maintenance.currentlyInService") : t("maintenance.notScheduled")) : offset < 0 ? t("maintenance.overdueBy", { count: -offset }) : offset === 0 ? t("maintenance.dueToday") : t("maintenance.dueIn", { count: offset });
      return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="grid min-h-20 w-full cursor-pointer gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-5">
        <span className="hidden size-9 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] sm:flex"><Icon className="size-[1.125rem]" aria-hidden="true" /></span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2">{item.displayName ? <span className="shrink-0 font-mono text-xs text-[var(--ui-text-muted)]">{item.assetTag}</span> : null}<strong className="truncate text-sm text-[var(--ui-text)]">{equipmentDisplayName(item)}</strong><MaintenanceBadge item={item} urgency={urgency} /></span><span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]">{[t(`types.${item.equipmentType}`), equipmentModelIdentity(item), location].filter(Boolean).join(" · ")}</span></span>
        <span className="text-xs text-[var(--ui-text-muted)] sm:text-right">{due ? <><span className="block font-semibold text-[var(--ui-text-secondary)]">{t("maintenance.due", { date: due })}</span><span>{timing}</span></> : timing}</span>
      </button>;
    })}</div>
  </section>;
}

function MaintenanceBadge({ item, urgency }: { item: EquipmentItem; urgency: ReturnType<typeof getMaintenanceUrgency> }) {
  const t = useTranslations("Equipment");
  if (item.lifecycleState === "in_service") return <span className="rounded-full bg-[var(--ui-warning-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--ui-warning-text)]">{t("maintenance.currentlyInService")}</span>;
  if (!urgency) return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", urgency === "overdue" ? "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)]" : "bg-[var(--ui-warning-surface)] text-[var(--ui-warning-text)]")}>{t(`maintenance.${urgency}`)}</span>;
}

function EmptyState({ Icon, title, description }: { Icon: LucideIcon; title: string; description: string }) {
  return <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><Icon className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p></div>;
}

type WorkstationDraft = { number: number; name: string; assignedEmployeeId: string };
interface WorkstationEditorElement extends HTMLDivElement { startViewTransition?: Document["startViewTransition"] }

function CreateWorkstationDialog({ isOpen, members, workstations, onClose, onCreated }: { isOpen: boolean; members: EquipmentMember[]; workstations: WorkstationItem[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const nextNumber = Math.max(0, ...workstations.map((workstation) => workstation.number)) + 1;
  const [workstationType, setWorkstationType] = useState<WorkstationItem["workstationType"]>("office");
  const [quantity, setQuantity] = useState(1);
  const [startingNumber, setStartingNumber] = useState(nextNumber);
  const [drafts, setDrafts] = useState<WorkstationDraft[]>(() => [{ number: nextNumber, name: "", assignedEmployeeId: "__none" }]);
  const [assignEmployees, setAssignEmployees] = useState(false);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const [pending, startTransition] = useTransition();
  const editorRef = useRef<WorkstationEditorElement>(null);
  const activeRowTransitionRef = useRef<ViewTransition | null>(null);
  const existingAssignments = new Map(workstations.flatMap((workstation) => workstation.assignedEmployee ? [[workstation.assignedEmployee.id, workstation]] : []));
  function changeQuantity(value: number) {
    const nextQuantity = Math.max(1, Math.min(50, value || 1));
    if (nextQuantity === quantity) return;
    const update = () => {
      setQuantity(nextQuantity);
      setDrafts((current) => Array.from({ length: nextQuantity }, (_, index) => current[index] ?? { number: startingNumber + index, name: "", assignedEmployeeId: "__none" }));
    };
    const motion = document.documentElement.dataset.motion;
    const editor = editorRef.current;
    if (!editor?.startViewTransition || motion === "off" || (motion === "system" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) update();
    else {
      const activeTransition = activeRowTransitionRef.current;
      if (activeTransition) {
        activeTransition.skipTransition();
        update();
        return;
      }
      const transition = editor.startViewTransition({ types: ["workstation-rows"], update: () => flushSync(update) });
      activeRowTransitionRef.current = transition;
      void transition.ready.catch((reason: unknown) => {
        const expectedCancellation = reason instanceof DOMException
          && (reason.name === "AbortError" || reason.name === "InvalidStateError");
        if (!expectedCancellation) reportError(reason);
      });
      void transition.finished.then(
        () => { if (activeRowTransitionRef.current === transition) activeRowTransitionRef.current = null; },
        () => { if (activeRowTransitionRef.current === transition) activeRowTransitionRef.current = null; },
      );
    }
  }
  function changeStartingNumber(value: number) {
    const nextStartingNumber = Math.max(1, value || 1);
    setStartingNumber(nextStartingNumber);
    setDrafts((current) => current.map((draft, index) => ({ ...draft, number: nextStartingNumber + index })));
  }
  function updateDraft(index: number, patch: Partial<WorkstationDraft>) { setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft)); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await createWorkstations({ workstations: drafts.map((draft) => ({ ...draft, workstationType, assignedEmployeeId: assignEmployees ? draft.assignedEmployeeId : "__none" })) });
      if (result.error) setError(result.error);
      else if (quantity === 1 && result.id) onCreated(result.id);
      else { onClose(); router.refresh(); }
    });
  }
  const rowColumns = assignEmployees ? "sm:grid-cols-[7rem_minmax(0,1fr)_minmax(12rem,1fr)]" : "sm:grid-cols-[7rem_minmax(0,1fr)]";
  return <Dialog className="max-w-3xl sm:h-[min(48rem,calc(100dvh-2rem))]" closeDisabled={pending} closeLabel={t("close")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("workstation.form.createTitle")}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
      <div className="flex shrink-0 flex-wrap items-end gap-4">
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("workstation.form.quantity")}</legend>
          <span data-quantity-stepper><NumericStepper initialFocus ariaLabel={t("workstation.form.quantity")} decreaseLabel={t("workstation.form.decreaseQuantity")} increaseLabel={t("workstation.form.increaseQuantity")} max={50} value={String(quantity)} onValueChange={(value) => changeQuantity(Number(value))} /></span>
        </fieldset>
        <FormField className="w-28" label={t("workstation.form.startingNumber")}><Input className="appearance-none text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" inputMode="numeric" type="number" min={1} max={1_000_000} value={startingNumber} onChange={(event) => changeStartingNumber(Number(event.target.value))} /></FormField>
      </div>

      <FormField as="div" className="max-w-72" label={t("workstation.form.type")}><SegmentedControl ariaLabel={t("workstation.form.type")} value={workstationType} onValueChange={setWorkstationType} items={(["office", "remote"] as const).map((value) => ({ value, label: t(`workstation.types.${value}`) }))} /></FormField>
      <div ref={editorRef} data-workstation-editor className="min-h-52 max-h-72 shrink-0 overflow-y-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] sm:max-h-none sm:min-h-0 sm:flex-1">
        <div className="divide-y divide-[var(--ui-border-subtle)]">
          <div className={cn("sticky top-0 z-10 hidden gap-3 border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] sm:grid", rowColumns)}><span>{t("workstation.form.number")}</span><span>{t("workstation.form.name")} <span className="font-normal">({t("optional")})</span></span>{assignEmployees ? <span>{t("workstation.form.employee")} <span className="font-normal">({t("optional")})</span></span> : null}</div>
          {drafts.map((draft, index) => { const selectedEmployees = new Set(drafts.filter((_, draftIndex) => draftIndex !== index).map((item) => item.assignedEmployeeId)); return <div key={index} data-workstation-draft style={{ viewTransitionName: `workstation-draft-${index}` }} className={cn("grid gap-3 p-3", rowColumns)}><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.number")}</span><Input type="number" min={1} max={1_000_000} value={draft.number} onChange={(event) => updateDraft(index, { number: Number(event.target.value) || 0 })} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.name")} ({t("optional")})</span><Input maxLength={120} value={draft.name} onChange={(event) => updateDraft(index, { name: event.target.value })} /></label>{assignEmployees ? <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.employee")} ({t("optional")})</span><Select value={draft.assignedEmployeeId} onValueChange={(assignedEmployeeId) => updateDraft(index, { assignedEmployeeId })}><SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>{members.map((member) => { const assigned = existingAssignments.get(member.id); const unavailable = Boolean(assigned) || selectedEmployees.has(member.id); return <SelectItem key={member.id} value={member.id} disabled={unavailable && draft.assignedEmployeeId !== member.id} textValue={member.fullName}>{member.fullName}{assigned ? ` · ${t("workstation.form.assignedElsewhere", { workstation: t("workstation.numberLabel", { number: assigned.number }) })}` : ""}</SelectItem>; })}</Select></label> : null}</div>; })}
        </div>
      </div>
      <label className="flex min-h-11 shrink-0 cursor-pointer items-start gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3"><input className="mt-0.5 size-5 accent-[var(--ui-action-primary)]" type="checkbox" checked={assignEmployees} onChange={(event) => setAssignEmployees(event.target.checked)} /><span><span className="block text-sm font-semibold">{t("workstation.form.assignEmployees")}</span></span></label>
      <ActionError error={error} />
      <div className="flex shrink-0 justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createWorkstations", { count: quantity })}</Button></div>
    </form>
  </Dialog>;
}

function CreateEquipmentDialog({ isOpen, workstations, onClose, onCreated }: { isOpen: boolean; workstations: WorkstationItem[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createEquipment, initialActionState);
  useEffect(() => { if (state.success && state.id && !processed.current) { processed.current = true; onCreated(state.id); } }, [onCreated, state.id, state.success]);
  return <Dialog className="max-w-2xl" closeDisabled={pending} closeLabel={t("close")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.createTitle")}>
    <form action={action} className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 sm:p-6"><EquipmentFormFields workstations={workstations} initialType="other" /><ActionError error={state.error} /><div className="flex justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createEquipment")}</Button></div></form>
  </Dialog>;
}

function OptionalInput({ disabled, hint, label, maxLength, name, value }: { disabled?: boolean; hint?: string; label: string; maxLength: number; name: string; value?: string | null }) {
  const t = useTranslations("Equipment");
  return <FormField label={label} optional optionalLabel={t("optional")}><Input disabled={disabled} name={name} maxLength={maxLength} defaultValue={value ?? ""} />{hint ? <span className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{hint}</span> : null}</FormField>;
}

function WorkstationDrawer({ allEquipment, isTopLayer, item, members, workstations, onClose, onOpenEquipment }: { allEquipment: EquipmentItem[]; isTopLayer: boolean; item: WorkstationItem | null; members: EquipmentMember[]; workstations: WorkstationItem[]; onClose: () => void; onOpenEquipment: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef(item?.name ?? "");
  const savedNameRef = useRef(item?.name ?? "");
  const [workstationError, setWorkstationError] = useState<EquipmentActionState["error"]>();
  const [equipmentError, setEquipmentError] = useState<EquipmentActionState["error"]>();
  const [workstationType, setWorkstationType] = useState(item?.workstationType ?? "office");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(item?.assignedEmployee?.id ?? "__none");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsTrigger, setActionsTrigger] = useState<HTMLButtonElement | null>(null);
  const [renumberOpen, setRenumberOpen] = useState(false);
  const [number, setNumber] = useState(String(item?.number ?? 1));
  const [pending, startTransition] = useTransition();
  if (!item) return null;
  const assignments = new Map(workstations.filter((workstation) => workstation.id !== item.id && workstation.assignedEmployee).map((workstation) => [workstation.assignedEmployee!.id, workstation]));
  const candidates = allEquipment.filter((equipmentItem) => equipmentItem.workstationId !== item.id);
  const locationNames = new Map(workstations.map((workstation) => [workstation.id, `${t("workstation.numberLabel", { number: workstation.number })}${workstation.name ? ` · ${workstation.name}` : ""}`]));
  const computers = item.equipment.filter((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
  const monitors = item.equipment.filter((equipmentItem) => equipmentItem.equipmentType === "monitor");
  const peripherals = item.equipment.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType));
  const other = item.equipment.filter((equipmentItem) => isOtherEquipment(equipmentItem.equipmentType));
  const computerCandidates = candidates.filter((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
  const monitorCandidates = candidates.filter((equipmentItem) => equipmentItem.equipmentType === "monitor");
  const peripheralCandidates = candidates.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType));
  const workstationId = item.id;
  const workstationNumber = item.number;
  const workstationName = t("workstation.numberLabel", { number: item.number });
  function run(operation: () => Promise<EquipmentActionState>, setOperationError: (error: EquipmentActionState["error"]) => void, after?: () => void) { setOperationError(undefined); startTransition(async () => { try { const result = await operation(); if (result.error) setOperationError(result.error); else { after?.(); router.refresh(); } } catch { setOperationError("update"); } }); }
  function saveDetails(name: string, employeeId: string, after?: () => void, type = workstationType) { run(() => updateWorkstation({ workstationId, number: workstationNumber, workstationType: type, name, assignedEmployeeId: employeeId }), setWorkstationError, after); }
  function renumber(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); run(() => updateWorkstation({ workstationId, number, workstationType, name: nameRef.current, assignedEmployeeId }), setWorkstationError, () => setRenumberOpen(false)); }
  function remove() { if (!window.confirm(t("workstation.deleteConfirm", { name: workstationName }))) return; run(() => deleteWorkstation({ workstationId }), setWorkstationError, onClose); }
  function attach(equipmentId: string) { run(() => assignEquipment({ equipmentId, workstationId }), setEquipmentError); }
  function detach(equipmentId: string) { run(() => assignEquipment({ equipmentId, workstationId: null }), setEquipmentError); }
  const actionsPortal = actionsTrigger?.closest("dialog, [role='dialog']") ?? undefined;
  return <><Drawer isOpen isTopLayer={isTopLayer && !renumberOpen} onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={workstationName} className="w-full max-w-[38rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h2 className="truncate text-lg font-bold text-[var(--ui-text)]">{workstationName}</h2>{item.name ? <p className="mt-0.5 truncate text-sm text-[var(--ui-text-secondary)]">{item.name}</p> : null}<div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-[var(--ui-text-muted)]">{item.assignedEmployee ? <><UserAvatar decorative imageUrl={item.assignedEmployee.avatarUrl} name={item.assignedEmployee.fullName} size="board" /><span className="truncate">{item.assignedEmployee.fullName}</span></> : <><UserRound className="size-4 shrink-0" aria-hidden="true" /><span>{t("workstation.unassigned")}</span></>}</div></div></div><div className="flex shrink-0 items-center"><PopoverPrimitive.Root open={actionsOpen} onOpenChange={setActionsOpen}><PopoverPrimitive.Trigger asChild><button ref={setActionsTrigger} type="button" disabled={pending} aria-label={t("actions.more")} aria-haspopup="menu" className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><MoreHorizontal className="size-5" aria-hidden="true" /></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal container={actionsPortal}><PopoverPrimitive.Content role="menu" align="end" sideOffset={6} className="z-[80] min-w-48 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" role="menuitem" onClick={() => { setActionsOpen(false); setWorkstationError(undefined); setNumber(String(item.number)); setRenumberOpen(true); }} className="flex min-h-10 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Pencil className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" />{t("workstation.actions.renumber")}</button><button type="button" role="menuitem" onClick={() => { setActionsOpen(false); remove(); }} className="flex min-h-10 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Trash2 className="size-4" aria-hidden="true" />{t("actions.delete")}</button></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root><button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-4 p-5 sm:p-6"><FormField as="div" label={t("workstation.form.type")}><SegmentedControl disabled={pending} ariaLabel={t("workstation.form.type")} value={workstationType} onValueChange={(value) => saveDetails(nameRef.current, assignedEmployeeId, () => setWorkstationType(value), value)} items={(["office", "remote"] as const).map((value) => ({ value, label: t(`workstation.types.${value}`) }))} /></FormField><FormField label={t("workstation.form.name")} optional optionalLabel={t("optional")}><Input disabled={pending} maxLength={120} defaultValue={item.name ?? ""} onChange={(event) => { nameRef.current = event.target.value; }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name === savedNameRef.current) return; nameRef.current = name; saveDetails(name, assignedEmployeeId, () => { savedNameRef.current = name; }); }} /></FormField><FormField label={t("workstation.form.employee")} optional optionalLabel={t("optional")}><Select disabled={pending} value={assignedEmployeeId} onValueChange={(value) => { saveDetails(nameRef.current, value, () => setAssignedEmployeeId(value)); }}><SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>{members.map((member) => { const assigned = assignments.get(member.id); return <SelectItem key={member.id} value={member.id} disabled={Boolean(assigned)} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}{assigned ? ` · ${t("workstation.form.assignedElsewhere", { workstation: t("workstation.numberLabel", { number: assigned.number }) })}` : ""}</span></SelectItem>; })}</Select></FormField><ActionError error={workstationError === "numberConflict" ? undefined : workstationError} /></div>
      <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{t("workstation.attached")}</h3><span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text-muted)]">{item.equipment.length}</span></div>
        <ActionError error={equipmentError} />
        <div className="mt-5 space-y-5"><EquipmentGroup title={t("groups.computers")} attachLabel={t("assignment.attachComputer")} candidates={computerCandidates} items={computers} locationNames={locationNames} onAttach={attach} onOpen={onOpenEquipment} onDetach={detach} pending={pending} /><EquipmentGroup title={t("groups.monitors")} attachLabel={t("assignment.attachMonitor")} candidates={monitorCandidates} items={monitors} locationNames={locationNames} onAttach={attach} onOpen={onOpenEquipment} onDetach={detach} pending={pending} /><EquipmentGroup title={t("groups.peripherals")} attachLabel={t("assignment.attachPeripheral")} candidates={peripheralCandidates} items={peripherals} locationNames={locationNames} onAttach={attach} onOpen={onOpenEquipment} onDetach={detach} pending={pending} />{other.length ? <EquipmentGroup title={t("groups.other")} items={other} onOpen={onOpenEquipment} onDetach={detach} pending={pending} /> : null}</div>
      </section>
    </div>
  </Drawer><Dialog className="h-auto max-w-sm" closeDisabled={pending} closeLabel={t("close")} isOpen={renumberOpen} onRequestClose={() => { if (!pending) setRenumberOpen(false); }} title={t("workstation.actions.renumber")}><form onSubmit={renumber} className="grid gap-4 p-5 sm:p-6"><FormField as="div" label={t("workstation.form.number")}><NumericStepper initialFocus ariaLabel={t("workstation.form.number")} decreaseLabel={t("workstation.form.decreaseNumber")} increaseLabel={t("workstation.form.increaseNumber")} value={number} invalid={workstationError === "numberConflict"} onValueChange={(value) => { setNumber(value); if (workstationError === "numberConflict") setWorkstationError(undefined); }} />{workstationError === "numberConflict" ? <span role="alert" className="text-sm font-normal text-[var(--ui-danger-text)]">{t("workstation.form.numberConflict")}</span> : null}</FormField><ActionError error={workstationError === "numberConflict" ? undefined : workstationError} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setRenumberOpen(false)}>{t("cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("workstation.actions.renumber")}</Button></div></form></Dialog></>;
}

function EquipmentGroup({ attachLabel, candidates, items, locationNames, onAttach, onDetach, onOpen, pending, title }: { attachLabel?: string; candidates?: EquipmentItem[]; items: EquipmentItem[]; locationNames?: Map<string, string>; onAttach?: (id: string) => void; onDetach: (id: string) => void; onOpen: (id: string) => void; pending: boolean; title: string }) {
  const t = useTranslations("Equipment");
  const attachAction = attachLabel && candidates && locationNames && onAttach ? <EquipmentAttachPicker candidates={candidates} label={attachLabel} locationNames={locationNames} onAttach={onAttach} pending={pending} /> : null;
  return <div><div className="flex min-h-10 items-center justify-between gap-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{title}</h4>{attachAction}</div>{items.length ? <div className="mt-2 divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{items.map((item) => { const Icon = equipmentIcons[item.equipmentType]; const specs = isComputerEquipment(item.equipmentType) ? equipmentSpecificationSummary(item, (config) => pcConfigurationSummaries(config, configurationLabels(t))) : ""; const label = equipmentDisplayName(item); return <div key={item.id} className="flex items-center gap-3 px-3 py-2.5"><button type="button" onClick={() => onOpen(item.id)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Icon className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span><span className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{specs || [t(`types.${item.equipmentType}`), equipmentModelIdentity(item)].filter(Boolean).join(" · ")}</span></span></button><button type="button" disabled={pending} onClick={() => onDetach(item.id)} aria-label={t("assignment.detachNamed", { name: label })} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><Unplug className="size-4" aria-hidden="true" /></button></div>; })}</div> : null}</div>;
}

function EquipmentAttachPicker({ candidates, label, locationNames, onAttach, pending }: { candidates: EquipmentItem[]; label: string; locationNames: Map<string, string>; onAttach: (id: string) => void; pending: boolean }) {
  const t = useTranslations("Equipment");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCandidates = candidates.filter((candidate) => {
    const location = candidate.workstationId ? locationNames.get(candidate.workstationId) ?? t("location.unknown") : t("location.unattached");
    return `${equipmentDisplayName(candidate)} ${candidate.assetTag} ${equipmentModelIdentity(candidate)} ${t(`types.${candidate.equipmentType}`)} ${location}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const portalContainer = triggerNode?.closest("dialog, [role='dialog']") ?? undefined;
  return <PopoverPrimitive.Root modal={false} open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
    <PopoverPrimitive.Trigger asChild><Button ref={setTriggerNode} type="button" variant="ghost" className="size-9 shrink-0 p-0" disabled={pending} aria-label={label} title={label}><Plus className="size-4" aria-hidden="true" /></Button></PopoverPrimitive.Trigger>
    <PopoverPrimitive.Portal container={portalContainer}><PopoverPrimitive.Content data-equipment-attach-picker aria-label={label} align="end" sideOffset={6} collisionPadding={12} className="z-[80] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow-popover)]">
      <div className="border-b border-[var(--ui-border-subtle)] p-3"><label className="relative block"><span className="sr-only">{t("assignment.search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" aria-hidden="true" /><Input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-controls={listId} placeholder={t("assignment.searchPlaceholder")} className="pl-9" /></label></div>
      <div id={listId} aria-label={label} className="max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1.5">{visibleCandidates.length ? visibleCandidates.map((candidate) => { const Icon = equipmentIcons[candidate.equipmentType]; const currentWorkstation = candidate.workstationId ? locationNames.get(candidate.workstationId) ?? t("location.unknown") : null; const candidateName = equipmentDisplayName(candidate); return <button key={candidate.id} type="button" onClick={() => { if (currentWorkstation && !window.confirm(t("assignment.moveConfirm", { name: candidateName, workstation: currentWorkstation }))) return; setOpen(false); onAttach(candidate.id); }} className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--ui-text)]">{candidateName}</span><span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{[t(`types.${candidate.equipmentType}`), equipmentModelIdentity(candidate), currentWorkstation ?? t("location.unattached")].filter(Boolean).join(" · ")}</span></span></button>; }) : <p role="status" className="px-3 py-5 text-center text-sm leading-5 text-[var(--ui-text-muted)]">{t("assignment.noMatches")}</p>}</div>
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>;
}

function EquipmentDrawer({ item, maintenanceMode, today, workstations, onClose }: { item: EquipmentItem | null; maintenanceMode: boolean; today: string; workstations: WorkstationItem[]; onClose: () => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const dirtyConfiguration = useRef(false);
  const inFlight = useRef(0);
  const writeQueue = useRef(Promise.resolve());
  const failures = useRef(new Map<string, { error: EquipmentActionState["error"]; retry: () => void }>());
  const retryRef = useRef<(() => void) | null>(null);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeNumber, setCodeNumber] = useState(equipmentInventoryNumber(item?.assetTag ?? "", item?.equipmentType ?? "other"));
  const [saved, setSaved] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsTrigger, setActionsTrigger] = useState<HTMLButtonElement | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (dirtyConfiguration.current || failures.current.size || inFlight.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, []);
  if (!item) return null;
  const Icon = equipmentIcons[item.equipmentType];
  const currentWorkstation = item.workstationId ? workstations.find((workstation) => workstation.id === item.workstationId) : null;
  const workstationName = currentWorkstation ? `${t("workstation.numberLabel", { number: currentWorkstation.number })}${currentWorkstation.name ? ` · ${currentWorkstation.name}` : ""}` : item.workstationId ? t("location.unknown") : t("location.unattached");
  const equipmentId = item.id;
  const equipmentName = equipmentDisplayName(item);
  const codePrefix = equipmentInventoryPrefix(item.equipmentType);
  function canLeave() {
    if (inFlight.current || ((dirtyConfiguration.current || failures.current.size) && !window.confirm(t("form.discardChanges")))) return false;
    dirtyConfiguration.current = false;
    return true;
  }
  function close() { if (canLeave()) onClose(); }
  function run(operation: () => Promise<EquipmentActionState>, after?: () => void, key = "operation") {
    setSaved(false);
    inFlight.current += 1;
    const resultPromise = writeQueue.current.then(operation);
    writeQueue.current = resultPromise.then(() => undefined, () => undefined);
    startTransition(async () => {
      let result: EquipmentActionState;
      try { result = await resultPromise; } catch { result = { error: "update" }; }
      inFlight.current -= 1;
      if (result.error) failures.current.set(key, { error: result.error, retry: () => run(operation, after, key) });
      else { failures.current.delete(key); after?.(); router.refresh(); }
      const failure = failures.current.values().next().value;
      setError(failure?.error);
      retryRef.current = failure?.retry ?? null;
      setSaved(!failure && !result.error);
    });
  }
  function saveField(patch: EquipmentFieldUpdate) { run(() => updateEquipmentField(patch), undefined, patch.field); }
  function renameCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateEquipmentField({ equipmentId, field: "assetTag", value: `${codePrefix}${codeNumber}` }), () => setCodeOpen(false));
  }
  function remove() { if (!window.confirm(t("deleteConfirm", { name: equipmentName }))) return; run(() => deleteEquipment({ equipmentId }), onClose); }
  const actionsPortal = actionsTrigger?.closest("dialog, [role='dialog']") ?? undefined;
  return <><Drawer isOpen isTopLayer={!serviceOpen && !codeOpen} onClose={close} initialFocusRef={closeRef} focusKey={item.id} title={equipmentName} className="w-full max-w-[42rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{[item.displayName ? item.assetTag : null, t(`types.${item.equipmentType}`), equipmentModelIdentity(item)].filter(Boolean).join(" · ")}</p><div className="mt-1 flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold">{equipmentName}</h2><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lifecycleStyle(item.lifecycleState))}>{t(`states.${item.lifecycleState}`)}</span></div><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{workstationName}</p></div></div><div className="flex shrink-0 items-center"><PopoverPrimitive.Root open={actionsOpen} onOpenChange={setActionsOpen}><PopoverPrimitive.Trigger asChild><button ref={setActionsTrigger} type="button" disabled={pending} aria-label={t("actions.more")} aria-haspopup="menu" className="flex size-11 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><MoreHorizontal className="size-5" aria-hidden="true" /></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal container={actionsPortal}><PopoverPrimitive.Content role="menu" align="end" sideOffset={6} className="z-[80] min-w-40 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-popover)]"><button type="button" role="menuitem" onClick={() => { setActionsOpen(false); setError(undefined); setCodeNumber(equipmentInventoryNumber(item.assetTag ?? "", item.equipmentType)); setCodeOpen(true); }} className="flex min-h-10 w-full items-center gap-2 rounded-[var(--ui-radius-control)] px-3 text-left text-sm hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Pencil className="size-4" aria-hidden="true" />{t("actions.changeCode")}</button><button type="button" role="menuitem" onClick={() => { setActionsOpen(false); remove(); }} className="flex min-h-10 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-left text-sm font-medium text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Trash2 className="size-4" aria-hidden="true" />{t("actions.delete")}</button></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root><button ref={closeRef} type="button" disabled={pending} onClick={close} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-5 pt-3 sm:px-6" role="status" aria-live="polite">{pending ? <span className="text-xs text-[var(--ui-text-muted)]">{t("actions.saving")}</span> : saved ? <span className="text-xs text-[var(--ui-text-muted)]">{t("actions.saved")}</span> : null}<ActionError error={error} />{error && retryRef.current ? <Button variant="ghost" onClick={() => retryRef.current?.()}>{t("actions.retry")}</Button> : null}</div>
      {maintenanceMode ? <><MaintenanceSchedule item={item} pending={pending} run={run} /><ServicePanel item={item} pending={pending} run={run} today={today} /><HistoryPanel item={item} /></> : <><fieldset aria-busy={pending} className="flex flex-col gap-5 p-5 sm:p-6"><EquipmentFormFields pending={pending} item={item} showMaintenanceFields={false} workstations={workstations} onSave={saveField} onDirtyChange={(dirty) => { dirtyConfiguration.current = dirty; }} /></fieldset><EquipmentMaintenanceSummary item={item} today={today} onNavigate={canLeave} onStartService={() => setServiceOpen(true)} /></>}
    </div>
  </Drawer>
  <Dialog className="max-w-lg" isOpen={serviceOpen} closeDisabled={pending} closeLabel={t("close")} title={t("service.send")} onRequestClose={(reason) => { if (!pending && reason !== "outside") setServiceOpen(false); }}><div className="overflow-y-auto p-5 sm:p-6"><p className="mb-4 text-sm text-[var(--ui-text-muted)]">{item.assetTag}{item.displayName ? ` · ${item.displayName}` : ""}</p><StartServiceForm item={item} pending={pending} today={today} run={(operation) => run(operation, () => setServiceOpen(false))} /><ActionError error={error} /></div></Dialog>
  <Dialog className="max-w-sm" isOpen={codeOpen} closeDisabled={pending} closeLabel={t("close")} title={t("actions.changeCode")} onRequestClose={() => { if (!pending) setCodeOpen(false); }}><form onSubmit={renameCode} className="grid gap-4 p-5 sm:p-6"><FormField as="div" label={t("form.assetTag")}><NumericStepper initialFocus ariaLabel={t("form.assetTagNumber")} decreaseLabel={t("form.decreaseAssetTag")} increaseLabel={t("form.increaseAssetTag")} invalid={error === "duplicate"} prefix={codePrefix} preserveWidth value={codeNumber} onValueChange={(value) => { setCodeNumber(value); if (error === "duplicate") setError(undefined); }} />{error === "duplicate" ? <span role="alert" className="text-sm font-normal text-[var(--ui-danger-text)]">{t("form.codeUnavailable")}</span> : null}<span className="text-xs font-normal text-[var(--ui-text-muted)]">{t("form.codeChangeHint")}</span></FormField><ActionError error={error === "duplicate" ? undefined : error} /><Button type="submit" disabled={pending || !codeNumber}>{t("actions.changeCode")}</Button></form></Dialog></>;
}

function MaintenanceSchedule({ item, pending, run }: { item: EquipmentItem; pending: boolean; run: (operation: () => Promise<EquipmentActionState>) => void }) {
  const t = useTranslations("Equipment");
  const [enabled, setEnabled] = useState(item.recurringMaintenanceEnabled);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() => updateEquipmentMaintenance({ equipmentId: item.id, enabled, interval: enabled ? data.get("interval") : null, dueDate: enabled ? data.get("dueDate") : null }));
  }
  return <form onSubmit={submit} className="grid gap-4 p-5 sm:p-6"><h3 className="text-sm font-semibold">{t("maintenance.recurringTitle")}</h3><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--ui-action-primary)]" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{t("maintenance.enabled")}</label>{enabled ? <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("maintenance.interval")}><Input type="number" name="interval" min={1} max={120} required defaultValue={item.maintenanceIntervalMonths ?? 12} /></FormField><FormField label={t("maintenance.nextDueDate")}><Input type="date" name="dueDate" required defaultValue={item.nextMaintenanceDueDate ?? ""} /></FormField></div> : null}<Button className="justify-self-end" type="submit" disabled={pending}>{t("maintenance.saveSchedule")}</Button></form>;
}

function EquipmentMaintenanceSummary({ item, today, onStartService, onNavigate }: { item: EquipmentItem; today: string; onStartService: () => void; onNavigate: () => boolean }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const openService = item.serviceEvents.find((event) => !event.completedOn);
  const urgency = getMaintenanceUrgency(item.recurringMaintenanceEnabled, item.nextMaintenanceDueDate, today);
  const status = openService ? t("service.inProgressSince", { date: formatDateOnly(openService.startedOn, locale) }) : item.nextMaintenanceDueDate ? t("maintenance.due", { date: formatDateOnly(item.nextMaintenanceDueDate, locale) }) : t("maintenance.notScheduled");
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)]"><Wrench className="size-4" aria-hidden="true" /></span><div className="min-w-0"><h3 className="text-sm font-semibold">{t("maintenance.summaryTitle")}</h3><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-text-muted)]"><span>{status}</span><MaintenanceBadge item={item} urgency={urgency} /></div></div></div><div className="flex flex-wrap gap-2">{!openService && item.lifecycleState !== "retired" ? <Button variant="outline" onClick={onStartService}>{t("service.send")}</Button> : null}<Button asChild variant="ghost"><Link onClick={(event) => { if (!onNavigate()) event.preventDefault(); }} href={`/office/equipment?view=maintenance&item=${item.id}`}>{t("maintenance.openWorkspace")}</Link></Button></div></div></section>;
}

function StartServiceForm({ item, pending, run, today }: { item: EquipmentItem; pending: boolean; run: (operation: () => Promise<EquipmentActionState>) => void; today: string }) {
  const t = useTranslations("Equipment");
  function start(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => startEquipmentService({ equipmentId: item.id, eventType: data.get("eventType"), startedOn: data.get("startedOn"), serviceProvider: data.get("serviceProvider"), notes: data.get("notes") })); }
  return <form onSubmit={start} className="mt-4 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("service.type")}><Select name="eventType" defaultValue="regular_maintenance"><SelectItem value="regular_maintenance">{t("history.types.regular_maintenance")}</SelectItem><SelectItem value="repair">{t("history.types.repair")}</SelectItem><SelectItem value="upgrade">{t("history.types.upgrade")}</SelectItem></Select></FormField><FormField label={t("service.sentDate")}><Input type="date" name="startedOn" max={today} required defaultValue={today} /></FormField></div><OptionalInput name="serviceProvider" label={t("service.provider")} maxLength={160} /><FormField label={t("service.startNotes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} /></FormField><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("service.send")}</Button></form>;
}

function ServicePanel({ item, pending, run, today }: { item: EquipmentItem; pending: boolean; run: (operation: () => Promise<EquipmentActionState>, after?: () => void) => void; today: string }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const openService = item.serviceEvents.find((event) => !event.completedOn);

  function complete(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!openService) return; const data = new FormData(event.currentTarget); const costAmount = data.get("costAmount"); run(() => completeEquipmentService({ serviceEventId: openService.id, completedOn: data.get("completedOn"), returnState: data.get("returnState"), costAmount, costCurrency: costAmount ? data.get("costCurrency") : "", notes: data.get("notes") })); }
  function record(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const costAmount = data.get("costAmount"); run(() => recordEquipmentHistory({ equipmentId: item.id, eventType: data.get("eventType"), startedOn: data.get("startedOn"), completedOn: data.get("completedOn"), serviceProvider: data.get("serviceProvider"), costAmount, costCurrency: costAmount ? data.get("costCurrency") : "", notes: data.get("notes") }), () => { form.reset(); setShowHistoryForm(false); }); }
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{t("service.title")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{openService ? t("service.inProgressSince", { date: formatDateOnly(openService.startedOn, locale) }) : null}</p></div><Wrench className="size-5 text-[var(--ui-text-muted)]" aria-hidden="true" /></div>
    {openService ? <form onSubmit={complete} className="mt-4 grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"><p className="text-sm font-semibold">{t(`history.types.${openService.eventType}`)}</p><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("service.returnDate")}><Input type="date" name="completedOn" min={openService.startedOn} max={today} required defaultValue={today} /></FormField><FormField label={t("service.returnState")}><Select name="returnState" defaultValue="active"><SelectItem value="active">{t("states.active")}</SelectItem><SelectItem value="spare">{t("states.spare")}</SelectItem></Select></FormField></div><CostFields /><FormField label={t("service.completionNotes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} /></FormField><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("service.complete")}</Button></form>
      : item.lifecycleState !== "retired" ? <StartServiceForm item={item} pending={pending} run={run} today={today} /> : <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("service.retired")}</p>}
    <div className="mt-5 border-t border-[var(--ui-border)] pt-5"><Button type="button" variant="outline" disabled={pending} onClick={() => setShowHistoryForm((value) => !value)}><Plus className="mr-2 size-4" aria-hidden="true" />{t("history.record")}</Button>{showHistoryForm ? <form onSubmit={record} className="mt-4 grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("service.type")}><Select name="eventType" defaultValue="repair"><SelectItem value="repair">{t("history.types.repair")}</SelectItem><SelectItem value="upgrade">{t("history.types.upgrade")}</SelectItem></Select></FormField><FormField label={t("history.completedDate")}><Input type="date" name="completedOn" max={today} required defaultValue={today} /></FormField></div><FormField label={t("history.startedDate")} optional optionalLabel={t("optional")}><Input type="date" name="startedOn" max={today} /></FormField><OptionalInput name="serviceProvider" label={t("service.provider")} maxLength={160} /><CostFields /><FormField label={t("history.details")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setShowHistoryForm(false)}>{t("cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("history.save")}</Button></div></form> : null}</div>
  </section>;
}

function CostFields() {
  const t = useTranslations("Equipment");
  return <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]"><FormField label={t("service.cost")} optional optionalLabel={t("optional")}><Input type="number" name="costAmount" min="0.01" step="0.01" /></FormField><FormField label={t("service.currency")}><Select name="costCurrency" defaultValue="UAH">{CRM_BUDGET_CURRENCIES.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</Select></FormField></div>;
}

function HistoryPanel({ item }: { item: EquipmentItem }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const completed = item.serviceEvents.filter((event) => event.completedOn);
  return <section className="border-t border-[var(--ui-border)] p-5 sm:p-6"><div className="flex items-center gap-2"><RotateCcw className="size-4 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="font-semibold">{t("history.title")}</h3></div>{completed.length ? <ol className="mt-4 space-y-3">{completed.map((event) => {
    const cost = event.costAmount !== null && event.costCurrency && isCrmBudgetCurrency(event.costCurrency) ? formatCrmBudget(event.costAmount, event.costCurrency) : null;
    return <li key={event.id} className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm">{t(`history.types.${event.eventType}`)}</strong><time className="text-xs text-[var(--ui-text-muted)]" dateTime={event.completedOn ?? undefined}>{formatDateOnly(event.completedOn, locale)}</time></div><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{event.startedOn !== event.completedOn ? t("history.dateRange", { start: formatDateOnly(event.startedOn, locale), end: formatDateOnly(event.completedOn, locale) }) : null}{event.serviceProvider ? `${event.startedOn !== event.completedOn ? " · " : ""}${event.serviceProvider}` : ""}{cost ? ` · ${cost}` : ""}</p>{event.startedNotes ? <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--ui-text-secondary)]">{event.startedNotes}</p> : null}{event.completionNotes ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ui-text-secondary)]">{event.completionNotes}</p> : null}</li>;
  })}</ol> : <p className="mt-3 text-sm text-[var(--ui-text-muted)]">{t("history.empty")}</p>}</section>;
}

function ActionError({ error }: { error?: EquipmentActionState["error"] }) {
  const t = useTranslations("Equipment");
  return error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t(`errors.${error}`)}</p> : null;
}
