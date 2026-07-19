"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertCircle, LockKeyhole, Mail } from "lucide-react";
import { loginSchema } from "@/lib/validation/auth";
import { useState } from "react";

export default function LoginPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "anna@studio.com", password: "password123" } });

  const onSubmit = async () => {
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">StudioFlow</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">Interior design studio workspace</h1>
          <p className="mt-2 text-sm text-stone-600">Sign in to review projects, tasks, and team productivity.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="block text-sm font-medium text-stone-700">
            <span className="mb-2 flex items-center gap-2"><Mail size={16} /> Email</span>
            <input {...register("email")} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none" />
            {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
          </label>
          <label className="block text-sm font-medium text-stone-700">
            <span className="mb-2 flex items-center gap-2"><LockKeyhole size={16} /> Password</span>
            <input type="password" {...register("password")} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none" />
            {errors.password ? <p className="mt-1 text-sm text-red-600">{errors.password.message}</p> : null}
          </label>
          {submitted ? <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600"><AlertCircle size={16} /> Mock sign-in complete. You can continue to the dashboard.</div> : null}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
