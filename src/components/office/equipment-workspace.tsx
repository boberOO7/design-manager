"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  Trash2,
  Unplug,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  assignEquipment,
  createEquipment,
  createWorkstation,
  deleteEquipment,
  deleteWorkstation,
  updateEquipment,
  updateWorkstation,
} from "@/app/(app)/office/equipment/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { EquipmentItem, EquipmentMember, WorkstationItem } from "@/data/queries/equipment";
import {
  EQUIPMENT_LIFECYCLE_STATES,
  EQUIPMENT_TYPES,
  equipmentSpecificationSummary,
  isComputerEquipment,
  isEquipmentType,
  isOtherEquipment,
  isPeripheralEquipment,
  type EquipmentLifecycleState,
  type EquipmentType,
} from "@/lib/equipment";
import type { EquipmentActionState } from "@/lib/validation/equipment";
import { cn } from "@/lib/utils";

type EquipmentView = "workstations" | "other";
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

export function EquipmentWorkspace({ equipment, initialView, members, workstations }: { equipment: EquipmentItem[]; initialView: EquipmentView; members: EquipmentMember[]; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const routing = useEquipmentRouting();
  const selectedWorkstation = workstations.find((item) => item.id === routing.selectedItemId) ?? null;
  const selectedEquipment = selectedWorkstation ? null : equipment.find((item) => item.id === routing.selectedItemId) ?? null;
  const workstationNames = useMemo(() => new Map(workstations.map((item) => [item.id, item.name])), [workstations]);
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
      {(["workstations", "other"] as const).map((view) => <Link key={view} href={`/office/equipment?view=${view}`} aria-current={initialView === view ? "page" : undefined} className={cn("flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:flex-none", initialView === view ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]")}>
        {view === "workstations" ? <MonitorCog className="size-4" aria-hidden="true" /> : <Boxes className="size-4" aria-hidden="true" />}{t(`views.${view}`)}
      </Link>)}
    </nav>

    {initialView === "workstations"
      ? <WorkstationList items={workstations} onOpen={routing.openItem} />
      : <EquipmentInventory items={inventoryItems} workstationNames={workstationNames} onOpen={routing.openItem} />}

    <CreateWorkstationDialog key={`create-workstation-${routing.createKind === "workstation"}`} isOpen={routing.createKind === "workstation"} members={members} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <CreateEquipmentDialog key={`create-equipment-${routing.createKind === "equipment"}`} isOpen={routing.createKind === "equipment"} workstations={workstations} onClose={routing.closeCreate} onCreated={routing.openItem} />
    <WorkstationDrawer key={selectedWorkstation?.id ?? "workstation-closed"} item={selectedWorkstation} allEquipment={equipment} members={members} workstations={workstations} onClose={routing.closeItem} onOpenEquipment={routing.openItem} />
    <EquipmentDrawer key={selectedEquipment?.id ?? "equipment-closed"} item={selectedEquipment} workstations={workstations} onClose={routing.closeItem} />
  </div>;
}

function WorkstationList({ items, onOpen }: { items: WorkstationItem[]; onOpen: (id: string) => void }) {
  const t = useTranslations("Equipment");
  if (!items.length) return <EmptyState Icon={MonitorCog} title={t("empty.workstationsTitle")} description={t("empty.workstationsDescription")} />;
  return <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => {
    const computer = item.equipment.find((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
    const monitorCount = item.equipment.filter((equipmentItem) => equipmentItem.equipmentType === "monitor").length;
    const peripheralCount = item.equipment.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType)).length;
    const specs = computer ? equipmentSpecificationSummary(computer) : "";
    return <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="min-h-44 cursor-pointer rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-left shadow-[var(--ui-shadow-panel)] transition-colors hover:border-[var(--ui-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] sm:p-5">
      <span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("workstation.eyebrow")}</span><strong className="mt-0.5 block truncate text-base text-[var(--ui-text)]">{item.name}</strong></span></span><Pencil className="size-4 shrink-0 text-[var(--ui-text-subtle)]" aria-hidden="true" /></span>
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

function EmptyState({ Icon, title, description }: { Icon: LucideIcon; title: string; description: string }) {
  return <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-6 py-14 text-center"><Icon className="mx-auto size-8 text-[var(--ui-text-muted)]" aria-hidden="true" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-sm text-[var(--ui-text-muted)]">{description}</p></div>;
}

function CreateWorkstationDialog({ isOpen, members, onClose, onCreated }: { isOpen: boolean; members: EquipmentMember[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createWorkstation, initialActionState);
  useEffect(() => { if (state.success && state.id && !processed.current) { processed.current = true; onCreated(state.id); } }, [onCreated, state.id, state.success]);
  return <Dialog closeDisabled={pending} closeLabel={t("close")} description={t("workstation.form.createDescription")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("workstation.form.createTitle")}>
    <form action={action} className="grid gap-5 overflow-y-auto p-5 sm:p-6"><WorkstationFields members={members} /><ActionError error={state.error} /><div className="flex justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createWorkstation")}</Button></div></form>
  </Dialog>;
}

function WorkstationFields({ item, members }: { item?: WorkstationItem; members: EquipmentMember[] }) {
  const t = useTranslations("Equipment");
  return <><FormField label={t("workstation.form.name")}><Input data-dialog-initial-focus={!item || undefined} name="name" required maxLength={120} defaultValue={item?.name} /></FormField><FormField label={t("workstation.form.employee")} optional optionalLabel={t("optional")}><Select name="assignedEmployeeId" defaultValue={item?.assignedEmployee?.id ?? "__none"}><SelectItem value="__none">{t("workstation.unassigned")}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} textValue={member.fullName}><span className="flex items-center gap-2"><UserAvatar decorative imageUrl={member.avatarUrl} name={member.fullName} size="boardCard" />{member.fullName}</span></SelectItem>)}</Select></FormField></>;
}

