---
type: "query"
date: "2026-09-05T15:54:27.529327+00:00"
question: "Trace Office submission comments from database schema and RLS through server mutation and client drawer Realtime synchronization"
contributor: "graphify"
outcome: "useful"
source_nodes: ["submission_comments", "addSubmissionComment", "SubmissionDetailDrawer"]
---

# Q: Trace Office submission comments from database schema and RLS through server mutation and client drawer Realtime synchronization

## Answer

Expanded from repository vocabulary via submission, comment, request, drawer, supabase, realtime, channel, postgres, publication, and policy. Direct inspection confirmed public.submission_comments, private.can_access_submission-backed SELECT RLS, addSubmissionComment, and SubmissionDetailDrawer as the owning path. Added request-filtered INSERT subscription and local publication migration.

## Outcome

- Signal: useful

## Source Nodes

- submission_comments
- addSubmissionComment
- SubmissionDetailDrawer