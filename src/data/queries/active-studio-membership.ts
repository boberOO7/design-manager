import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type StudioMembershipRow = Database["public"]["Tables"]["studio_members"]["Row"];

export type ActiveStudioMembership = Pick<
  StudioMembershipRow,
  "studio_id" | "system_role"
> & {
  authenticatedUserId: string;
};

export async function getActiveStudioMembership(): Promise<ActiveStudioMembership | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("studio_members")
    .select("studio_id, system_role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(2);

  if (error) {
    console.error("Unable to resolve active studio membership", error);
    return null;
  }

  return data?.length === 1 ? { ...data[0], authenticatedUserId: userId } : null;
}
