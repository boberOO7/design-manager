"use client";

import { Check, Copy, ExternalLink, MoreHorizontal, Palette, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContractor, deleteContractor, deleteContractorCategory, renameContractorCategory, updateContractor, updateContractorCategoryColor } from "@/app/(app)/contractors/actions";
import { ContractorCategoryCombobox, ContractorSubcategoryCombobox, getUniqueContractorCategories } from "@/components/contractors/contractor-category-combobox";
import type { Contractor, ContractorCategory } from "@/data/queries/contractors";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import { formatUkrainianPhone } from "@/lib/ukrainian-phone";
import { changeContractorCategoryFilter, filterContractors, getContractorSubcategories } from "@/lib/contractor-subcategory-presentation";
import { contractorCategoryColorKeys, getContractorCategoryBadgeClassName, getContractorCategoryColorLabel, type ContractorCategoryColorKey } from "@/lib/contractor-category-colors";
import { useLocale } from "next-intl";
import type { ContractorFormActionState, ContractorFormField } from "@/lib/validation/contractor";

const initialState: ContractorFormActionState = {};

type ContractorAction = (state: ContractorFormActionState, formData: FormData) => Promise<ContractorFormActionState>;
type ContractorCategoryOverride = { colorKey?: ContractorCategoryColorKey; name?: string };

