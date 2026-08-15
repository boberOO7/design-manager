import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { cache } from "react";

type StudioMembershipRow = Database["public"]["Tables"]["studio_members"]["Row"];

export type ActiveStudioMembership = Pick<
  StudioMembershipRow,
  "studio_id" | "system_role"
> & {
  authenticatedUserId: string;
  studioName: string;
};

type ActiveStudioMembershipQuery = Pick<StudioMembershipRow, "studio_id" | "system_role"> & {
  studio: Pick<Database["public"]["Tables"]["studios"]["Row"], "name">;
};

export const getActiveStudioMembership = cache(async (): Promise<ActiveStudioMembership | null> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (userError || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("studio_members")
    .select("studio_id, system_role, studio:studios!inner(name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(2)
    .overrideTypes<ActiveStudioMembershipQuery[], { merge: false }>();

  if (error) {
    console.error("Unable to resolve active studio membership", error);
    return null;
  }

  return data?.length === 1 ? { ...data[0], authenticatedUserId: userId, studioName: data[0].studio.name } : null;
});
