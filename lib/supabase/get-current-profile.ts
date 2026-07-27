import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { Profile } from "@/types";

/**
 * Fetches the authenticated user's profile from the database.
 * 
 * - Verifies authentication via getSession()
 * - Extracts authenticated user ID from session
 * - Queries public.profiles for the matching row
 * - Returns null if no valid authenticated user exists
 * - Throws an error if auth exists but profile record is missing
 * 
 * @returns The authenticated user's Profile or null
 */
export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
      },
    }
  );

  // Verify authentication using getSession()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return null;
  }

  // Extract authenticated user ID from session
  const userId = session.user.id as string | undefined;

  if (!userId) {
    return null;
  }

  // Query public.profiles for the row where id equals the authenticated user ID
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, job_title, system_role, is_active, created_at, updated_at")
    .eq("id", userId)
    .single();

  if (profileError) {
    // Profile record not found - throw clear error
    throw new Error(
      `Authenticated user exists but profile record is missing for user ID: ${userId}`
    );
  }

  return profile;
}
