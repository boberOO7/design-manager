---
type: "query"
date: "2026-09-14T11:42:45.130666+00:00"
question: "Investigate and fix the stale-session/auth-resume failure after StudioFlow is left open"
contributor: "graphify"
outcome: "useful"
source_nodes: ["updateSession()", "proxy()", "queries/index.ts"]
---

# Q: Investigate and fix the stale-session/auth-resume failure after StudioFlow is left open

## Answer

Expanded from original query via graph vocab: auth, session, supabase, profile, proxy, refresh, token, client, server, login. The shared Supabase SSR proxy refreshed and forwarded auth cookies but ignored the response headers supplied by @supabase/ssr 0.12.3. Those headers mark token-refresh responses private and non-cacheable; omitting them allows cached App Router/RSC responses to preserve a stale credential view after resume. Fixed updateSession by accepting the setAll headers argument and copying every supplied header to the NextResponse. Existing profile handling still returns null for invalid auth and throws genuine PostgREST/profile failures.

## Outcome

- Signal: useful

## Source Nodes

- updateSession()
- proxy()
- queries/index.ts