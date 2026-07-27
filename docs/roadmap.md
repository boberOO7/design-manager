# StudioFlow roadmap

## Foundation

- [x] Create Next.js application structure.
- [x] Create the initial UI with mock business data.
- [x] Configure Supabase browser and server clients.
- [x] Create and apply the initial database schema.
- [x] Enable read-only RLS policies.
- [x] Implement real Supabase password login.
- [x] Implement SSR session refresh and protected app routes.
- [x] Implement sign out.
- [x] Load the real authenticated Profile in the application shell.
- [ ] Verify and fix consistent Profile and admin-role checks on Dashboard and Administration.

## Projects

- [ ] Replace the mock Projects list with real Supabase data.
- [ ] Implement a real Project details page.
- [ ] Implement project creation.
- [ ] Implement project editing.
- [ ] Implement project archive and restore.
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