function CreateEquipmentDialog({ isOpen, workstations, onClose, onCreated }: { isOpen: boolean; workstations: WorkstationItem[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("Equipment");
  const processed = useRef(false);
  const [state, action, pending] = useActionState(createEquipment, initialActionState);
  useEffect(() => { if (state.success && state.id && !processed.current) { processed.current = true; onCreated(state.id); } }, [onCreated, state.id, state.success]);
  return <Dialog className="max-w-2xl" closeDisabled={pending} closeLabel={t("close")} description={t("form.createDescription")} isOpen={isOpen} onRequestClose={(reason) => { if (reason !== "outside" && !pending) onClose(); }} title={t("form.createTitle")}>
    <form action={action} className="grid gap-5 overflow-y-auto p-5 sm:p-6"><EquipmentFormFields workstations={workstations} initialType="other" /><ActionError error={state.error} /><div className="flex justify-end gap-3"><Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>{t("cancel")}</Button><Button type="submit" size="lg" disabled={pending}>{pending ? t("actions.creating") : t("actions.createEquipment")}</Button></div></form>
  </Dialog>;
}

function EquipmentFormFields({ item, initialType, workstations }: { item?: EquipmentItem; initialType?: EquipmentType; workstations: WorkstationItem[] }) {
  const t = useTranslations("Equipment");
  const [type, setType] = useState<EquipmentType>(item?.equipmentType ?? initialType ?? "other");
  return <>
    <div className="grid gap-4 sm:grid-cols-2"><FormField label={t("form.type")}><Select name="equipmentType" value={type} onValueChange={(value) => { if (isEquipmentType(value)) setType(value); }}>{EQUIPMENT_TYPES.map((value) => <SelectItem key={value} value={value}>{t(`types.${value}`)}</SelectItem>)}</Select></FormField><FormField label={t("form.state")}><Select name="lifecycleState" defaultValue={item?.lifecycleState ?? "active"}>{EQUIPMENT_LIFECYCLE_STATES.map((value) => <SelectItem key={value} value={value}>{t(`states.${value}`)}</SelectItem>)}</Select></FormField></div>
    <FormField label={t("form.displayName")}><Input data-dialog-initial-focus={!item || undefined} name="displayName" required maxLength={160} defaultValue={item?.displayName} /></FormField>
    <FormField label={t("form.workstation")} optional optionalLabel={t("optional")}><Select name="workstationId" defaultValue={item?.workstationId ?? "__none"}><SelectItem value="__none">{t("location.unattached")}</SelectItem>{workstations.map((workstation) => <SelectItem key={workstation.id} value={workstation.id}>{workstation.name}</SelectItem>)}</Select></FormField>
    <fieldset className="grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-4"><legend className="px-1 text-sm font-semibold text-[var(--ui-text)]">{t("form.identification")}</legend><div className="grid gap-4 sm:grid-cols-2"><OptionalInput name="manufacturer" label={t("form.manufacturer")} value={item?.manufacturer} maxLength={160} /><OptionalInput name="model" label={t("form.model")} value={item?.model} maxLength={160} /><OptionalInput name="serialNumber" label={t("form.serialNumber")} value={item?.serialNumber} maxLength={160} /><OptionalInput name="assetTag" label={t("form.assetTag")} value={item?.assetTag} maxLength={160} /></div></fieldset>
    {isComputerEquipment(type) ? <fieldset className="grid gap-4 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-subtle)] p-4"><legend className="px-1 text-sm font-semibold text-[var(--ui-text)]">{t("form.specifications")}</legend><p className="text-xs leading-5 text-[var(--ui-text-muted)]">{t("form.specificationsDescription")}</p><div className="grid gap-4 sm:grid-cols-2"><OptionalInput name="cpu" label={t("form.cpu")} value={item?.cpu} maxLength={500} /><OptionalInput name="gpu" label={t("form.gpu")} value={item?.gpu} maxLength={500} /><OptionalInput name="ram" label={t("form.ram")} value={item?.ram} maxLength={500} /><OptionalInput name="storage" label={t("form.storage")} value={item?.storage} maxLength={500} /></div></fieldset> : null}
    <FormField label={t("form.notes")} optional optionalLabel={t("optional")}><Textarea name="notes" rows={4} maxLength={5000} defaultValue={item?.notes ?? ""} /></FormField>
  </>;
}

function OptionalInput({ label, maxLength, name, value }: { label: string; maxLength: number; name: string; value?: string | null }) {
  const t = useTranslations("Equipment");
  return <FormField label={label} optional optionalLabel={t("optional")}><Input name={name} maxLength={maxLength} defaultValue={value ?? ""} /></FormField>;
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
  const locationNames = new Map(workstations.map((workstation) => [workstation.id, workstation.name]));
  const computers = item.equipment.filter((equipmentItem) => isComputerEquipment(equipmentItem.equipmentType));
  const monitors = item.equipment.filter((equipmentItem) => equipmentItem.equipmentType === "monitor");
  const peripherals = item.equipment.filter((equipmentItem) => isPeripheralEquipment(equipmentItem.equipmentType));
  const other = item.equipment.filter((equipmentItem) => isOtherEquipment(equipmentItem.equipmentType));
  const workstationId = item.id;
  const workstationName = item.name;
  function run(operation: () => Promise<EquipmentActionState>, after?: () => void) { setError(undefined); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else { after?.(); router.refresh(); } }); }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateWorkstation({ workstationId, name: data.get("name"), assignedEmployeeId: data.get("assignedEmployeeId") })); }
  function remove() { if (!window.confirm(t("workstation.deleteConfirm", { name: workstationName }))) return; run(() => deleteWorkstation({ workstationId }), onClose); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.name} className="w-full max-w-[38rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-info-surface)] text-[var(--ui-info-text)]"><MonitorCog className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t("workstation.eyebrow")}</p><h2 className="mt-1 truncate text-lg font-bold">{item.name}</h2></div></div><button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <form onSubmit={submit} className="grid gap-4 p-5 sm:p-6"><WorkstationFields item={item} members={members} /><ActionError error={error} /><div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="ghost" className="text-[var(--ui-danger-text)]" disabled={pending} onClick={remove}><Trash2 className="mr-2 size-4" aria-hidden="true" />{t("actions.delete")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("actions.saveWorkstation")}</Button></div></form>
      <section className="border-t border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{t("workstation.attached")}</h3><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t("workstation.attachedDescription")}</p></div><span className="rounded-full bg-[var(--ui-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--ui-text-muted)]">{item.equipment.length}</span></div>
        <div className="mt-5 space-y-5"><EquipmentGroup title={t("groups.computers")} items={computers} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /><EquipmentGroup title={t("groups.monitors")} items={monitors} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /><EquipmentGroup title={t("groups.peripherals")} items={peripherals} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} />{other.length ? <EquipmentGroup title={t("groups.other")} items={other} onOpen={onOpenEquipment} onDetach={(equipmentId) => run(() => assignEquipment({ equipmentId, workstationId: null }))} pending={pending} /> : null}</div>
        <div className="mt-6 border-t border-[var(--ui-border)] pt-5"><h4 className="text-sm font-semibold">{t("assignment.attach")}</h4><p className="mt-1 text-xs leading-5 text-[var(--ui-text-muted)]">{t("assignment.moveNotice")}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Select value={attachId} onValueChange={setAttachId} disabled={pending}><SelectItem value="__none">{t("assignment.choose")}</SelectItem>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id} textValue={candidate.displayName}>{candidate.displayName} · {candidate.workstationId ? locationNames.get(candidate.workstationId) ?? t("location.unknown") : t("location.unattached")}</SelectItem>)}</Select><Button type="button" disabled={pending || attachId === "__none"} onClick={() => run(() => assignEquipment({ equipmentId: attachId, workstationId }), () => setAttachId("__none"))}>{pending ? t("actions.moving") : t("assignment.attachAction")}</Button></div></div>
      </section>
    </div>
  </Drawer>;
}

