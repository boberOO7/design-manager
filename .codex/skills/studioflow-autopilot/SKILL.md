---
name: studioflow-autopilot
description: Carry an explicitly invoked StudioFlow product, bug, or feature request through implementation, focused validation, independent review, repair, and final verification.
---

# StudioFlow Autopilot

Run only when invoked as `$studioflow-autopilot`. Treat the following request as the product objective. For long-running work, create a Codex Goal with concrete completion conditions derived from that request; mark it complete only after the requested behavior, relevant validation, review, and repairs are finished. If Goals are unavailable, report that limitation instead of inventing a substitute.

Follow the repository's `AGENTS.md` for source-of-truth, context routing, permissions, and validation. Inspect the current implementation before choosing an approach. Classify the task internally as micro/local, normal feature, or complex/cross-domain/database. Read only relevant architecture references and existing repo skills when they materially help; do not load Graphify by default. Preserve StudioFlow's established product and visual language unless the request changes it.

- **Micro/local:** Implement directly. Do not spawn investigation or writer agents unless clearly useful.
- **Normal/complex:** Keep the main thread as the primary implementation writer. Use Luna High explorers selectively; use `code_mapper` when tracing a multi-file flow. Run parallel agents only for genuinely independent investigation, and pass narrow questions instead of repeating large repository context. Delegate implementation only when isolated ownership materially helps. Keep implementation decisions in the main thread.
- **Validation:** Match checks to risk: a focused UI check and TypeScript when relevant for micro UI; focused tests for local logic; invariant and RLS checks for database changes. Broaden regression or build checks only for a concrete integration risk.

After implementation, ask the `studioflow_reviewer` agent (GPT-6 Sol High) to use `$studioflow-review` on the actual resulting diff against the original request. Pass the request, diff scope, and validation results; have the reviewer inspect the files rather than pasting large repository context. Use this same reviewer for DB, Finance, RLS, historical-integrity, and other high-risk changes. Fix confirmed findings and rerun affected checks before completing the Goal. Report a failed optional visual check as a caveat; keep the Goal open when a required acceptance check fails. An intermediate completion is not the finish line.

Ask the user only for a material unresolved product choice, approval for a destructive/remote/production action, or a blocker the repository cannot resolve. Respect normal sandbox and approval boundaries. End with a compact account of the change, checks, review outcome, and remaining caveats.
