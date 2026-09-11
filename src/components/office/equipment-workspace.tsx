"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AirVent,
  Boxes,
  Coffee,
  Cpu,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  MonitorCog,
  Mouse,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Unplug,
  UserRound,
  Video,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  assignEquipment,
  completeEquipmentService,
  createEquipment,
  createWorkstations,
  deleteEquipment,
  deleteWorkstation,
  recordEquipmentHistory,
  startEquipmentService,
  updateEquipment,
  updateWorkstation,
} from "@/app/(app)/office/equipment/actions";
import { EquipmentFormFields } from "@/components/office/equipment-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { EquipmentItem, EquipmentMember, WorkstationItem } from "@/data/queries/equipment";
import { CRM_BUDGET_CURRENCIES, formatCrmBudget, isCrmBudgetCurrency } from "@/lib/crm-budget";
import {
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
import type { EquipmentActionState } from "@/lib/validation/equipment";
import { cn } from "@/lib/utils";

type EquipmentView = "workstations" | "other" | "maintenance";
type CreateKind = "workstation" | "equipment";
const initialActionState: EquipmentActionState = {};

const equipmentIcons: Record<EquipmentType, LucideIcon> = {
  pc: Cpu,
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

function useEquipmentRouting() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createValue = searchParams.get("create");
  const createKind: CreateKind | null = createValue === "workstation" || createValue === "equipment" ? createValue : null;
  const selectedItemId = createKind ? null : searchParams.get("item");

  function updateSearchParams(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    const query = next.toString();
    router.replace(query ? `/office/equipment?${query}` : "/office/equipment", { scroll: false });
  }

  return {
    createKind,
    selectedItemId,
    closeCreate: () => updateSearchParams((next) => next.delete("create")),
    closeItem: () => updateSearchParams((next) => next.delete("item")),
    openItem: (id: string) => updateSearchParams((next) => { next.delete("create"); next.set("item", id); }),
  };
}

export function EquipmentWorkspace({ equipment, initialView, members, today, workstations }: { equipment: EquipmentItem[]; initialView: EquipmentView; members: EquipmentMember[]; today: string; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const routing = useEquipmentRouting();
  const selectedWorkstation = workstations.find((item) => item.id === routing.selectedItemId) ?? null;
  const selectedEquipment = selectedWorkstation ? null : equipment.find((item) => item.id === routing.selectedItemId) ?? null;
  const workstationNames = useMemo(() => new Map(workstations.map((item) => [item.id, `${t("workstation.numberLabel", { number: item.number })}${item.name ? ` · ${item.name}` : ""}`])), [t, workstations]);
  const inventoryItems = equipment.filter((item) => isOtherEquipment(item.equipmentType) || !item.workstationId);

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-lg font-bold text-[var(--ui-text)]">{t("title")}</h2><p className="mt-1 text-sm leading-6 text-[var(--ui-text-secondary)]">{t("description")}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link href={`/office/equipment?view=${initialView}&create=workstation`}><Plus className="mr-2 size-4" aria-hidden="true" />{t("actions.addWorkstation")}</Link></Button>
        <Button asChild><Link href={`/office/equipment?view=${initialView}&create=equipment`}><Plus className="mr-2 size-4" aria-hidden="true" />{t("actions.addEquipment")}</Link></Button>
      </div>
    </div>

    <nav aria-label={t("views.label")} className="flex gap-1 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">
      {(["workstations", "other", "maintenance"] as const).map((view) => <Link key={view} href={`/office/equipment?view=${view}`} aria-current={initialView === view ? "page" : undefined} className={cn("flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:flex-none", initialView === view ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>
        {view === "workstations" ? <MonitorCog className="size-4" aria-hidden="true" /> : view === "other" ? <Boxes className="size-4" aria-hidden="true" /> : <Wrench className="size-4" aria-hidden="true" />}{t(`views.${view}`)}
      </Link>)}
    </nav>

    {initialView === "workstations" ? <WorkstationList items={workstations} onOpen={routing.openItem} />
      : initialView === "other" ? <EquipmentInventory items={inventoryItems} workstationNames={workstationNames} onOpen={routing.openItem} />
      : <MaintenanceQueue items={equipment} workstationNames={workstationNames} today={today} onOpen={routing.openItem} />}

    <CreateWorkstationDialog key={`create-workstation-${routing.createKind === "workstation"}`} isOpen={routing.createKind === "workstation"} members={members} workstations={workstations} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <CreateEquipmentDialog key={`create-equipment-${routing.createKind === "equipment"}`} isOpen={routing.createKind === "equipment"} workstations={workstations} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <WorkstationDrawer key={selectedWorkstation?.id ?? "workstation-closed"} item={selectedWorkstation} allEquipment={equipment} members={members} workstations={workstations} onClose={routing.closeItem} onOpenEquipment={routing.openItem} />
    <EquipmentDrawer key={selectedEquipment?.id ?? "equipment-closed"} item={selectedEquipment} today={today} workstations={workstations} onClose={routing.closeItem} />
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
      <span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><span className="min-w-0"><strong className="block truncate text-base text-[var(--ui-text)]">{t("workstation.numberLabel", { number: item.number })}</strong>{item.name ? <span className="mt-0.5 block truncate text-sm text-[var(--ui-text-secondary)]">{item.name}</span> : null}</span></span><Pencil className="size-4 shrink-0 text-[var(--ui-text-subtle)]" aria-hidden="true" /></span>
      <span className="mt-4 flex items-center gap-2 text-sm text-[var(--ui-text-secondary)]">{item.assignedEmployee ? <><UserAvatar decorative imageUrl={item.assignedEmployee.avatarUrl} name={item.assignedEmployee.fullName} size="boardCard" /><span className="truncate font-medium">{item.assignedEmployee.fullName}</span></> : <><UserRound className="size-4" aria-hidden="true" /><span>{t("workstation.unassigned")}</span></>}</span>
      <span className="mt-4 block border-t border-[var(--ui-border-subtle)] pt-3"><span className="block truncate text-sm font-semibold text-[var(--ui-text)]">{computer ? computer.displayName : t("workstation.noComputer")}</span>{specs ? <span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]" title={specs}>{specs}</span> : null}<span className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ui-text-muted)]"><span>{t("workstation.monitorCount", { count: monitorCount })}</span><span aria-hidden="true">·</span><span>{t("workstation.peripheralCount", { count: peripheralCount })}</span></span></span>
    </button>;
  })}</div>;
}

function EquipmentInventory({ items, workstationNames, onOpen }: { items: EquipmentItem[]; workstationNames: Map<string, string>; onOpen: (id: string) => void }) {
  const t = useTranslations("Equipment");
  if (!items.length) return <EmptyState Icon={Boxes} title={t("empty.equipmentTitle")} description={t("empty.equipmentDescription")} />;
  return <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{items.map((item) => {
    const Icon = equipmentIcons[item.equipmentType];
    const location = item.workstationId ? workstationNames.get(item.workstationId) ?? t("location.unknown") : t("location.unattached");
    return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="grid min-h-16 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:px-5">
      <span className="flex size-9 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-[1.125rem]" aria-hidden="true" /></span>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-[var(--ui-text)]">{item.displayName}</strong><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lifecycleStyle(item.lifecycleState))}>{t(`states.${item.lifecycleState}`)}</span></span><span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]">{t(`types.${item.equipmentType}`)} · {location}{item.assetTag ? ` · ${item.assetTag}` : ""}</span></span>
      <Pencil className="size-4 text-[var(--ui-text-subtle)]" aria-hidden="true" />
    </button>;
  })}</div>;
}

function MaintenanceQueue({ items, onOpen, today, workstationNames }: { items: EquipmentItem[]; onOpen: (id: string) => void; today: string; workstationNames: Map<string, string> }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const queue = items.flatMap((item) => {
    const urgency = getMaintenanceUrgency(item.recurringMaintenanceEnabled, item.nextMaintenanceDueDate, today);
    if (item.lifecycleState !== "in_service" && !urgency) return [];
    return [{ item, urgency, priority: item.lifecycleState === "in_service" ? 0 : urgency === "overdue" ? 1 : 2 }];
  }).sort((a, b) => a.priority - b.priority || (a.item.nextMaintenanceDueDate ?? "9999").localeCompare(b.item.nextMaintenanceDueDate ?? "9999") || a.item.displayName.localeCompare(b.item.displayName));
  if (!queue.length) return <EmptyState Icon={Wrench} title={t("maintenance.emptyTitle")} description={t("maintenance.emptyDescription")} />;
  return <section aria-labelledby="maintenance-queue-heading">
    <div className="mb-3"><h3 id="maintenance-queue-heading" className="font-semibold text-[var(--ui-text)]">{t("maintenance.queueTitle")}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{t("maintenance.queueDescription")}</p></div>
    <div className="divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{queue.map(({ item, urgency }) => {
      const Icon = equipmentIcons[item.equipmentType];
      const location = item.workstationId ? workstationNames.get(item.workstationId) ?? t("location.unknown") : t("location.unattached");
      const due = item.nextMaintenanceDueDate ? formatDateOnly(item.nextMaintenanceDueDate, locale) : null;
      const offset = item.nextMaintenanceDueDate && urgency ? maintenanceDayOffset(item.nextMaintenanceDueDate, today) : null;
      const timing = offset === null ? t("maintenance.currentlyInService") : offset < 0 ? t("maintenance.overdueBy", { count: -offset }) : offset === 0 ? t("maintenance.dueToday") : t("maintenance.dueIn", { count: offset });
      return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="grid min-h-20 w-full cursor-pointer gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--ui-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ui-focus)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-5">
        <span className="hidden size-9 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)] sm:flex"><Icon className="size-[1.125rem]" aria-hidden="true" /></span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-[var(--ui-text)]">{item.displayName}</strong><MaintenanceBadge item={item} urgency={urgency} /></span><span className="mt-1 block truncate text-xs text-[var(--ui-text-muted)]">{t(`types.${item.equipmentType}`)} · {location}{item.assetTag ? ` · ${item.assetTag}` : ""}</span></span>
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

function CreateWorkstationDialog({ isOpen, members, workstations, onClose, onCreated }: { isOpen: boolean; members: EquipmentMember[]; workstations: WorkstationItem[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const nextNumber = Math.max(0, ...workstations.map((workstation) => workstation.number)) + 1;
  const [quantity, setQuantity] = useState(1);
  const [startingNumber, setStartingNumber] = useState(nextNumber);
  const [drafts, setDrafts] = useState<WorkstationDraft[]>(() => [{ number: nextNumber, name: "", assignedEmployeeId: "__none" }]);
  const [assignEmployees, setAssignEmployees] = useState(false);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const [pending, startTransition] = useTransition();
  const existingAssignments = new Map(workstations.flatMap((workstation) => workstation.assignedEmployee ? [[workstation.assignedEmployee.id, workstation]] : []));
  function regenerate(nextQuantity: number, nextStartingNumber: number) {
    setQuantity(nextQuantity);
    setStartingNumber(nextStartingNumber);
    setDrafts(Array.from({ length: nextQuantity }, (_, index) => ({ number: nextStartingNumber + index, name: "", assignedEmployeeId: "__none" })));
  }
  function updateDraft(index: number, patch: Partial<WorkstationDraft>) { setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft)); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await createWorkstations({ workstations: drafts.map((draft) => ({ ...draft, assignedEmployeeId: assignEmployees ? draft.assignedEmployeeId : "__none" })) });
      if (result.error) setError(result.error);
      else if (quantity === 1 && result.id) onCreated(result.id);
      else { onClose(); router.refresh(); }
    });
  }
  const rowColumns = assignEmployees ? "sm:grid-cols-[7rem_minmax(0,1fr)_minmax(12rem,1fr)]" : "sm:grid-cols-[7rem_minmax(0,1fr)]";
  return <Dialog closeDisabled={pending} closeLabel={t("close")} description={t("workstation.form.createDescription")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("workstation.form.createTitle")}>
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("workstation.form.quantity")}><Input data-dialog-initial-focus type="number" min={1} max={50} value={quantity} onChange={(event) => regenerate(Math.max(1, Math.min(50, Number(event.target.value) || 1)), startingNumber)} /></FormField><FormField label={t("workstation.form.startingNumber")}><Input type="number" min={1} max={1_000_000} value={startingNumber} onChange={(event) => regenerate(quantity, Math.max(1, Number(event.target.value) || 1))} /></FormField></div><p className="-mt-2 text-xs leading-5 text-[var(--ui-text-muted)]">{t("workstation.form.bulkHelp")}</p><div className={cn("overflow-y-auto rounded-[var(--ui-radius-control)] border border-[var(--ui-border)]", drafts.length > 5 && "max-h-80")}><div className="divide-y divide-[var(--ui-border-subtle)]"><div className={cn("hidden gap-3 border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] sm:grid", rowColumns)}><span>{t("workstation.form.number")}</span><span>{t("workstation.form.name")} <span className="font-normal">({t("optional")})</span></span>{assignEmployees ? <span>{t("workstation.form.employee")} <span className="font-normal">({t("optional")})</span></span> : null}</div>{drafts.map((draft, index) => { const selectedEmployees = new Set(drafts.filter((_, draftIndex) => draftIndex !== index).map((item) => item.assignedEmployeeId)); return <div key={index} className={cn("grid gap-3 p-3", rowColumns)}><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.number")}</span><Input type="number" min={1} max={1_000_000} value={draft.number} onChange={(event) => updateDraft(index, { number: Number(event.target.value) || 0 })} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.name")} ({t("optional")})</span><Input maxLength={120} value={draft.name} onChange={(event) => updateDraft(index, { name: event.target.value })} /></label>{assignEmployees ? <label className="grid gap-1.5 text-sm font-medium text-[var(--ui-text-secondary)]"><span className="sm:sr-only">{t("workstation.form.employee")} ({t("optional")})</span><Select value={draft.assignedEmployeeId} onValueChange={(assignedEmployeeId) => updateDraft(index, { assignedEmployeeId })}><SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>{members.map((member) => { const assigned = existingAssignments.get(member.id); const unavailable = Boolean(assigned) || selectedEmployees.has(member.id); return <SelectItem key={member.id} value={member.id} disabled={unavailable && draft.assignedEmployeeId !== member.id} textValue={member.fullName}>{member.fullName}{assigned ? ` · ${t("workstation.form.assignedElsewhere", { workstation: t("workstation.numberLabel", { number: assigned.number }) })}` : ""}</SelectItem>; })}</Select></label> : null}</div>; })}</div></div><label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] p-3"><input className="mt-0.5 size-5 accent-[var(--ui-action-primary)]" type="checkbox" checked={assignEmployees} onChange={(event) => setAssignEmployees(event.target.checked)} /><span><span className="block text-sm font-semibold">{t("workstation.form.assignEmployees")}</span><span className="mt-1 block text-xs leading-5 text-[var(--ui-text-muted)]">{t("workstation.form.assignEmployeesHelp")}</span></span></label><ActionError error={error} /><div className="flex justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createWorkstations", { count: quantity })}</Button></div></form>
  </Dialog>;
}