function EquipmentGroup({ items, onDetach, onOpen, pending, title }: { items: EquipmentItem[]; onDetach: (id: string) => void; onOpen: (id: string) => void; pending: boolean; title: string }) {
  const t = useTranslations("Equipment");
  return <div><h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{title}</h4>{items.length ? <div className="mt-2 divide-y divide-[var(--ui-border-subtle)] overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{items.map((item) => { const Icon = equipmentIcons[item.equipmentType]; const specs = isComputerEquipment(item.equipmentType) ? equipmentSpecificationSummary(item) : ""; return <div key={item.id} className="flex items-center gap-3 px-3 py-2.5"><button type="button" onClick={() => onOpen(item.id)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[var(--ui-radius-control)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><Icon className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.displayName}</span><span className="mt-0.5 block truncate text-xs text-[var(--ui-text-muted)]">{specs || t(`types.${item.equipmentType}`)}</span></span></button><button type="button" disabled={pending} onClick={() => onDetach(item.id)} aria-label={t("assignment.detachNamed", { name: item.displayName })} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:opacity-50"><Unplug className="size-4" aria-hidden="true" /></button></div>; })}</div> : <p className="mt-2 text-sm text-[var(--ui-text-muted)]">{t("groups.empty")}</p>}</div>;
}

function EquipmentDrawer({ item, workstations, onClose }: { item: EquipmentItem | null; workstations: WorkstationItem[]; onClose: () => void }) {
  const t = useTranslations("Equipment");
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<EquipmentActionState["error"]>();
  const [pending, startTransition] = useTransition();
  if (!item) return null;
  const Icon = equipmentIcons[item.equipmentType];
  const workstationName = item.workstationId ? workstations.find((workstation) => workstation.id === item.workstationId)?.name ?? t("location.unknown") : t("location.unattached");
  const equipmentId = item.id;
  const equipmentName = item.displayName;
  function run(operation: () => Promise<EquipmentActionState>, after?: () => void) { setError(undefined); startTransition(async () => { const result = await operation(); if (result.error) setError(result.error); else { after?.(); router.refresh(); } }); }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateEquipment({ equipmentId, equipmentType: data.get("equipmentType"), lifecycleState: data.get("lifecycleState"), displayName: data.get("displayName"), workstationId: data.get("workstationId"), manufacturer: data.get("manufacturer"), model: data.get("model"), serialNumber: data.get("serialNumber"), assetTag: data.get("assetTag"), cpu: data.get("cpu") ?? "", gpu: data.get("gpu") ?? "", ram: data.get("ram") ?? "", storage: data.get("storage") ?? "", notes: data.get("notes") })); }
  function remove() { if (!window.confirm(t("deleteConfirm", { name: equipmentName }))) return; run(() => deleteEquipment({ equipmentId }), onClose); }
  return <Drawer isOpen onClose={onClose} initialFocusRef={closeRef} focusKey={item.id} title={item.displayName} className="w-full max-w-[38rem]">
    <header className="flex items-start justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] text-[var(--ui-text-secondary)]"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">{t(`types.${item.equipmentType}`)}</p><div className="mt-1 flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate text-lg font-bold">{item.displayName}</h2><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", lifecycleStyle(item.lifecycleState))}>{t(`states.${item.lifecycleState}`)}</span></div><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{workstationName}</p></div></div><button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] hover:bg-[var(--ui-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"><X className="size-5" aria-hidden="true" /></button></header>
    <form onSubmit={submit} className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:p-6"><EquipmentFormFields item={item} workstations={workstations} /><ActionError error={error} /><div className="flex flex-wrap justify-between gap-3 border-t border-[var(--ui-border)] pt-5"><Button type="button" variant="ghost" className="text-[var(--ui-danger-text)]" disabled={pending} onClick={remove}><Trash2 className="mr-2 size-4" aria-hidden="true" />{t("actions.delete")}</Button><Button type="submit" disabled={pending}>{pending ? t("actions.saving") : t("actions.saveEquipment")}</Button></div></form>
  </Drawer>;
}

function ActionError({ error }: { error?: EquipmentActionState["error"] }) {
  const t = useTranslations("Equipment");
  return error ? <p role="alert" className="text-sm text-[var(--ui-danger-text)]">{t(`errors.${error}`)}</p> : null;
}
