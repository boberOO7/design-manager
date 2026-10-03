import "server-only";

import { resolveActiveStudioMembership } from "@/data/queries/active-studio-membership";
import { getCanonicalProductivityAttributions } from "@/data/queries/productivity-attributions";
import { getEmployeeProfileEmployment } from "@/data/queries/employee-profile-employment";
import { buildProfileHeatmap, getProfileActivityBounds, summarizeProfileContributions } from "@/lib/employee-profile";
import { instantToDateOnly } from "@/lib/calendar";
import { isOperationalProjectStatus } from "@/lib/project-lifecycle";
import { createClient } from "@/lib/supabase/server";

export async function getEmployeeProfile(userId: string) {
  const access = await resolveActiveStudioMembership();
  if (access.status !== "ACTIVE_STUDIO") return null;
  const membership = access.membership;
  const isAdmin = membership.system_role === "admin";
  const isOwn = membership.authenticatedUserId === userId;
  const supabase = await createClient();
  const { data: person, error } = await supabase.from("studio_members")
    .select("joined_at, is_active, system_role, profile:profiles!studio_members_user_id_fkey!inner(id, full_name, job_title, avatar_url, country_code, city, city_geonames_id)")
    .eq("studio_id", membership.studio_id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Unable to load employee profile.", { cause: error });
  if (!person || (!isAdmin && !person.is_active)) return null;
  const now = new Date();
  const [attributions, projects, employment, activity] = await Promise.all([
    isAdmin ? getCanonicalProductivityAttributions(membership.studio_id, { contributorId: userId }) : Promise.resolve(null),
    (async () => {
      // Caller-context RLS limits colleagues to projects they can already open.
      const page = (offset: number) => supabase.from("project_members")
        .select("assigned_at, is_active, project:projects!inner(id, name, status, updated_at, completed_at, archived_at)", { count: "exact" })
        .eq("user_id", userId).eq("project.studio_id", membership.studio_id)
        .order("id").range(offset, offset + 999);
      const first = await page(0);
      if (first.error || !first.data || first.count === null) throw new Error("Unable to load profile projects.", { cause: first.error });
      const rows = [...first.data];
      while (rows.length < first.count) {
        const next = await page(rows.length);
        if (next.error || !next.data?.length) throw new Error("Unable to load profile projects.", { cause: next.error });
        rows.push(...next.data);
      }
      const participation = rows.map((row) => ({ ...row.project, assignedAt: row.assigned_at, isActive: row.is_active }));
      const byProject = new Map<string, typeof participation[number]>();
      for (const project of participation) {
        const previous = byProject.get(project.id);
        if (!previous) byProject.set(project.id, project);
        else {
          previous.assignedAt = previous.assignedAt < project.assignedAt ? previous.assignedAt : project.assignedAt;
          previous.isActive ||= project.isActive;
        }
      }
      return [...byProject.values()];
    })(),
    isAdmin ? getEmployeeProfileEmployment(userId, now) : Promise.resolve(null),
    isOwn || isAdmin ? (async () => {
      // Same assignee/collaborator union as Dashboard, without fetching area or task details.
      const countTasks = async (status: "completed" | "in_progress") => {
        const scope = (collaborating: boolean) => {
          let query = supabase.from("tasks")
            .select(collaborating
              ? "id, project:projects!tasks_project_id_fkey!inner(studio_id, status, archived_at), collaborators:task_collaborators!inner(user_id)"
              : "id, project:projects!tasks_project_id_fkey!inner(studio_id, status, archived_at)", { count: "exact", head: true })
            .eq("project.studio_id", membership.studio_id).eq("status", status);
          if (collaborating) query = query.eq("collaborators.user_id", userId);
          if (status === "in_progress") query = query.is("project.archived_at", null).neq("project.status", "paused").neq("project.status", "archived");
          return query;
        };
        const results = await Promise.all([scope(false).eq("assignee_id", userId), scope(true), scope(true).eq("assignee_id", userId)]);
        for (const result of results) if (result.error || result.count === null) throw new Error("Unable to load profile activity.", { cause: result.error });
        return results.reduce((total, result, index) => total + (index === 2 ? -1 : 1) * (result.count ?? 0), 0);
      };
      const bounds = getProfileActivityBounds(now);
      const completionPage = (collaborating: boolean, offset: number) => {
        const selected = collaborating
          ? supabase.from("tasks").select("id, completed_at, project:projects!tasks_project_id_fkey!inner(studio_id), collaborators:task_collaborators!inner(user_id)", { count: "exact" })
          : supabase.from("tasks").select("id, completed_at, project:projects!tasks_project_id_fkey!inner(studio_id)", { count: "exact" });
        let query = selected.eq("project.studio_id", membership.studio_id).eq("status", "completed")
          .gte("completed_at", bounds.start).lte("completed_at", bounds.today);
        query = collaborating ? query.eq("collaborators.user_id", userId) : query.eq("assignee_id", userId);
        return query.order("id").range(offset, offset + 999);
      };
      const loadCompletions = async (collaborating: boolean) => {
        const first = await completionPage(collaborating, 0);
        if (first.error || !first.data || first.count === null) throw new Error("Unable to load profile activity.", { cause: first.error });
        const rows = [...first.data];
        while (rows.length < first.count) {
          const next = await completionPage(collaborating, rows.length);
          if (next.error || !next.data?.length) throw new Error("Unable to load profile activity.", { cause: next.error });
          rows.push(...next.data);
        }
        return rows;
      };
      const currentTasks = (collaborating: boolean) => {
        const selected = collaborating
          ? supabase.from("tasks").select("id, title, due_date, project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at), collaborators:task_collaborators!inner(user_id)")
          : supabase.from("tasks").select("id, title, due_date, project:projects!tasks_project_id_fkey!inner(id, name, studio_id, status, archived_at)");
        let query = selected.eq("project.studio_id", membership.studio_id).eq("status", "in_progress")
          .is("project.archived_at", null).neq("project.status", "paused").neq("project.status", "archived");
        query = collaborating ? query.eq("collaborators.user_id", userId) : query.eq("assignee_id", userId);
        return query.order("due_date", { nullsFirst: false }).order("id").range(0, 1);
      };
      const approvedPeriods = async () => {
        // Self-visible approved dates only; never private notes, types or review details.
        const page = (offset: number) => supabase.from("time_off_requests")
          .select("id, start_date, end_date", { count: "exact" })
          .eq("studio_id", membership.studio_id).eq("user_id", userId).eq("status", "approved")
          .lte("start_date", bounds.today).gte("end_date", bounds.start)
          .order("id").range(offset, offset + 999);
        const first = await page(0);
        if (first.error || !first.data || first.count === null) throw new Error("Unable to load profile activity.", { cause: first.error });
        const rows = [...first.data];
        while (rows.length < first.count) {
          const next = await page(rows.length);
          if (next.error || !next.data?.length) throw new Error("Unable to load profile activity.", { cause: next.error });
          rows.push(...next.data);
        }
        return rows;
      };
      const [completedTasks, inProgressTasks, assigned, collaborated, assignedNow, collaboratedNow, timeOff, daysOff] = await Promise.all([
        countTasks("completed"), countTasks("in_progress"), loadCompletions(false), loadCompletions(true),
        currentTasks(false), currentTasks(true), approvedPeriods(),
        supabase.from("studio_days_off").select("date").eq("studio_id", membership.studio_id)
          .gte("date", bounds.start).lte("date", bounds.today),
      ]);
      if (assignedNow.error || collaboratedNow.error || daysOff.error || !daysOff.data) {
        throw new Error("Unable to load profile activity.", { cause: assignedNow.error ?? collaboratedNow.error ?? daysOff.error });
      }
      const snapshot = [...new Map([...(assignedNow.data ?? []), ...(collaboratedNow.data ?? [])].map((task) => [task.id, task])).values()]
        .sort((left, right) => (left.due_date ?? "9999").localeCompare(right.due_date ?? "9999") || left.id.localeCompare(right.id))
        .slice(0, 2).map((task) => ({ id: task.id, title: task.title, projectId: task.project.id, projectName: task.project.name }));
      return {
        completedTasks, inProgressTasks, currentTasks: snapshot,
        heatmap: buildProfileHeatmap({ tasks: [...assigned, ...collaborated], joinedAt: person.joined_at, timeOff, studioDaysOff: daysOff.data.map((day) => day.date), now }),
      };
    })() : Promise.resolve(null),
  ]);
  const isCurrentProject = (project: typeof projects[number]) => project.isActive && !project.archived_at && isOperationalProjectStatus(project.status);
  projects.sort((left, right) => Number(isCurrentProject(right)) - Number(isCurrentProject(left))
    || new Date(right.completed_at ?? right.updated_at).getTime() - new Date(left.completed_at ?? left.updated_at).getTime()
    || left.id.localeCompare(right.id));
  const earliestParticipation = [...projects].sort((left, right) => left.assignedAt.localeCompare(right.assignedAt) || left.id.localeCompare(right.id))[0] ?? null;
  const completedProjects = projects.filter((project) => project.completed_at !== null && (project.status === "completed" || project.status === "archived"));
  const firstCompletedProject = completedProjects.filter((project) => instantToDateOnly(project.assignedAt) <= (project.completed_at ?? ""))
    .sort((left, right) => (left.completed_at ?? "").localeCompare(right.completed_at ?? "") || left.id.localeCompare(right.id))[0] ?? null;
  const currentProjects = projects.filter(isCurrentProject);
  return {
    person, isOwn, isAdmin, employment, activity,
    projectCount: projects.length, completedProjectCount: completedProjects.length,
    activeProjectCount: currentProjects.length, currentProjects: currentProjects.slice(0, 2), projects: projects.slice(0, 6), earliestParticipation, firstCompletedProject,
    work: attributions ? summarizeProfileContributions(attributions, userId, now) : null,
  };
}
