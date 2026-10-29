-- Legacy directions inherit the archive's retained lifecycle, without renaming them.
update public.project_work_directions d
set status=case when p.completed_at is not null then 'completed' else 'paused' end
from public.projects p
where p.id=d.project_id and p.status='archived' and d.kind is null and d.status='planned';
