import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { cancel, intro, isCancel, note, outro, select, text } from "@clack/prompts";
import { z } from "zod";
import { createAdminClient } from "../src/lib/supabase/admin-client";
import {
  PROFESSIONAL_ROLES,
  type ProfessionalRole,
} from "../src/lib/validation/employee-invitation";

const studioNameSchema = z
  .string()
  .trim()
  .min(1, "Studio name is required")
  .max(120, "Studio name is too long");

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Full name must be at least 2 characters")
  .max(120, "Full name is too long");

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email")
  .transform((email) => email.toLowerCase());

const systemRoleSchema = z.enum(["admin", "employee"]);

type SystemRole = z.infer<typeof systemRoleSchema>;

const initialMemberSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  jobTitle: z.enum(PROFESSIONAL_ROLES),
  systemRole: systemRoleSchema,
});

const bootstrapInputSchema = z
  .object({
    studioName: studioNameSchema,
    members: z.array(initialMemberSchema).min(1, "Add at least one initial member"),
  })
  .superRefine((value, context) => {
    const seenEmails = new Set<string>();

    value.members.forEach((member, index) => {
      if (seenEmails.has(member.email)) {
        context.addIssue({
          code: "custom",
          path: ["members", index, "email"],
          message: `Duplicate initial-team email: ${member.email}`,
        });
      }
      seenEmails.add(member.email);
    });

    if (!value.members.some((member) => member.systemRole === "admin")) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message: "At least one initial member must be an Administrator",
      });
    }
  });

type InitialMember = z.infer<typeof initialMemberSchema>;
type BootstrapInput = z.infer<typeof bootstrapInputSchema>;
type AdminClient = ReturnType<typeof createAdminClient>;
type AuthUser = NonNullable<
  Awaited<ReturnType<AdminClient["auth"]["admin"]["inviteUserByEmail"]>>["data"]["user"]
>;

class BootstrapError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(message);
  }
}

function getEnvFilePath(): string {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length === 0) return ".env.local";
  if (args.length === 2 && args[0] === "--env-file" && args[1]) return args[1];

  throw new BootstrapError(
    "arguments",
    "Usage: pnpm bootstrap-studio -- [--env-file path/to/file]",
  );
}

function loadEnvironment(envFile: string): void {
  const absolutePath = resolve(envFile);
  try {
    // The selected file is the source of truth. Do not accidentally bootstrap a
    // shell's previously selected project when --env-file was supplied.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    loadEnvFile(absolutePath);
  } catch {
    throw new BootstrapError(
      "environment",
      `Could not load environment file: ${envFile}`,
    );
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SITE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    throw new BootstrapError(
      "environment",
      "The selected environment file must define NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SITE_URL, and SUPABASE_SECRET_KEY.",
    );
  }
}

function getTargetUrl(): URL {
  try {
    const target = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error();
    }
    return target;
  } catch {
    throw new BootstrapError(
      "environment",
      "NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL.",
    );
  }
}

function getInviteRedirectTo(): string {
  try {
    const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL!);
    if (siteUrl.protocol !== "http:" && siteUrl.protocol !== "https:") {
      throw new Error();
    }

    return `${siteUrl.toString().replace(/\/+$/, "")}/auth/confirm`;
  } catch {
    throw new BootstrapError(
      "environment",
      "NEXT_PUBLIC_SITE_URL must be a valid http(s) URL.",
    );
  }
}

function isLocalTarget(target: URL): boolean {
  return target.hostname === "localhost" || target.hostname === "127.0.0.1";
}

function failureMessage(
  resource: string,
  error: { code?: string; status?: number } | null,
): string {
  const detail = [error?.code, error?.status]
    .filter((value) => value !== undefined)
    .join(" / ");
  return detail
    ? `${resource} request failed (${detail}).`
    : `${resource} request failed.`;
}

function validationMessage<T>(schema: z.ZodType<T>, value: string): string | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? undefined
    : (parsed.error.issues[0]?.message ?? "Invalid input.");
}

async function askForText<T>(
  message: string,
  schema: z.ZodType<T>,
  extraValidate?: (rawValue: string) => string | undefined,
): Promise<T | null> {
  const value = await text({
    message,
    validate: (input) => {
      const rawValue = input ?? "";
      return validationMessage(schema, rawValue) ?? extraValidate?.(rawValue);
    },
  });

  if (isCancel(value)) {
    cancel("Bootstrap cancelled. No changes were made.");
    return null;
  }

  return schema.parse(value);
}

function roleLabel(role: SystemRole): string {
  return role === "admin" ? "Administrator" : "Employee";
}

