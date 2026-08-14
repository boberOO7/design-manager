"use client";

import { ExternalLink, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createContractor, deleteContractor, updateContractor } from "@/app/(app)/contractors/actions";
import { ContractorCategoryCombobox, getUniqueContractorCategories } from "@/components/contractors/contractor-category-combobox";
import type { Contractor } from "@/data/queries/contractors";
import { Button } from "@/components/ui/button";
import { Dialog, type DialogCloseReason } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField, Input, Textarea } from "@/components/ui/form-field";
import type { ContractorFormActionState, ContractorFormField } from "@/lib/validation/contractor";

const initialState: ContractorFormActionState = {};

type ContractorAction = (state: ContractorFormActionState, formData: FormData) => Promise<ContractorFormActionState>;

export function ContractorDirectory({ contractors: initialContractors, isAdmin }: { contractors: Contractor[]; isAdmin: boolean }) {
  const router = useRouter();
  const contractors = initialContractors;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Contractor | null>(null);
  const [deleting, setDeleting] = useState<Contractor | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useMemo(() => getUniqueContractorCategories(contractors.map((contractor) => contractor.category)), [contractors]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("uk");
    return contractors.filter((contractor) =>
      (!category || contractor.category === category)
      && (!normalized || contractor.name.toLocaleLowerCase("uk").includes(normalized)),
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

  return <>
    <div className="rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_12rem] lg:min-w-[34rem]">
          <label className="relative block">
            <span className="sr-only">Пошук за назвою</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Пошук за назвою" type="search" />
          </label>
          <label>
            <span className="sr-only">Категорія</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
              <option value="">Усі категорії</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <Button type="button" onClick={openCreate} className="min-h-11 shrink-0"><Plus className="size-4" aria-hidden="true" />Додати підрядника</Button>
      </div>

      {visible.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] text-xs font-medium uppercase tracking-wide text-[var(--ui-text-muted)]">
            <tr><th className="px-4 py-3">Назва</th><th className="px-4 py-3">Категорія</th><th className="px-4 py-3">Телефон</th><th className="px-4 py-3">Посилання</th><th className="px-4 py-3">Опис</th>{isAdmin ? <th className="px-4 py-3 text-right"><span className="sr-only">Дії</span></th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--ui-border)]">
            {visible.map((contractor) => <tr key={contractor.id} className="align-top transition-colors hover:bg-[var(--ui-surface-subtle)]">
              <td className="px-4 py-3 font-medium text-[var(--ui-text)]">{contractor.name}</td>
              <td className="px-4 py-3"><span className="inline-flex rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ui-text-secondary)]">{contractor.category}</span></td>
              <td className="px-4 py-3 text-[var(--ui-text-secondary)]">{contractor.phone || "—"}</td>
              <td className="px-4 py-3">{contractor.website_url ? <a href={contractor.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--ui-info-text)] underline underline-offset-4"><span className="max-w-40 truncate">Відкрити</span><ExternalLink className="size-3.5" aria-hidden="true" /></a> : <span className="text-[var(--ui-text-muted)]">—</span>}</td>
              <td className="max-w-sm px-4 py-3 text-[var(--ui-text-secondary)]"><p className="line-clamp-2" title={contractor.description ?? undefined}>{contractor.description || "—"}</p></td>
              {isAdmin ? <td className="px-4 py-2"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="sm" aria-label={`Редагувати ${contractor.name}`} onClick={() => openEdit(contractor)}><Pencil className="size-4" aria-hidden="true" />Редагувати</Button><Button type="button" variant="ghost" size="sm" aria-label={`Видалити ${contractor.name}`} className="text-[var(--ui-danger-text)] hover:bg-[var(--ui-danger-surface)]" onClick={() => { setDeleteError(""); setDeleting(contractor); }}><Trash2 className="size-4" aria-hidden="true" />Видалити</Button></div></td> : null}
            </tr>)}
          </tbody>
        </table>
      </div> : <EmptyState title={contractors.length ? "Підрядників не знайдено" : "Підрядників ще немає"} description={contractors.length ? "Змініть пошуковий запит або фільтр категорії." : "Додайте першого підрядника до спільного довідника."} action={!contractors.length ? <Button type="button" onClick={openCreate}><Plus className="size-4" aria-hidden="true" />Додати підрядника</Button> : undefined} className="m-4" />}
    </div>

    <ContractorFormDialog key={`${formMode}-${selected?.id ?? "new"}`} categories={categories} contractor={formMode === "edit" ? selected : null} isOpen={formMode !== null} mode={formMode ?? "create"} onClose={() => setFormMode(null)} onSuccess={() => { setFormMode(null); router.refresh(); }} />
    <Dialog closeDisabled={isDeleting} closeLabel="Закрити" description={deleting ? `Підрядника «${deleting.name}» буде видалено назавжди.` : undefined} isOpen={Boolean(deleting)} onRequestClose={(reason) => { if (reason !== "outside" && !isDeleting) setDeleting(null); }} title="Видалити підрядника?">
      <div className="p-4 sm:p-6"><p className="text-sm text-[var(--ui-text-secondary)]">Цю дію неможливо скасувати.</p>{deleteError ? <p role="alert" className="mt-3 text-sm text-[var(--ui-danger-text)]">{deleteError}</p> : null}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={isDeleting} onClick={() => setDeleting(null)}>Скасувати</Button><Button type="button" className="bg-[var(--ui-danger-text)] text-white hover:bg-[var(--ui-danger-text)]/90" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? "Видалення…" : "Видалити"}</Button></div></div>
    </Dialog>
  </>;
}

