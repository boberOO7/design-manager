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

## Projects

- [X] Replace the mock Projects list with real Supabase data.
- [x] Implement a real Project details page.
- [X] Implement project creation.
- [x] Implement project editing.
- [x] Implement project archive and restore.
- [ ] Implement project-member assignment.

## Tasks and progress

- [ ] Replace mock tasks with real Supabase data.
- [ ] Implement task creation and editing.
- [ ] Implement task status updates.
- [ ] Implement project area progress recording.
- [ ] Implement project activity history.

## Team and metrics

- [ ] Replace mock Team data with real profiles and studio memberships.
- [ ] Implement employee management.
- [ ] Replace mock dashboard metrics with real calculations.
- [ ] Replace mock workload and leaderboard data.

## Production

- [ ] Add required write RLS policies.
- [ ] Add validation and error handling for mutations.
- [ ] Add automated tests for critical authorization logic.
- [ ] Configure production deployment on Vercel.
- [ ] Perform final security and usability review.
