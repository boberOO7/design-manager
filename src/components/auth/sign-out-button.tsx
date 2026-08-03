"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ShellControl } from "@/components/layout/shell-control";
import { createClient } from "@/lib/supabase/client";
import { useTranslations } from "next-intl";

export function SignOutButton() {
  const t = useTranslations("Account");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await supabase.auth.signOut({ scope: "local" });
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
      onClick={handleSignOut}
      disabled={isLoading}
        className="gap-2 px-3 text-sm font-medium hover:border-[var(--ui-danger-border)] hover:text-[var(--ui-danger-text)]"
      >
        <LogOut size={16} aria-hidden="true" />
        {isLoading ? t("signingOut") : t("signOut")}
      </ShellControl>
      {error ? <span role="alert" className="text-xs text-[var(--ui-danger-text)]">{error}</span> : null}
    </div>
  );
}
