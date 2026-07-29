# StudioFlow roadmap

## Foundation

- [X] Create Next.js application structure.
- [X] Create the initial UI with mock business data.
- [X] Configure Supabase browser and server clients.
- [X] Create and apply the initial database schema.
- [X] Enable read-only RLS policies.
- [X] Implement real Supabase password login.
- [X] Implement SSR session refresh and protected app routes.
- [X] Implement sign out.
- [X] Load the real authenticated Profile in the application shell.
- [X] Verify and fix consistent Profile and admin-role checks on Dashboard and Administration.
- [ ] Complete the UI foundation milestone: compact shared primitives, accessible mobile navigation, and tokenized visual conventions.
- [ ] Complete accessibility and interaction consistency pass.
- [ ] Complete the Dashboard presentation milestone: priority-led hierarchy and compact operational density.

## Projects

- [X] Replace the mock Projects list with real Supabase data.
- [x] Implement a real Project details page.
- [X] Implement project creation.
- [x] Implement project editing.
- [x] Implement project archive and restore.
- [x] Implement project-member assignment.
- [ ] Complete the Projects presentation milestone: operational desktop list and responsive project cards.

## Tasks and progress

- [ ] Replace mock tasks with real Supabase data.
- [ ] Implement task creation and editing.
- [ ] Implement task status updates.
- [ ] Implement project area progress recording.
- [ ] Implement project activity history.
- [ ] Deliver the project-scoped Activity History vertical slice (migration pending deployment).
- [ ] Implement task-derived project progress and operational health.
- [ ] Implement controlled project lifecycle workflow.

## Team and metrics

- [X] Replace mock Team data with real profiles and studio memberships.
- [X] Implement admin-only employee invitation and password onboarding.
- [ ] Implement employee editing and membership deactivation/reactivation.
- [ ] Replace mock dashboard metrics with real calculations.
- [ ] Replace mock workload and leaderboard data.

## Administration

- [X] Replace the mock Administration page with the real admin action queue.

## Notifications

- [ ] Deliver persistent in-app Notifications with event-driven delivery.

## Calendar

- [x] Deliver the role-aware Calendar milestone (Month, Week, Agenda, events,
  live deadlines, and privacy-safe time off).
- [x] Apply shared semantic status styling and named privacy-safe coworker availability.
- [x] Complete Phase 3E Calendar mobile polish: responsive controls, compact
  Month and Agenda presentation, intentional Week scrolling, and mobile-ready
  drawers.

## Production

- [ ] Add required write RLS policies.
- [ ] Add validation and error handling for mutations.
- [ ] Add automated tests for critical authorization logic.
- [ ] Configure production deployment on Vercel.
- [ ] Perform final security and usability review.
