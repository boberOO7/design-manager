"use client";
import { useActionState,useState,type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FinanceActionState } from "@/lib/finance";

export function FinanceActionForm({ children,action,onSaved,onPending,label,cancelLabel,onCancel,submitClassName,actionsClassName,className,fieldsetClassName,disabled=false }: {
  children:ReactNode; action:(previous:FinanceActionState,form:FormData)=>Promise<FinanceActionState>;
  onSaved:(result:FinanceActionState)=>void; onPending?:(pending:boolean)=>void; label:string;
  cancelLabel?:string; onCancel?:()=>void; submitClassName?:string; actionsClassName?:string; className?:string; fieldsetClassName?:string; disabled?:boolean;
}) {
  const t=useTranslations("Finance");
  const [requestId]=useState(()=>crypto.randomUUID());
  const [state,submit,pending]=useActionState(async(previous:FinanceActionState,form:FormData):Promise<FinanceActionState>=>{
    onPending?.(true);
    try { const result=await action(previous,form); if(result.status==="success") onSaved(result); return result; }
    catch { return { status:"error",message:t("movements.errors.save") }; }
    finally { onPending?.(false); }
  },{ status:"idle" });
  return <form action={submit} onSubmit={(event)=>event.stopPropagation()} onReset={(event)=>event.preventDefault()} className={className??"space-y-4"}>
    <input type="hidden" name="requestId" value={requestId}/>
    <fieldset disabled={pending} className={fieldsetClassName??"min-w-0 space-y-4"}>{children}{onCancel&&cancelLabel?<div className={actionsClassName??"flex justify-end gap-2"}><Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button><Button type="submit" disabled={pending||disabled} className={submitClassName}>{pending?t("movements.saving"):label}</Button></div>:<Button type="submit" disabled={pending||disabled} className={submitClassName}>{pending?t("movements.saving"):label}</Button>}</fieldset>
    {state.message?<p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.message}</p>:null}
  </form>;
}
