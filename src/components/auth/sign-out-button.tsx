"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
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
      setError("Failed to sign out.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isLoading}
      className="rounded-full border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 disabled:opacity-50"
    >
      {isLoading ? "Signing out…" : "Sign out"}
      {error && <span className="ml-2 text-red-500 text-xs">{error}</span>}
    </button>
  );
}
