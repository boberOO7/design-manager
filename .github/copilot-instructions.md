- Inspect only the code relevant to the task before editing.
- Follow repository conventions and applicable AGENTS.md files.
- Make the smallest coherent change that fully solves the request.
- Preserve existing user changes and avoid unrelated modifications.
- Prefer existing architecture, types, utilities, and dependencies.
- Make in-scope local edits and run the narrowest relevant non-destructive
  validation without asking first.
- Fix validation failures caused by your changes; report unrelated failures
  separately.
- Require confirmation before destructive actions, dependency installation,
  external writes, remote database changes, or material scope expansion.
- Review the final diff for accidental, duplicated, or unrelated changes.
- Never claim validation passed unless it actually ran successfully.
- Keep the final response brief: summary, files changed, validation,
  remaining issues.