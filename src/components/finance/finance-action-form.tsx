"use client";
import { useActionState,useCallback,useState,type ReactNode,type Ref } from "react";
import { useTranslations } from "next-intl";
import { useProjectWorkspaceNavigation } from "@/components/projects/project-workspace-navigation";
import { Button } from "@/components/ui/button";
import type { FinanceActionState } from "@/lib/finance";

export function FinanceActionForm({ children,action,onSaved,onPending,onResult,label,cancelLabel,onCancel,secondaryAction,submitClassName,actionsClassName,className,fieldsetClassName,disabled=false,formRef,hideActions=false,showMessage=true,refreshWorkspaceOnSave=false }: {
  children:ReactNode; action:(previous:FinanceActionState,form:FormData)=>Promise<FinanceActionState>;
  onSaved:(result:FinanceActionState)=>void; onPending?:(pending:boolean)=>void; label:string;
  onResult?:(result:FinanceActionState)=>void; cancelLabel?:string; onCancel?:()=>void; secondaryAction?:ReactNode; submitClassName?:string; actionsClassName?:string; className?:string; fieldsetClassName?:string; disabled?:boolean;
  formRef?:Ref<HTMLFormElement>; hideActions?:boolean; showMessage?:boolean; refreshWorkspaceOnSave?:boolean;
}) {
  const t=useTranslations("Finance");
  const navigation=useProjectWorkspaceNavigation();
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [state,submit,pending]=useActionState(async(previous:FinanceActionState,form:FormData):Promise<FinanceActionState>=>{
    onPending?.(true);
    try { const result=await action(previous,form); onResult?.(result); if(result.status==="success") { navigation?.invalidate();setRequestId(crypto.randomUUID());onSaved(result);if(refreshWorkspaceOnSave)navigation?.refresh(); } return result; }
    catch { const result:FinanceActionState={ status:"error",message:t("movements.errors.save") }; onResult?.(result); return result; }
    finally { onPending?.(false); }
  },{ status:"idle" });
  const attachForm = useCallback((node: HTMLFormElement | null) => {
    if (!node) return;
    // React resets action forms during commit, when its synthetic reset handler is disabled.
    // Keep native date/select values and optional text intact after a failed submission.
    const preventReset = (event: Event) => event.preventDefault();
    node.addEventListener("reset", preventReset);
    const cleanupRef = typeof formRef === "function" ? formRef(node) : undefined;
    if (formRef && typeof formRef !== "function") formRef.current = node;
    return () => {
      node.removeEventListener("reset", preventReset);
      if (typeof cleanupRef === "function") cleanupRef();
      else if (typeof formRef === "function") formRef(null);
      else if (formRef) formRef.current = null;
    };
  }, [formRef]);
  const submitButton = <Button type="submit" disabled={pending||disabled} className={submitClassName}>{pending?t("movements.saving"):label}</Button>;
  return <form ref={attachForm} action={submit} autoComplete="off" onSubmit={(event)=>event.stopPropagation()} className={className??"space-y-4"}>
    <input type="hidden" name="requestId" value={requestId}/>
    <fieldset disabled={pending} className={fieldsetClassName??"min-w-0 space-y-4"}>{children}{hideActions?null:onCancel&&cancelLabel?<div className={actionsClassName??"flex justify-end gap-2"}><Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>{secondaryAction}{submitButton}</div>:secondaryAction?<div className={actionsClassName??"flex flex-wrap items-center gap-2"}>{submitButton}{secondaryAction}</div>:submitButton}</fieldset>
    {showMessage&&state.message?<p role="alert" className="text-sm text-[var(--ui-danger-text)]">{state.message}</p>:null}
  </form>;
}
