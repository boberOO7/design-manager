Equipment browser checks use the running local Supabase stack and a separate
production build/server on port 3100. They create and remove a disposable studio;
existing inventory is left intact. Docker access is required for fixture SQL.

```sh
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test
```

The suite checks EN/UA create/edit persistence, legacy text preservation,
category-specific fields, multiple drive removal, keyboard access, mobile layout,
and reduced motion. It records per-frame accordion height, opacity, and the next
section's position; an instantaneous layout jump fails the motion assertion.