async function askForMember(
  index: number,
  existingEmails: ReadonlySet<string>,
): Promise<InitialMember | null> {
  const fullName = await askForText(
    `Member #${index} full name`,
    fullNameSchema,
  );
  if (fullName === null) return null;

  const email = await askForText(
    `Member #${index} email`,
    emailSchema,
    (rawValue) => {
      const normalized = rawValue.trim().toLowerCase();
      return existingEmails.has(normalized)
        ? "This email is already in the initial team"
        : undefined;
    },
  );
  if (email === null) return null;

  const jobTitle = await select<ProfessionalRole>({
    message: `Member #${index} job title`,
    options: PROFESSIONAL_ROLES.map((role) => ({
      value: role,
      label: role,
    })),
  });
  if (isCancel(jobTitle)) {
    cancel("Bootstrap cancelled. No changes were made.");
    return null;
  }

  const systemRole = await select<SystemRole>({
    message: `Member #${index} access role`,
    options: [
      { value: "admin", label: "Administrator" },
      { value: "employee", label: "Employee" },
    ],
  });
  if (isCancel(systemRole)) {
    cancel("Bootstrap cancelled. No changes were made.");
    return null;
  }

  const parsed = initialMemberSchema.safeParse({
    fullName,
    email,
    jobTitle,
    systemRole,
  });
  if (!parsed.success) {
    throw new BootstrapError(
      "input",
      parsed.error.issues[0]?.message ?? "Invalid member input.",
    );
  }

  return parsed.data;
}

async function askForInput(): Promise<BootstrapInput | null> {
  intro("StudioFlow bootstrap");

  const studioName = await askForText("Studio name", studioNameSchema);
  if (studioName === null) return null;

  const members: InitialMember[] = [];
  const memberEmails = new Set<string>();

  for (;;) {
    const member = await askForMember(members.length + 1, memberEmails);
    if (!member) return null;

    members.push(member);
    memberEmails.add(member.email);

    const nextAction = await select<"add" | "review">({
      message: "What next?",
      options: [
        { value: "add", label: "Add another member" },
        { value: "review", label: "Review team" },
      ],
    });

    if (isCancel(nextAction)) {
      cancel("Bootstrap cancelled. No changes were made.");
      return null;
    }

    if (nextAction === "add") continue;

    if (!members.some((item) => item.systemRole === "admin")) {
      note(
        "At least one initial member must be an Administrator. Add another member and assign Administrator access.",
        "Administrator required",
      );
      continue;
    }

    break;
  }

  const parsed = bootstrapInputSchema.safeParse({ studioName, members });
  if (!parsed.success) {
    throw new BootstrapError(
      "input",
      parsed.error.issues[0]?.message ?? "Invalid bootstrap input.",
    );
  }

  return parsed.data;
}

async function listRequestedAuthUsersByEmail(
  admin: AdminClient,
  requestedEmails: ReadonlySet<string>,
): Promise<Map<string, AuthUser>> {
  const usersByEmail = new Map<string, AuthUser>();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1_000,
    });

    if (error) {
      throw new BootstrapError(
        "preflight",
        failureMessage("Auth user lookup", error),
      );
    }

    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !requestedEmails.has(email)) continue;

      if (usersByEmail.has(email)) {
        throw new BootstrapError(
          "preflight",
          `Multiple Auth users have email ${email}; refusing to guess.`,
        );
      }

      usersByEmail.set(email, user as AuthUser);
    }

    if (data.users.length < 1_000) break;
  }

  return usersByEmail;
}

type ExistingMembership = {
  studio_id: string;
  system_role: string;
  is_active: boolean;
};

type MemberPreflight = {
  member: InitialMember;
  authUser: AuthUser | null;
  existingMembership: ExistingMembership | null;
};

type Preflight = {
  existingStudioId: string | null;
  members: MemberPreflight[];
};

