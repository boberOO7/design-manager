"use client";
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
  const [archived,setArchived]=useState(Boolean(category?.archived_at));
  return <FinanceActionForm action={saveFinancePlanning} label={t("planning.save")} onSaved={(result)=>onSaved(result.id)} onPending={onPending}>
    <input type="hidden" name="intent" value="category"/><input type="hidden" name="id" value={category?.id??""}/>
    <FormField label={t("planning.categoryName")}><Input name="name" defaultValue={category?.name??""} maxLength={120} required/></FormField>
    {category?<><input type="hidden" name="direction" value={kind}/><input type="hidden" name="nature" value={nature}/><p className="text-sm text-[var(--ui-text-muted)]">{t(`movements.kinds.${kind}`)} · {t(`movements.natures.${nature}`)}</p></>:<>
      <FormField label={t("movements.type")}><Select name="direction" aria-label={t("movements.type")} value={kind} onValueChange={(value)=>{setKind(value);if(value==="incoming"&&nature==="owner_distribution")setNature("operating");}}>{["incoming","outgoing"].map((value)=><SelectItem key={value} value={value}>{t(`movements.kinds.${value}`)}</SelectItem>)}</Select></FormField>
      <FormField label={t("movements.nature")}><Select name="nature" aria-label={t("movements.nature")} value={nature} onValueChange={setNature}>{["operating","financing",...(kind==="outgoing"?["owner_distribution"]:[])].map((value)=><SelectItem key={value} value={value}>{t(`movements.natures.${value}`)}</SelectItem>)}</Select></FormField>
    </>}
    <input type="hidden" name="archived" value={String(archived)}/>
    {category?<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(event)=>setArchived(event.target.checked)}/>{t("planning.archived")}</label>:null}
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
    <Button type="button" variant="ghost" onClick={()=>setCreating(true)}>{t("planning.newCategory")}</Button>
    <Dialog isOpen={creating} closeDisabled={pending} onRequestClose={()=>setCreating(false)} title={t("planning.newCategory")} closeLabel={t("movements.close")}>
      {creating?<div className="p-5"><FinanceCategoryEditor direction={direction} owner={owner} onPending={setPending} onSaved={(id)=>{if(id)onValueChange(id);setCreating(false);}}/></div>:null}
    </Dialog>
  </div>;
}
