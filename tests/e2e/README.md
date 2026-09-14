Browser checks use the running local Supabase stack and a separate
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

`office-reconciliation.spec.ts` checks Office overlay navigation, history,
Realtime comments, anonymous/admin visibility, and single-request reconciliation
for Office and CRM mutations. Its request assertions distinguish automatic Link
prefetches from navigation and Server Action requests.

Calendar and Projects presentation regression coverage:
`pnpm exec playwright test tests/e2e/calendar-projects-presentation.spec.ts`.
Uses disposable local records to check filter navigation counts, direct links,
Back/Forward, paused ordering, same-range refresh adoption, and an event mutation
that completes while an earlier refresh response is deliberately delayed.
