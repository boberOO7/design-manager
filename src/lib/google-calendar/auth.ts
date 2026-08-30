import "server-only";

import { getActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { createClient } from "@/lib/supabase/server";

export async function getGoogleCalendarActor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const membership = await getActiveStudioMembership();
  if (!membership || membership.authenticatedUserId !== data.user.id) return null;
  return { membership, supabase, user: data.user };
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