function ContractorFormDialog({ categories, contractor, isOpen, mode, onClose, onSuccess }: { categories: string[]; contractor: Contractor | null; isOpen: boolean; mode: "create" | "edit"; onClose: () => void; onSuccess: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const action: ContractorAction = mode === "edit" && contractor ? updateContractor.bind(null, contractor.id) : createContractor;
  return <Dialog closeLabel="Закрити" description={mode === "create" ? "Додайте контакт до спільного довідника." : "Оновіть дані підрядника."} isOpen={isOpen} onRequestClose={(reason: DialogCloseReason) => { if (reason !== "outside") onClose(); }} returnFocusRef={triggerRef} title={mode === "create" ? "Додати підрядника" : "Редагувати підрядника"}>
    <ContractorForm action={action} categories={categories} contractor={contractor} mode={mode} onCancel={onClose} onSuccess={onSuccess} />
  </Dialog>;
}

function ContractorForm({ action, categories, contractor, mode, onCancel, onSuccess }: { action: ContractorAction; categories: string[]; contractor: Contractor | null; mode: "create" | "edit"; onCancel: () => void; onSuccess: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [category, setCategory] = useState(contractor?.category ?? "");
  useEffect(() => { if (state.contractorId) { formRef.current?.reset(); onSuccess(); } }, [onSuccess, state.contractorId]);
  useEffect(() => { if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true }); }, [state.fieldErrors]);
  const error = (field: ContractorFormField) => state.fieldErrors?.[field];
  const errorProps = (field: ContractorFormField) => ({ "aria-invalid": error(field) ? true : undefined, "aria-describedby": error(field) ? `${field}-error` : undefined });
  return <form ref={formRef} action={formAction} className="min-h-0 overflow-y-auto p-4 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">
    <FormField label="Категорія" error={error("category")}><ContractorCategoryCombobox categories={categories} value={category} onValueChange={setCategory} {...errorProps("category")} /></FormField>
    <FormField label="Назва фірми" error={error("name")}><Input required name="name" defaultValue={contractor?.name} {...errorProps("name")} /></FormField>
    <FormField className="sm:col-span-2" label={<>Посилання на сайт / Instagram <span className="font-normal text-[var(--ui-text-muted)]">(необов&apos;язково)</span></>} error={error("website_url")}><Input type="url" name="website_url" defaultValue={contractor?.website_url ?? ""} placeholder="https://" {...errorProps("website_url")} /></FormField>
    <FormField label={<>Телефон <span className="font-normal text-[var(--ui-text-muted)]">(необов&apos;язково)</span></>} error={error("phone")}><Input type="tel" name="phone" defaultValue={contractor?.phone ?? ""} {...errorProps("phone")} /></FormField>
    <div className="hidden sm:block" />
    <FormField className="sm:col-span-2" label={<>Короткий опис <span className="font-normal text-[var(--ui-text-muted)]">(необов&apos;язково)</span></>} error={error("description")}><Textarea rows={4} name="description" defaultValue={contractor?.description ?? ""} {...errorProps("description")} /></FormField>
  </div>{state.formError ? <p role="alert" className="mt-4 text-sm text-[var(--ui-danger-text)]">{state.formError}</p> : null}<p role="status" aria-live="polite" className="sr-only">{state.contractorId ? "Збережено" : ""}</p><div className="mt-6 flex justify-end gap-3 border-t border-[var(--ui-border)] pt-4"><Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>Скасувати</Button><Button type="submit" disabled={isPending}>{isPending ? "Збереження…" : mode === "create" ? "Додати підрядника" : "Зберегти зміни"}</Button></div></form>;
}