async function preflight(
  admin: AdminClient,
  values: BootstrapInput,
): Promise<Preflight> {
  const { data: studios, error: studioError } = await admin
    .from("studios")
    .select("id")
    .eq("name", values.studioName);

  if (studioError) {
    throw new BootstrapError(
      "preflight",
      failureMessage("Studio lookup", studioError),
    );
  }
  if (!studios) {
    throw new BootstrapError("preflight", "Studio lookup returned no data.");
  }
  if (studios.length > 1) {
    throw new BootstrapError(
      "preflight",
      "Multiple studios have this name; refusing to guess which one to recover.",
    );
  }

  const existingStudioId = studios[0]?.id ?? null;
  const requestedEmails = new Set(values.members.map((member) => member.email));
  const authUsersByEmail = await listRequestedAuthUsersByEmail(
    admin,
    requestedEmails,
  );

  const requestedAuthUserIds = [...authUsersByEmail.values()].map(
    (user) => user.id,
  );

  const profilesByUserId = new Map<
    string,
    { id: string; email: string; system_role: string }
  >();
  const membershipsByUserId = new Map<string, ExistingMembership[]>();

  if (requestedAuthUserIds.length > 0) {
    const [profilesResult, membershipsResult] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, system_role")
        .in("id", requestedAuthUserIds),
      admin
        .from("studio_members")
        .select("studio_id, user_id, system_role, is_active")
        .in("user_id", requestedAuthUserIds),
    ]);

    if (profilesResult.error) {
      throw new BootstrapError(
        "preflight",
        failureMessage("Profile lookup", profilesResult.error),
      );
    }
    if (membershipsResult.error) {
      throw new BootstrapError(
        "preflight",
        failureMessage("Membership lookup", membershipsResult.error),
      );
    }

    for (const profile of profilesResult.data ?? []) {
      profilesByUserId.set(profile.id, profile);
    }

    for (const membership of membershipsResult.data ?? []) {
      const current = membershipsByUserId.get(membership.user_id) ?? [];
      current.push({
        studio_id: membership.studio_id,
        system_role: membership.system_role,
        is_active: membership.is_active,
      });
      membershipsByUserId.set(membership.user_id, current);
    }
  }

  const memberStates: MemberPreflight[] = [];

  for (const member of values.members) {
    const authUser = authUsersByEmail.get(member.email) ?? null;
    let existingMembership: ExistingMembership | null = null;

    if (authUser) {
      const profile = profilesByUserId.get(authUser.id);
      if (profile && profile.email.trim().toLowerCase() !== member.email) {
        throw new BootstrapError(
          "preflight",
          `Auth user ${member.email} has a Profile with a different email; refusing to overwrite it.`,
        );
      }

      const memberships = membershipsByUserId.get(authUser.id) ?? [];
      const conflictingMembership = memberships.find((membership) =>
        existingStudioId
          ? membership.studio_id !== existingStudioId
          : true,
      );

      if (conflictingMembership) {
        throw new BootstrapError(
          "preflight",
          `${member.email} already belongs to a different studio; refusing to change its StudioFlow access.`,
        );
      }

      existingMembership = existingStudioId
        ? (memberships.find(
            (membership) => membership.studio_id === existingStudioId,
          ) ?? null)
        : null;

      if (
        existingMembership &&
        (existingMembership.system_role !== member.systemRole ||
          !existingMembership.is_active)
      ) {
        throw new BootstrapError(
          "preflight",
          `${member.email} already has a non-active or different-role membership in this studio; refusing to change it automatically.`,
        );
      }
    }

    memberStates.push({ member, authUser, existingMembership });
  }

  if (existingStudioId) {
    const { data: existingStudioMembers, error: studioMembersError } = await admin
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", existingStudioId);

    if (studioMembersError) {
      throw new BootstrapError(
        "preflight",
        failureMessage("Studio membership lookup", studioMembersError),
      );
    }

    const requestedUserIds = new Set(
      memberStates
        .map((state) => state.authUser?.id)
        .filter((userId): userId is string => Boolean(userId)),
    );

    const unrelatedMember = (existingStudioMembers ?? []).find(
      (membership) => !requestedUserIds.has(membership.user_id),
    );

    if (unrelatedMember) {
      throw new BootstrapError(
        "preflight",
        "A studio with this name already has members outside this requested initial team; refusing to treat it as a bootstrap retry.",
      );
    }
  }

  return {
    existingStudioId,
    members: memberStates,
  };
}

function formatTeamSummary(state: Preflight): string[] {
  return state.members.flatMap((item, index) => [
    `${index + 1}. ${item.member.fullName} <${item.member.email}>`,
    `   ${item.member.jobTitle} · ${roleLabel(item.member.systemRole)}`,
    `   Auth: ${item.authUser ? "existing user; no invite" : "send invite"}`,
    `   Membership: ${
      item.existingMembership
        ? `already active ${roleLabel(item.member.systemRole)}`
        : `create active ${roleLabel(item.member.systemRole)}`
    }`,
  ]);
}

async function confirm(
  target: URL,
  values: BootstrapInput,
  state: Preflight,
): Promise<boolean> {
  const local = isLocalTarget(target);

  note(
    [
      `Target Supabase URL: ${target.toString()}`,
      `Studio: ${values.studioName}${
        state.existingStudioId
          ? " (recover existing bootstrap)"
          : " (create new)"
      }`,
      "",
      "Initial team:",
      ...formatTeamSummary(state),
    ].join("\n"),
    "Bootstrap summary",
  );

  const approved = await select<"yes" | "no">({
    message: `Create this studio and invite ${values.members.length} member${
      values.members.length === 1 ? "" : "s"
    }?`,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  });

  if (isCancel(approved) || approved !== "yes") {
    outro("Bootstrap cancelled. No changes were made.");
    return false;
  }

  if (local) return true;

  const hostConfirmation = await text({
    message: `NON-LOCAL TARGET. Type the exact Supabase host (${target.host}) to continue`,
    validate: (value) =>
      (value ?? "").trim() === target.host
        ? undefined
        : `Enter exactly: ${target.host}`,
  });

  if (isCancel(hostConfirmation)) {
    cancel("Bootstrap cancelled. No changes were made.");
    return false;
  }

  return true;
}

