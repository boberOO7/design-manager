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

export type ActiveStudioMembershipResolution =
  | { status: "UNAUTHENTICATED" }
  | { status: "AUTH_ERROR"; cause: unknown }
  | { status: "NO_ACTIVE_STUDIO"; authenticatedUserId: string; email: string | null }
  | { status: "ACTIVE_STUDIO"; membership: ActiveStudioMembership; email: string | null }
  | { status: "MULTIPLE_ACTIVE_STUDIOS"; authenticatedUserId: string; email: string | null };

type ActiveStudioMembershipQuery = Pick<StudioMembershipRow, "studio_id" | "system_role"> & {
  studio: Pick<Database["public"]["Tables"]["studios"]["Row"], "name">;
};

export const resolveActiveStudioMembership = cache(async (): Promise<ActiveStudioMembershipResolution> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError) {
    return { status: "AUTH_ERROR", cause: userError };
  }

  if (!user) {
    return { status: "UNAUTHENTICATED" };
  }

  const { data, error } = await supabase
    .from("studio_members")
    .select("studio_id, system_role, studio:studios!inner(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(2)
    .overrideTypes<ActiveStudioMembershipQuery[], { merge: false }>();

  if (error) {
    console.error("Unable to resolve active studio membership", error);
    throw new Error("Unable to resolve active studio membership.", { cause: error });
  }

  if (!data || data.length === 0) {
    return { status: "NO_ACTIVE_STUDIO", authenticatedUserId: user.id, email: user.email ?? null };
  }

  if (data.length > 1) {
    return { status: "MULTIPLE_ACTIVE_STUDIOS", authenticatedUserId: user.id, email: user.email ?? null };
  }

  return {
    status: "ACTIVE_STUDIO",
    email: user.email ?? null,
    membership: { ...data[0], authenticatedUserId: user.id, studioName: data[0].studio.name },
  };
});

export const getActiveStudioMembership = cache(async (): Promise<ActiveStudioMembership | null> => {
  const resolution = await resolveActiveStudioMembership();
  return resolution.status === "ACTIVE_STUDIO" ? resolution.membership : null;
});
