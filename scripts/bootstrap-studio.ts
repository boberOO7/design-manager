import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { z } from "zod";
import { createAdminClient } from "../src/lib/supabase/admin-client";

const bootstrapInputSchema = z.object({
  studioName: z.string().trim().min(1, "Studio name is required").max(120, "Studio name is too long"),
  fullName: z.string().trim().min(2, "Admin full name must be at least 2 characters").max(120, "Admin full name is too long"),
  email: z.string().trim().min(1, "Admin email is required").max(254, "Admin email is too long").email("Enter a valid admin email").transform((email) => email.toLowerCase()),
});

type BootstrapInput = z.infer<typeof bootstrapInputSchema>;
type AdminClient = ReturnType<typeof createAdminClient>;
type AuthUser = Awaited<ReturnType<AdminClient["auth"]["admin"]["inviteUserByEmail"]>>["data"]["user"];

class BootstrapError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
  }
}

function getEnvFilePath(): string {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length === 0) return ".env.local";
  if (args.length === 2 && args[0] === "--env-file" && args[1]) return args[1];

  throw new BootstrapError("arguments", "Usage: pnpm bootstrap-studio -- [--env-file path/to/file]");
}

function loadEnvironment(envFile: string): void {
  const absolutePath = resolve(envFile);
  try {
    // The selected file is the source of truth. Do not accidentally bootstrap a
    // shell's previously selected project when --env-file was supplied.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    loadEnvFile(absolutePath);
  } catch {
    throw new BootstrapError("environment", `Could not load environment file: ${envFile}`);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new BootstrapError(
      "environment",
      "The selected environment file must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }
}

function getTargetUrl(): URL {
  try {
    const target = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error();
    return target;
  } catch {
    throw new BootstrapError("environment", "NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL.");
  }
}

function isLocalTarget(target: URL): boolean {
  return target.hostname === "localhost" || target.hostname === "127.0.0.1";
}

function failureMessage(resource: string, error: { code?: string; status?: number } | null): string {
  const detail = [error?.code, error?.status].filter((value) => value !== undefined).join(" / ");
  return detail ? `${resource} request failed (${detail}).` : `${resource} request failed.`;
}

async function askForInput(): Promise<BootstrapInput> {
  const readline = createInterface({ input, output });
  try {
    const parsed = bootstrapInputSchema.safeParse({
      studioName: await readline.question("Studio name: "),
      fullName: await readline.question("Admin full name: "),
      email: await readline.question("Admin email: "),
    });

    if (!parsed.success) throw new BootstrapError("input", parsed.error.issues[0]?.message ?? "Invalid input.");
    return parsed.data;
  } finally {
    readline.close();
  }
}

async function findAuthUserByEmail(admin: AdminClient, email: string): Promise<NonNullable<AuthUser> | null> {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1_000 });
    if (error) throw new BootstrapError("preflight", failureMessage("Auth user lookup", error));

    const matches = data.users.filter((user) => user.email?.toLowerCase() === email);
    if (matches.length > 1) throw new BootstrapError("preflight", "Multiple Auth users have this email; refusing to guess.");
    if (matches[0]) return matches[0];
    if (data.users.length < 1_000) return null;
  }
}

type Preflight = {
  authUser: NonNullable<AuthUser> | null;
  existingStudioId: string | null;
  existingMembership: { system_role: string; is_active: boolean } | null;
};

async function preflight(admin: AdminClient, values: BootstrapInput): Promise<Preflight> {
  const [{ data: studios, error: studioError }, authUser] = await Promise.all([
    admin.from("studios").select("id").eq("name", values.studioName),
    findAuthUserByEmail(admin, values.email),
  ]);
  if (studioError) throw new BootstrapError("preflight", failureMessage("Studio lookup", studioError));
  if (!studios) throw new BootstrapError("preflight", "Studio lookup returned no data.");
  if (studios.length > 1) throw new BootstrapError("preflight", "Multiple studios have this name; refusing to guess which one to recover.");

  const existingStudioId = studios[0]?.id ?? null;
  let existingMembership: Preflight["existingMembership"] = null;

  if (authUser) {
    const [{ data: profiles, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
      admin.from("profiles").select("id, email").eq("id", authUser.id),
      admin.from("studio_members").select("studio_id, system_role, is_active").eq("user_id", authUser.id),
    ]);
    if (profileError) throw new BootstrapError("preflight", failureMessage("Profile lookup", profileError));
    if (membershipError) throw new BootstrapError("preflight", failureMessage("Membership lookup", membershipError));

    const profile = profiles?.[0];
    if (profile && profile.email.toLowerCase() !== values.email) {
      throw new BootstrapError("preflight", "The matching Auth user has a Profile with a different email; refusing to overwrite it.");
    }

    existingMembership = memberships?.find((membership) => membership.studio_id === existingStudioId) ?? null;
    const conflictingMembership = memberships?.find((membership) => membership.studio_id !== existingStudioId);
    if (conflictingMembership) {
      throw new BootstrapError("preflight", "This Auth user already belongs to a different studio; refusing to change its StudioFlow access.");
    }
    if (existingMembership && (existingMembership.system_role !== "admin" || !existingMembership.is_active)) {
      throw new BootstrapError("preflight", "The user already has a non-active or non-admin membership in this studio; refusing to change it.");
    }
  }

  if (existingStudioId && !existingMembership) {
    const { data: studioMembers, error: studioMembersError } = await admin
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", existingStudioId)
      .limit(1);
    if (studioMembersError) throw new BootstrapError("preflight", failureMessage("Studio membership lookup", studioMembersError));
    if (studioMembers && studioMembers.length > 0) {
      throw new BootstrapError("preflight", "A studio with this name already has members; refusing to add an administrator to an ambiguous existing studio.");
    }
  }

  return { authUser, existingStudioId, existingMembership };
}

