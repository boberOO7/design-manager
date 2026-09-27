---
name: studioflow-review
description: Review a StudioFlow diff for meaningful behavior, regression, data integrity, UX, validation, and scope issues when explicitly requested or delegated by autopilot.
---

# StudioFlow Review

When invoked on the main thread, delegate the review to the `studioflow_reviewer` agent (GPT-6 Sol High), including for DB, Finance, RLS, historical-integrity, and other high-risk changes. Give it the original request, diff scope, and relevant validation results. Do not paste large repository context. If already running as `studioflow_reviewer`, perform the review directly without further delegation.

Independently inspect the actual resulting diff, including untracked files when relevant, and enough surrounding implementation to assess the requested behavior. Use the original request and `AGENTS.md` as the review contract. Follow its context routing; read relevant migrations or tests when data, permissions, or historical behavior is affected. Do not load unrelated skills, architecture references, or Graphify by default.

Report only actionable issues: incorrect requested behavior, regressions or edge cases, data integrity/RLS/historical correctness, visible UX inconsistency in the affected flow, missing focused validation for a material risk, or unnecessary scope and complexity. Do not suggest generic style changes, broad cleanup, architecture audits, documentation refreshes, or unrelated improvements.

Return findings to the main agent, ordered by severity. For each, cite a concrete file and behavior, explain the failure condition and impact, and distinguish evidence from inference. If no meaningful findings exist, say so clearly. Review only; leave repair to the implementing agent unless the user separately asks for fixes.
