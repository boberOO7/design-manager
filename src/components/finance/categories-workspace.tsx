"use client";

import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { removeFinanceCategory, saveFinancePlanning } from "@/app/(app)/finance/expected/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { financeCategoryLabel, type FinanceCategory } from "@/lib/finance-planning";
import { FinanceActionForm } from "./finance-action-form";
import { FinanceCategoryEditor } from "./category-select";

type ManagedCategory = FinanceCategory & { can_delete: boolean };
type Editor = { category?: ManagedCategory; direction?: "incoming" | "outgoing" };

export function FinanceCategoriesWorkspace({ categories, ready }: { categories: ManagedCategory[]; ready: boolean }) {
  const t = useTranslations("Finance");
  const router = useRouter();
  const [editing, setEditing] = useState<Editor | null>(null);
  const [removing, setRemoving] = useState<ManagedCategory | null>(null);
  const [pending, setPending] = useState(false);
  const selected = editing?.category;
  const label = (category: ManagedCategory) => financeCategoryLabel(category, category.name, key => t(`planning.defaults.${key}`));
  const openRemoval = (category: ManagedCategory) => { setEditing(null); setRemoving(category); };
  const groups = [
    { direction: "outgoing" as const, title: t("planning.expenses"), border: "border-t-[var(--ui-warning-border)]" },
    { direction: "incoming" as const, title: t("planning.income"), border: "border-t-[var(--ui-success-border)]" },
  ];

  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <PageHeader title={t("planning.categories")} description={t("planning.categoriesHelp")}/>
    {!ready ? <Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link> : <div className="grid items-start gap-5 lg:grid-cols-2">
      {groups.map(group => {
        const items = categories.filter(category => category.direction === group.direction);
        return <section key={group.direction} data-category-direction={group.direction} className={`overflow-hidden rounded-[var(--ui-radius-panel)] border border-t-2 border-[var(--ui-border)] bg-[var(--ui-surface)] ${group.border}`}>
          <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-surface-subtle)] px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2"><h2 className="font-semibold text-[var(--ui-text)]">{group.title}</h2><span className="text-xs tabular-nums text-[var(--ui-text-muted)]">{items.length}</span></div>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" aria-label={t(group.direction === "outgoing" ? "planning.addExpenseCategory" : "planning.addIncomeCategory")} onClick={() => setEditing({ direction: group.direction })}><Plus className="size-4" aria-hidden="true"/><span className="hidden sm:inline">{t("planning.newCategory")}</span></Button>
          </header>
          <ul className="divide-y divide-[var(--ui-border)]">{items.map(category => {
            const name = label(category);
            const removal = category.can_delete ? "delete" : "archive";
            return <li key={category.id} className="group flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 transition-colors motion-reduce:transition-none hover:bg-[var(--ui-surface-subtle)] focus-within:bg-[var(--ui-surface-subtle)]">
              <div className="min-w-0"><p className="break-words text-sm font-medium text-[var(--ui-text)]">{name}{category.archived_at ? <span className="ml-2 whitespace-nowrap rounded-full bg-[var(--ui-surface-muted)] px-2 py-0.5 text-xs font-normal text-[var(--ui-text-muted)]">{t("planning.archived")}</span> : null}</p><p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">{t(`movements.natures.${category.nature}`)}</p></div>
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-150 motion-reduce:transition-none md:pointer-fine:opacity-0 md:pointer-fine:group-hover:opacity-100 md:pointer-fine:group-focus-within:opacity-100">
                <Button type="button" size="sm" variant="ghost" className="size-11 p-0 md:size-9" aria-label={t("planning.editNamed", { name })} onClick={() => setEditing({ category })}><Pencil className="size-4" aria-hidden="true"/></Button>
                {category.can_delete || !category.archived_at ? <Button type="button" size="sm" variant="ghost" className={`size-11 p-0 md:size-9 ${removal === "delete" ? "text-[var(--ui-danger-text)]" : ""}`} aria-label={t(`planning.${removal}Named`, { name })} onClick={() => setRemoving(category)}>{removal === "delete" ? <Trash2 className="size-4" aria-hidden="true"/> : <Archive className="size-4" aria-hidden="true"/>}</Button> : null}
              </div>
            </li>;
          })}</ul>
        </section>;
      })}
    </div>}

    <Dialog isOpen={editing !== null} closeDisabled={pending} onRequestClose={() => setEditing(null)} title={t(selected ? "planning.editCategory" : "planning.newCategory")} closeLabel={t("movements.close")} className="max-w-lg">
      {editing ? <div className="space-y-5 p-5 sm:p-6"><FinanceCategoryEditor category={selected} direction={editing.direction} onPending={setPending} onSaved={() => { setEditing(null); router.refresh(); }}/>
        {selected ? <div className="border-t border-[var(--ui-border)] pt-4">{selected.archived_at ? <FinanceActionForm action={saveFinancePlanning} label={t("planning.restore")} onPending={setPending} onSaved={() => { setEditing(null); router.refresh(); }}>
          <input type="hidden" name="intent" value="category"/><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="name" value={selected.name}/><input type="hidden" name="direction" value={selected.direction}/><input type="hidden" name="nature" value={selected.nature}/><input type="hidden" name="archived" value="false"/>
          <p className="text-sm text-[var(--ui-text-muted)]">{t("planning.restoreCategoryHelp")}</p>
        </FinanceActionForm> : null}
          {selected.can_delete || !selected.archived_at ? <div className={selected.archived_at ? "mt-4" : undefined}><p className="text-sm text-[var(--ui-text-muted)]">{t(selected.can_delete ? "planning.deleteCategoryHelp" : "planning.archiveCategoryHelp")}</p><Button type="button" variant="ghost" className={`mt-2 ${selected.can_delete ? "text-[var(--ui-danger-text)]" : ""}`} onClick={() => openRemoval(selected)}>{selected.can_delete ? <Trash2 className="size-4" aria-hidden="true"/> : <Archive className="size-4" aria-hidden="true"/>}{t(selected.can_delete ? "planning.delete" : "planning.archive")}</Button></div> : null}
        </div> : null}
      </div> : null}
    </Dialog>

    <Dialog isOpen={removing !== null} closeDisabled={pending} onRequestClose={() => setRemoving(null)} title={t(removing?.can_delete ? "planning.deleteCategory" : "planning.archiveCategory")} description={removing ? t(removing.can_delete ? "planning.deleteCategoryConfirm" : "planning.archiveCategoryConfirm", { name: label(removing) }) : undefined} closeLabel={t("movements.close")} className="h-auto max-w-md">
      {removing ? <div className="p-5 sm:p-6"><FinanceActionForm action={removeFinanceCategory} label={t(removing.can_delete ? "planning.delete" : "planning.archive")} cancelLabel={t("planning.cancel")} onCancel={() => setRemoving(null)} onPending={setPending} submitClassName={removing.can_delete ? "bg-[var(--ui-danger-solid)] text-white hover:opacity-90" : undefined} onSaved={() => { setRemoving(null); router.refresh(); }}><input type="hidden" name="categoryId" value={removing.id}/></FinanceActionForm></div> : null}
    </Dialog>
  </div>;
}
