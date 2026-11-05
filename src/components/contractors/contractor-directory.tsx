"use client";

import { Check, CircleCheck, Clock, Copy, ExternalLink, MoreHorizontal, Palette, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContractor, deleteContractor, deleteContractorCategory, renameContractorCategory, setContractorRecommendation, updateContractor, updateContractorCategoryColor } from "@/app/(app)/contractors/actions";
import { ContractorCategoryCombobox, ContractorSubcategoryCombobox, getUniqueContractorCategories } from "@/components/contractors/contractor-category-combobox";
import type { Contractor, ContractorCategory } from "@/data/queries/contractors";
import { Button } from "@/components/ui/button";
import { SortableListHeader } from "@/components/shared/sortable-list-header";
import { listToolbarSearchClassName } from "@/components/shared/list-toolbar-search";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectItem } from "@/components/ui/select";
import { formatUkrainianPhone } from "@/lib/ukrainian-phone";
import { changeContractorCategoryFilter, filterContractors, getContractorSubcategories, sortContractors, type ContractorDirectorySort } from "@/lib/contractor-subcategory-presentation";
import { contractorCategoryColorKeys, getContractorCategoryBadgeClassName, getContractorCategoryColorLabel, type ContractorCategoryColorKey } from "@/lib/contractor-category-colors";
import { useLocale } from "next-intl";
import type { ContractorFormActionState, ContractorFormField } from "@/lib/validation/contractor";
import { Tooltip } from "@/components/ui/tooltip";

const initialState: ContractorFormActionState = {};
const filterOptionClassName = "h-11 grid-cols-[minmax(0,1fr)_1rem] py-2.5 sm:h-9 sm:py-1.5 [&>span:first-child]:order-last [&>span:last-child]:truncate";

type ContractorAction = (state: ContractorFormActionState, formData: FormData) => Promise<ContractorFormActionState>;
type ContractorCategoryOverride = { colorKey?: ContractorCategoryColorKey; name?: string };