async function confirm(target: URL, values: BootstrapInput, state: Preflight): Promise<void> {
  const readline = createInterface({ input, output });
  const local = isLocalTarget(target);
  try {
    console.log("\nBootstrap summary");
    console.log(`  Target Supabase URL: ${target.toString()}`);
    console.log(`  Studio: ${values.studioName}${state.existingStudioId ? " (recover existing studio)" : " (create new)"}`);
    console.log(`  Admin: ${values.fullName} <${values.email}>${state.authUser ? " (existing Auth user; no invitation will be sent)" : " (send invite)"}`);
    console.log(`  Membership: ${state.existingMembership ? "already active admin" : "create active admin membership"}`);

    const expected = local ? "BOOTSTRAP" : target.host;
    const prompt = local
      ? "\nType BOOTSTRAP to perform these writes: "
      : `\nNON-LOCAL TARGET. Type the exact Supabase host (${target.host}) to perform these writes: `;
    if ((await readline.question(prompt)).trim() !== expected) {
      throw new BootstrapError("confirmation", "No changes were made.");
    }
  } finally {
    readline.close();
  }
}

async function createStudio(admin: AdminClient, values: BootstrapInput, state: Preflight): Promise<string> {
  if (state.existingStudioId) return state.existingStudioId;
  const { data, error } = await admin.from("studios").insert({ name: values.studioName }).select("id").single();
  if (error || !data) throw new BootstrapError("create studio", failureMessage("Studio creation", error));
  return data.id;
}

async function getOrInviteAdmin(admin: AdminClient, values: BootstrapInput, state: Preflight): Promise<NonNullable<AuthUser>> {
  if (state.authUser) return state.authUser;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(values.email, {
    data: { full_name: values.fullName, job_title: "Designer" },
  });
  if (error || !data.user) throw new BootstrapError("invite admin", failureMessage("Admin invitation", error));
  return data.user;
}

async function provisionProfile(admin: AdminClient, values: BootstrapInput, userId: string): Promise<void> {
  const { error } = await admin.from("profiles").upsert(
    { id: userId, email: values.email, full_name: values.fullName, job_title: "Designer", system_role: "admin", is_active: true },
    { onConflict: "id" },
  );
  if (error) throw new BootstrapError("provision profile", failureMessage("Profile provisioning", error));
}

async function provisionMembership(admin: AdminClient, studioId: string, userId: string, state: Preflight): Promise<void> {
  if (state.existingMembership) return;
  const { error } = await admin.from("studio_members").insert({ studio_id: studioId, user_id: userId, system_role: "admin", is_active: true });
  if (error) throw new BootstrapError("provision membership", failureMessage("Admin membership provisioning", error));
}

async function main(): Promise<void> {
  const envFile = getEnvFilePath();
  loadEnvironment(envFile);
  const target = getTargetUrl();
  const values = await askForInput();
  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    throw new BootstrapError("environment", "Could not initialize the Supabase admin client.");
  }

  const state = await preflight(admin, values);
  await confirm(target, values, state);
  const studioId = await createStudio(admin, values, state);
  const authUser = await getOrInviteAdmin(admin, values, state);
  await provisionProfile(admin, values, authUser.id);
  await provisionMembership(admin, studioId, authUser.id, state);

  console.log("\nStudio bootstrap complete.");
  console.log(`  Studio: ${values.studioName} (${studioId})`);
  console.log(`  Admin: ${values.email} (${authUser.id})`);
  console.log(`  Target Supabase URL: ${target.toString()}`);
  console.log(`  Admin membership: ${state.existingMembership ? "already active and confirmed" : "created and active"}.`);
}

main().catch((error: unknown) => {
  if (error instanceof BootstrapError) {
    console.error(`Bootstrap failed during ${error.stage}: ${error.message}`);
  } else {
    console.error("Bootstrap failed during an unexpected stage. No secrets were printed.");
  }
  process.exitCode = 1;
});
