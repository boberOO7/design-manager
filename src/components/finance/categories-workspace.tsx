"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { FinanceCategoryEditor } from "./category-select";
import { financeCategoryLabel,type FinanceCategory } from "@/lib/finance-planning";
export function FinanceCategoriesWorkspace({ categories,ready }: { categories:FinanceCategory[];ready:boolean }) {
  const t=useTranslations("Finance");
  const [editing,setEditing]=useState<FinanceCategory|"new"|null>(null),[pending,setPending]=useState(false);
  return <div className="mx-auto w-full max-w-4xl space-y-6"><PageHeader title={t("planning.categories")} description={t("planning.categoriesHelp")}/>
    {ready?<Button onClick={()=>setEditing("new")}>{t("planning.newCategory")}</Button>:<Link className="underline" href="/finance/accounts">{t("movements.setupLink")}</Link>}
    <ul className="divide-y divide-[var(--ui-border)] rounded-[var(--ui-radius-panel)] border border-[var(--ui-border)] bg-[var(--ui-surface)]">{categories.map((category)=><li key={category.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium">{financeCategoryLabel(category,category.name,(key)=>t(`planning.defaults.${key}`))}{category.archived_at?<span className="ml-2 text-xs text-[var(--ui-text-muted)]">{t("planning.archived")}</span>:null}</p><p className="mt-1 text-xs text-[var(--ui-text-muted)]">{t(`movements.kinds.${category.direction}`)} · {t(`movements.natures.${category.nature}`)}</p></div><Button variant="ghost" onClick={()=>setEditing(category)}>{t("edit")}</Button></li>)}</ul>
    <Dialog isOpen={editing!==null} closeDisabled={pending} onRequestClose={()=>setEditing(null)} title={t(editing==="new"?"planning.newCategory":"planning.editCategory")} closeLabel={t("movements.close")}>
      {editing?<div className="p-5"><FinanceCategoryEditor category={editing==="new"?undefined:editing} onPending={setPending} onSaved={()=>setEditing(null)}/></div>:null}
    </Dialog>
  </div>;
}
