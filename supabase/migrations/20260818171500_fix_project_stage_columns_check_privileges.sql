-- The enabled-statuses CHECK constraint calls this pure validation helper while
-- authenticated users update their project configuration.
grant execute on function private.are_distinct_text_array(text[]) to authenticated;
