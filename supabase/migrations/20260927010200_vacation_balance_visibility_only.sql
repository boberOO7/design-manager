-- Vacation visibility now controls balance presentation only; self-service requests remain available.
drop trigger enforce_vacation_employee_visibility_before_insert on public.time_off_requests;
drop function private.enforce_vacation_employee_visibility();
