# Focused local browser checks

With the local Supabase stack and application already running against that stack:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test browser-auth.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test finance-overview.spec.ts
```

Omit `PLAYWRIGHT_BASE_URL` to use the existing build/start workflow on port 3100.
For an existing dev server, use the same origin as the manual browser, including
its hostname: on this setup `127.0.0.1:3000` served HTML but its HMR WebSocket
failed, leaving client interactions unhydrated; `localhost:3000` worked.
The config reads current local Supabase keys from `supabase status`; it never
loads test credentials from personal accounts or a remote Supabase target.

Feature specs can call `signInLocalTestUser(page, fixtureAccount)` from
`tests/helpers/auth.ts`. Create confirmed users, active profiles and studio
memberships in the spec's local setup, and remove them during teardown. The
helper performs a real Supabase password grant using the publishable key and
installs the resulting SSR cookies for the configured application origin. The
application still verifies the user and membership through its normal boundary.

Avoid submitting `/login` as incidental feature setup: an SSR form is actionable
before React hydration, and early automation can submit a native `POST /login`
without ever calling Supabase Auth. Login UI tests should test that UI explicitly.
Do not reuse on-disk storage state across local database resets. The auth check
creates new fixtures and verifies a fresh session and an in-memory state restore.
