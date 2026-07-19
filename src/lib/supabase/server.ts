import { createClient } from "@supabase/supabase-js";
import { isMockMode } from "./client";
import { studioProfiles, studioProjects, studioTasks } from "@/data/mock";

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    client,
    isMockMode,
    getProfiles: async () => {
      if (isMockMode) return studioProfiles;
      const { data, error } = await client.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
    getProjects: async () => {
      if (isMockMode) return studioProjects;
      const { data, error } = await client.from("projects").select("*");
      if (error) throw error;
      return data;
    },
    getTasks: async () => {
      if (isMockMode) return studioTasks;
      const { data, error } = await client.from("tasks").select("*");
      if (error) throw error;
      return data;
    },
  };
}
