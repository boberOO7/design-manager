"use client";
import { useActionState,useState,type ReactNode,type Ref } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FinanceActionState } from "@/lib/finance";

export function FinanceActionForm({ children,action,onSaved,onPending,onResult,label,cancelLabel,onCancel,submitClassName,actionsClassName,className,fieldsetClassName,disabled=false,formRef,hideActions=false,showMessage=true }: {
  children:ReactNode; action:(previous:FinanceActionState,form:FormData)=>Promise<FinanceActionState>;
  onSaved:(result:FinanceActionState)=>void; onPending?:(pending:boolean)=>void; label:string;
  onResult?:(result:FinanceActionState)=>void; cancelLabel?:string; onCancel?:()=>void; submitClassName?:string; actionsClassName?:string; className?:string; fieldsetClassName?:string; disabled?:boolean;
  formRef?:Ref<HTMLFormElement>; hideActions?:boolean; showMessage?:boolean;
}) {
  const t=useTranslations("Finance");
  const [requestId]=useState(()=>crypto.randomUUID());
  const [state,submit,pending]=useActionState(async(previous:FinanceActionState,form:FormData):Promise<FinanceActionState>=>{
    onPending?.(true);
    try { const result=await action(previous,form); onResult?.(result); if(result.status==="success") onSaved(result); return result; }
    catch { const result:FinanceActionState={ status:"error",message:t("movements.errors.save") }; onResult?.(result); return result; }
    finally { onPending?.(false); }
  },{ status:"idle" });
  return <form ref={formRef} action={submit} onSubmit={(event)=>event.stopPropagation()} onReset={(event)=>event.preventDefault()} className={className??"space-y-4"}>
    <input type="hidden" name="requestId" value={requestId}/>
    <fieldset disabled={pending} className={fieldsetClassName??"min-w-0 space-y-4"}>{children}{hideActions?null:onCancel&&cancelLabel?<div className={actionsClassName??"flex justify-end gap-2"}><Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button><Button type="submit" disabled={pending||disabled} className={submitClassName}>{pending?t("movements.saving"):label}</Button></div>:<Button type="submit" disabled={pending||disabled} className={submitClassName}>{pending?t("movements.saving"):label}</Button>}</fieldset>
    {showMessage&&state.message?<p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.message}</p>:null}
  </form>;
}