async function createStudio(
  admin: AdminClient,
  values: BootstrapInput,
  state: Preflight,
): Promise<string> {
  if (state.existingStudioId) return state.existingStudioId;

  const { data, error } = await admin
    .from("studios")
    .insert({ name: values.studioName })
    .select("id")
    .single();

  if (error || !data) {
    throw new BootstrapError(
      "create studio",
      failureMessage("Studio creation", error),
    );
  }

  return data.id;
}

async function getOrInviteMember(
  admin: AdminClient,
  state: MemberPreflight,
  redirectTo: string,
): Promise<AuthUser> {
  if (state.authUser) return state.authUser;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    state.member.email,
    {
      data: {
        full_name: state.member.fullName,
        job_title: state.member.jobTitle,
      },
      redirectTo,
    },
  );

  if (error || !data.user) {
    throw new BootstrapError(
      `invite ${state.member.email}`,
      failureMessage("Member invitation", error),
    );
  }

  return data.user as AuthUser;
}

async function provisionProfile(
  admin: AdminClient,
  member: InitialMember,
  userId: string,
): Promise<void> {
  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: member.email,
      full_name: member.fullName,
      job_title: member.jobTitle,
      system_role: member.systemRole,
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new BootstrapError(
      `provision profile ${member.email}`,
      failureMessage("Profile provisioning", error),
    );
  }
}

async function provisionMembership(
  admin: AdminClient,
  studioId: string,
  state: MemberPreflight,
  userId: string,
): Promise<void> {
  if (state.existingMembership) return;

  const { error } = await admin.from("studio_members").insert({
    studio_id: studioId,
    user_id: userId,
    system_role: state.member.systemRole,
    is_active: true,
  });

  if (error) {
    throw new BootstrapError(
      `provision membership ${state.member.email}`,
      failureMessage("Studio membership provisioning", error),
    );
  }
}

type CompletedMember = {
  member: InitialMember;
  userId: string;
  membershipWasExisting: boolean;
};

async function provisionInitialTeam(
  admin: AdminClient,
  studioId: string,
  state: Preflight,
  redirectTo: string,
): Promise<CompletedMember[]> {
  const completed: CompletedMember[] = [];

  for (const memberState of state.members) {
    const authUser = await getOrInviteMember(admin, memberState, redirectTo);
    await provisionProfile(admin, memberState.member, authUser.id);
    await provisionMembership(admin, studioId, memberState, authUser.id);

    completed.push({
      member: memberState.member,
      userId: authUser.id,
      membershipWasExisting: Boolean(memberState.existingMembership),
    });
  }

  return completed;
}

async function main(): Promise<void> {
  const envFile = getEnvFilePath();
  loadEnvironment(envFile);

  const target = getTargetUrl();
  const inviteRedirectTo = getInviteRedirectTo();
  const values = await askForInput();
  if (!values) return;

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    throw new BootstrapError(
      "environment",
      "Could not initialize the Supabase admin client.",
    );
  }

  const state = await preflight(admin, values);
  if (!(await confirm(target, values, state))) return;

  const studioId = await createStudio(admin, values, state);
  const completedMembers = await provisionInitialTeam(
    admin,
    studioId,
    state,
    inviteRedirectTo,
  );

  note(
    [
      `Studio: ${values.studioName} (${studioId})`,
      `Target Supabase URL: ${target.toString()}`,
      "",
      "Initial team:",
      ...completedMembers.flatMap((item, index) => [
        `${index + 1}. ${item.member.fullName} <${item.member.email}> (${item.userId})`,
        `   ${item.member.jobTitle} · ${roleLabel(item.member.systemRole)}`,
        `   Membership: ${
          item.membershipWasExisting ? "already active" : "created and active"
        }`,
      ]),
    ].join("\n"),
    "Studio bootstrap complete",
  );

  outro("Studio and initial team setup are ready.");
}

main().catch((error: unknown) => {
  if (error instanceof BootstrapError) {
    console.error(`Bootstrap failed during ${error.stage}: ${error.message}`);
  } else {
    console.error(
      "Bootstrap failed during an unexpected stage. No secrets were printed.",
    );
  }
  process.exitCode = 1;
});