function WorkstationFields({ item, members, workstations }: { item?: WorkstationItem; members: EquipmentMember[]; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const assignments = new Map(workstations.filter((workstation) => workstation.id !== item?.id && workstation.assignedEmployee).map((workstation) => [workstation.assignedEmployee!.id, workstation]));
  return <><div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]"><FormField label={t("workstation.form.number")}><Input data-dialog-initial-focus={!item || undefined} name="number" required type="number" min={1} max={1_000_000} defaultValue={item?.number} /></FormField><FormField label={t("workstation.form.name")} optional optionalLabel={t("optional")}><Input name="name" maxLength={120} defaultValue={item?.name ?? ""} /></FormField></div><FormField label={t("workstation.form.employee")} optional optionalLabel={t("optional")}><Select name="assignedEmployeeId" defaultValue={item?.assignedEmployee?.id ?? "__none"}><SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>{members.map((member) => { const assigned = assignments.get(member.id); return <SelectItem key={member.id} value={member.id} disabled={Boolean(assigned)} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}{assigned ? ` · ${t("workstation.form.assignedElsewhere", { workstation: t("workstation.numberLabel", { number: assigned.number }) })}` : ""}</span></SelectItem>; })}</Select></FormField></>;
}

function CreateEquipmentDialog({ isOpen, workstations, onClose, onCreated }: { isOpen: boolean; workstations: WorkstationItem[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createEquipment, initialActionState);
  useEffect(() => { if (state.success && state.id && !processed.current) { processed.current = true; onCreated(state.id); } }, [onCreated, state.id, state.success]);
  return <Dialog className="max-w-2xl" closeDisabled={pending} closeLabel={t("close")} description={t("form.createDescription")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.createTitle")}>
    <form action={action} className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5 sm:p-6"><EquipmentFormFields workstations={workstations} initialType="other" /><ActionError error={state.error} /><div className="flex justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createEquipment")}</Button></div></form>
  </Dialog>;
}

function OptionalInput({ disabled, hint, label, maxLength, name, value }: { disabled?: boolean; hint?: string; label: string; maxLength: number; name: string; value?: string | null }) {
  const t = useTranslations("Equipment");
  return <FormField label={label} optional optionalLabel={t("optional")}><Input disabled={disabled} name={name} maxLength={maxLength} defaultValue={value ?? ""} />{hint ? <span className="text-xs font-normal leading-5 text-[var(--ui-text-muted)]">{hint}</span> : null}</FormField>;
}

function WorkstationDrawer({ allEquipment, item, members, workstations, onClose, onOpenEquipment }: { allEquipment: EquipmentItem[]; item: WorkstationItem | null; members: EquipmentMember[]; workstations: WorkstationItem[]; onClose: () => void; onOpenEquipment: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const [pending, startTransition] = useTransition();
  const [attachId, setAttachId] = useState("__none");
  if (!item) return null;
  const candidates = allEquipment.filter((equipmentItem) => equipmentItem.workstationId !== item.id);
  const locationNames = new Map(workstations.map((workstation) => [workstation.id, `${t("workstation.numberLabel", { number: workstation.number })}${workstation.name ? ` · ${workstation.name}` : ""}`]));
  const computers = item.equipment.filter((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
  const monitors = item.equipment.filter((equipmentItem) => equipmentItem.equipmentType === "monitor");
  const peripherals = item.equipment.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType));
  const other = item.equipment.filter((equipmentItem) => isOtherEquipment(equipmentItem.equipmentType));
  const workstationId = item.id;
  const workstationName = t("workstation.numberLabel", { number: item.number });
  function run(operation: () => Promise<EquipmentActionState>, after?: () => void) { setError(undefined); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else { after?.(); router.refresh(); } }); }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateWorkstation({ workstationId, number: data.get("number"), name: data.get("name"), assignedEmployeeId: data.get("assignedEmployeeId") })); }
  function remove() { if (!window.confirm(t("workstation.deleteConfirm", { name: workstationName }))) return; run(() => deleteWorkstation({ workstationId }), onClose); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={workstationName} className="w-full max-w-[38rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("workstation.eyebrow")}</p><h2 className="mt-1 truncate text-lg font-bold">{workstationName}</h2>{item.name ? <p className="mt-1 truncate text-sm text-[var(--ui-text-secondary)]">{item.name}</p> : null}</div></div><button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <form onSubmit={submit} className="grid gap-4 p-5 sm:p-6"><WorkstationFields item={item} members={members} workstations={workstations} /><ActionError error={error} /><div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="ghost" className="text-[var(--ui-danger-text)]" disabled={pending} onClick={remove}><Trash2 className="mr-2 size-4" aria-hidden="true" />{t("actions.delete")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("actions.saveWorkstation")}</Button></div></form>
      <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{t("workstation.attached")}</h3><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("workstation.attachedDescription")}</p></div><span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text-muted)]">{item.equipment.length}</span></div>
        <div className="mt-5 space-y-5"><EquipmentGroup title={t("groups.computers")} items={computers} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /><EquipmentGroup title={t("groups.monitors")} items={monitors} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /><EquipmentGroup title={t("groups.peripherals")} items={peripherals} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} />{other.length ? <EquipmentGroup title={t("groups.other")} items={other} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /> : null}</div>
        <div className="mt-6 border-t border-[var(--ui-border)] pt-5"><h4 className="text-sm font-semibold">{t("assignment.attach")}</h4><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("assignment.moveNotice")}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={attachId} onValueChange={setAttachId} disabled={pending}><SelectItem value="__none">{t("assignment.choose")}</SelectItem>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id} textValue={candidate.displayName}>{candidate.displayName} · {candidate.workstationId ? locationNames.get(candidate.workstationId) ?? t("location.unknown") : t("location.unattached")}</SelectItem>)}</Select><Button type="button" disabled={pending || attachId === "__none"} onClick={() => run(() => assignEquipment({ equipmentId: attachId, workstationId }), () => setAttachId("__none"))}>{pending ? t("actions.moving") : t("assignment.attachAction")}</Button></div></div>
      </section>
    </div>
  </Drawer>;
}

