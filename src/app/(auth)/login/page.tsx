"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LockKeyhole, Mail } from "lucide-react";
import { loginSchema } from "@/lib/validation/auth";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user) {
        router.push("/dashboard");
        router.refresh();
      }
    };
    checkSession();
  }, [router, supabase]);

  const onSubmit = async (data: { email: string; password: string }) => {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(authError.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ui-surface-muted)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ui-text-muted)]">StudioFlow</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">Interior design studio workspace</h1>
          <p className="mt-2 text-sm text-[var(--ui-text-secondary)]">Sign in to review projects, tasks, and team productivity.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
            <span className="mb-2 flex items-center gap-2"><Mail size={16} /> Email</span>
            <input type="email" autoComplete="email" {...register("email")} className="mt-1 w-full rounded-xl border border-[var(--ui-border)] px-3 py-2 text-sm focus:border-[var(--ui-focus)] focus:outline-none" />
            {errors.email ? <p className="mt-1 text-sm text-[var(--ui-danger-text)]">{errors.email.message}</p> : null}
          </label>
          <label className="block text-sm font-medium text-[var(--ui-text-secondary)]">
            <span className="mb-2 flex items-center gap-2"><LockKeyhole size={16} /> Password</span>
            <input type="password" autoComplete="current-password" {...register("password")} className="mt-1 w-full rounded-xl border border-[var(--ui-border)] px-3 py-2 text-sm focus:border-[var(--ui-focus)] focus:outline-none" />
            {errors.password ? <p className="mt-1 text-sm text-[var(--ui-danger-text)]">{errors.password.message}</p> : null}
          </label>
          {error && <p className="text-sm text-[var(--ui-danger-text)]">{error}</p>}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-medium text-[var(--ui-text-secondary)] underline underline-offset-4">
              Forgot your password?
            </Link>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-[var(--ui-action-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--ui-action-primary-text)] transition hover:bg-[var(--ui-action-primary-hover)] disabled:opacity-60">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
