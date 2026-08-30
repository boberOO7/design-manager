-- Keep the existing canonical enum field: renaming values preserves rows,
-- foreign references, recurrence series, and occurrence overrides in place.
alter type public.calendar_event_type rename value 'other' to 'general';
alter type public.calendar_event_type rename value 'client_presentation' to 'presentation';
