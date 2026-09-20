"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveFinancePlanning } from "@/app/(app)/finance/expected/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField,Input } from "@/components/ui/form-field";
import { Select,SelectItem } from "@/components/ui/select";
import { FinanceActionForm } from "./finance-action-form";
import { categoriesForDirection,financeCategoryLabel,type FinanceCategory } from "@/lib/finance-planning";

export function FinanceCategoryEditor({ category,direction="incoming",owner=false,onSaved,onPending }: {
  category?:FinanceCategory; direction?:string; owner?:boolean; onSaved:(id?:string)=>void; onPending?:(pending:boolean)=>void;
}) {
  const t=useTranslations("Finance");
  const [kind,setKind]=useState(category?.direction??direction);
  const [nature,setNature]=useState(category?.nature??(owner?"owner_distribution":"operating"));
  const [archived]=useState(Boolean(category?.archived_at));
  return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={(result)=>onSaved(result.id)} onPending={onPending}>
    <input type="hidden" name="intent" value="category"/><input type="hidden" name="id" value={category?.id??""}/>
    <FormField label={t("planning.categoryName")}><Input name="name" defaultValue={category?.name??""} maxLength={120} required/></FormField>
    {category?<><input type="hidden" name="direction" value={kind}/><input type="hidden" name="nature" value={nature}/><p className="text-sm text-[var(--ui-text-muted)]">{t(`movements.kinds.${kind}`)} · {t(`movements.natures.${nature}`)}</p></>:<>
      <fieldset><legend className="mb-1.5 text-sm font-medium text-[var(--ui-text-secondary)]">{t("movements.type")}</legend><div className="inline-flex rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)] p-1">{(["outgoing","incoming"] as const).map((value)=><label key={value} className="relative cursor-pointer"><input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name="direction" value={value} checked={kind===value} onChange={()=>{setKind(value);if(value==="incoming"&&nature==="owner_distribution")setNature("operating");}}/><span className="flex min-h-10 items-center rounded-[calc(var(--ui-radius-control)-2px)] px-3 text-sm text-[var(--ui-text-secondary)] peer-checked:bg-[var(--ui-surface)] peer-checked:font-semibold peer-checked:text-[var(--ui-text)] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ui-focus)]">{t(`planning.${value==="outgoing"?"expenses":"income"}`)}</span></label>)}</div></fieldset>
      <FormField label={t("movements.nature")}><Select name="nature" aria-label={t("movements.nature")} value={nature} onValueChange={setNature}>{["operating","financing",...(kind==="outgoing"?["owner_distribution"]:[])].map((value)=><SelectItem key={value} value={value}>{t(`movements.natures.${value}`)}</SelectItem>)}</Select></FormField>
    </>}
    <input type="hidden" name="archived" value={String(archived)}/>
  </FinanceActionForm>;
}

export function FinanceCategorySelect({ categories,direction,owner=false,value,onValueChange,currentId }: {
  categories:FinanceCategory[]; direction:string; owner?:boolean; value:string; onValueChange:(value:string)=>void; currentId?:string|null;
}) {
  const t=useTranslations("Finance");
  const [creating,setCreating]=useState(false);
  const [pending,setPending]=useState(false);
  const options=categoriesForDirection(categories,direction,owner,currentId);
  return <div className="space-y-1">
    <FormField label={t("movements.category")}><Select name="categoryId" aria-label={t("movements.category")} value={value} onValueChange={onValueChange} required searchPlaceholder={t("planning.searchCategories")} searchEmptyMessage={t("planning.noCategories")}>
      {options.map((category)=><SelectItem key={category.id} value={category.id}>{financeCategoryLabel(category,category.name,(key)=>t(`planning.defaults.${key}`))}</SelectItem>)}
    </Select></FormField>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Button type="button" variant="ghost" className="gap-1.5" onClick={()=>setCreating(true)}><Plus className="size-4" aria-hidden="true"/>{t("planning.newCategory")}</Button><Link href="/finance/categories" className="flex min-h-10 items-center text-sm font-medium text-[var(--ui-text-secondary)] underline decoration-[var(--ui-border-strong)] underline-offset-4 hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">{t("planning.manageCategories")}</Link></div>
    <Dialog isOpen={creating} closeDisabled={pending} onRequestClose={()=>setCreating(false)} title={t("planning.newCategory")} closeLabel={t("movements.close")}>
      {creating?<div className="p-5"><FinanceCategoryEditor direction={direction} owner={owner} onPending={setPending} onSaved={(id)=>{if(id)onValueChange(id);setCreating(false);}}/></div>:null}
    </Dialog>
  </div>;
}