function EquipmentGroup({ items, onDetach, onOpen, pending, title }: { items: EquipmentItem[]; onDetach: (id: string) => void; onOpen: (id: string) => void; pending: boolean; title: string }) {
  const t = useTranslations("Equipment");
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{title}</h4>{items.length ? <div className="mt-2 divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{items.map((item) => { const Icon = equipmentIcons[item.equipmentType]; const specs = isComputerEquipment(item.equipmentType) ? equipmentSpecificationSummary(item, (config) => pcConfigurationSummaries(config, configurationLabels(t))) : ""; return <div key={item.id} className="flex items-center gap-3 px-3 py-2.5"><button type="button" onClick={() => onOpen(item.id)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Icon className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.displayName}</span><span className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{specs || t(`types.${item.equipmentType}`)}</span></span></button><button type="button" disabled={pending} onClick={() => onDetach(item.id)} aria-label={t("assignment.detachNamed", { name: item.displayName })} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><Unplug className="size-4" aria-hidden="true" /></button></div>; })}</div> : <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("groups.empty")}</p>}</div>;
}

function EquipmentDrawer({ item, today, workstations, onClose }: { item: EquipmentItem | null; today: string; workstations: WorkstationItem[]; onClose: () => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const [pending, startTransition] = useTransition();
  if (!item) return null;
  const Icon = equipmentIcons[item.equipmentType];
  const currentWorkstation = item.workstationId ? workstations.find((workstation) => workstation.id === item.workstationId) : null;
  const workstationName = currentWorkstation ? `${t("workstation.numberLabel", { number: currentWorkstation.number })}${currentWorkstation.name ? ` · ${currentWorkstation.name}` : ""}` : item.workstationId ? t("location.unknown") : t("location.unattached");
  const equipmentId = item.id;
  const equipmentName = item.displayName;
  function run(operation: () => Promise<EquipmentActionState>, after?: () => void) { setError(undefined); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else { after?.(); router.refresh(); } }); }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateEquipment({ equipmentId, equipmentType: data.get("equipmentType"), lifecycleState: data.get("lifecycleState"), displayName: data.get("displayName"), workstationId: data.get("workstationId"), manufacturer: data.get("manufacturer"), model: data.get("model"), serialNumber: data.get("serialNumber"), assetTag: data.get("assetTag"), cpu: data.get("cpu") ?? "", gpu: data.get("gpu") ?? "", ram: data.get("ram") ?? "", storage: data.get("storage") ?? "", pcConfiguration: data.get("pcConfiguration"), notes: data.get("notes"), recurringMaintenanceEnabled: data.get("recurringMaintenanceEnabled") === "on", maintenanceIntervalMonths: data.get("maintenanceIntervalMonths") ?? "", nextMaintenanceDueDate: data.get("nextMaintenanceDueDate") ?? "" })); }
  function remove() { if (!window.confirm(t("deleteConfirm", { name: equipmentName }))) return; run(() => deleteEquipment({ equipmentId }), onClose); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.displayName} className="w-full max-w-[42rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.equipmentType}`)}</p><div className="mt-1 flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold">{item.displayName}</h2><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lifecycleStyle(item.lifecycleState))}>{t(`states.${item.lifecycleState}`)}</span></div><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{workstationName}</p></div></div><button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto"><form onSubmit={submit} className="flex flex-col gap-5 p-5 sm:p-6"><EquipmentFormFields item={item} workstations={workstations} /><ActionError error={error} /><div className="flex flex-wrap justify-between gap-3 border-t border-[var(--ui-border)] pt-5"><Button type="button" variant="ghost" className="text-[var(--ui-danger-text)]" disabled={pending} onClick={remove}><Trash2 className="mr-2 size-4" aria-hidden="true" />{t("actions.delete")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("actions.saveEquipment")}</Button></div></form><ServicePanel item={item} pending={pending} run={run} today={today} /><HistoryPanel item={item} /></div>
  </Drawer>;
}

