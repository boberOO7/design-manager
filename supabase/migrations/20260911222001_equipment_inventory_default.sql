-- A default expression lets generated clients omit asset_tag on insert. The
-- BEFORE INSERT trigger replaces this null with a reserved code before NOT NULL
-- is checked. Explicit null updates remain forbidden by the identity trigger.
alter table public.equipment alter column asset_tag set default nullif('', '');
