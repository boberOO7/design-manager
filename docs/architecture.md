# StudioFlow architecture

## Goals
- Manage a focused set of interior design studio projects and tasks.
- Enforce employee access through RLS and role-aware UI.
- Keep the first release grounded in typed mock data while remaining compatible with Supabase.

## Key layers
- App Router pages under src/app.
- Reusable UI under src/components.
- Domain and query logic under src/data and src/types.
- Supabase client setup under src/lib/supabase.

## Deferred capabilities
- Billing, multi-studio switching, customer accounts, realtime chat, file attachments, and subtasks are intentionally postponed.
