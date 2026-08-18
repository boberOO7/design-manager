"use client";

import { ExternalLink, Palette, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContractor, deleteContractor, updateContractor, updateContractorCategoryColor } from "@/app/(app)/contractors/actions";
import { ContractorCategoryCombobox, getUniqueContractorCategories } from "@/components/contractors/contractor-category-combobox";
import type { Contractor } from "@/data/queries/contractors";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { formatUkrainianPhone } from "@/lib/ukrainian-phone";
import { contractorCategoryColorKeys, getContractorCategoryBadgeClassName, getContractorCategoryColorLabel, type ContractorCategoryColorKey } from "@/lib/contractor-category-colors";
import { useLocale } from "next-intl";
import type { ContractorFormActionState, ContractorFormField } from "@/lib/validation/contractor";

const initialState: ContractorFormActionState = {};

type ContractorAction = (state: ContractorFormActionState, formData: FormData) => Promise<ContractorFormActionState>;

export function ContractorDirectory({ contractors: initialContractors, isAdmin }: { contractors: Contractor[]; isAdmin: boolean }) {
  const t = useTranslations("Contractors");
  const locale = useLocale();
  const router = useRouter();
  const [colorOverrides, setColorOverrides] = useState<Record<string, ContractorCategoryColorKey>>({});
  const contractors = useMemo(() => initialContractors.map((contractor) => ({ ...contractor, category: { ...contractor.category, colorKey: colorOverrides[contractor.category.id] ?? contractor.category.colorKey } })), [colorOverrides, initialContractors]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Contractor | null>(null);
  const [deleting, setDeleting] = useState<Contractor | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [managingColors, setManagingColors] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [colorError, setColorError] = useState("");

  const categories = useMemo(() => getUniqueContractorCategories(contractors.map((contractor) => contractor.category)), [contractors]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return contractors.filter((contractor) =>
      (!category || contractor.category.name === category)
      && (!normalized || contractor.name.toLocaleLowerCase().includes(normalized)),
    );
  }, [category, contractors, query]);

  function openCreate() {
    setSelected(null);
    setFormMode("create");
  }

  function openEdit(contractor: Contractor) {
    setSelected(contractor);
    setFormMode("edit");
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    setDeleteError("");
    const result = await deleteContractor(deleting.id);
    setIsDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  async function changeCategoryColor(categoryId: string, colorKey: ContractorCategoryColorKey) {
    setSavingCategoryId(categoryId);
    setColorError("");
    const result = await updateContractorCategoryColor(categoryId, colorKey);
    setSavingCategoryId(null);
    if (result.error) { setColorError(result.error); return; }
    setColorOverrides((current) => ({ ...current, [categoryId]: colorKey }));
    router.refresh();
  }

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_12rem] lg:min-w-[34rem]">
          <label className="relative block">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={t("searchPlaceholder")} type="search" />
          </label>
          <Select aria-label={t("columns.category")} value={category} onValueChange={setCategory} placeholder={t("allCategories")}>
            <SelectItem className="min-h-12 py-2.5" value="">{t("allCategories")}</SelectItem>
            {categories.map((item) => <SelectItem className="min-h-12 py-2.5" key={item.id} value={item.name}><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium leading-5 ${getContractorCategoryBadgeClassName(item.colorKey)}`}>{item.name}</span></SelectItem>)}
          </Select>
        </div>
        <div className="flex shrink-0 gap-2">{isAdmin ? <Button type="button" variant="outline" onClick={() => { setColorError(""); setManagingColors(true); }}><Palette className="size-4" aria-hidden="true" />{t("columns.category")}</Button> : null}<Button type="button" onClick={openCreate} className="min-h-11"><Plus className="size-4" aria-hidden="true" />{t("add")}</Button></div>
      </div>

      {visible.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-xs font-medium uppercase tracking-wide text-[var(--ui-text-muted)]">
            <tr><th className="px-4 py-3">{t("columns.name")}</th><th className="px-4 py-3">{t("columns.category")}</th><th className="px-4 py-3">{t("columns.phone")}</th><th className="px-4 py-3">{t("columns.link")}</th><th className="px-4 py-3">{t("columns.description")}</th>{isAdmin ? <th className="px-4 py-3 text-right"><span className="sr-only">{t("actions")}</span></th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--ui-border)]">
            {visible.map((contractor) => <tr key={contractor.id} className="align-top transition-colors hover:bg-[var(--ui-surface-subtle)]">
              <td className="px-4 py-3 font-medium text-[var(--ui-text)]">{contractor.name}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(contractor.category.colorKey)}`}>{contractor.category.name}</span></td>
              <td className="px-4 py-3 text-[var(--ui-text-secondary)]">{formatUkrainianPhone(contractor.phone) || "—"}</td>
              <td className="px-4 py-3">{contractor.website_url ? <a href={contractor.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--ui-info-text)] underline underline-offset-4"><span className="max-w-40 truncate">{t("openLink")}</span><ExternalLink className="size-3.5" aria-hidden="true" /></a> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="max-w-sm px-4 py-3 text-[var(--ui-text-secondary)]"><p className="line-clamp-2" title={contractor.description ?? undefined}>{contractor.description || "—"}</p></td>
              {isAdmin ? <td className="px-4 py-2"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" aria-label={t("editAria", { name: contractor.name })} onClick={() => openEdit(contractor)}><Pencil className="size-4" aria-hidden="true" />{t("edit")}</Button><Button type="button" variant="ghost" size="sm" aria-label={t("deleteAria", { name: contractor.name })} className="text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]" onClick={() => { setDeleteError(""); setDeleting(contractor); }}><Trash2 className="size-4" aria-hidden="true" />{t("delete")}</Button></div></td> : null}
            </tr>)}
          </tbody>
        </table>
      </div> : <EmptyState title={contractors.length ? t("empty.filteredTitle") : t("empty.title")} description={contractors.length ? t("empty.filteredDescription") : t("empty.description")} className="m-4" />}
    </div>

    <ContractorFormDialog key={`${formMode}-${selected?.id ?? "new"}`} categories={categories} contractor={formMode === "edit" ? selected : null} isOpen={formMode !== null} mode={formMode ?? "create"} onClose={() => setFormMode(null)} onSuccess={() => { setFormMode(null); router.refresh(); }} />
    <Dialog closeDisabled={isDeleting} closeLabel={t("close")} description={deleting ? t("deleteDialog.description", { name: deleting.name }) : undefined} isOpen={Boolean(deleting)} onRequestClose={(reason) => { if (reason !== "outside" && !isDeleting) setDeleting(null); }} title={t("deleteDialog.title")}>
      <div className="p-4 sm:p-6"><p className="text-sm text-[var(--ui-text-secondary)]">{t("deleteDialog.notice")}</p>{deleteError ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{deleteError}</p> : null}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={isDeleting} onClick={() => setDeleting(null)}>{t("cancel")}</Button><Button type="button" className="bg-[var(--ui-danger-text)] text-white hover:bg-[var(--ui-danger-text)]/90" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? t("deleting") : t("delete")}</Button></div></div>
    </Dialog>
    <Dialog closeDisabled={Boolean(savingCategoryId)} closeLabel={t("close")} isOpen={managingColors} onRequestClose={(reason) => { if (reason !== "outside" && !savingCategoryId) setManagingColors(false); }} title={t("columns.category")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><div className="space-y-3">{categories.map((item) => <section key={item.id} className="flex flex-col gap-3 border-b border-[var(--ui-border-subtle)] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(item.colorKey)}`}>{item.name}</span><div className="grid grid-cols-9 gap-1" role="radiogroup" aria-label={item.name}>{contractorCategoryColorKeys.map((colorKey) => <button key={colorKey} type="button" role="radio" aria-checked={item.colorKey === colorKey} aria-label={getContractorCategoryColorLabel(colorKey, locale)} disabled={savingCategoryId !== null} onClick={() => void changeCategoryColor(item.id, colorKey)} className={`flex size-8 items-center justify-center rounded-[var(--ui-radius-control)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${item.colorKey === colorKey ? "ring-2 ring-[var(--ui-focus)] ring-offset-2" : "hover:bg-[var(--ui-surface-muted)]"} ${getContractorCategoryBadgeClassName(colorKey)}`}><span className="size-3 rounded-sm bg-current" aria-hidden="true" /></button>)}</div></section>)}</div>{colorError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{colorError}</p> : null}</div>
    </Dialog>
  </>;
}

function ContractorFormDialog({ categories, contractor, isOpen, mode, onClose, onSuccess }: { categories: Contractor["category"][]; contractor: Contractor | null; isOpen: boolean; mode: "create" | "edit"; onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("Contractors");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const action: ContractorAction = mode === "edit" && contractor ? updateContractor.bind(null, contractor.id) : createContractor;
  return <Dialog closeLabel={t("close")} description={mode === "create" ? t("form.createDescription") : t("form.editDescription")} isOpen={isOpen} onRequestClose={(reason: DialogCloseReason) => { if (reason !== "outside") onClose(); }} returnFocusRef={triggerRef} title={mode === "create" ? t("form.createTitle") : t("form.editTitle")}>
    <ContractorForm action={action} categories={categories} contractor={contractor} mode={mode} onCancel={onClose} onSuccess={onSuccess} />
  </Dialog>;
}

function ContractorForm({ action, categories, contractor, mode, onCancel, onSuccess }: { action: ContractorAction; categories: Contractor["category"][]; contractor: Contractor | null; mode: "create" | "edit"; onCancel: () => void; onSuccess: () => void }) {
  const t = useTranslations("Contractors");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [category, setCategory] = useState(contractor?.category.name ?? "");
  const [phone, setPhone] = useState(() => formatUkrainianPhone(contractor?.phone));
  const selectedCategory = categories.find((item) => item.name.toLocaleLowerCase() === category.trim().toLocaleLowerCase());
  useEffect(() => { if (state.contractorId) { formRef.current?.reset(); onSuccess(); } }, [onSuccess, state.contractorId]);
  useEffect(() => { if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true }); }, [state.fieldErrors]);
  const error = (field: ContractorFormField) => state.fieldErrors?.[field];
  const errorProps = (field: ContractorFormField) => ({ "aria-invalid": error(field) ? true : undefined, "aria-describedby": error(field) ? `${field}-error` : undefined });
  return <form ref={formRef} action={formAction} className="min-h-0 overflow-y-auto p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
    <FormField label={t("form.category")} error={error("category")}><div className="grid gap-2"><ContractorCategoryCombobox categories={categories} value={category} onValueChange={setCategory} {...errorProps("category")} />{selectedCategory ? <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(selectedCategory.colorKey)}`}>{selectedCategory.name}</span> : null}</div></FormField>
    <FormField label={t("form.companyName")} error={error("name")}><Input required name="name" defaultValue={contractor?.name} {...errorProps("name")} /></FormField>
    <FormField className="sm:col-span-2" label={<>{t("form.website")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("website_url")}><Input type="url" name="website_url" defaultValue={contractor?.website_url ?? ""} placeholder="https://" {...errorProps("website_url")} /></FormField>
    <FormField label={<>{t("form.phone")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("phone")}><Input autoComplete="tel" inputMode="tel" name="phone" onChange={(event) => setPhone(formatUkrainianPhone(event.target.value))} placeholder="+380 (XX) XXX-XX-XX" type="tel" value={phone} {...errorProps("phone")} /></FormField>
    <div className="hidden sm:block" />
    <FormField className="sm:col-span-2" label={<>{t("form.description")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("description")}><Textarea rows={4} name="description" defaultValue={contractor?.description ?? ""} {...errorProps("description")} /></FormField>
  </div>{state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}<p role="status" aria-live="polite" className="sr-only">{state.contractorId ? t("saved") : ""}</p><div className="mt-6 flex justify-end gap-3 border-t border-[var(--ui-border)] pt-4"><Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>{t("cancel")}</Button><Button type="submit" disabled={isPending}>{isPending ? t("saving") : mode === "create" ? t("add") : t("save")}</Button></div></form>;
}
