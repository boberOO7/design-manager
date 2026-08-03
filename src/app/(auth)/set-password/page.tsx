import { SetPasswordForm } from "@/components/auth/set-password-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ui-surface-muted)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ui-text-muted)]">StudioFlow</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ui-text)]">Set your password</h1>
        <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">
          Choose a password to finish setting up your employee account.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
