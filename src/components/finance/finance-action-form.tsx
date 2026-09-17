"use client";
import { useActionState,useState,type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FinanceActionState } from "@/lib/finance";

export function FinanceActionForm({ children,action,onSaved,onPending,label }: {
  children:ReactNode; action:(previous:FinanceActionState,form:FormData)=>Promise<FinanceActionState>;
  onSaved:(result:FinanceActionState)=>void; onPending?:(pending:boolean)=>void; label:string;
}) {
  const t=useTranslations("Finance");
  const [requestId]=useState(()=>crypto.randomUUID());
  const [state,submit,pending]=useActionState(async(previous:FinanceActionState,form:FormData):Promise<FinanceActionState>=>{
    onPending?.(true);
    try { const result=await action(previous,form); if(result.status==="success") onSaved(result); return result; }
    catch { return { status:"error",message:t("movements.errors.save") }; }
    finally { onPending?.(false); }
  },{ status:"idle" });
  return <form action={submit} onSubmit={(event)=>event.stopPropagation()} onReset={(event)=>event.preventDefault()} className="space-y-4">
    <input type="hidden" name="requestId" value={requestId}/>
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}<Button type="submit" disabled={pending}>{pending?t("movements.saving"):label}</Button></fieldset>
    {state.message?<p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.message}</p>:null}
  </form>;
}
