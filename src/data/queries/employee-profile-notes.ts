import "server-only";

import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { createClient } from "@/lib/supabase/server";

export async function getEmployeeProfileNotes(userId: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin) throw new Error("Studio administrator access required.");
  const supabase = await createClient();
  const page = (offset: number) => supabase.from("employee_profile_notes")
    .select("id, note, review_month, created_at, author:profiles!employee_profile_notes_author_id_fkey(full_name)", { count: "exact" })
    .eq("studio_id", admin.studio_id).eq("employee_id", userId)
    .order("review_month", { ascending: false }).order("created_at", { ascending: false }).order("id")
    .range(offset, offset + 999);
  const first = await page(0);
  if (first.error || !first.data || first.count === null) throw new Error("Unable to load internal employee notes.", { cause: first.error });
  const notes = [...first.data];
  while (notes.length < first.count) {
    const next = await page(notes.length);
    if (next.error || !next.data?.length) throw new Error("Unable to load internal employee notes.", { cause: next.error });
    notes.push(...next.data);
  }
  return notes;
}
