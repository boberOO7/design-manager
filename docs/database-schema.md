# Database schema draft

## Core entities
- profiles: extends Supabase Auth users with studio role and activity state.
- studios: top-level studio or company record.
- studio_members: role and membership information across studios.
- projects: studio projects with area and status.
- project_members: employee participation per project.
- project_area_progress: auditable area-completion entries.
- tasks: delivery tasks with assignee and due date.
- project_activity: audit events for key project actions.

## RLS principles
- Users access only their studio data.
- Admins see all studio projects and metrics.
- Employees only view projects where they are assigned.
- Employees cannot change roles or create progress entries in the MVP.