function ServicePanel({ item, pending, run, today }: { item: EquipmentItem; pending: boolean; run: (operation: () => Promise<EquipmentActionState>, after?: () => void) => void; today: string }) {
  const t = useTranslations("Equipment");
  const locale = useLocale();
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const openService = item.serviceEvents.find((event) => !event.completedOn);
  function start(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => startEquipmentService({ equipmentId: item.id, eventType: data.get("eventType"), startedOn: data.get("startedOn"), serviceProvider: data.get("serviceProvider"), notes: data.get("notes") })); }
  function complete(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!openService) return; const data = new FormData(event.currentTarget); const costAmount = data.get("costAmount"); run(() => completeEquipmentService({ serviceEventId: openService.id, completedOn: data.get("completedOn"), returnState: data.get("returnState"), costAmount, costCurrency: costAmount ? data.get("costCurrency") : "", notes: data.get("notes") })); }
  function record(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const costAmount = data.get("costAmount"); run(() => recordEquipmentHistory({ equipmentId: item.id, eventType: data.get("eventType"), startedOn: data.get("startedOn"), completedOn: data.get("completedOn"), serviceProvider: data.get("serviceProvider"), costAmount, costCurrency: costAmount ? data.get("costCurrency") : "", notes: data.get("notes") }), () => { form.reset(); setShowHistoryForm(false); }); }
  return <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{t("service.title")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{openService ? t("service.inProgressSince", { date: formatDateOnly(openService.startedOn, locale) }) : t("service.description")}</p></div><Wrench className="size-5 text-[var(--ui-text-muted)]" aria-hidden="true" /></div>
    {openService ? <form onSubmit={complete} className="mt-4 grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"><p className="text-sm font-semibold">{t(`history.types.${openService.eventType}`)}</p><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("service.returnDate")}><Input type="date" name="completedOn" min={openService.startedOn} max={today} required defaultValue={today} /></FormField><FormField label={t("service.returnState")}><Select name="returnState" defaultValue="active"><SelectItem value="active">{t("states.active")}</SelectItem><SelectItem value="spare">{t("states.spare")}</SelectItem></Select></FormField></div><CostFields /><FormField label={t("service.completionNotes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} /></FormField><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("service.complete")}</Button></form>
      : item.lifecycleState !== "retired" ? <form onSubmit={start} className="mt-4 grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4"><div className="grid gap-4 sm:grid-cols-2"><FormField label={t("service.type")}><Select name="eventType" defaultValue="regular_maintenance"><SelectItem value="regular_maintenance">{t("history.types.regular_maintenance")}</SelectItem><SelectItem value="repair">{t("history.types.repair")}</SelectItem><SelectItem value="upgrade">{t("history.types.upgrade")}</SelectItem></Select></FormField><FormField label={t("service.sentDate")}><Input type="date" name="startedOn" max={today} required defaultValue={today} /></FormField></div><OptionalInput name="serviceProvider" label={t("service.provider")} maxLength={160} /><FormField label={t("service.startNotes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={3} maxLength={5000} /></FormField><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("service.send")}</Button></form> : <p className="mt-4 text-sm text-[var(--ui-text-muted)]">{t("service.retired")}</p>}
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
