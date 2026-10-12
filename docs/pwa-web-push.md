# PWA and Web Push

StudioFlow remains an ordinary authenticated website. Installation is optional
on desktop Chrome/Edge and Android. Profile settings offer installation and a
separate per-browser system-notification opt-in. Neither changes the existing
in-app popup/sound preferences or notification history/read states.

`/manifest.webmanifest` uses the existing StudioFlow brand mark, standalone
display, `/dashboard` start URL and root scope. `/sw.js` has no fetch handler or
offline cache. Its IndexedDB store contains only opaque IDs to deduplicate Push
retries, not application records or notification content.

## Delivery and security

1. Every new `notifications` insert transactionally queues one delivery for each
   existing recipient subscription. There is no historical replay on enabling
   Push, and no separate integration for individual notification producers.
2. `/api/push/dispatch` claims up to 100 jobs per invocation using five-minute
   leases and `SKIP LOCKED`. A queue INSERT trigger invokes it via pg_net POST
   **after commit**, independently of browser tabs. Encrypted Supabase Vault
   stores the environment's callback URL and `CRON_SECRET` bearer credential.
   Requests carry only a dispatch UUID. The service-only acknowledgement RPC
   drains further batches and schedules provider retries. An on-demand pg_cron
   timer recovers missing acknowledgements after the HTTP deadline, including
   application outages and pg_net's unlogged request loss. Each timer removes
   itself; there is no idle queue polling or Vercel Push cron. Transport recovery
   and provider retries use bounded exponential backoff (up to one hour).
3. The Node worker encrypts messages with `web-push`. Messages carry opaque IDs
   and fixed Ukrainian/English preview text; stored titles, bodies, metadata,
   names, amounts and HR details never enter OS previews. 404/410 responses remove
   expired endpoints; transient failures retry with bounded exponential delay.
4. The worker checks live auth sessions, active profiles/studio membership and
   unread state. The service worker additionally resolves each notification
   through a verified authenticated API before showing it, and verifies again
   on click. Saved relative links reuse the destination's existing authorization.
   Missing/unauthorized notification or subscription records fall back to
   `/dashboard`; destination pages enforce current entity access. Clicks do not
   alter notification read state.

Subscription registration is a caller-bound RPC using `auth.uid()` and the
verified JWT's live `session_id`. There is no recipient parameter. RLS permits
only own-row reads/deletes; direct browser inserts/updates and worker RPC calls
are denied. Endpoints are globally unique and cannot be transferred to another
user. The API and privileged sender allow only known HTTPS browser Push-provider
hosts, avoiding arbitrary server-side requests. Supported hosts are FCM, Mozilla,
Apple Web Push and Windows notification services.
The HTTP API also checks the browser's expected current account against verified
identity before the RPC, preventing registration across an account switch while
the permission dialog is open. This input is a consistency guard, not authority.

Logout unsubscribes this browser before signing out, removes its opt-in and closes
its notifications. Subscriptions reference `auth.sessions` with cascading deletes;
session revocation also removes queued work without a browser tab. Other devices
are retained. Account changes require fresh opt-in. Permission revocation is
reconciled on supported permission events and on return to the app; expired
browser subscriptions and VAPID rotation need another enable click. Permission is
never requested on page load, focus, authentication events or reconciliation.

Unique delivery pairs, leases, OS tags and persistent receipt IDs suppress retries.
Provider acceptance followed by a worker crash can still cause a transport retry;
Web Push does not offer exactly-once transport. Focused StudioFlow windows suppress
redundant system notifications where the browser permits invisible Push handling.

The enabled settings state includes a current-device self-test. Its same-origin
authenticated route uses the normal encrypted sender, without creating a task or
notification-history row. A caller-bound RPC verifies the live session and limits
tests to one per user per minute in a private table, including across devices and
subscription replacement. Provider acceptance is reported separately from OS
display. The worker verifies the recipient/subscription before showing a test,
and permits this explicit test while StudioFlow is focused. Delivery failures log
only reason/status, and dispatcher results include failure-reason counts; expired
subscription cleanup remains unchanged. Configuration validates that the VAPID
private key derives the configured public key before registration or claiming work.

## Deployment

- Apply `20261010214627_web_push.sql`, then
  `20261010222211_event_driven_web_push.sql` through the normal migration process.
  The self-test also requires `20261012143927_web_push_self_test.sql` for its
  caller-bound cooldown RPC.
  They require pg_net, pg_cron and Supabase Vault (the second migration enables
  them). pg_cron must support interval schedules; local validation used 1.6.4.
  Do not rewrite earlier migrations. No remote migration is applied by
  implementation or tests.
- Generate a persistent VAPID pair once with
  `pnpm exec web-push generate-vapid-keys --json`. Store its values as server-only
  `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`. Set
  `WEB_PUSH_VAPID_SUBJECT` to a real `mailto:` contact or HTTPS contact URL.
  Never use `NEXT_PUBLIC_` for the private key.
- Configure existing `SUPABASE_SECRET_KEY` and `CRON_SECRET`, along with the
  ordinary Supabase URL/publishable key. The public VAPID key is returned only by
  the authenticated subscription API.
- Deploy over HTTPS with `/sw.js` served as JavaScript at root scope and without
  caching; the Next configuration supplies these headers. Each origin has its
  own subscriptions. Preview databases need their own explicit callback setup.
