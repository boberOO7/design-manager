import { reviewSql, sqlId, type TaskReviewFixture } from "./task-review-fixture";

// Administrative entry today with effective historical completion. Real triggers
// retain today's audit timestamps, so suggestion tests exercise the mismatch.
export function backdateWorkLogProject(fixture: TaskReviewFixture) {
  const { admin, projectId } = fixture;
  reviewSql(`begin;
    select set_config('request.jwt.claim.sub', '${admin.id}', true);
    insert into public.project_members(project_id,user_id,project_role,assigned_area_m2,assigned_at)
      values (${sqlId(projectId)},${sqlId(admin.id)},'designer',0,'2026-05-01');
    update public.projects set start_date='2026-05-01',started_at='2026-05-01' where id=${sqlId(projectId)};
    update public.tasks set assignee_id=${sqlId(admin.id)},status='completed' where project_id=${sqlId(projectId)};
    update public.tasks set completed_at='2026-05-20' where project_id=${sqlId(projectId)};
    update public.projects set status='completed',completed_at='2026-05-20' where id=${sqlId(projectId)};
    commit;`);
}