export function ContractorDirectory({ categories: initialCategories, contractors: initialContractors, canEdit, isAdmin }: { categories: ContractorCategory[]; contractors: Contractor[]; canEdit: boolean; isAdmin: boolean }) {
  const t = useTranslations("Contractors");
  const locale = useLocale();
  const router = useRouter();
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, ContractorCategoryOverride>>({});
  const [deletedCategoryIds, setDeletedCategoryIds] = useState<string[]>([]);
  const categories = useMemo(() => getUniqueContractorCategories(initialCategories
    .filter((category) => !deletedCategoryIds.includes(category.id))
    .map((category) => ({ ...category, ...categoryOverrides[category.id] }))), [categoryOverrides, deletedCategoryIds, initialCategories]);
  const contractors = useMemo(() => initialContractors.map((contractor) => ({
    ...contractor,
    category: { ...contractor.category, ...categoryOverrides[contractor.category.id] },
  })), [categoryOverrides, initialContractors]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Contractor | null>(null);
  const [deleting, setDeleting] = useState<Contractor | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState("");
  const [categoryNameError, setCategoryNameError] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<ContractorCategory | null>(null);
  const [deleteCategoryError, setDeleteCategoryError] = useState("");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [copiedContractorId, setCopiedContractorId] = useState<string | null>(null);
  const copiedPhoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedPhoneTimeoutRef.current) clearTimeout(copiedPhoneTimeoutRef.current);
  }, []);

  const selectedFilterSubcategories = getContractorSubcategories(categories, categoryId);
  const manageCategoriesLabel = t("categoryManagement.trigger");
  const visible = useMemo(() => {
    return filterContractors(contractors, { categoryId, subcategoryId, query });
  }, [categoryId, contractors, query, subcategoryId]);

  function changeCategoryFilter(nextCategoryId: string) {
    const next = changeContractorCategoryFilter(categories, nextCategoryId, subcategoryId);
    setCategoryId(next.categoryId);
    setSubcategoryId(next.subcategoryId);
  }

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
    setCategoryError("");
    const result = await updateContractorCategoryColor(categoryId, colorKey);
    setSavingCategoryId(null);
    if (result.error) { setCategoryError(result.error); return; }
    setCategoryOverrides((current) => ({ ...current, [categoryId]: { ...current[categoryId], colorKey } }));
    router.refresh();
  }

  function beginCategoryRename(category: ContractorCategory) {
    setEditingCategoryId(category.id);
    setCategoryNameDraft(category.name);
    setCategoryNameError("");
  }

  function cancelCategoryRename() {
    setEditingCategoryId(null);
    setCategoryNameDraft("");
    setCategoryNameError("");
  }

  async function saveCategoryName(categoryId: string) {
    setSavingCategoryId(categoryId);
    setCategoryNameError("");
    const result = await renameContractorCategory(categoryId, categoryNameDraft);
    setSavingCategoryId(null);
    if (result.error || !result.name) { setCategoryNameError(result.error ?? t("categoryManagement.errors.renameFailed")); return; }
    setCategoryOverrides((current) => ({ ...current, [categoryId]: { ...current[categoryId], name: result.name } }));
    cancelCategoryRename();
    router.refresh();
  }

  async function confirmCategoryDelete() {
    if (!deletingCategory) return;
    setSavingCategoryId(deletingCategory.id);
    setDeleteCategoryError("");
    const result = await deleteContractorCategory(deletingCategory.id);
    setSavingCategoryId(null);
    if (result.error) { setDeleteCategoryError(result.error); return; }
    setDeletedCategoryIds((current) => [...current, deletingCategory.id]);
    if (categoryId === deletingCategory.id) changeCategoryFilter("");
    setDeletingCategory(null);
    router.refresh();
  }

  async function copyContractorPhone(contractorId: string, phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedContractorId(contractorId);
      if (copiedPhoneTimeoutRef.current) clearTimeout(copiedPhoneTimeoutRef.current);
      copiedPhoneTimeoutRef.current = setTimeout(() => setCopiedContractorId(null), 1800);
    } catch (error) {
      console.error("Unable to copy contractor phone", error);
    }
  }

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_12rem] lg:min-w-[46rem] lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={t("searchPlaceholder")} type="search" />
          </label>
          <Select aria-label={t("columns.category")} value={categoryId} onValueChange={changeCategoryFilter} placeholder={t("allCategories")}>
            <SelectItem className="min-h-12 py-2.5" value="">{t("allCategories")}</SelectItem>
            {categories.map((item) => <SelectItem className="min-h-12 py-2.5" key={item.id} value={item.id}><span className="block min-w-0"><span title={item.name} className={`inline-flex max-w-full min-w-0 items-center rounded-full px-2 py-0.5 text-xs font-medium leading-5 ${getContractorCategoryBadgeClassName(item.colorKey)}`}><span className="min-w-0 truncate whitespace-nowrap">{item.name}</span></span></span></SelectItem>)}
          </Select>
          <Select aria-label={t("columns.subcategory")} value={subcategoryId} onValueChange={setSubcategoryId} placeholder={t("allSubcategories")}>
            <SelectItem className="min-h-12 py-2.5" value="">{t("allSubcategories")}</SelectItem>
            {selectedFilterSubcategories.map((item) => <SelectItem className="min-h-12 py-2.5" key={item.id} value={item.id}>{item.name}</SelectItem>)}
          </Select>
        </div>
        <div className="flex shrink-0 gap-2">{canEdit ? <Button type="button" onClick={openCreate} className="min-h-11"><Plus className="size-4" aria-hidden="true" />{t("add")}</Button> : null}{isAdmin ? <Popover.Root open={categoryMenuOpen} onOpenChange={setCategoryMenuOpen}><Popover.Trigger asChild><Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={manageCategoriesLabel}><MoreHorizontal className="size-5" aria-hidden="true" /></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 shadow-[var(--ui-shadow-panel)]"><button type="button" onClick={() => { setCategoryMenuOpen(false); setCategoryError(""); setManagingCategories(true); }} className="flex min-h-11 w-full items-center gap-2 rounded-[calc(var(--ui-radius-control)-0.125rem)] px-3 text-left text-sm font-medium text-[var(--ui-text)] outline-none transition-colors hover:bg-[var(--ui-surface-muted)] focus-visible:bg-[var(--ui-surface-muted)]"><Palette className="size-4 text-[var(--ui-text-secondary)]" aria-hidden="true" />{manageCategoriesLabel}</button></Popover.Content></Popover.Portal></Popover.Root> : null}</div>
      </div>

      {visible.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-[var(--ui-border-strong)] bg-[var(--ui-surface-muted)] text-xs font-medium uppercase tracking-wide text-[var(--ui-text-muted)]">
            <tr><th className="px-4 py-3">{t("columns.name")}</th><th className="px-4 py-3">{t("columns.category")}</th><th className="px-4 py-3">{t("columns.subcategory")}</th><th className="px-4 py-3">{t("columns.phone")}</th><th className="px-4 py-3">{t("columns.link")}</th><th className="px-4 py-3">{t("columns.description")}</th>{canEdit ? <th className="px-4 py-3 text-right"><span className="sr-only">{t("actions")}</span></th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--ui-border)]">
            {visible.map((contractor) => <tr key={contractor.id} className="align-middle transition-colors hover:bg-[var(--ui-surface-subtle)]">
              <td className="align-middle px-4 py-3 font-medium text-[var(--ui-text)]">{contractor.name}</td>
              <td className="align-middle px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(contractor.category.colorKey)}`}>{contractor.category.name}</span></td>
              <td className="align-middle px-4 py-3">{contractor.subcategory ? <span className="inline-flex max-w-44 truncate rounded-full border border-[var(--ui-border-subtle)] bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal leading-5 text-[var(--ui-text-secondary)]" title={contractor.subcategory.name}>{contractor.subcategory.name}</span> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="align-middle px-4 py-3 text-[var(--ui-text-secondary)]">{contractor.phone ? <div className="relative inline-flex items-center gap-1.5"><span>{formatUkrainianPhone(contractor.phone)}</span><button type="button" aria-label={copiedContractorId === contractor.id ? t("phoneCopied") : t("copyPhone", { phone: formatUkrainianPhone(contractor.phone) })} className="inline-flex size-7 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onClick={() => { if (contractor.phone) void copyContractorPhone(contractor.id, contractor.phone); }}>{copiedContractorId === contractor.id ? <Check aria-hidden="true" className="size-3.5 text-[var(--ui-success-text)]" /> : <Copy aria-hidden="true" className="size-3.5" />}</button>{copiedContractorId === contractor.id ? <span role="status" className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-[var(--ui-success-text)]">{t("phoneCopied")}</span> : null}</div> : "—"}</td>
              <td className="align-middle px-4 py-3">{contractor.website_url ? <a href={contractor.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--ui-info-text)] underline underline-offset-4"><span className="max-w-40 truncate">{t("openLink")}</span><ExternalLink className="size-3.5" aria-hidden="true" /></a> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="align-middle max-w-sm px-4 py-3 text-[var(--ui-text-secondary)]"><p className="line-clamp-2" title={contractor.description ?? undefined}>{contractor.description || "—"}</p></td>
              {canEdit ? <td className="align-middle px-4 py-2"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" aria-label={t("editAria", { name: contractor.name })} onClick={() => openEdit(contractor)}><Pencil className="size-4" aria-hidden="true" />{t("edit")}</Button>{isAdmin ? <Button type="button" variant="ghost" size="sm" aria-label={t("deleteAria", { name: contractor.name })} className="text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]" onClick={() => { setDeleteError(""); setDeleting(contractor); }}><Trash2 className="size-4" aria-hidden="true" />{t("delete")}</Button> : null}</div></td> : null}
            </tr>)}
          </tbody>
        </table>
      </div> : <EmptyState title={contractors.length ? t("empty.filteredTitle") : t("empty.title")} description={contractors.length ? t("empty.filteredDescription") : t("empty.description")} className="m-4" />}
    </div>

    <ContractorFormDialog key={`${formMode}-${selected?.id ?? "new"}`} categories={categories} contractor={formMode === "edit" ? selected : null} isOpen={formMode !== null} mode={formMode ?? "create"} onClose={() => setFormMode(null)} onSuccess={() => { setFormMode(null); router.refresh(); }} />
    <Dialog closeDisabled={isDeleting} closeLabel={t("close")} description={deleting ? t("deleteDialog.description", { name: deleting.name }) : undefined} isOpen={Boolean(deleting)} onRequestClose={(reason) => { if (reason !== "outside" && !isDeleting) setDeleting(null); }} title={t("deleteDialog.title")}>
      <div className="p-4 sm:p-6"><p className="text-sm text-[var(--ui-text-secondary)]">{t("deleteDialog.notice")}</p>{deleteError ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{deleteError}</p> : null}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={isDeleting} onClick={() => setDeleting(null)}>{t("cancel")}</Button><Button type="button" className="bg-[var(--ui-danger-text)] text-white hover:bg-[var(--ui-danger-text)]/90" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? t("deleting") : t("delete")}</Button></div></div>
    </Dialog>
    <Dialog closeDisabled={Boolean(savingCategoryId)} closeLabel={t("close")} description={t("categoryManagement.description")} isOpen={managingCategories && !deletingCategory} onRequestClose={(reason) => { if (reason !== "outside" && !savingCategoryId) { cancelCategoryRename(); setManagingCategories(false); } }} title={t("categoryManagement.title")}>
      <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-2">{categories.map((item) => <section key={item.id} className="grid gap-3 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] p-3 transition-colors hover:bg-[var(--ui-surface-muted)] sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            {editingCategoryId === item.id ? <div className="flex min-w-0 items-center gap-1">
              <Input data-dialog-initial-focus aria-label={t("categoryManagement.nameLabel")} aria-invalid={Boolean(categoryNameError)} aria-describedby={categoryNameError ? `category-name-${item.id}-error` : undefined} className="min-w-0" maxLength={100} value={categoryNameDraft} disabled={savingCategoryId !== null} onChange={(event) => setCategoryNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveCategoryName(item.id); } else if (event.key === "Escape") { event.preventDefault(); cancelCategoryRename(); } }} />
              <Button type="button" variant="ghost" className="size-9 shrink-0 p-0 hover:bg-[var(--ui-surface-strong)]" disabled={savingCategoryId !== null} aria-label={t("categoryManagement.saveName", { name: item.name })} onClick={() => void saveCategoryName(item.id)}><Check className="size-4" aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" className="size-9 shrink-0 p-0 hover:bg-[var(--ui-surface-strong)]" disabled={savingCategoryId !== null} aria-label={t("categoryManagement.cancelRename")} onClick={cancelCategoryRename}><X className="size-4" aria-hidden="true" /></Button>
            </div> : <div className="flex min-w-0 items-center gap-1">
              <span title={item.name} className={`min-w-0 truncate rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(item.colorKey)}`}>{item.name}</span>
              <Button type="button" variant="ghost" className="size-9 shrink-0 p-0 hover:bg-[var(--ui-surface-strong)] hover:text-[var(--ui-text)]" disabled={savingCategoryId !== null} aria-label={t("categoryManagement.rename", { name: item.name })} onClick={() => beginCategoryRename(item)}><Pencil className="size-4" aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" className="size-9 shrink-0 p-0 text-[var(--ui-danger-text)] hover:bg-[color-mix(in_srgb,var(--ui-danger-surface)_55%,var(--ui-surface))]" disabled={savingCategoryId !== null} aria-label={t("categoryManagement.delete", { name: item.name })} onClick={() => { setDeleteCategoryError(""); setDeletingCategory(item); }}><Trash2 className="size-4" aria-hidden="true" /></Button>
            </div>}
            {editingCategoryId === item.id && categoryNameError ? <p id={`category-name-${item.id}-error`} role="alert" className="mt-1.5 text-xs text-[var(--ui-danger-text)]">{categoryNameError}</p> : null}
          </div>
          <div className="grid grid-cols-9 gap-1 border-t border-[var(--ui-border)] pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0" role="radiogroup" aria-label={t("categoryManagement.colorLabel", { name: item.name })}>{contractorCategoryColorKeys.map((colorKey) => <button key={colorKey} type="button" role="radio" aria-checked={item.colorKey === colorKey} aria-label={getContractorCategoryColorLabel(colorKey, locale)} disabled={savingCategoryId !== null} onClick={() => void changeCategoryColor(item.id, colorKey)} className={`flex size-8 items-center justify-center rounded-[var(--ui-radius-control)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${item.colorKey === colorKey ? "ring-2 ring-[var(--ui-focus)] ring-offset-2" : "hover:bg-[var(--ui-surface-muted)]"} ${getContractorCategoryBadgeClassName(colorKey)}`}><span className="size-3 rounded-sm bg-current" aria-hidden="true" /></button>)}</div>
        </section>)}</div>
        {!categories.length ? <p className="text-sm text-[var(--ui-text-muted)]">{t("categoryManagement.empty")}</p> : null}
        {categoryError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{categoryError}</p> : null}
      </div>
    </Dialog>
    <Dialog closeDisabled={Boolean(savingCategoryId)} closeLabel={t("close")} description={deletingCategory ? t("categoryManagement.deleteDialog.description", { name: deletingCategory.name }) : undefined} isOpen={Boolean(deletingCategory)} onRequestClose={(reason) => { if (reason !== "outside" && !savingCategoryId) setDeletingCategory(null); }} title={t("categoryManagement.deleteDialog.title")}>
      <div className="p-4 sm:p-6"><p className="text-sm text-[var(--ui-text-secondary)]">{t("categoryManagement.deleteDialog.notice")}</p>{deleteCategoryError ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{deleteCategoryError}</p> : null}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={Boolean(savingCategoryId)} onClick={() => setDeletingCategory(null)}>{t("cancel")}</Button><Button type="button" className="bg-[var(--ui-danger-text)] text-white hover:bg-[var(--ui-danger-text)]/90" disabled={Boolean(savingCategoryId)} onClick={() => void confirmCategoryDelete()}>{savingCategoryId ? t("deleting") : t("delete")}</Button></div></div>
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
  const [subcategory, setSubcategory] = useState(contractor?.subcategory?.name ?? "");
  const [phone, setPhone] = useState(() => formatUkrainianPhone(contractor?.phone));
  const selectedCategory = categories.find((item) => item.name.toLocaleLowerCase() === category.trim().toLocaleLowerCase());
  const subcategories = selectedCategory?.subcategories ?? [];
  function changeCategory(nextCategory: string) {
    setCategory(nextCategory);
    setSubcategory("");
  }
  useEffect(() => { if (state.contractorId) { formRef.current?.reset(); onSuccess(); } }, [onSuccess, state.contractorId]);
  useEffect(() => { if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true }); }, [state.fieldErrors]);
  const error = (field: ContractorFormField) => state.fieldErrors?.[field];
  const errorProps = (field: ContractorFormField) => ({ "aria-invalid": error(field) ? true : undefined, "aria-describedby": error(field) ? `${field}-error` : undefined });
  return <form ref={formRef} action={formAction} className="min-h-0 overflow-y-auto p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
    <FormField label={t("form.category")} error={error("category")}><div className="grid gap-2"><ContractorCategoryCombobox categories={categories} value={category} onValueChange={changeCategory} {...errorProps("category")} />{selectedCategory ? <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(selectedCategory.colorKey)}`}>{selectedCategory.name}</span> : null}</div></FormField>
    <FormField label={<>{t("form.subcategory")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("subcategory")}><ContractorSubcategoryCombobox disabled={!category.trim()} subcategories={subcategories} value={subcategory} onValueChange={setSubcategory} {...errorProps("subcategory")} /></FormField>
    <FormField label={t("form.companyName")} error={error("name")}><Input required name="name" defaultValue={contractor?.name} {...errorProps("name")} /></FormField>
    <div className="hidden sm:block" />
    <FormField className="sm:col-span-2" label={<>{t("form.website")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("website_url")}><Input type="url" name="website_url" defaultValue={contractor?.website_url ?? ""} placeholder="https://" {...errorProps("website_url")} /></FormField>
    <FormField label={<>{t("form.phone")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("phone")}><Input autoComplete="tel" inputMode="tel" name="phone" onChange={(event) => setPhone(formatUkrainianPhone(event.target.value))} placeholder="+380 (XX) XXX-XX-XX" type="tel" value={phone} {...errorProps("phone")} /></FormField>
    <div className="hidden sm:block" />
    <FormField className="sm:col-span-2" label={<>{t("form.description")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("description")}><Textarea rows={4} name="description" defaultValue={contractor?.description ?? ""} {...errorProps("description")} /></FormField>
  </div>{state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}<p role="status" aria-live="polite" className="sr-only">{state.contractorId ? t("saved") : ""}</p><div className="mt-6 flex justify-end gap-3 border-t border-[var(--ui-border)] pt-4"><Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>{t("cancel")}</Button><Button type="submit" disabled={isPending}>{isPending ? t("saving") : mode === "create" ? t("add") : t("save")}</Button></div></form>;
}
