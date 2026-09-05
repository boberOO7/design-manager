# StudioFlow

StudioFlow is an internal project and operations system for interior design
studios. It combines project delivery, task progress, productivity attribution,
team availability, studio operations, and role-aware reporting in one workspace.

## Stack

- Next.js 16 App Router and React 19
- TypeScript
- Supabase PostgreSQL, Auth, Storage, and Row Level Security (RLS)
- Tailwind CSS 4
- `next-intl` for English and Ukrainian
- pnpm

Product scope is described in [the product specification](docs/product-spec.md).
Start codebase navigation from [the architecture overview](docs/architecture/overview.md).
Coding agents must also follow [AGENTS.md](AGENTS.md).

## Prerequisites

- Node.js compatible with Next.js 16
- pnpm 11
- Docker-compatible local runtime for Supabase

Install dependencies:

```bash
pnpm install
```

## Local setup

1. Start the local Supabase stack and inspect its generated connection values.

   ```bash
   pnpm db:start
   pnpm db:status
   ```

2. Create `.env.local` from `.env.example`. The application clients currently
   require `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; rename the example's legacy
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` entry when copying it.

3. Add the local Supabase URL and publishable key to `.env.local`. Before using
   the bootstrap command, also add `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
   and the local `SUPABASE_SECRET_KEY`.

4. Start StudioFlow.

   ```bash
   pnpm dev
   ```

5. Open `http://localhost:3000`. For a clean database, create the first studio
   and administrator with the bootstrap command:

   ```bash
   pnpm bootstrap-studio
   ```

The bootstrap command reports its target and asks for confirmation before it
writes. Never point it at a remote environment unintentionally.

## Environment variables

| Category | Variables | Notes |
| --- | --- | --- |
| Supabase client | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe project URL and publishable key. |
| Bootstrap/admin | `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY` | Site origin plus server-only secret used by bootstrap/admin paths. Never expose the secret with `NEXT_PUBLIC_`. |
| City lookup | `GEONAMES_USERNAME` | Server-only GeoNames account used by `/api/cities`. Manual city entry remains available. |
| Google Calendar | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | Server-side OAuth, token encryption, and callback configuration. |
| Scheduled reconciliation | `CRON_SECRET` | Authenticates the protected Google Calendar reconciliation drain. |

Do not commit `.env.local`, production secrets, OAuth tokens, or service-role
credentials.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the Next.js development server. |
| `pnpm build` | Create a production build. |
| `pnpm lint` | Lint the repository. |
| `pnpm exec tsc --noEmit` | Type-check without emitting files. |
| `pnpm exec vitest run` | Run the test suite. |
| `pnpm db:start` / `pnpm db:stop` | Start or stop local Supabase. |
| `pnpm db:status` | Show local Supabase connection values and services. |
| `pnpm bootstrap-studio` | Interactively create a studio and first administrator. |
| `graphify query "<question>"` | Query the repository knowledge graph. |
| `graphify update .` | Refresh the graph after source or documentation changes. |

## Database changes and generated types

StudioFlow uses ordered, imperative migrations in `supabase/migrations/`.

1. Inspect the latest schema, policies, grants, functions, and related tests.
2. Create a new migration with
   `pnpm exec supabase migration new <descriptive_name>`.
3. Never edit a migration already applied to a shared or remote database.
4. Validate locally with the narrowest relevant reset, SQL test, and application
   test workflow.
5. Regenerate the checked-in database types after the local schema is current:

   ```bash
   pnpm exec supabase gen types typescript --local > src/types/database.types.ts
   ```

6. Review the generated diff. Do not hand-edit `src/types/database.types.ts`.
7. Never push migrations or modify remote data without explicit confirmation.

See [database architecture](docs/architecture/database.md) and
[permissions](docs/architecture/permissions.md) before changing schema or RLS.

## Documentation map

- [Product specification](docs/product-spec.md)
- [Architecture overview](docs/architecture/overview.md)
- [Permissions](docs/architecture/permissions.md)
- [Projects](docs/architecture/projects.md)
- [Tasks](docs/architecture/tasks.md)
- [Productivity](docs/architecture/productivity.md)
- [Calendar](docs/architecture/calendar.md)
- [Studio operations](docs/architecture/studio-operations.md)
- [Database](docs/architecture/database.md)
