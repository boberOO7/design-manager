"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";
import { tripRecognitionConfirmationSchema } from "@/lib/finance-trip-reporting";
import type { FinanceActionState } from "@/lib/finance";

export async function saveFinanceTripRecognition(_state: FinanceActionState, form: FormData): Promise<FinanceActionState> {
  const t = await getTranslations("Finance.tripReporting.errors");
  const admin = await getActiveStudioAdmin();
  if (!admin) return { status: "error", message: t("forbidden") };
  const parsed = tripRecognitionConfirmationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: t("invalid") };
  const client = await createClient();
  const { data, error } = await client.rpc("confirm_finance_trip_recognition", {
    p_studio_id: admin.studio_id, p_request_id: parsed.data.requestId, p_entry_id: parsed.data.entryId, p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: t(error.message.includes("conflict") ? "conflict" : "save") };
  revalidatePath("/finance", "layout");
  revalidatePath("/projects/[projectId]", "page");
  return { status: "success", id: data };
}