- After deploying the route and applying migrations, configure production Vault
  once as a database administrator. In Vault, add/update the named secrets
  `studioflow_web_push_url` (the HTTPS production URL ending in
  `/api/push/dispatch`) and `studioflow_web_push_token` (the exact production
  `CRON_SECRET` from Vercel), then run
  `select private.request_web_push_dispatch();` to activate pending work. This
  keeps the token out of SQL-editor query text. For private operator tooling,
  the equivalent setup helper is:

  ```sql
  select private.configure_web_push_dispatch(
    'https://studio-flow.space/api/push/dispatch',
    '<the exact production CRON_SECRET from Vercel>'
  );
  ```

  Replace the placeholder privately; never commit or post it in logs. This stores
  the URL/token encrypted and starts any already-pending work. Keep separate
  credentials/URLs for local, preview and production databases. No Supabase Edge
  Function deployment, external scheduler, additional dashboard webhook or
  Vercel Pro plan is needed. Do not create a second webhook on notifications or
  deliveries. The route must be reachable from Supabase without Vercel preview
  protection/interactive login; its bearer authentication remains mandatory.
  Production always uses HTTPS. The protected GET remains an operator recovery
  endpoint; normal delivery does not call it.
- Changing the VAPID pair invalidates existing subscriptions. Keep the pair stable
  across deploys; users must re-enable Push after intentional key rotation.

## Focused validation

Local setup (with local Supabase Docker and an already-running Next.js app):

1. Keep a valid persistent VAPID pair, the existing `CRON_SECRET` and existing
   Supabase credentials in gitignored `.env.local`. The subject is
   `mailto:studioflow.notifications@gmail.com`, StudioFlow's existing contact.
2. Set `WEB_PUSH_DISPATCH_URL=http://host.docker.internal:3000/api/push/dispatch`.
   Check connectivity from `supabase_db_design-manager`: an unauthenticated
   request should return 401. Docker Desktop may map that host to Windows while
   Next.js runs in WSL; use the WSL `eth0` address (`ip -4 addr show eth0`) instead
   when necessary. The address can change after restarting WSL. Do not use
   `localhost` inside the database container to reach Next.js.
3. Apply migrations locally, then run `node scripts/configure-web-push-local.mjs`.
   This local-only script reads `.env.local` and stores the URL/existing token in
   local Vault without printing secrets. Rerun it after a callback IP/token change.
   Restart Next.js after changing server credentials. `WEB_PUSH_DISPATCH_URL`
   itself is operator setup input; delivery reads Vault, not browser environment.

```bash
pnpm exec vitest run src/lib/web-push/*.test.ts src/app/api/push/subscriptions/route.test.ts src/app/api/push/dispatch/route.test.ts
psql <LOCAL_DATABASE_URL> -v ON_ERROR_STOP=1 -f supabase/tests/web_push_security.test.sql
pnpm exec tsc --noEmit
```

SQL fixtures roll back. The suite covers ownership, session forgery, grants,
multiple devices, deduplication, queue leasing, retries, expired endpoints, read
state and session deletion. JavaScript tests cover generic previews, server
dispatch, permission denial/revocation, account changes, unsubscribe ordering,
focused-window suppression, duplicate receipts and authenticated click navigation.

With a running local app and local Supabase, run
`SUPABASE_TELEMETRY_DISABLED=1 pnpm exec playwright test -c tests/pwa-push.config.ts`.
Set `PUSH_TEST_REAL=1`, `PUSH_TEST_HEADED=1` and optionally
`PUSH_TEST_CHANNEL=chrome` (or `msedge`) to attempt genuine provider delivery.
The suite uses a disposable regular browser profile: Chromium incognito contexts
reject Push registration with `AbortError: permission denied` even if test
notification permission is granted. The real test creates a task-review
request through the existing domain RPC and checks service-worker notification
delivery automatically after commit; it never invokes the dispatcher manually
or mocks the Push provider. The shared task-review fixture's teardown can be
blocked by immutable finance membership history in populated local databases;
do not remove that history or alter constraints to run this smoke test. It does not
establish Windows OS acceptance or simulate an OS notification click.

On Windows Chrome/Edge, complete manual acceptance:

1. In a regular tab, enable System notifications in profile settings. Accept the
   browser prompt, minimize StudioFlow, and submit a real task review from another
   account with this user as reviewer. Confirm automatic delivery and a
   Windows notification with a generic preview.
2. Click it. Confirm the existing/new StudioFlow window opens the correct task
   under the recipient's normal permissions and notification history remains.
3. Repeat with StudioFlow focused: no redundant system notification where
   supported. Disable Push and confirm delivery stops for this browser only.
4. Deny site notification permission and verify the blocked state/help. Revoke
   permission after enabling, return to the app and confirm cleanup. Enable
   again, log out, trigger another notification and confirm there is no delivery.
5. Log into a different account in the same browser: Push starts disabled.
6. Use Install StudioFlow (native Chromium prompt or browser menu). Launch the
   installed app, confirm standalone mode and adapted installation entry, then
   repeat Push delivery/click. Installation must not be required for step 1.

## Browser limits

HTTPS is required except trusted localhost development. Browser/OS notification
settings, Focus Assist/Do Not Disturb, enterprise policies and browser background
execution can prevent visible delivery. A Push provider accepting a request does
not prove that Windows displayed it. An online, authenticated cookie session is
needed for the service worker's recipient check; expired/session-only cookies or
an unavailable app API suppress display. Notifications remain in app history.

iOS/iPadOS Web Push requires a Home Screen web app on [iOS 16.4 or later](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Desktop
Safari supports Push without installation; Safari's Add to Dock requires macOS
Sonoma or later. Native Chromium installation is offered only when the browser
emits `beforeinstallprompt`; otherwise the settings entry explains installation.
Some browsers may show their own generic background-update notice when a Push
event is suppressed under `userVisibleOnly` rules.

References: [Web Push library](https://github.com/web-push-libs/web-push),
[Push subscription API](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe),
[notification clicks](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