export function ContractorDirectory({ categories: initialCategories, contractors: initialContractors, canEdit, isAdmin }: { categories: ContractorCategory[]; contractors: Contractor[]; canEdit: boolean; isAdmin: boolean }) {
  const t = useTranslations("Contractors");
  const locale = useLocale();
  const router = useRouter();
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, ContractorCategoryOverride>>({});
  const [deletedCategoryIds, setDeletedCategoryIds] = useState<string[]>([]);
  const [recommendationOverrides, setRecommendationOverrides] = useState<Record<string, { value: boolean; updatedAt: string }>>({});
  const [savingRecommendations, setSavingRecommendations] = useState<Set<string>>(new Set());
  const pendingRecommendations = useRef(new Set<string>());
  const [recommendationError, setRecommendationError] = useState("");
  const categories = useMemo(() => getUniqueContractorCategories(initialCategories
    .filter((category) => !deletedCategoryIds.includes(category.id))
    .map((category) => ({ ...category, ...categoryOverrides[category.id] }))), [categoryOverrides, deletedCategoryIds, initialCategories]);
  const contractors = useMemo(() => initialContractors.map((contractor) => ({
    ...contractor,
    is_recommended: contractor.cooperation_status === "verified" && (recommendationOverrides[contractor.id]?.updatedAt === contractor.updated_at ? recommendationOverrides[contractor.id].value : contractor.is_recommended),
    category: { ...contractor.category, ...categoryOverrides[contractor.category.id] },
  })), [categoryOverrides, initialContractors, recommendationOverrides]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [status, setStatus] = useState<Contractor["cooperation_status"] | "">("");
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [sort, setSort] = useState<ContractorDirectorySort>({ column: "name", direction: "asc" });
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
    return sortContractors(filterContractors(contractors, { categoryId, subcategoryId, query, status: isAdmin ? status : "verified", recommendedOnly }), sort, locale);
  }, [categoryId, contractors, isAdmin, locale, query, recommendedOnly, sort, status, subcategoryId]);

  async function toggleRecommendation(contractor: Contractor) {
    if (!isAdmin || contractor.cooperation_status !== "verified" || pendingRecommendations.current.has(contractor.id)) return;
    pendingRecommendations.current.add(contractor.id);
    setSavingRecommendations(new Set(pendingRecommendations.current));
    setRecommendationError("");
    setRecommendationOverrides((current) => ({ ...current, [contractor.id]: { value: !contractor.is_recommended, updatedAt: contractor.updated_at } }));
    try {
      const result = await setContractorRecommendation(contractor.id, !contractor.is_recommended);
      if (result.error) throw new Error(result.error);
    } catch {
      setRecommendationOverrides((current) => ({ ...current, [contractor.id]: { value: contractor.is_recommended, updatedAt: contractor.updated_at } }));
      setRecommendationError(`${contractor.name}: ${t("errors.recommendationFailed")}`);
    } finally {
      pendingRecommendations.current.delete(contractor.id);
      setSavingRecommendations(new Set(pendingRecommendations.current));
      router.refresh();
    }
  }

  function sortHeader(column: ContractorDirectorySort["column"]) {
    const active = sort.column === column;
    const nextDirection = active && sort.direction === "asc" ? "desc" : "asc";
    return <th scope="col" aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : undefined} className="px-3 py-1"><SortableListHeader active={active} direction={sort.direction} label={t(`columns.${column}`)} nextDirection={nextDirection} onClick={() => setSort({ column, direction: nextDirection })} /></th>;
  }

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
      <div className="flex flex-wrap items-start gap-3 border-b border-[var(--ui-border-subtle)] p-4">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 xl:w-auto xl:flex-1">
          <label className={`${listToolbarSearchClassName} sm:w-56`}>
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={t("searchPlaceholder")} type="search" />
          </label>
          <Select aria-label={t("columns.category")} className="w-full sm:w-64" value={categoryId} onValueChange={changeCategoryFilter} placeholder={t("allCategories")}>
            <SelectItem className={filterOptionClassName} value="">{t("allCategories")}</SelectItem>
            {categories.map((item) => <SelectItem className={filterOptionClassName} key={item.id} value={item.id}><span className="block min-w-0"><Tooltip content={item.name} onlyWhenTruncated="span"><span tabIndex={0} className={`inline-flex max-w-full min-w-0 items-center rounded-md px-2 py-0.5 text-xs font-medium leading-5 ${getContractorCategoryBadgeClassName(item.colorKey)}`}><span className="min-w-0 truncate whitespace-nowrap">{item.name}</span></span></Tooltip></span></SelectItem>)}
          </Select>
          <Select aria-label={t("columns.subcategory")} className="w-full sm:w-64" value={subcategoryId} onValueChange={setSubcategoryId} placeholder={t("allSubcategories")}>
            <SelectItem className={filterOptionClassName} value="">{t("allSubcategories")}</SelectItem>
            {selectedFilterSubcategories.map((item) => <SelectItem className={filterOptionClassName} key={item.id} value={item.id}><Tooltip content={item.name} onlyWhenTruncated><span tabIndex={0} className="block truncate">{item.name}</span></Tooltip></SelectItem>)}
          </Select>
            {isAdmin ? <Select aria-label={t("cooperation.label")} className="w-full sm:w-48" value={status} onValueChange={(value) => { if (value === "" || value === "verified" || value === "prospective") setStatus(value); }}>
              <SelectItem className={filterOptionClassName} value="">{t("cooperation.all")}</SelectItem>
              <SelectItem className={filterOptionClassName} value="verified"><span className="flex min-w-0 items-center gap-2"><CircleCheck aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-success-text)]" /><span className="truncate">{t("cooperation.verified")}</span></span></SelectItem>
              <SelectItem className={filterOptionClassName} value="prospective"><span className="flex min-w-0 items-center gap-2"><Clock aria-hidden="true" className="size-4 shrink-0 text-[var(--ui-text-muted)]" /><span className="truncate">{t("cooperation.prospective")}</span></span></SelectItem>
            </Select> : null}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-[var(--ui-text-secondary)]"><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} className="size-4 accent-[var(--ui-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]" />{t("recommendation.only")}</label>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit ? <Button type="button" onClick={openCreate} className="h-11 gap-2"><Plus className="size-4 shrink-0" aria-hidden="true" />{t("add")}</Button> : null}
          {isAdmin ? <Popover.Root open={categoryMenuOpen} onOpenChange={setCategoryMenuOpen}>
            <Popover.Trigger asChild>
              <Button type="button" variant="outline" className="size-11 shrink-0 border-[var(--ui-border)] p-0 data-[state=open]:bg-[var(--ui-surface-muted)]" aria-label={manageCategoriesLabel}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="z-50 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1.5 shadow-[var(--ui-shadow-panel)]">
                <button type="button" onClick={() => { setCategoryMenuOpen(false); setCategoryError(""); setManagingCategories(true); }} className="flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-[calc(var(--ui-radius-control)-0.25rem)] px-3 text-left text-sm font-medium text-[var(--ui-text-secondary)] outline-none transition-colors duration-150 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:bg-[var(--ui-surface-muted)] focus-visible:text-[var(--ui-text)] motion-reduce:transition-none sm:min-h-9">
                  <Palette className="size-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" />{manageCategoriesLabel}
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root> : null}
        </div>
      </div>
      {recommendationError ? <p role="alert" className="px-4 py-2 text-sm text-[var(--ui-danger-text)]">{recommendationError}</p> : null}

      {visible.length ? <div className="overflow-x-auto rounded-b-[var(--ui-radius-panel)]">
        <table className="w-full min-w-[80rem] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-12" />
            <col className="w-[clamp(14rem,16vw,20rem)]" />
            <col className="w-[clamp(11rem,13vw,16rem)]" />
            <col className="w-[clamp(12rem,14vw,18rem)]" />
            <col className="w-56" />
            <col className="w-20" />
            <col />
            {canEdit ? <col className="w-24" /> : null}
          </colgroup>
          <thead className="border-b border-[var(--ui-border-subtle)] bg-[var(--ui-surface-subtle)] text-xs font-medium text-[var(--ui-text-muted)] [&_th]:font-medium">
            <tr><th scope="col" className="px-2 py-1"><span className="sr-only">{t("recommendation.label")}</span></th>{sortHeader("name")}{sortHeader("category")}{sortHeader("subcategory")}<th scope="col" className="px-3 py-1">{t("columns.phone")}</th><th scope="col" className="px-2 py-1 text-center">{t("columns.link")}</th><th scope="col" className="px-3 py-1">{t("columns.description")}</th>{canEdit ? <th scope="col" className="px-2 py-1 text-right"><span className="sr-only">{t("actions")}</span></th> : null}</tr>
          </thead>
          <tbody>
            {visible.map((contractor) => <tr key={contractor.id} className="group h-16 border-b border-[var(--ui-border-subtle)] align-middle transition-[background-color] duration-200 last:border-b-0 hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)] motion-reduce:transition-none">
              <td className="w-12 align-middle px-2 py-2"><Tooltip content={contractor.cooperation_status === "prospective" ? t("recommendation.prospective") : isAdmin ? t(contractor.is_recommended ? "recommendation.remove" : "recommendation.add", { name: contractor.name }) : t(contractor.is_recommended ? "recommendation.yes" : "recommendation.no")}>
                {isAdmin ? <button type="button" aria-label={t(contractor.is_recommended ? "recommendation.remove" : "recommendation.add", { name: contractor.name })} aria-pressed={contractor.is_recommended} aria-disabled={contractor.cooperation_status === "prospective" || savingRecommendations.has(contractor.id)} aria-busy={savingRecommendations.has(contractor.id)} className={`relative flex size-8 items-center justify-center rounded-[var(--ui-radius-control)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none ${contractor.cooperation_status === "prospective" ? "cursor-not-allowed text-[var(--ui-text-muted)]" : contractor.is_recommended ? "text-[var(--ui-warning-text)] hover:bg-[var(--ui-surface-muted)]" : "text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)]"}`} onClick={(event) => { event.stopPropagation(); void toggleRecommendation(contractor); }}>
                  <Star aria-hidden="true" className="size-4" fill={contractor.is_recommended ? "currentColor" : "none"} />
                  {savingRecommendations.has(contractor.id) ? <span role="status" className="sr-only">{t("recommendation.saving", { name: contractor.name })}</span> : null}
                </button> : <span tabIndex={0} role="img" aria-label={t(contractor.is_recommended ? "recommendation.yes" : "recommendation.no")} className={`flex size-8 items-center justify-center rounded-[var(--ui-radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${contractor.is_recommended ? "text-[var(--ui-warning-text)]" : "text-[var(--ui-text-muted)]"}`}><Star aria-hidden="true" className="size-4" fill={contractor.is_recommended ? "currentColor" : "none"} /></span>}
              </Tooltip></td>
              <td className="align-middle px-3 py-2 font-semibold text-[var(--ui-text)]"><span className="flex min-w-0 items-center gap-1.5"><Tooltip content={contractor.name} onlyWhenTruncated><span tabIndex={0} className="min-w-0 truncate rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{contractor.name}</span></Tooltip><Tooltip content={t(contractor.cooperation_status === "verified" ? "cooperation.verifiedTooltip" : "cooperation.prospectiveTooltip")}><span tabIndex={0} role="img" aria-label={t(`cooperation.${contractor.cooperation_status}`)} className="inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{contractor.cooperation_status === "verified" ? <CircleCheck aria-hidden="true" className="size-3.5 text-[var(--ui-success-text)]" /> : <Clock aria-hidden="true" className="size-3.5 text-[var(--ui-text-muted)]" />}</span></Tooltip></span></td>
              <td className="align-middle px-3 py-2"><Tooltip content={contractor.category.name} onlyWhenTruncated><span tabIndex={0} className={`block w-fit max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] ${getContractorCategoryBadgeClassName(contractor.category.colorKey)}`}>{contractor.category.name}</span></Tooltip></td>
              <td className="align-middle px-3 py-2">{contractor.subcategory ? <Tooltip content={contractor.subcategory.name} onlyWhenTruncated><span className="block w-fit max-w-full truncate rounded-md bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal leading-5 text-[var(--ui-text-secondary)]" tabIndex={0}>{contractor.subcategory.name}</span></Tooltip> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="align-middle px-3 py-2 text-[var(--ui-text-secondary)]">{contractor.phone ? <div className="relative flex min-w-0 items-center gap-1.5"><Tooltip content={formatUkrainianPhone(contractor.phone)} onlyWhenTruncated><span tabIndex={0} className="min-w-0 truncate whitespace-nowrap ui-numeric">{formatUkrainianPhone(contractor.phone)}</span></Tooltip><button type="button" aria-label={copiedContractorId === contractor.id ? t("phoneCopied") : t("copyPhone", { phone: formatUkrainianPhone(contractor.phone) })} className="inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2" onClick={() => { if (contractor.phone) void copyContractorPhone(contractor.id, contractor.phone); }}>{copiedContractorId === contractor.id ? <Check aria-hidden="true" className="size-3.5 text-[var(--ui-success-text)]" /> : <Copy aria-hidden="true" className="size-3.5" />}</button>{copiedContractorId === contractor.id ? <span role="status" className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-[var(--ui-success-text)]">{t("phoneCopied")}</span> : null}</div> : "—"}</td>
              <td className="align-middle px-2 py-2 text-center">{contractor.website_url ? <Tooltip content={contractor.website_url}><Button asChild variant="ghost" size="sm" className="size-8 p-0 transition-colors duration-200 motion-reduce:transition-none"><a href={contractor.website_url} target="_blank" rel="noopener noreferrer" aria-label={t("openLink", { name: contractor.name })}><ExternalLink className="size-4" aria-hidden="true" /></a></Button></Tooltip> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="align-middle px-3 py-2 text-[var(--ui-text-secondary)]"><Tooltip content={contractor.description ?? undefined} onlyWhenTruncated openOnClick><p className="line-clamp-2 break-words rounded-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]" tabIndex={0}>{contractor.description || "—"}</p></Tooltip></td>
              {canEdit ? <td className="align-middle px-2 py-2"><div className="flex justify-end gap-1"><Tooltip content={t("edit")}><Button type="button" variant="ghost" size="sm" className="size-9 shrink-0 p-0 text-[var(--ui-text-secondary)] opacity-100 transition-colors duration-100 hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] focus-visible:bg-[var(--ui-surface-muted)] focus-visible:text-[var(--ui-text)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100" aria-label={t("editAria", { name: contractor.name })} onClick={() => openEdit(contractor)}><Pencil className="size-4" aria-hidden="true" /></Button></Tooltip>{isAdmin ? <Tooltip content={t("delete")}><Button type="button" variant="ghost" size="sm" aria-label={t("deleteAria", { name: contractor.name })} className="size-9 shrink-0 p-0 text-[var(--ui-text-secondary)] opacity-100 transition-colors duration-100 hover:bg-[var(--ui-danger-surface)] hover:text-[var(--ui-danger-text)] focus-visible:bg-[var(--ui-danger-surface)] focus-visible:text-[var(--ui-danger-text)] motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100" onClick={() => { setDeleteError(""); setDeleting(contractor); }}><Trash2 className="size-4" aria-hidden="true" /></Button></Tooltip> : null}</div></td> : null}
            </tr>)}
          </tbody>
        </table>
      </div> : <EmptyState title={contractors.length ? t("empty.filteredTitle") : t("empty.title")} description={contractors.length ? t("empty.filteredDescription") : t("empty.description")} className="m-4" />}
    </div>

    <ContractorFormDialog key={`${formMode}-${selected?.id ?? "new"}`} categories={categories} contractor={formMode === "edit" ? selected : null} isAdmin={isAdmin} isOpen={formMode !== null} mode={formMode ?? "create"} onClose={() => setFormMode(null)} onSuccess={() => { setFormMode(null); router.refresh(); }} />
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
              <Tooltip content={item.name} onlyWhenTruncated><span tabIndex={0} className={`min-w-0 truncate rounded-md px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(item.colorKey)}`}>{item.name}</span></Tooltip>
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

function ContractorFormDialog({ categories, contractor, isAdmin, isOpen, mode, onClose, onSuccess }: { categories: Contractor["category"][]; contractor: Contractor | null; isAdmin: boolean; isOpen: boolean; mode: "create" | "edit"; onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("Contractors");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const action: ContractorAction = mode === "edit" && contractor ? updateContractor.bind(null, contractor.id) : createContractor;
  return <Dialog closeLabel={t("close")} description={mode === "create" ? t("form.createDescription") : t("form.editDescription")} isOpen={isOpen} onRequestClose={(reason: DialogCloseReason) => { if (reason !== "outside") onClose(); }} returnFocusRef={triggerRef} title={mode === "create" ? t("form.createTitle") : t("form.editTitle")}>
    <ContractorForm action={action} categories={categories} contractor={contractor} isAdmin={isAdmin} mode={mode} onCancel={onClose} onSuccess={onSuccess} />
  </Dialog>;
}

function ContractorForm({ action, categories, contractor, isAdmin, mode, onCancel, onSuccess }: { action: ContractorAction; categories: Contractor["category"][]; contractor: Contractor | null; isAdmin: boolean; mode: "create" | "edit"; onCancel: () => void; onSuccess: () => void }) {
  const t = useTranslations("Contractors");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [category, setCategory] = useState(contractor?.category.name ?? "");
  const [subcategory, setSubcategory] = useState(contractor?.subcategory?.name ?? "");
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
    <FormField label={t("form.category")} error={error("category")}><div className="grid gap-2"><ContractorCategoryCombobox categories={categories} value={category} onValueChange={changeCategory} {...errorProps("category")} />{selectedCategory ? <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${getContractorCategoryBadgeClassName(selectedCategory.colorKey)}`}>{selectedCategory.name}</span> : null}</div></FormField>
    <FormField label={<>{t("form.subcategory")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("subcategory")}><ContractorSubcategoryCombobox disabled={!category.trim()} subcategories={subcategories} value={subcategory} onValueChange={setSubcategory} {...errorProps("subcategory")} /></FormField>
    <FormField label={t("form.companyName")} error={error("name")}><Input required name="name" defaultValue={contractor?.name} {...errorProps("name")} /></FormField>
    {isAdmin ? <FormField label={t("cooperation.label")} error={error("cooperation_status")}><Select name="cooperation_status" defaultValue={contractor?.cooperation_status ?? "verified"} {...errorProps("cooperation_status")}><SelectItem value="verified">{t("cooperation.verified")}</SelectItem><SelectItem value="prospective">{t("cooperation.prospective")}</SelectItem></Select></FormField> : <div className="hidden sm:block" />}
    <FormField className="sm:col-span-2" label={<>{t("form.website")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("website_url")}><Input type="url" name="website_url" defaultValue={contractor?.website_url ?? ""} placeholder="https://" {...errorProps("website_url")} /></FormField>
    <FormField label={<>{t("form.phone")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("phone")}><PhoneInput name="phone" defaultValue={contractor?.phone} {...errorProps("phone")} /></FormField>
    <div className="hidden sm:block" />
    <FormField className="sm:col-span-2" label={<>{t("form.description")} <span className="font-normal text-[var(--ui-text-muted)]">({t("form.optional")})</span></>} error={error("description")}><Textarea rows={4} name="description" defaultValue={contractor?.description ?? ""} {...errorProps("description")} /></FormField>
  </div>{state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}<p role="status" aria-live="polite" className="sr-only">{state.contractorId ? t("saved") : ""}</p><div className="mt-6 flex justify-end gap-3 border-t border-[var(--ui-border)] pt-4"><Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>{t("cancel")}</Button><Button type="submit" disabled={isPending}>{isPending ? t("saving") : mode === "create" ? t("add") : t("save")}</Button></div></form>;
}
