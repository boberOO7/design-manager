"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ShellControl } from "@/components/layout/shell-control";
import { createClient, setRememberMe } from "@/lib/supabase/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function SignOutButton() {
  const t = useTranslations("Account");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await supabase.auth.signOut({ scope: "local" });
      setRememberMe(true);
      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.error("Error signing out:", err);
      setError(t("signOutFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <ShellControl
        ref={triggerRef}
        onClick={() => setConfirmationOpen(true)}
        disabled={isLoading}
        className="gap-2 px-3 text-sm font-medium hover:border-[var(--ui-danger-border)] hover:text-[var(--ui-danger-text)]"
      >
        <LogOut size={16} aria-hidden="true" />
        {isLoading ? t("signingOut") : t("signOut")}
      </ShellControl>
      {error ? <span role="alert" className="text-xs text-[var(--ui-danger-text)]">{error}</span> : null}
      <Dialog isOpen={confirmationOpen} onRequestClose={() => { if (!isLoading) setConfirmationOpen(false); }} returnFocusRef={triggerRef} closeDisabled={isLoading} closeLabel={t("close")} title={t("signOutConfirmTitle")} description={t("signOutConfirmDescription")} className="h-auto max-w-md">
        <div className="flex justify-end gap-2 p-5 sm:p-6">
          <Button data-dialog-initial-focus type="button" variant="outline" disabled={isLoading} onClick={() => setConfirmationOpen(false)}>{t("cancel")}</Button>
          <Button type="button" disabled={isLoading} className="bg-[var(--ui-danger-solid)] text-white hover:opacity-90" onClick={() => { setConfirmationOpen(false); void handleSignOut(); }}>{t("signOut")}</Button>
        </div>
      </Dialog>
    </div>
  );
}
