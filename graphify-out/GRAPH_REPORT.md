# Graph Report - .  (2026-09-22)

## Corpus Check
- Scoped Business Trips refresh: 19 changed TypeScript files, 2 architecture documents, and 5 new migrations. Unrelated graph coverage preserved.

## Summary
- 9569 nodes · 20538 edges · 739 communities (528 shown, 211 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 197 edges (avg confidence: 0.65)
- Token cost: structural extraction/clustering used no LLM calls; semantic extraction used the host agent, whose token counts were not exposed.

## Incremental integrity
- No dangling or missing endpoints after merge.
- Two self-reference diagnostics: one pre-existing edge and the explicit trip-entry self foreign key for plans/corrections. The undirected graph collapses reciprocal relations by design.
- All 202 pre-existing Finance/overview architecture concepts preserved.

## Graph Freshness
- Built from commit: `de248f61`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Finance
- live-browser.js
- queries/finance.ts
- checks.mjs
- leads-workspace.tsx
- schedules-workspace.tsx
- task.ts
- context.mjs
- button.tsx
- Database
- svelte-component.mjs
- connectSSE
- project-task-board.tsx
- live-server.mjs
- project-value-builder.tsx
- injected/index.mjs
- cn
- design-system.mjs
- modern-screenshot.umd.js
- detect-text.mjs
- setLiveState
- task-details-drawer.tsx
- project.ts
- page
- hook-before-edit.mjs
- hook-lib.mjs
- overview-summaries.integration.test.ts
- database.types.ts
- el
- lib/calendar.ts
- equipment-workspace.tsx
- schedules/actions.ts
- concept-seed.mjs
- detect-antipatterns-browser.js
- getActiveStudioMembership
- productivity.ts
- submissions-workspace.tsx
- queries/crm.ts
- [projectId]/page.tsx
- queries/index.ts
- live-commit-manual-edits.mjs
- queries/calendar.ts
- team/actions.ts
- detect-html.mjs
- impeccable-config.mjs
- equipment/actions.ts
- createClient
- live-accept.mjs
- lib/finance.ts
- calendar-workspace.tsx
- finance_trip_entries
- hook-admin.mjs
- parseAnyColor
- live-wrap.mjs
- queries/dashboard.ts
- slide_search_core.py
- session-store.mjs
- layout.md
- equipment-catalog/sync.ts
- manual-apply.mjs
- detect-antipatterns.mjs
- doctor.mjs
- design-parser.mjs
- initPageChat
- live-poll.mjs
- Brand Guidelines v1.0
- scanCssTextForPulsingDot
- bootstrap-studio.ts
- contractor-directory.tsx
- buffer
- dialog.tsx
- Studio Operations architecture
- types/tasks.ts
- parseAnyColor
- init
- spacing
- impeccable/SKILL.md
- google-calendar/sync.ts
- floor-plan-view.tsx
- queries/equipment.ts
- live.md
- live-copy-edit-agent.mjs
- Typography Specifications
- Management Overview
- lib/project-lifecycle.ts
- server.ts
- lib/project-progress.ts
- domain-messages.tsx
- Logo Usage Rules
- Component Specifications
- compilerOptions
- calendar-event-form.ts
- applyEditing
- html-token-validator.py
- roots.mjs
- DesignSystemGenerator
- 20260719221450_initial_schema.sql
- radius
- critique-storage.mjs
- Asset Approval Checklist
- Responsive Design
- checkHtmlPatterns
- handleManualEditActivity
- manual-edit-routes.mjs
- event-validation.mjs
- types/calendar.ts
- task-payload.integration.test.ts
- lib/crm.ts
- user-avatar.tsx
- Color Palette Management
- States and Variants
- collectBrowserFindings
- impeccable-paths.mjs
- live-manual-edit-evidence.mjs
- What You Must Do When Invoked
- devDependencies
- insert-ui.mjs
- svelte-ast.mjs
- project-activity-section.tsx
- Design System
- onboard.md
- design_system.py
- dependencies
- notification-bell.tsx
- live.mjs
- collectVisualContrastCandidates
- Historical opening valuation
- google-calendar/diagnostics.ts
- theme-switch.tsx
- notification-presentation.ts
- GSAP Core
- Operate mode depth (and Read notes)
- The Toolkit
- detect-url.mjs
- onAnnotDown
- app-header.tsx
- task-status.ts
- set-password/actions.ts
- city-provider.ts
- generate-slide.py
- fontSize
- resolveLengthPx
- showToast
- validation/crm.ts
- accept-css.mjs
- live-inject.mjs
- createAdminClient
- 20260917141123_finance_compensation_recurring.sql
- Asset Organization Guide
- gray
- resolveLiveInjectionAnchor
- color
- tanstack-adapter.mjs
- BM25
- finance_expected_items
- StudioFlow architecture overview
- Permissions
- contractors/actions.ts
- Brand Consistency Checklist
- Color Semantics
- fetch-background.py
- sveltekit-adapter.mjs
- Supabase
- 20260917182151_finance_automatic_schedule_occurrences.sql
- isCardLike
- crm/actions.ts
- Changelog
- semantic-styles.ts
- animate.md
- Handle `generate`
- context-signals.mjs
- checkQuality
- constants.mjs
- serve-question.mjs
- Changelog
- Writing Guidelines for Postgres References
- calculate_finance_forecast
- administration-workspace.tsx
- 20260904120000_internal_submissions.sql
- 20260916233308_finance_expected_settlement.sql
- Generate Report
- generate-image.mjs
- detect-utils.mjs
- frameworks/index.mjs
- tag-strategy.mjs
- Copywriting Formulas
- core.py
- finance_project_items
- 20260917114733_finance_project_agreements.sql
- Messaging Framework
- Brand Voice Framework
- extract-colors.cjs
- validate-asset.cjs
- Tailwind Integration
- Impeccable Asset Producer
- optimize.md
- Layout Patterns
- equipment-catalog.ts
- 20260730120100_task_progress_checklists.sql
- 20260916200241_finance_foundation.sql
- finance-project-hardening.spec.ts
- brand/references/update.md
- Token Architecture
- design-tokens-starter.json
- GSAP with React
- Scan mode (approach C: auto-extract, then confirm descriptive language)
- sampleCssBackground
- StaticElement
- pin.mjs
- [eventId]/route.ts
- 20260813143000_per_task_studio_member_removal.sql
- calendar-projects-presentation.spec.ts
- Primitive Tokens
- card
- GSAP Performance
- GSAP Timeline
- Simplify the Design
- Hardening Dimensions
- ui-core.mjs
- journal.mjs
- Immutable forecast snapshots
- calendar-event-types.ts
- getActiveTaskDeadline
- google-calendar-automatic-sync.test.ts
- 20260728153858_calendar_foundation.sql
- 20260903122126_stage_four_operational_independence.sql
- 20260910221602_equipment_maintenance.sql
- 20260920131009_finance_payroll_hardening.sql
- finance-projects.spec.ts
- Core Visual Elements
- inject-brand-context.cjs
- embed-tokens.cjs
- clarify.md
- critique.md
- Nielsen's 10 Heuristics
- Generate Combined Critique Report
- New visual work
- polish.md
- quieter.md
- detect-csp.mjs
- embed-prompt.mjs
- renderGroupedTemplate
- generation-preflight.mjs
- palette.mjs
- Quick Reference
- project-form.contract.test.ts
- google-calendar-integration.test.ts
- candidates-workspace.tsx
- 20260819110000_calendar_event_invitations.sql
- 20260904135441_office_assignments.sql
- 20260916221929_finance_actual_movements.sql
- Brand
- Component Tokens
- generate-tokens.cjs
- button
- primitive
- CORE DIRECTIVE: AWWWARDS-LEVEL DESIGN ENGINEERING
- Init flow
- staleness-notice.mjs
- board-collapse.spec.ts
- Slide Strategies
- Section Definitions
- Tasks
- scripts
- legal-document.tsx
- equipment-workspace.test.ts
- 20260728214907_in_app_notifications.sql
- 20260818170000_project_stage_columns_and_internal_review.sql
- 20260827120000_task_collaborators.sql
- 20260908144506_create_crm_foundation.sql
- 20260920121044_finance_opening_valuation.sql
- finance-foundation.spec.ts
- finance-overview.spec.ts
- sync-brand-to-tokens.cjs
- _run
- Common Cognitive Load Violations
- Shape
- Prerequisites
- graphify reference: extra exports and benchmark
- equipment-form.spec.ts
- app-shell.test.ts
- [requestId]/route.ts
- time-off-stabilization-migration.test.ts
- 20260825150000_project_stage_configuration.sql
- 20260829170000_add_business_trip_participants.sql
- 20260910193120_equipment_domain_foundation.sql
- 20260917170558_finance_budget_forecast.sql
- 20260920170000_finance_serialized_capture.sql
- test_core.py
- forgot-password/actions.ts
- StudioFlow
- input
- Persona-Based Design Testing
- doctor.md
- Extract Flow
- template-extensions.mjs
- search
- ui-ux-pro-max
- 20260920211341_finance_recurring_groups.sql
- Productivity and progress
- StudioFlow product specification
- StudioFlow
- app-sidebar.tsx
- confirm/route.ts
- ukrainian-phone.ts
- 20260728145920_project_lifecycle_workflow.sql
- 20260728171129_calendar_event_and_time_off_fixes.sql
- 20260729200758_project_activity_history.sql
- 20260805212420_structured_project_metadata.sql
- 20260821130000_project_templates.sql
- 20260902140546_google_calendar_automatic_reconciliation.sql
- 20260910112451_review_note_privacy.sql
- 20260912124803_equipment_reference_catalog.sql
- 20260913214647_add_crm_follow_up_state.sql
- archive/page.tsx
- Generate Report
- Cognitive Load Assessment
- Impeccable Manual Edit Applier
- checkTextOcclusionDOM
- HTML Slide Template
- detect_domain
- How to Use This Skill
- events/route.test.ts
- office-workspace.test.ts
- task-stage-assignment.test.ts
- 20260730120000_productivity_attribution.sql
- 20260802192102_studio_checklist_templates.sql
- 20260813120000_studio_member_lifecycle.sql
- 20260817172631_leaderboard_bonus_rules.sql
- 20260821100000_stage_progress_methods.sql
- 20260830130000_google_calendar_phase_one.sql
- Diagnostic Scan
- bolder.md
- normalizeGitHubEvent
- Slides
- Supabase Postgres Best Practices
- Pre-Delivery Checklist
- graphify reference: query, path, explain
- Equipment reference catalog
- Core workflows
- leads-workspace.test.ts
- finance-project-builder.spec.ts
- crm-lead-lifecycle-migration.test.ts
- 20260817143113_time_off_multi_admin_approvals.sql
- 20260825103801_stage_productivity_accounting.sql
- 20260907195437_allow_admin_task_completion_date_edit.sql
- 20260909104850_add_crm_lead_lifecycle_behavior.sql
- 20260912151329_canonical_equipment_catalog_storage.sql
- vercel.json
- Brand Guidelines Template
- finance-project-visual.spec.ts
- inline-ignores.mjs
- time-picker.tsx
- readConfig
- Common Rules for Professional UI
- Example Workflow
- Q: Trace Office submission comments from database schema and RLS through server mutation and client drawer Realtime synchronization
- Q: Fix the leaderboard previous period leader calculation.
- Q: Investigate and fix the stale-session/auth-resume failure after StudioFlow is left open
- Q: Which modules own the Finance information architecture, Accounts configuration, and Movements ledger UX?
- package.json
- legal-pages.test.ts
- theme-switch.test.ts
- floor-plan-view.test.ts
- project-code-visibility.test.ts
- project-template-stage-dialog.test.ts
- notification-insert-shape-migration.test.ts
- 20260727172225_tasks_board_vertical_slice.sql
- 20260730141740_fix_task_progress_checklist_workflow.sql
- 20260818120000_add_contractor_category_colors.sql
- 20260829160000_add_site_visit_assignee.sql
- 20260829180000_add_meeting_presentation_mode.sql
- 20260902180000_add_task_milestone_deadlines.sql
- 20260904173557_submission_operational_inbox.sql
- 20260909113540_link_crm_leads_to_projects.sql
- 20260912000918_polish_equipment_identity.sql
- finance-visual-audit.spec.ts
- task-payload.spec.ts
- finance_project_terms
- Heuristics Scoring Guide
- detect.mjs
- hook.mjs
- validate_data.py
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- calendar/page.tsx
- contractor-permissions.contract.test.ts
- stage-configuration-controls.test.ts
- task-details-drawer.test.ts
- task-drawer-reopen.test.ts
- finance-opening-valuation.spec.ts
- auth-autocomplete.test.ts
- crm-lead-follow-up-migration.test.ts
- crm-lead-metadata-migration.test.ts
- project-city-geonames-mutation.test.ts
- public-table-privileges-migration.test.ts
- 20260727202322_task_details_editing.sql
- 20260806175022_add_project_city_geonames_id.sql
- 20260818130000_refine_contractor_category_colors.sql
- 20260818140000_add_contractor_subcategories.sql
- 20260818160000_add_task_stages.sql
- 20260818180000_canonical_project_types.sql
- 20260821140000_project_template_defaults.sql
- 20260827123000_add_team_member_dates.sql
- 20260828150000_link_work_makeup_to_day_off.sql
- 20260910120551_task_deadline_completion_history.sql
- 20260913164707_add_office_floor_plan_layout.sql
- 20260914100625_align_crm_candidate_and_lead_invariants.sql
- 20260917142641_finance_schedule_lifecycle_guards.sql
- 20260917171353_finance_forecast_capture_boundary.sql
- test_sync_brand_to_tokens.py
- main
- checkRadialSpotlight
- source-lock.mjs
- [dayOffId]/route.ts
- project-form.spec.ts
- Project value and payment schedule builder
- checkCreamPalette
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- project-routes.localization.test.ts
- candidates-workspace.test.ts
- app-layout.tsx
- assignments-workspace.test.ts
- studio-member-lifecycle-controls.contract.test.ts
- studio-member-profile-editor.contract.test.ts
- pause-operational-scope.test.ts
- task-collaborators-query.test.ts
- avatar-storage-migration.test.ts
- calendar-migration.test.ts
- canonical-project-types-migration.test.ts
- crm-consistency-migration.test.ts
- crm-lead-project-conversion-migration.test.ts
- office-assignments-migration.test.ts
- office-floor-plan-migration.test.ts
- productivity-migration.test.ts
- submission-comment-realtime-migration.test.ts
- submission-operational-inbox-migration.test.ts
- task-collaborators-migration.test.ts
- task-progress-migration.test.ts
- time-off-approval-migration.test.ts
- 20260812210630_profile_location.sql
- 20260814120100_add_contractors.sql
- 20260818150000_allow_active_members_to_update_contractors.sql
- 20260821150000_harden_project_template_defaults.sql
- 20260824110000_calendar_event_recurrence.sql
- 20260826100000_leaderboard_employee_visibility.sql
- 20260826120000_task_status_derived_progress.sql
- 20260905205045_add_submission_request_categories.sql
- 20260911105717_workstation_number_bulk_creation.sql
- 20260912163544_safe_catalog_sync_completion.sql
- 20260914002804_realtime_notification_presentation.sql
- 20260915154619_clamp_project_task_completion_dates.sql
- create.md
- advanced-full-text-search.md
- advanced-jsonb-indexing.md
- conn-idle-timeout.md
- conn-limits.md
- conn-pooling.md
- conn-prepared-statements.md
- data-batch-inserts.md
- data-n-plus-one.md
- data-pagination.md
- data-upsert.md
- lock-advisory.md
- lock-deadlock-prevention.md
- lock-short-transactions.md
- lock-skip-locked.md
- monitor-explain-analyze.md
- monitor-pg-stat-statements.md
- monitor-vacuum-analyze.md
- query-composite-indexes.md
- query-covering-indexes.md
- query-index-types.md
- query-missing-indexes.md
- query-partial-indexes.md
- schema-constraints.md
- schema-data-types.md
- schema-foreign-key-indexes.md
- schema-lowercase-identifiers.md
- schema-partitioning.md
- schema-primary-keys.md
- security-privileges.md
- security-rls-basics.md
- security-rls-performance.md
- _template.md
- @clack/prompts
- extraction-spec.md
- eslint.config.mjs
- next.config.ts
- next-intl
- @radix-ui/react-popover
- @radix-ui/react-slot
- react-hook-form
- saxes
- zod
- playwright.config.ts
- postcss.config.mjs
- access-unavailable.contract.test.ts
- archive/page.test.ts
- calendar/page.test.ts
- crm-actions.test.ts
- crm-route-authorization.test.ts
- leaderboard/page.test.ts
- task-actions.test.ts
- team-directory-presentation.test.ts
- login/page.test.ts
- administration-workspace.test.ts
- checklist-template-manager.test.ts
- avatar-crop-step.contract.test.ts
- language-selector.test.ts
- notification-bell.test.ts
- profile-avatar-editor.contract.test.ts
- leaderboard-bonus-menu.contract.test.ts
- project-lifecycle-controls.test.ts
- project-template-manager.test.ts
- submissions-workspace.test.ts
- add-task-dialog.test.ts
- project-task-board.test.ts
- team-member-card.contract.test.ts
- date-picker.contract.test.ts
- dialog.test.ts
- task-status.test.ts
- active-studio-membership.contract.test.ts
- leaderboard-productivity-query.test.ts
- bulk-task-status-unassigned-migration.test.ts
- calendar-attendee-update-contract.test.ts
- calendar-completed-projects-migration.test.ts
- calendar-event-semantic-types-migration.test.ts
- calendar-event-type-canonicalization-migration.test.ts
- calendar-fixes-migration.test.ts
- calendar-general-self-invite-migration.test.ts
- calendar-interview-migration.test.ts
- calendar-meeting-presentation-migration.test.ts
- contractor-category-management-migration.test.ts
- contractor-subcategories-migration.test.ts
- contractor-update-permissions-migration.test.ts
- equipment-domain-migration.test.ts
- equipment-identity-polish-migration.test.ts
- equipment-inventory-migration.test.ts
- equipment-maintenance-migration.test.ts
- finance-foundation-migration.test.ts
- finance-movements-migration.test.ts
- internal-submissions-migration.test.ts
- leaderboard-visibility-migration.test.ts
- notification-localization-migration.test.ts
- notifications-migration.test.ts
- operational-autocomplete.test.ts
- productivity-stage-accounting-migration.test.ts
- profile-birthday-migration.test.ts
- profile-details-migration.test.ts
- profile-location-migration.test.ts
- profile-start-date-migration.test.ts
- project-activity-migration.test.ts
- project-city-geonames-migration.test.ts
- project-completion-date-migration.test.ts
- project-member-removal-migration.test.ts
- project-stage-configuration-migration.test.ts
- project-task-completion-clamp-migration.test.ts
- project-template-defaults-migration.test.ts
- project-template-hardening-migration.test.ts
- project-template-stage-application-migration.test.ts
- project-template-task-priority-migration.test.ts
- project-templates-migration.test.ts
- realtime-notification-migration.test.ts
- selected-task-bulk-actions-migration.test.ts
- stage-four-operational-independence-migration.test.ts
- stage-progress-migration.test.ts
- structured-project-metadata-migration.test.ts
- studio-checklist-template-migration.test.ts
- studio-member-removal-migration.test.ts
- submission-request-categories-migration.test.ts
- proxy.test.ts
- task-checklist-template-migration.test.ts
- task-completion-date-migration.test.ts
- task-deadlines-migration.test.ts
- task-status-progress-migration.test.ts
- task-unassigned-migration.test.ts
- team-member-profile-migration.test.ts
- time-off-approval-notification-read-state-migration.test.ts
- time-off-review-note-privacy-migration.test.ts
- unassigned-area-task-completion-migration.test.ts
- unassigned-stage-productivity-completion-migration.test.ts
- 20260803223000_add_project_location_metadata.sql
- 20260818173000_default_all_project_stage_columns.sql
- 20260830120000_add_studio_days_off.sql
- 20260908165338_normalize_crm_lead_project_metadata.sql
- 20260908171623_tighten_crm_lead_project_type_constraint.sql
- 20260909204000_extend_crm_lead_budget_currencies.sql
- 20260911125015_equipment_pc_configuration_schema.sql
- 20260911222001_equipment_inventory_default.sql
- 20260913172714_validate_office_floor_plan_display_metadata.sql
- 20260913181519_refine_computer_configuration.sql
- 20260913220044_sync_crm_follow_up_on_status_change.sql
- 20260917134044_finance_actionable_unapplied.sql
- Untitled query 526.sql
- Project Finance independent of production lifecycle
- Keep this as an advance for later matching
- Advances and unresolved credits
- Залишити як аванс для подальшого пов’язування
- Аванси й нерозподілені переплати
- WRITABLE_TASK_STATUS_VALUES

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 189 edges
2. `Finance` - 156 edges
3. `Database` - 108 edges
4. `cn()` - 106 edges
5. `getActiveStudioAdmin()` - 86 edges
6. `getActiveStudioMembership` - 79 edges
7. `Database` - 62 edges
8. `Button` - 57 edges
9. `el()` - 51 edges
10. `runHook()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `PayrollSetup()` --implements--> `Team payroll setup`  [INFERRED]
  src/components/finance/payroll-setup.tsx → docs/architecture/finance.md
- `ProjectFinanceWorkspace()` --implements--> `Project financial summary and payment presentation`  [INFERRED]
  src/components/finance/project-finance-workspace.tsx → docs/architecture/finance.md
- `ProjectValueBuilder()` --implements--> `Project value and payment schedule builder`  [INFERRED]
  src/components/finance/project-value-builder.tsx → docs/architecture/finance.md
- `projectPlanSchema` --implements--> `Project value and payment schedule builder`  [INFERRED]
  src/lib/finance-project-plan.ts → docs/architecture/finance.md
- `public.workstation_type` --implements--> `Workstations`  [EXTRACTED]
  supabase/migrations/20260911221152_equipment_inventory_identity.sql → docs/architecture/studio-operations.md

## Import Cycles
- 3-file cycle: `src/lib/task-deadlines.ts -> src/lib/task-workflow.ts -> src/types/tasks.ts -> src/lib/task-deadlines.ts`
- 3-file cycle: `src/lib/calendar-recurrence.ts -> src/lib/calendar.ts -> src/types/calendar.ts -> src/lib/calendar-recurrence.ts`

## Communities (739 total, 211 thin omitted)

### Community -1 - "Finance"
Cohesion: 0.03
Nodes (76): /finance, /finance/categories, /finance/expected, /finance/movements, /finance/schedules, agreed, Amount-free payroll reminders, category_id (+68 more)

### Community 0 - "live-browser.js"
Cohesion: 0.03
Nodes (119): applyGlobalBarLabelState(), applyPlaceholderSizingStyles(), averageRgb01(), bindEditBadgeProxy(), bufferToBase64(), buildCollapsible(), buildColorModels(), buildDesignHeader() (+111 more)

### Community 1 - "queries/finance.ts"
Cohesion: 0.04
Nodes (80): Project financial summary and payment presentation, FinancePage(), FinanceCategoriesPage(), FinanceExpectedPage(), FinanceMovementsPage(), FinancePage(), FinanceCashPlanningPage(), FinanceSchedulesPage() (+72 more)

### Community 2 - "checks.mjs"
Cohesion: 0.04
Nodes (106): borderColorsFromStyle(), borderWidthsFromStyle(), checkClippedOverflow(), checkEdgeFlushCardsDOM(), checkElementBlinkingCursorDOM(), checkElementClippedOverflow(), checkElementClippedOverflowDOM(), checkElementGptBorderShadow() (+98 more)

### Community 3 - "leads-workspace.tsx"
Cohesion: 0.12
Nodes (22): CandidateSourceField(), NotesField(), formatDate(), getCurrencySymbol(), LeadDetail(), LeadFormFields(), HistoryPanel(), LazyProjectForm (+14 more)

### Community 4 - "schedules-workspace.tsx"
Cohesion: 0.05
Nodes (64): react, react, saveFinancePlanning(), mocks, Props, Editor, ManagedCategory, FinanceCategoryEditor() (+56 more)

### Community 5 - "task.ts"
Cohesion: 0.05
Nodes (66): DELETE(), PATCH(), POST(), PATCH(), PATCH(), PATCH(), PATCH(), createProjectTask() (+58 more)

### Community 6 - "context.mjs"
Cohesion: 0.05
Nodes (95): appendAutonomyCounterDirective(), appendDetectorFallback(), appendImageGenDirective(), appendImageToolsDirective(), appendStalenessDirective(), appendSubagentAuthorizationDirective(), appendSurfaceBriefContext(), automaticHookMode() (+87 more)

### Community 7 - "button.tsx"
Cohesion: 0.05
Nodes (49): ProjectMemberActionState, updateStudioMemberProfile(), TeamPage(), LoginPage(), LeaderboardBonusSettings(), AvatarCropStep(), ImageDimensions, loadImageDimensions() (+41 more)

### Community 8 - "Database"
Cohesion: 0.03
Nodes (83): anon, apply_project_template_stage, Atomic guarded RPCs, authenticated, avatars, budget_note, bulk_assign_selected_project_tasks, bulk_move_project_tasks (+75 more)

### Community 9 - "svelte-component.mjs"
Cohesion: 0.08
Nodes (55): collectUnusedSelectors(), verifyAcceptedSource(), applyLegacyDeferredAcceptsOnStartup(), buildPropsScriptV2(), loadSvelteCompiler(), appendCssToSvelteStyle(), appendSanitizedCssRule(), applyDeferredSvelteComponentAccepts() (+47 more)

### Community 10 - "connectSSE"
Cohesion: 0.06
Nodes (76): applyParamDefaults(), applyParamValue(), applyPlaceholderDimensions(), applySavedSessionMeta(), buildInsertPlaceholderSnapshotFromDom(), checkpointPayload(), clampVariantIndex(), clearHandled() (+68 more)

### Community 11 - "project-task-board.tsx"
Cohesion: 0.06
Nodes (54): AddTaskDialog, AddTaskDialogHandle, BoardColumn(), BulkAssignmentScope, BulkColumnDragHandle(), BulkDragSource, BulkTaskContextMenu(), DraggableTaskCard() (+46 more)

### Community 12 - "live-server.mjs"
Cohesion: 0.06
Nodes (64): assembleLiveBrowserScript(), assertLiveBrowserScriptParts(), LIVE_BROWSER_SCRIPT_PARTS, readLiveBrowserScriptParts(), resolveLiveBrowserScriptParts(), eventPriority(), selectAvailablePendingEvent(), acknowledgePendingEvent() (+56 more)

### Community 13 - "project-value-builder.tsx"
Cohesion: 0.08
Nodes (39): getProjectReferenceRate(), saveFinanceProject(), mocks, saveFinanceTrip(), input, mocks, decimalText(), PaymentRow() (+31 more)

### Community 14 - "injected/index.mjs"
Cohesion: 0.06
Nodes (68): addBrowserFindings(), addVisualContrastFindings(), addVisualContrastResult(), analyzeVisualContrast(), analyzeVisualContrastCandidate(), blendRgba(), browserColorsClose(), browserDesignSystemConfig() (+60 more)

### Community 15 - "cn"
Cohesion: 0.05
Nodes (47): Admin(), Availability(), DashboardPage(), Deadlines(), Employee(), mocks, SpaceLogoFull(), DashboardSection() (+39 more)

### Community 16 - "design-system.mjs"
Cohesion: 0.07
Nodes (65): addClampEndpoints(), addColorObject(), addDesignColor(), addFontSizeStep(), addRoundedScale(), addRoundedToken(), addSidecarColors(), addSidecarRadii() (+57 more)

### Community 17 - "modern-screenshot.umd.js"
Cohesion: 0.07
Nodes (63): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+55 more)

### Community 18 - "detect-text.mjs"
Cohesion: 0.10
Nodes (36): blankCssComments(), BLOCK_BRACE_PREFIX_KEYWORDS, CSS_IN_JS_EXTENSIONS, detectText(), extFromFilePath(), extractCSSinJS(), extractStyleBlocks(), findCSSinJSTemplates() (+28 more)

### Community 19 - "setLiveState"
Cohesion: 0.09
Nodes (61): buildPickedAnchorSnapshot(), cancelEditing(), cancelEditingToPicking(), cancelInsertConfigure(), clearAnnotations(), clearInsertPicking(), closeTunePopover(), cursorForInsertAxis() (+53 more)

### Community 20 - "task-details-drawer.tsx"
Cohesion: 0.06
Nodes (47): ChecklistTemplateManager(), createStage(), Draft, SortableStageRow(), stageKeyboardSensor, stagePointerSensor, stageSensors, TemplateEditor() (+39 more)

### Community 21 - "project.ts"
Cohesion: 0.05
Nodes (69): createProject(), createProjectFromLead(), createProjectRecord(), getSelectedTemplateId(), getStageAssignees(), ProjectTemplatesPage(), Field(), ProjectFormModal() (+61 more)

### Community 22 - "page"
Cohesion: 0.06
Nodes (31): page, actors, bank, client, complete(), local, login(), salary() (+23 more)

### Community 23 - "hook-before-edit.mjs"
Cohesion: 0.09
Nodes (59): allow(), bumpCursorDenial(), cursorBlockMessage(), deny(), detectProposedHtml(), done(), escapeRegExp(), findingSignature() (+51 more)

### Community 24 - "hook-lib.mjs"
Cohesion: 0.06
Nodes (58): ACK_EXTS, ADVISORY_RULES, applyConfigSource(), applyDetectorConfigSource(), canonicalPath(), canonicalPathCache, clampByte(), cleanIgnoreValueDisplay() (+50 more)

### Community 25 - "overview-summaries.integration.test.ts"
Cohesion: 0.07
Nodes (38): kyivToday(), OfficeAssignmentsPage(), OfficeOverviewPage(), AssignmentDetailDrawer(), AssignmentRow(), statusStyle(), AssignmentRow, getOfficeAssignmentsData() (+30 more)

### Community 26 - "database.types.ts"
Cohesion: 0.06
Nodes (28): updateSession(), config, proxy(), CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema (+20 more)

### Community 27 - "el"
Cohesion: 0.07
Nodes (57): measureHiddenTextDOM(), measureHiddenTextDOM(), actionLabel(), applyConfigureBarChrome(), bindConfigureCountPillTooltip(), bindConfigureInlineControlHover(), bindConfigureModifierPillHover(), buildConfigureActionControl() (+49 more)

### Community 28 - "lib/calendar.ts"
Cohesion: 0.06
Nodes (62): AgendaView(), MonthView(), WeekView(), CalendarEventRelevance, calendarItemTimestamp(), CalendarTimeOffTitleLabels, canAttendCalendarEvent(), compareCanonical() (+54 more)

### Community 29 - "equipment-workspace.tsx"
Cohesion: 0.05
Nodes (70): EquipmentFormFields(), configurationLabels(), CreateEquipmentDialog(), CreateKind, CreateWorkstationDialog(), EquipmentAttachPicker(), EquipmentDrawer(), EquipmentGroup() (+62 more)

### Community 30 - "schedules/actions.ts"
Cohesion: 0.19
Nodes (16): Recurring payment groups, moveFinanceRules(), saveFinanceGroup(), saveFinanceSchedule(), saveInitialPayroll(), mocks, employeeBonusSchema, financeScheduleError() (+8 more)

### Community 31 - "concept-seed.mjs"
Cohesion: 0.08
Nodes (48): API_BASE, API_TIMEOUT_MS, apiBudgetMs(), dealCompositions(), driveSelection(), fetchRoll(), here, loadLocal() (+40 more)

### Community 32 - "detect-antipatterns-browser.js"
Cohesion: 0.05
Nodes (58): browserColorsClose(), browserDesignSystemConfig(), browserHasDirectText(), browserPrimaryFont(), browserRadiusTokens(), browserSampleText(), buildSelectorSegment(), checkBrowserDesignSystemSources() (+50 more)

### Community 33 - "getActiveStudioMembership"
Cohesion: 0.06
Nodes (41): isDateOnly(), isRecord(), parseDayOff(), POST(), PATCH(), PATCH(), POST(), CrmLayout() (+33 more)

### Community 34 - "productivity.ts"
Cohesion: 0.10
Nodes (37): BonusBadge(), formatArea(), LeaderboardPage(), LeaderboardBonusMenu(), LeaderboardPeriodSwitcher(), getCurrentUserProfile, getLeaderboardForPeriod(), getLeaderboardOverviewData() (+29 more)

### Community 35 - "submissions-workspace.tsx"
Cohesion: 0.04
Nodes (63): OfficeSubmissionsPage(), AssignmentAdminControls(), AssignmentsWorkspace(), AssignmentWorkflowAction(), CreateAssignmentDialog(), Filter, initialCreateState, officeWorkflowStyles (+55 more)

### Community 36 - "queries/crm.ts"
Cohesion: 0.08
Nodes (31): loadCandidateCycles(), loadLeadHistory(), CrmCandidatesPage(), CrmLeadsPage(), EmptyState(), accounts, clients, measure() (+23 more)

### Community 37 - "[projectId]/page.tsx"
Cohesion: 0.05
Nodes (59): ProjectsPage(), getProjectView(), getProjectViewHref(), ProjectDetailsPage(), ProjectPageSearchParams, ProjectView, ProjectCompletionDateForm(), ProjectCreationModal() (+51 more)

### Community 38 - "queries/index.ts"
Cohesion: 0.05
Nodes (48): dashboardMetrics, employeeWorkload, getAccessibleProjects(), getDashboardMetrics(), getEmployeeWorkload(), getMyTasks(), getProjectAreaProgress(), getProjectById() (+40 more)

### Community 39 - "live-commit-manual-edits.mjs"
Cohesion: 0.10
Nodes (50): allEntryIds(), argVal(), buildRepairBatch(), candidatesForEntry(), changedFilesSinceSnapshot(), clearAppliedEntries(), collectApplyOwnedFiles(), collectRollbackFiles() (+42 more)

### Community 40 - "queries/calendar.ts"
Cohesion: 0.10
Nodes (35): PATCH(), responseSchema, CalendarQueryInput, mocks, getCalendarData(), getNormalizedCalendarEvent(), mocks, deduplicateCalendarItems() (+27 more)

### Community 41 - "team/actions.ts"
Cohesion: 0.11
Nodes (26): inviteEmployee(), isExistingAuthUserError(), removeStudioMember(), restoreStudioMember(), EmployeeInvitationActionState, EmployeeInvitationField, employeeInvitationSchema, EmployeeInvitationValues (+18 more)

### Community 42 - "detect-html.mjs"
Cohesion: 0.06
Nodes (46): mergeDesignSystemFindings(), runTextContentAnalyzers(), applyStaticDeclaration(), buildBorderOverrideMap(), buildStaticStyleMap(), buildStaticWindow(), collectStaticCssRules(), collectStaticCssText() (+38 more)

### Community 43 - "impeccable-config.mjs"
Cohesion: 0.10
Nodes (47): applyDetectionConfigSource(), clampByte(), cleanIgnoreValueDisplay(), cloneDetectionConfig(), cloneRawDetectionConfig(), colorIgnoreKey(), DEFAULT_DETECTION_CONFIG, DETECTOR_CONFIG_KEYS (+39 more)

### Community 44 - "equipment/actions.ts"
Cohesion: 0.12
Nodes (27): createWorkstation(), equipmentValues(), formValue(), workstationValues(), completeEquipmentServiceSchema, EquipmentActionState, equipmentAssignmentSchema, equipmentDeleteSchema (+19 more)

### Community 45 - "createClient"
Cohesion: 0.12
Nodes (44): deleteContractor(), deleteContractorCategory(), updateContractorCategoryColor(), removeFinanceCategory(), saveFinanceCashPlan(), createOfficeAssignment(), manageOfficeAssignment(), refreshOffice() (+36 more)

### Community 46 - "live-accept.mjs"
Cohesion: 0.09
Nodes (47): safeSessionId(), matchesTemplateExtension(), acceptCli(), acceptReceiptPath(), argVal(), buildAcceptedWrappedSource(), buildCarbonizeReplacement(), decodeHtmlAttr() (+39 more)

### Community 47 - "lib/finance.ts"
Cohesion: 0.08
Nodes (29): saveFinanceFoundation(), mocks, valuation, saveFinanceMovement(), input, mocks, initialState, FinanceAccount (+21 more)

### Community 48 - "calendar-workspace.tsx"
Cohesion: 0.08
Nodes (31): CalendarChipIcon(), CalendarDetailHeaderIcon(), CalendarEventDetails(), CalendarPill(), dateLabel(), DayDetails(), Drawer, EventForm() (+23 more)

### Community 49 - "finance_trip_entries"
Cohesion: 0.11
Nodes (40): Business trips, Project Finance owning route and modules, add_finance_entry, allocate_finance_payment, begin_finance_planning, finance_allocations, finance_categories, finance_currencies (+32 more)

### Community 50 - "hook-admin.mjs"
Cohesion: 0.12
Nodes (42): ACTIONS, addIgnoreFile(), addIgnoreRule(), addIgnoreValue(), DETECTOR_CONFIG_KEYS, detectorSection(), fileHasImpeccableHookMarker(), HOOK_MANIFEST_TARGETS (+34 more)

### Community 51 - "parseAnyColor"
Cohesion: 0.10
Nodes (43): checkBorders(), checkColors(), checkElementAIPaletteDOM(), checkElementBorders(), checkElementBordersDOM(), checkElementColors(), checkElementColorsDOM(), checkElementGlow() (+35 more)

### Community 52 - "live-wrap.mjs"
Cohesion: 0.12
Nodes (39): hasGeneratedHeader(), HEADER_MARKERS, isGeneratedFile(), isGitIgnored(), resolveLiveTemplateExtensions(), resolveSourceTraits(), argVal(), buildInsertWrapperLines() (+31 more)

### Community 53 - "queries/dashboard.ts"
Cohesion: 0.13
Nodes (38): AdminDashboard, DashboardData, DashboardDeadline, DashboardProjectRow, DashboardTaskRow, EmployeeDashboard, getDashboard(), makeDeadlines() (+30 more)

### Community 54 - "slide_search_core.py"
Cohesion: 0.09
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 55 - "session-store.mjs"
Cohesion: 0.10
Nodes (32): readLiveServerInfo(), FORBIDDEN, verifyAcceptedFile(), completeCli(), completeThroughServer(), parseArgs(), readServerInfo(), collectManualApplyFiles() (+24 more)

### Community 56 - "layout.md"
Cohesion: 0.05
Nodes (35): Adaptation Strategies, Assess Adaptation Challenge, Implement & Verify, Orientation & foldables, Phone → Tablet (iPad / large screens), Platform → platform (iOS ↔ Android), Web → native (porting a website or web app), Android platform (+27 more)

### Community 57 - "equipment-catalog/sync.ts"
Cohesion: 0.14
Nodes (27): localFile(), main(), catalogError(), formatCatalogError(), CatalogImportRow, componentFamilyPattern(), componentIdentity(), ICECAT_CATEGORIES (+19 more)

### Community 58 - "manual-apply.mjs"
Cohesion: 0.10
Nodes (36): addOpToManualApplyChunk(), APPLY_EVENT_HARD_TIMEOUT_MS, APPLY_EVENT_SOFT_DEADLINE_MS, buildManualApplyAgentAction(), clearManualApplyTransaction(), collectManualApplyFiles(), compactManualApplyBatch(), compactManualApplyCandidates() (+28 more)

### Community 59 - "detect-antipatterns.mjs"
Cohesion: 0.12
Nodes (36): confirm(), detectCli(), dim(), fileUrlToLocalPath(), formatAdvisorySection(), formatFindings(), formatFindingsBody(), formatFindingSummary() (+28 more)

### Community 60 - "doctor.mjs"
Cohesion: 0.08
Nodes (54): applyFixes(), cli(), collect(), parseArgs(), readProjectRootPatterns(), rel(), renderText(), safeRead() (+46 more)

### Community 61 - "design-parser.mjs"
Cohesion: 0.13
Nodes (39): assessCoverage(), buildColor(), CANONICAL_SECTIONS, collectBullets(), collectColorValues(), collectParagraphs(), detectFormat(), extractColors() (+31 more)

### Community 62 - "initPageChat"
Cohesion: 0.08
Nodes (50): armPageChatForTyping(), attachSteerFocusDebug(), attachSteerFocusGuard(), buildSteerProcessingDots(), buildSteerQueueHint(), clearSteerAwaitTimer(), clearSteerFocusRecoverTimer(), collapsePageChat() (+42 more)

### Community 63 - "live-poll.mjs"
Cohesion: 0.11
Nodes (36): completionAckForAcceptResult(), completionTypeForAcceptResult(), PREVIEW_MODES_WITHOUT_SOURCE_MARKERS, acceptInstructions(), bootInstructions(), deferredWrapperInstructions(), generateInstructions(), insertScaffoldInstructions() (+28 more)

### Community 64 - "Brand Guidelines v1.0"
Cohesion: 0.05
Nodes (37): 1. Color Palette, 2. Typography, 3. Logo Usage, 4. Voice & Tone, 5. Imagery Guidelines, 6. Design Components, Accessibility, AI Image Generation (+29 more)

### Community 65 - "scanCssTextForPulsingDot"
Cohesion: 0.16
Nodes (16): buildHtmlPatternCorpora(), checkHtmlPatterns(), collectMarqueeKeyframes(), collectPulseKeyframes(), cssLengthToPx(), indexInSourceRanges(), infiniteAnimationNames(), isRoundDotRadius() (+8 more)

### Community 66 - "bootstrap-studio.ts"
Cohesion: 0.10
Nodes (36): AdminClient, askForInput(), askForMember(), askForText(), AuthUser, BootstrapError, BootstrapInput, bootstrapInputSchema (+28 more)

### Community 67 - "contractor-directory.tsx"
Cohesion: 0.11
Nodes (30): ContractorsPage(), ClassificationOption, ContractorCategoryCombobox(), ContractorSubcategoryCombobox(), CreatableClassificationCombobox(), getUniqueContractorCategories(), getUniqueContractorSubcategories(), uniqueOptions() (+22 more)

### Community 68 - "buffer"
Cohesion: 0.15
Nodes (26): buffer, callbackRedirect(), GET(), stateMatches(), GET(), POST(), GET(), POST() (+18 more)

### Community 69 - "dialog.tsx"
Cohesion: 0.16
Nodes (18): getAppScrollContainer(), getScrollbarWidth(), getScrollContainerScrollbarWidth(), lockAppScroll(), ScrollLockSnapshot, unlockAppScroll(), Dialog(), getPortalTarget() (+10 more)

### Community 70 - "Studio Operations architecture"
Cohesion: 0.09
Nodes (35): Calendar semantic events, Calendar URL and snapshot ownership, Calendar architecture, One-way Google Calendar projection, Calendar relevance predicate, Stored events and live Calendar projections, Payroll reminders, Canonical task milestone projection (+27 more)

### Community 71 - "types/tasks.ts"
Cohesion: 0.11
Nodes (23): ChecklistItemEditorRow(), ChecklistAutosaveStore, ChecklistChange, ChecklistMutationResult, ChecklistSnapshot, getChecklistAutosaveStore(), isChecklistMutationResult(), Listener (+15 more)

### Community 72 - "parseAnyColor"
Cohesion: 0.11
Nodes (42): checkColors(), checkElementAIPaletteDOM(), checkElementColors(), checkElementColorsDOM(), checkElementGlowDOM(), checkElementHoverContrast(), checkElementIconTile(), checkElementIconTileDOM() (+34 more)

### Community 73 - "init"
Cohesion: 0.16
Nodes (21): agentHasWorkInFlight(), agentStatusText(), barPaletteForTheme(), brandMarkSvg(), buildParamsPanel(), designPanelCss(), detectPageTheme(), ensureAgentPollTooltip() (+13 more)

### Community 74 - "spacing"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 75 - "impeccable/SKILL.md"
Cohesion: 0.07
Nodes (26): Craft (deprecated alias), Impeccable Documenter, Input Contract, Output Contract, Workflow, Checks, in order, Disposition, Impeccable Finish Reviewer (+18 more)

### Community 76 - "google-calendar/sync.ts"
Cohesion: 0.12
Nodes (29): asGoogleCalendarSyncError(), atGoogleCalendarStage(), isReconnectRequiredError(), addCounts(), CalendarEventRow, CalendarInviteRow, CalendarParticipantRow, getGoogleClient() (+21 more)

### Community 77 - "floor-plan-view.tsx"
Cohesion: 0.11
Nodes (32): DragState, EntityList(), fitViewBox(), FloorPlanEntity, floorPlans, FloorPlanView(), Legend(), PanState (+24 more)

### Community 78 - "queries/equipment.ts"
Cohesion: 0.09
Nodes (24): loadEquipmentHistory(), EquipmentPage(), EquipmentWorkspace(), useEquipmentRouting(), EquipmentItem, EquipmentMember, EquipmentRow, EquipmentServiceEvent (+16 more)

### Community 79 - "live.md"
Cohesion: 0.06
Nodes (29): Apply at system scale, Audit before choosing, Choose a strategy, Contrast and perception, Live-mode signature params, Verify, Visitor mode, Cleanup (+21 more)

### Community 80 - "live-copy-edit-agent.mjs"
Cohesion: 0.14
Nodes (31): applyMockWrites(), buildCopyEditBatchPrompt(), checkFrameworkSourceSyntax(), chooseCopyEditAgent(), COMMAND_AUTH_CACHE, commandAuthed(), commandExists(), compactBatchForPrompt() (+23 more)

### Community 81 - "Typography Specifications"
Cohesion: 0.06
Nodes (30): Accessibility, Base System, Best Practices, Clean & Modern, Common Font Pairings, Contrast Requirements, CSS Implementation, Editorial (+22 more)

### Community 82 - "Management Overview"
Cohesion: 0.11
Nodes (30): Finance Overview projection, RLS and explicit grants, /finance/planning, Accessible exact chart data, Actual flow comparison, Cash projection, Category Budget Forecast Actual, Daily forecast chart (+22 more)

### Community 83 - "lib/project-lifecycle.ts"
Cohesion: 0.12
Nodes (27): PATCH(), LifecycleContext, ProjectLifecycleProvider(), useProjectLifecycle(), ProjectLifecycleControls(), ProjectLifecycleMutationResult, updateProjectLifecycleStatus(), canUpdateProjectMetadata() (+19 more)

### Community 84 - "server.ts"
Cohesion: 0.15
Nodes (22): AdminPage(), AdministrationWorkspace(), getAdministrationData(), getStudioChecklistTemplates(), getDashboardAdministration(), getStudioLeaderboardBonusConfig(), AdministrationModel, AdministrationRequest (+14 more)

### Community 85 - "lib/project-progress.ts"
Cohesion: 0.09
Nodes (33): DeadlineSummary(), ProjectContextActions(), ProjectContextBand(), ProjectEditModal(), calculateOverallProjectProgress(), calculatePersonalProgress(), calculateProjectProgress(), calculateStageProgress() (+25 more)

### Community 86 - "domain-messages.tsx"
Cohesion: 0.06
Nodes (17): geistMono, geistSans, RootLayout(), viewport, FinanceNavigation(), DomainMessages(), Namespace, selectMessages() (+9 more)

### Community 87 - "Logo Usage Rules"
Cohesion: 0.07
Nodes (28): Absolute Don'ts, Approved Backgrounds, Before Using Logo, Clear Space, Co-branding, Color Rules, Color Usage, Color Variants (+20 more)

### Community 88 - "Component Specifications"
Cohesion: 0.07
Nodes (28): Alert, Anatomy, Anatomy, Anatomy, Anatomy, Anatomy, Badge, Button (+20 more)

### Community 89 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 90 - "calendar-event-form.ts"
Cohesion: 0.11
Nodes (29): TimeOffForm(), addCalendarDays(), CalendarEventFormValues, createCalendarEventFormValues(), getAllDayEventBounds(), getSiteVisitTitle(), getWorkMakeupTitle(), splitWallDateTime() (+21 more)

### Community 91 - "applyEditing"
Cohesion: 0.09
Nodes (31): addManualContextText(), applyEditing(), buildLocatorForLeaf(), canRestoreManualEditElement(), contextElementForManualEdit(), copyEditContainerContext(), copyEditLeafContext(), cssIdent() (+23 more)

### Community 92 - "html-token-validator.py"
Cohesion: 0.14
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 93 - "roots.mjs"
Cohesion: 0.16
Nodes (27): CANDIDATE_SCAN_IGNORED, consumeTargetArg(), CONTEXT_FALLBACK_DIRS, DESIGN_NAMES, DEV_CONFIG_MARKERS, discoverAppCandidates(), enterLiveRoot(), exists() (+19 more)

### Community 94 - "DesignSystemGenerator"
Cohesion: 0.14
Nodes (10): DesignSystemGenerator, Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV. (+2 more)

### Community 95 - "20260719221450_initial_schema.sql"
Cohesion: 0.13
Nodes (27): private.can_access_project(), private.can_view_profile(), private.is_studio_admin(), private.is_studio_member(), profiles, project_activity, project_area_progress, project_members (+19 more)

### Community 96 - "radius"
Cohesion: 0.11
Nodes (27): $type, $value, lg, sm, $type, $value, $type, $value (+19 more)

### Community 97 - "critique-storage.mjs"
Cohesion: 0.18
Nodes (21): coerceSlug(), listSnapshotsForSlug(), main(), nowFilenameStamp(), parseFrontmatter(), readLatestSnapshot(), readTrend(), serializeFrontmatter() (+13 more)

### Community 98 - "Asset Approval Checklist"
Cohesion: 0.08
Nodes (25): Accessibility, Archival, Asset Approval Checklist, Automation Support, Color Compliance, Common Issues & Fixes, Content Accessibility, Content Quality (+17 more)

### Community 99 - "Responsive Design"
Cohesion: 0.08
Nodes (25): Assess Adaptation Challenge, Breakpoints: Content-Driven, Content Adaptation, Desktop Adaptation (Mobile → Desktop), Detect Input Method, Not Just Screen Size, Email Adaptation (Web → Email), Implement Adaptations, Layout Adaptation Patterns (+17 more)

### Community 100 - "checkHtmlPatterns"
Cohesion: 0.13
Nodes (27): ANIMATION_VALUE_KEYWORDS, buildHtmlPatternCorpora(), checkHtmlPatterns(), collectCssCustomProps(), collectMarqueeKeyframes(), collectPulseKeyframes(), cssLengthToPx(), cssTextHasDarkRootBg() (+19 more)

### Community 101 - "handleManualEditActivity"
Cohesion: 0.19
Nodes (24): clearStoredManualApplyState(), fetchPendingCount(), handleManualEditActivity(), hidePendingApplyDock(), manualApplyLoadingText(), manualApplyStateKey(), manualEditEventForCurrentPage(), numberOrNull() (+16 more)

### Community 102 - "manual-edit-routes.mjs"
Cohesion: 0.19
Nodes (19): args, cwd, pageUrlFilter, remaining, compactManualLogText(), summarizeManualApplyFailures(), summarizeManualDiagnostics(), summarizeManualLogFile() (+11 more)

### Community 103 - "event-validation.mjs"
Cohesion: 0.16
Nodes (22): AGENT_PHASE_SET, FORBIDDEN_MANUAL_EDIT_TEXT_CHARS, INSERT_POSITIONS, isValidId(), isValidMountVariant(), isValidVariantId(), validateAnnotationFields(), validateEvent() (+14 more)

### Community 104 - "types/calendar.ts"
Cohesion: 0.07
Nodes (32): calendarQuery, route, baseValues, getTimeOffRequestPresentation(), requiresTimeOffReason(), TIME_OFF_REQUEST_PRESENTATION, TimeOffFieldLabelKey, TimeOffPlaceholderKey (+24 more)

### Community 105 - "task-payload.integration.test.ts"
Cohesion: 0.11
Nodes (19): loadDashboardTask(), MyTasksPage(), accounts, clients, mocks, oldDashboardTasks(), projects, requests (+11 more)

### Community 106 - "lib/crm.ts"
Cohesion: 0.13
Nodes (20): CandidateCycleFields(), FollowUpTime(), getLeadProjectDefaults(), isNestedInteractiveTarget(), LeadFollowUpDialog(), LeadFollowUpFields(), LeadsWorkspace(), instantToWallInput() (+12 more)

### Community 107 - "user-avatar.tsx"
Cohesion: 0.15
Nodes (20): StudioMemberLifecycleControls(), Member, TeamDirectory(), TeamMemberCard(), TeamMemberCardProps, sizeClassName, UserAvatar(), UserAvatarProps (+12 more)

### Community 108 - "Color Palette Management"
Cohesion: 0.08
Nodes (24): Accessibility Requirements, Brand Compliance Validation, Checking Contrast, Color Documentation Format, Color Extraction, Color Palette Examples, Color Palette Management, Color System Structure (+16 more)

### Community 109 - "States and Variants"
Cohesion: 0.08
Nodes (24): Accessibility, Accessibility Requirements, ARIA States, Color Contrast, Color Variants, Disabled States, Error Messages, Error States (+16 more)

### Community 110 - "collectBrowserFindings"
Cohesion: 0.15
Nodes (21): browserFindingsFromMap(), checkBorders(), checkEdgeFlushCardsDOM(), checkElementBlinkingCursorDOM(), checkElementBorders(), checkElementBordersDOM(), checkElementPseudoStripeDOM(), checkElementTextOverflowDOM() (+13 more)

### Community 111 - "impeccable-paths.mjs"
Cohesion: 0.18
Nodes (19): resolveProjectRoot(), firstExisting(), getDesignSidecarCandidates(), getDesignSidecarPath(), getImpeccableDir(), getLegacyLiveAnnotationsDir(), getLegacyLiveConfigPath(), getLegacyLiveServerPath() (+11 more)

### Community 112 - "live-manual-edit-evidence.mjs"
Cohesion: 0.16
Nodes (26): analyzeSourceHint(), buildCandidatesForOp(), buildContextHintsByRef(), buildManualEditEvidence(), collectSearchFiles(), countOps(), decodeBasicHtml(), escapeRegExp() (+18 more)

### Community 113 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 114 - "devDependencies"
Cohesion: 0.08
Nodes (25): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, @playwright/test, supabase, tailwindcss (+17 more)

### Community 115 - "insert-ui.mjs"
Cohesion: 0.11
Nodes (10): canCreateInsert(), clampPlaceholderSize(), computeInsertPosition(), groupSiblingRows(), hitSiblingInsertGap(), horizontalOverlap(), insertCreateDisabledReason(), insertLineCoords() (+2 more)

### Community 116 - "svelte-ast.mjs"
Cohesion: 0.22
Nodes (20): Analysis, analyzeAttributes(), analyzeFragment(), analyzeNode(), analyzeSvelteMarkup(), applyReplacements(), classifyEachKey(), classifyRoots() (+12 more)

### Community 117 - "project-activity-section.tsx"
Cohesion: 0.20
Nodes (20): ActivityRow(), ActivityTranslations, formatChange(), getHeadline(), initials(), ProjectActivitySection(), getProjectActivity(), ProjectActivity (+12 more)

### Community 118 - "Design System"
Cohesion: 0.09
Nodes (22): Best Practices, Chart.js Integration, Command, Component Spec Pattern, Contextual Decision Flow, Decision System CSVs, Design System, Integration (+14 more)

### Community 119 - "onboard.md"
Cohesion: 0.09
Nodes (22): Assess Onboarding Needs, Context Over Ceremony, Contextual Help, Design Onboarding Experiences, Documentation & Help, Empty State Design, Feature Discovery & Adoption, Guided Tours & Walkthroughs (+14 more)

### Community 120 - "design_system.py"
Cohesion: 0.15
Nodes (16): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi(), Format a page-specific override file with intelligent AI-generated content., Generate intelligent overrides based on page type using layered search. Uses… (+8 more)

### Community 121 - "dependencies"
Cohesion: 0.09
Nodes (23): class-variance-authority, clsx, @dnd-kit/react, googleapis, @hookform/resolvers, lucide-react, next, dependencies (+15 more)

### Community 122 - "notification-bell.tsx"
Cohesion: 0.18
Nodes (21): iconFor(), NotificationBell(), notificationIcon(), NotificationRow, playNotificationSound(), RealtimeNotificationToast(), NotificationData, NotificationItem (+13 more)

### Community 123 - "live.mjs"
Cohesion: 0.22
Nodes (13): parseTargetOptions(), parseTargetPath(), TargetArgError, __dirname, ensureServerRunning(), globToRegex(), liveCli(), relOrNull() (+5 more)

### Community 124 - "collectVisualContrastCandidates"
Cohesion: 0.13
Nodes (20): addBrowserFindings(), addVisualContrastFindings(), addVisualContrastResult(), analyzeVisualContrast(), analyzeVisualContrastCandidate(), clearOverlays(), collectVisualContrastCandidates(), collectVisualContrastReasons() (+12 more)

### Community 125 - "Historical opening valuation"
Cohesion: 0.16
Nodes (22): Historical opening persistence, value_finance_opening, /finance/accounts, Account create request identity, Account create retry recovery, Cutover FX resolution, Decimal text transport, Draft valuation invalidation (+14 more)

### Community 126 - "google-calendar/diagnostics.ts"
Cohesion: 0.33
Nodes (9): DiagnosticContext, extractFailureFields(), GoogleCalendarFailureDiagnostic, googleCalendarJobLastError(), GoogleCalendarSyncError, number(), record(), sanitizeGoogleCalendarErrorMessage() (+1 more)

### Community 127 - "theme-switch.tsx"
Cohesion: 0.31
Nodes (11): applyTheme(), getServerThemeSnapshot(), getThemeSnapshot(), subscribeToTheme(), syncThemeColor(), ThemeSwitch(), getNextTheme(), parseThemePreference() (+3 more)

### Community 128 - "notification-presentation.ts"
Cohesion: 0.18
Nodes (19): formatDateOnly(), formatDateRange(), getNotificationPresentation(), legacyDate(), legacyRequestType(), legacyTimeOffFields(), metadataBoolean(), metadataString() (+11 more)

### Community 129 - "GSAP Core"
Cohesion: 0.10
Nodes (20): Accessibility and responsive (gsap.matchMedia()), Common vars, Core Tween Methods, Custom: use CustomEase (plugin), Defaults, Do Not, Easing, Function-based values (+12 more)

### Community 130 - "Operate mode depth (and Read notes)"
Cohesion: 0.10
Nodes (18): Craft floor, Refuse, Verify, Constraints, Failure modes, Flow, $impeccable hooks, Intentional findings (+10 more)

### Community 131 - "The Toolkit"
Cohesion: 0.10
Nodes (20): Animate complex properties, Assess What "Extraordinary" Means Here, For data-heavy interfaces, For functional UI, For performance-critical UI, For visual/marketing surfaces, Implement with Discipline, Interact with the device (+12 more)

### Community 132 - "detect-url.mjs"
Cohesion: 0.22
Nodes (19): createBrowserDetector(), detectUrl(), launchBrowser(), measureContentHiddenAfterReveal(), runVisualContrastFallback(), serializeDesignSystemForBrowser(), captureVisualContrastCandidate(), compareScreenshotContrast() (+11 more)

### Community 133 - "onAnnotDown"
Cohesion: 0.16
Nodes (20): beginEditPin(), buildAnnotationsForCapture(), buildPinElement(), cancelEditingPin(), clampPlaceholderSize(), finalizeEditingPin(), initAnnotOverlay(), localCoords() (+12 more)

### Community 134 - "app-header.tsx"
Cohesion: 0.14
Nodes (14): AccessUnavailablePage(), AppLayout(), generateMetadata(), SignOutButton(), AppHeader(), ProfileAvatarEditor(), ProfileAvatarEditorProps, ProfileEditorDialog (+6 more)

### Community 135 - "task-status.ts"
Cohesion: 0.07
Nodes (40): PATCH(), PATCH(), POST(), PATCH(), PATCH(), PATCH(), mocks, PATCH() (+32 more)

### Community 136 - "set-password/actions.ts"
Cohesion: 0.26
Nodes (8): setUserPassword(), SetPasswordPage(), SetPasswordForm(), getSetPasswordInput(), SetPasswordActionState, SetPasswordField, setPasswordSchema, SetPasswordValues

### Community 137 - "city-provider.ts"
Cohesion: 0.13
Nodes (23): GET(), LanguageSelector(), AppLocale, isAppLocale(), locales, resolveLocale(), GeoNamesPlace, getGeoNamesCityPlace() (+15 more)

### Community 138 - "generate-slide.py"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 139 - "fontSize"
Cohesion: 0.11
Nodes (20): $type, $value, $type, $value, $type, $value, $type, $value (+12 more)

### Community 140 - "resolveLengthPx"
Cohesion: 0.12
Nodes (22): checkElementHeroEyebrow(), checkElementHeroEyebrowDOM(), checkElementQualityDOM(), checkHeroEyebrow(), checkKickerAboveHeading(), checkKickerAboveHeadingDOM(), checkKickerAboveHeadingFromDoc(), checkNumberedSectionLabels() (+14 more)

### Community 141 - "showToast"
Cohesion: 0.08
Nodes (49): abandonForeignSession(), abortSvelteComponentInjection(), acceptedDomAlreadyClean(), applyOriginalAttrsToSvelteAnchor(), cleanup(), cleanupAcceptedSession(), clearMountErrorCard(), clearScrollY() (+41 more)

### Community 142 - "validation/crm.ts"
Cohesion: 0.10
Nodes (19): Action, CrmActionForm(), validLead, CrmActionState, crmCandidateContactSchema, crmCandidateSchema, crmCandidateSchemaBase, crmLeadSchema (+11 more)

### Community 143 - "accept-css.mjs"
Cohesion: 0.22
Nodes (21): bakeParamValues(), collectAllSelectors(), collectSelectorsFromNodes(), escapeRegExp(), formatBody(), isToggleOn(), normalizeSelector(), normalizeToggleForVar() (+13 more)

### Community 144 - "live-inject.mjs"
Cohesion: 0.16
Nodes (20): describeInjectArtifacts(), frameworkIgnorePatterns(), resolveFramework(), applyNuxtLiveAdapter(), buildNuxtPlugin(), detectNuxtProject(), nuxt, removeNuxtLiveAdapter() (+12 more)

### Community 145 - "createAdminClient"
Cohesion: 0.18
Nodes (13): GET(), mocks, GET(), hasValidCronAuthorization(), mocks, GET(), hasValidCronAuthorization(), completeJob() (+5 more)

### Community 146 - "20260917141123_finance_compensation_recurring.sql"
Cohesion: 0.16
Nodes (14): finance_obligation_item_guard, finance_schedule_guard, finance_stop_removed_employee, private.guard_finance_obligation_item(), private.guard_finance_schedule(), private.stop_removed_employee_payroll(), public.finance_obligation_items, public.finance_obligations (+6 more)

### Community 147 - "Asset Organization Guide"
Cohesion: 0.11
Nodes (18): Asset Entry (manifest.json), Asset Organization Guide, By Campaign, By Status, By Type, Cleanup Workflow, Components, Directory Structure (+10 more)

### Community 148 - "gray"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 149 - "resolveLiveInjectionAnchor"
Cohesion: 0.16
Nodes (19): buildSvelteExpressionTextMap(), buildSveltePropValuesFromLiveElement(), buildSveltePropValuesV2(), cloneWithoutElements(), collectTextNodes(), collectVisibleTexts(), cssEscapeIdent(), elementMatchesOriginalMarkup() (+11 more)

### Community 150 - "color"
Cohesion: 0.05
Nodes (37): $type, $value, background, destructive, destructive-foreground, foreground, muted, muted-foreground (+29 more)

### Community 151 - "tanstack-adapter.mjs"
Cohesion: 0.20
Nodes (16): buildLiveScriptSrc(), applyTanStackLiveAdapter(), buildTanStackLiveRootComponent(), detectTanStackStartProject(), escapeRegExp(), findRootRouteFile(), insertAfterLastImport(), isManagedComponent() (+8 more)

### Community 152 - "BM25"
Cohesion: 0.14
Nodes (11): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+3 more)

### Community 153 - "finance_expected_items"
Cohesion: 0.20
Nodes (19): Actual refunds, cancel_finance_project_expectation, complete_finance_payroll_cost, Established outstanding, Expected settlement, finance_allocations, finance_expected_balances, finance_expected_items (+11 more)

### Community 154 - "StudioFlow architecture overview"
Cohesion: 0.15
Nodes (19): Europe/Kyiv business time and date-only semantics, Mutation revalidation across consumers, Database-owned atomic workflows, StudioFlow architecture overview, Domain route and ownership navigation, Durable coalesced Google Calendar reconciliation, English and Ukrainian next-intl localization, Narrow privileged server-only operations (+11 more)

### Community 155 - "Permissions"
Cohesion: 0.19
Nodes (19): Active profiles, Administrator capabilities, Canonical active-studio membership resolver, Employee capabilities, Finance administrator-only access, Atomic membership removal and restoration, Recipient-only notification access, Permissions (+11 more)

### Community 156 - "contractors/actions.ts"
Cohesion: 0.23
Nodes (16): createContractor(), getContractorValues(), nullable(), parseForm(), renameContractorCategory(), resolveContractorClassification(), updateContractor(), ContractorFormActionState (+8 more)

### Community 157 - "Brand Consistency Checklist"
Cohesion: 0.11
Nodes (17): Audit Frequency, Brand Consistency Checklist, Channel Audit, Collateral, Colors, Common Issues, Email, Imagery (+9 more)

### Community 158 - "Color Semantics"
Cohesion: 0.11
Nodes (17): Accent, Applying Semantic Tokens, Background & Foreground, Border & Ring, Color Semantics, Dark Mode Overrides, Destructive, Interactive States (+9 more)

### Community 159 - "fetch-background.py"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 160 - "sveltekit-adapter.mjs"
Cohesion: 0.24
Nodes (16): applySvelteKitLiveAdapter(), buildSvelteLiveRootComponent(), defaultSvelteLayout(), detectSvelteKitProject(), ensureSvelteLiveRootComponent(), escapeRegExp(), fileIncludes(), findSvelteKitAppHtml() (+8 more)

### Community 161 - "Supabase"
Cohesion: 0.11
Nodes (15): Fix suggestion, Source, What happened, Skill Feedback, Steps, Core Principles, Debugging, Making and Committing Schema Changes (+7 more)

### Community 162 - "20260917182151_finance_automatic_schedule_occurrences.sql"
Cohesion: 0.14
Nodes (8): finance_obligation_history_guard, finance_obligation_link_history_guard, private.guard_finance_obligation_history(), private.guard_finance_obligation_link_history(), private.reconcile_finance_obligation_item(), private.reconcile_finance_schedule_occurrences(), public.ensure_finance_schedule_occurrences(), public.finance_obligation_items

### Community 163 - "isCardLike"
Cohesion: 0.29
Nodes (7): checkLayout(), checkPageLayout(), isCardLike(), isCardLikeDOM(), isCardLikeFromProps(), parseRadiusToPx(), resolveBorderRadiusPx()

### Community 164 - "crm/actions.ts"
Cohesion: 0.29
Nodes (16): context(), createCandidate(), deleteCandidate(), deleteLead(), failure(), nullable(), recruitingCycleParameters(), saveCandidateEditor() (+8 more)

### Community 165 - "Changelog"
Cohesion: 0.12
Nodes (16): [1.2.0](https://github.com/supabase/agent-skills/compare/v1.1.1...v1.2.0) (2026-06-02), [1.3.0](https://github.com/supabase/agent-skills/compare/v1.2.0...v1.3.0) (2026-06-05), [1.4.0](https://github.com/supabase/agent-skills/compare/v1.3.0...v1.4.0) (2026-07-10), [1.5.0](https://github.com/supabase/agent-skills/compare/supabase-postgres-best-practices-v1.4.0...supabase-postgres-best-practices-v1.5.0) (2026-07-30), [1.6.0](https://github.com/supabase/agent-skills/compare/supabase-postgres-best-practices-v1.5.0...supabase-postgres-best-practices-v1.6.0) (2026-07-30), Bug Fixes, Bug Fixes, Bug Fixes (+8 more)

### Community 166 - "semantic-styles.ts"
Cohesion: 0.12
Nodes (29): ProjectDetails(), LeadStatusPill(), ProjectSignals(), DashboardTaskList(), MyTasksList(), sections, StatusColumnHeader(), TaskCardContent() (+21 more)

### Community 167 - "animate.md"
Cohesion: 0.12
Nodes (14): Accessibility and control, Choose material by meaning, Find the job, Implement to the runtime, Set the motion thesis, Timing and easing, Verify, Visitor mode (+6 more)

### Community 168 - "Handle `generate`"
Cohesion: 0.12
Nodes (16): 1. Read the screenshot (if present), 2. Wrap the element, 3. Load the action's reference, 4. Plan three variants: identity first, then mode, then axes, 5. Apply the freeform prompt (if present), 6. Deliver variants, 7. Parameters (composition-sized, 0-4 per variant), 8. Signal done (+8 more)

### Community 169 - "context-signals.mjs"
Cohesion: 0.25
Nodes (12): cli(), COMMON_DEV_PORTS, devServerSignals(), gatherSignals(), gitSignals(), hasCode(), isVendoredPath(), latestCritique() (+4 more)

### Community 170 - "checkQuality"
Cohesion: 0.15
Nodes (17): borderColorsFromStyle(), borderWidthsFromStyle(), checkElementGptBorderShadow(), checkElementGptBorderShadowDOM(), checkGptThinBorderWideShadow(), checkQuality(), colorsNearlyMatch(), cssColorAlpha() (+9 more)

### Community 171 - "constants.mjs"
Cohesion: 0.12
Nodes (18): checkPageTypography(), resolveSerif(), firstOverusedGoogleFont(), checkElementItalicSerif(), checkElementItalicSerifDOM(), checkItalicSerif(), checkPageTypography(), checkTypography() (+10 more)

### Community 172 - "serve-question.mjs"
Cohesion: 0.13
Nodes (8): esc(), localImages, page(), payloadPath, portArg, QUESTION_DIR, server, timeoutSec

### Community 173 - "Changelog"
Cohesion: 0.12
Nodes (15): [0.1.3](https://github.com/supabase/agent-skills/compare/v0.1.2...v0.1.3) (2026-06-02), [0.1.4](https://github.com/supabase/agent-skills/compare/v0.1.3...v0.1.4) (2026-06-05), [0.1.5](https://github.com/supabase/agent-skills/compare/v0.1.4...v0.1.5) (2026-07-10), [0.1.6](https://github.com/supabase/agent-skills/compare/v0.1.5...supabase-v0.1.6) (2026-07-30), [0.1.7](https://github.com/supabase/agent-skills/compare/v0.1.6...supabase-v0.1.7) (2026-08-12), Bug Fixes, Bug Fixes, Bug Fixes (+7 more)

### Community 174 - "Writing Guidelines for Postgres References"
Cohesion: 0.12
Nodes (15): 1. Concrete Transformation Patterns, 2. Error-First Structure, 3. Quantified Impact, 4. Self-Contained Examples, 5. Semantic Naming, Code Example Standards, Comments, Impact Level Guidelines (+7 more)

### Community 175 - "calculate_finance_forecast"
Cohesion: 0.22
Nodes (16): Finance schedule persistence, Automatic occurrence maintenance, Automatic schedule coverage, calculate_finance_forecast, Database-side aggregation, finance_obligation_items, finance_obligations, finance_payroll_cost_revisions (+8 more)

### Community 176 - "administration-workspace.tsx"
Cohesion: 0.29
Nodes (10): AvailabilityRow(), DecisionRow(), PendingRequestRow(), RequestDrawer(), typeKey(), formatAdministrationDateRange(), getTimeOffStatusBadgeStyle(), isTimeOffMutationResult() (+2 more)

### Community 177 - "20260904120000_internal_submissions.sql"
Cohesion: 0.17
Nodes (11): notify_submission_change_after_write, private.can_access_submission(), private.notify_submission_change(), public.manage_submission(), public.submission_admin_details, public.submission_comments, public.submission_reactions, public.submissions (+3 more)

### Community 178 - "20260916233308_finance_expected_settlement.sql"
Cohesion: 0.16
Nodes (7): finance_category_defaults, private.seed_new_finance_categories(), public.allocate_finance_payment(), public.finance_categories, public.finance_expected_balances, public.finance_movements, public.finance_payment_availability

### Community 179 - "Generate Report"
Cohesion: 0.13
Nodes (14): 1. Accessibility (A11y), 2. Performance, 3. Theming, 4. Responsive Design, 5. Implementation Integrity (CRITICAL), Audit Health Score, Detailed Findings by Severity, Diagnostic Scan (+6 more)

### Community 180 - "generate-image.mjs"
Cohesion: 0.20
Nodes (12): crc32(), hash32(), hslToRgb(), out, palette(), pngChunk(), pngFake(), promptFile (+4 more)

### Community 181 - "detect-utils.mjs"
Cohesion: 0.28
Nodes (13): astro, detectAstroProject(), fileExists(), findConfigFile(), firstExistingFile(), hasAnyDependency(), literalConfigFiles(), readPackageDeps() (+5 more)

### Community 182 - "frameworks/index.mjs"
Cohesion: 0.17
Nodes (11): COMMENT_SYNTAXES, FRAMEWORKS, INJECT_KINDS, PATCH_UNDOERS, PREVIEW_MODES, SOURCE_TRAIT_DEFAULTS, STYLE_MODES, staticHtml (+3 more)

### Community 183 - "tag-strategy.mjs"
Cohesion: 0.26
Nodes (14): appendOriginToDirective(), buildTagBlock(), commentClose(), commentOpen(), detectLineEnding(), findCspMetaTags(), getAttr(), insertTag() (+6 more)

### Community 184 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 185 - "core.py"
Cohesion: 0.19
Nodes (12): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Search stack-specific guidelines (+4 more)

### Community 186 - "finance_project_items"
Cohesion: 0.31
Nodes (11): finance_project_current_terms, finance_project_expected_balances, finance_project_items, finance_project_terms, finance_project_totals, generate_finance_supervision_months, guard_finance_project_expected, guard_finance_visit_context (+3 more)

### Community 187 - "20260917114733_finance_project_agreements.sql"
Cohesion: 0.26
Nodes (13): finance_project_expected_guard, finance_project_items_immutable, finance_project_terms_immutable, finance_visit_context_guard, private.guard_finance_project_expected(), private.guard_finance_visit_context(), public.finance_project_current_terms, public.finance_project_expected_balances (+5 more)

### Community 188 - "Messaging Framework"
Cohesion: 0.14
Nodes (13): Core Statements, Elevator Pitches, Framework Structure, Message Architecture, Message by Audience, Message Testing, Messaging Framework, Mission Statement (+5 more)

### Community 189 - "Brand Voice Framework"
Cohesion: 0.14
Nodes (13): Brand Voice Framework, Character Spectrum, Emotion Spectrum, Language Spectrum, Step 1: Define Personality Traits, Step 2: Create Voice Chart, Step 3: Context Adaptation, Tone Spectrum (+5 more)

### Community 190 - "extract-colors.cjs"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 191 - "validate-asset.cjs"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 192 - "Tailwind Integration"
Cohesion: 0.14
Nodes (13): Animation Tokens, Base Layer, Button Example, Component Classes, CSS Variables Setup, Dark Mode Toggle, HSL Format Benefits, shadcn/ui Alignment (+5 more)

### Community 193 - "Impeccable Asset Producer"
Cohesion: 0.14
Nodes (12): Core Rule, Decision Sketches, Impeccable Asset Producer, Input Contract, Output Contract, Prompt Pattern, Workflow, Generate three compositional options (+4 more)

### Community 194 - "optimize.md"
Cohesion: 0.14
Nodes (13): Animation Performance, Assess Performance Issues, Core Web Vitals Optimization, Cumulative Layout Shift (CLS < 0.1), Interaction to Next Paint (INP < 200ms), Largest Contentful Paint (LCP < 2.5s), Loading Performance, Network Optimization (+5 more)

### Community 195 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 196 - "equipment-catalog.ts"
Cohesion: 0.29
Nodes (8): GET(), EquipmentCatalogCombobox(), searchEquipmentCatalog(), mocks, equipmentCatalogResultsSchema, EquipmentCatalogSearch, equipmentCatalogSearchSchema, equipmentManufacturerSuggestions()

### Community 197 - "20260730120100_task_progress_checklists.sql"
Cohesion: 0.23
Nodes (12): enforce_task_progress_workflow_before_update, private.assign_task_checklist_position(), private.enforce_task_edit_permissions(), private.enforce_task_progress_workflow(), private.validate_project_progress_settings(), private.validate_task_area_allocation(), public.projects, public.task_checklist_items (+4 more)

### Community 198 - "20260916200241_finance_foundation.sql"
Cohesion: 0.20
Nodes (8): guard_finance_settings, private.guard_finance_account(), private.guard_finance_settings(), public.finance_accounts, public.finance_currencies, public.finance_settings, set_finance_accounts_updated_at, set_finance_settings_updated_at

### Community 199 - "finance-project-hardening.spec.ts"
Cohesion: 0.15
Nodes (10): actors, bankId, categoryId, clearFoundation(), client, contractorId, local, projectId (+2 more)

### Community 200 - "brand/references/update.md"
Cohesion: 0.15
Nodes (12): Color Presets, Examples, Files Modified, Important, Overview, Skills Used, Step 1: Gather Brand Input, Step 2: Update Brand Guidelines (+4 more)

### Community 201 - "Token Architecture"
Cohesion: 0.15
Nodes (12): Categories, Dark Mode, File Organization, Layer 1: Primitive Tokens, Layer 2: Semantic Tokens, Layer 3: Component Tokens, Layer Overview, Migration from Flat Tokens (+4 more)

### Community 202 - "design-tokens-starter.json"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 203 - "GSAP with React"
Cohesion: 0.15
Nodes (12): Best practices, Context-Safe Callbacks, Dependency array, scope, and revertOnUpdate, Do Not, gsap.context() in useEffect (when useGSAP isn't used), GSAP with React, Installation, Learn More (+4 more)

### Community 204 - "Scan mode (approach C: auto-extract, then confirm descriptive language)"
Cohesion: 0.15
Nodes (13): Component translation rules, Narrative mapping, Scan mode (approach C: auto-extract, then confirm descriptive language), Schema, Step 1: Find the design assets, Step 2: Auto-extract what can be auto-extracted, Step 2b: Stage the frontmatter, Step 3: Ask the user for qualitative language (+5 more)

### Community 205 - "sampleCssBackground"
Cohesion: 0.18
Nodes (16): blendRgba(), clampByte(), firstCssUrl(), getLayerValue(), loadVisualContrastImage(), parseObjectPosition(), parsePositionPair(), parsePositionToken() (+8 more)

### Community 207 - "pin.mjs"
Cohesion: 0.23
Nodes (11): CODEX_HARNESSES, commandPrefixForSkillsDir(), __dirname, findHarnessDirs(), generatePinnedSkill(), HARNESS_DIRS, loadCommandMetadata(), pin() (+3 more)

### Community 208 - "[eventId]/route.ts"
Cohesion: 0.12
Nodes (28): Context, DELETE(), PATCH(), POST(), CalendarSupabaseClient, getVerifiedTimeOffMembership(), POST(), VerifiedTimeOffMembership (+20 more)

### Community 209 - "20260813143000_per_task_studio_member_removal.sql"
Cohesion: 0.24
Nodes (11): enforce_project_member_studio_membership_before_write, enforce_task_assignee_membership_before_write, prevent_open_task_project_member_removal_before_write, private.enforce_task_assignee_membership(), private.enforce_task_edit_permissions(), private.lock_and_validate_project_member_studio_membership(), private.prevent_open_task_project_member_removal(), private.studio_member_removal_unassignment_permits (+3 more)

### Community 211 - "calendar-projects-presentation.spec.ts"
Cohesion: 0.17
Nodes (12): accounts, admin, choose(), dayOffId, eventIds, localSql(), login(), observeWorkspace() (+4 more)

### Community 212 - "Primitive Tokens"
Cohesion: 0.17
Nodes (11): Border Radius, Color Scales, Gray Scale, Motion / Duration, Primary Colors (Blue), Primitive Tokens, Shadows, Spacing Scale (+3 more)

### Community 213 - "card"
Cohesion: 0.20
Nodes (12): radius, padding, radius, shadow, card, radius, $type, $value (+4 more)

### Community 214 - "GSAP Performance"
Cohesion: 0.17
Nodes (11): Batch Reads and Writes, Best practices, Do Not, Frequently updated properties (e.g. mouse followers), GSAP Performance, Many Elements (Stagger, Lists), Prefer Transform and Opacity, Reduce Simultaneous Work (+3 more)

### Community 215 - "GSAP Timeline"
Cohesion: 0.17
Nodes (11): Controlling Playback, Creating a Timeline, Do Not, GSAP Timeline, Labels, Nesting Timelines, Official GSAP Best practices, Position Parameter (+3 more)

### Community 216 - "Simplify the Design"
Cohesion: 0.17
Nodes (11): Assess Current State, Code Simplification, Content Simplification, Document Removed Complexity, Information Architecture, Interaction Simplification, Layout Simplification, Plan Simplification (+3 more)

### Community 217 - "Hardening Dimensions"
Cohesion: 0.17
Nodes (11): Accessibility Resilience, Assess Hardening Needs, Edge Cases & Boundary Conditions, Error Handling, Hardening Dimensions, Input Validation & Sanitization, Internationalization (i18n), Performance Resilience (+3 more)

### Community 218 - "ui-core.mjs"
Cohesion: 0.23
Nodes (10): createLiveBrowserDomHelpers(), activeElementDeep(), appendStyleToLiveUiRoot(), appendToLiveUiRoot(), escapeCssIdent(), getLiveUiElementById(), LIVE_CHROME_MOUNT_CONTRACT, LIVE_UI_COMPONENT_IDS (+2 more)

### Community 219 - "journal.mjs"
Cohesion: 0.36
Nodes (11): clearInjectJournal(), healArtifact(), healInjectJournal(), injectJournalPath(), insideProject(), normalizeRel(), pruneEmptyDirs(), readIfPresent() (+3 more)

### Community 220 - "Immutable forecast snapshots"
Cohesion: 0.35
Nodes (12): Finance cash planning persistence, Cash Budget, finance_budget_revisions, finance_current_budget, finance_forecast_snapshots, finance_movements.posting_order, Immutable forecast snapshots, Legacy snapshot comparison (+4 more)

### Community 221 - "calendar-event-types.ts"
Cohesion: 0.21
Nodes (9): appLayout, globalStyles, source, CALENDAR_EVENT_DETAIL_CONFIG, CALENDAR_EVENT_TYPE_CONFIG, CalendarEventDetailConfig, CalendarEventDetailSection, CalendarEventTypeConfig (+1 more)

### Community 222 - "getActiveTaskDeadline"
Cohesion: 0.17
Nodes (10): getCalendarTasks(), accounts, cases, clients, enabled, projects, requests, studios (+2 more)

### Community 223 - "google-calendar-automatic-sync.test.ts"
Cohesion: 0.20
Nodes (8): createRoute, cronRoute, eventRoute, grantMigration, invitationRoute, migration, queue, sync

### Community 224 - "20260728153858_calendar_foundation.sql"
Cohesion: 0.24
Nodes (8): private.can_manage_calendar_event(), private.validate_calendar_event(), private.validate_calendar_event_attendee(), public.calendar_event_attendees, public.calendar_events, public.time_off_requests, set_calendar_events_updated_at, set_time_off_requests_updated_at

### Community 226 - "20260910221602_equipment_maintenance.sql"
Cohesion: 0.24
Nodes (9): enforce_equipment_service_lifecycle_before_write, private.enforce_equipment_service_lifecycle(), private.reset_equipment_maintenance_notification_cycle(), public.complete_equipment_service(), public.equipment, public.equipment_service_events, public.start_equipment_service(), reset_equipment_maintenance_notification_cycle_before_update (+1 more)

### Community 227 - "20260920131009_finance_payroll_hardening.sql"
Cohesion: 0.24
Nodes (9): finance_category_schedule_dependency, finance_history_immutable, finance_payroll_cost_category, private.calculate_finance_forecast_report(), private.guard_finance_category_schedule_dependency(), private.guard_finance_payroll_cost_category(), private.reconcile_finance_schedule_occurrences(), public.finance_payroll_cost_revisions (+1 more)

### Community 228 - "finance-projects.spec.ts"
Cohesion: 0.18
Nodes (10): actors, bankId, categoryId, clearFoundation(), client, contractorId, local, projectId (+2 more)

### Community 229 - "Core Visual Elements"
Cohesion: 0.18
Nodes (10): Color Palette, Colors, Core Visual Elements, Logo, Logo, Quick Checks, Typography, Typography (+2 more)

### Community 230 - "inject-brand-context.cjs"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 231 - "embed-tokens.cjs"
Cohesion: 0.20
Nodes (9): args, extractTokens(), fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath (+1 more)

### Community 232 - "clarify.md"
Cohesion: 0.18
Nodes (10): Actions and navigation, Audit the language, Errors and permissions, Forms, Help and instructional text, Loading, empty, and success states, Rewrite by function, Set the message hierarchy (+2 more)

### Community 233 - "critique.md"
Cohesion: 0.18
Nodes (10): Action Summary, Ask the User, Assessment A: Design Review, Assessment B: Detector + Browser Evidence, Assessment Orchestration, Hard Invariants, Persist the Snapshot, Purpose (+2 more)

### Community 234 - "Nielsen's 10 Heuristics"
Cohesion: 0.18
Nodes (11): 10. Help and Documentation, 1. Visibility of System Status, 2. Match Between System and Real World, 3. User Control and Freedom, 4. Consistency and Standards, 5. Error Prevention, 6. Recognition Rather Than Recall, 7. Flexibility and Efficiency of Use (+3 more)

### Community 235 - "Generate Combined Critique Report"
Cohesion: 0.18
Nodes (11): Design Health Score, Design Specificity Verdict, Generate Combined Critique Report, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider (+3 more)

### Community 236 - "New visual work"
Cohesion: 0.18
Nodes (11): 1. Decide what is already true, 2. Ask what will change the work, 3. Choose the right amount of invention, 4. Commit the world, 5. Record the decision, 6. Build with full commitment, 7. Inspect and finish, Create a whole surface inside an established world (+3 more)

### Community 237 - "polish.md"
Cohesion: 0.18
Nodes (10): 1. Establish the system, 2. Gather the evidence, 3. Triage, 4. Polish the whole path, 5. Verify and finish, Color, imagery, and icons, Content and code, Flow and hierarchy (+2 more)

### Community 238 - "quieter.md"
Cohesion: 0.18
Nodes (10): Assess Current State, Color Refinement, Composition Refinement, Motion Reduction, Plan Refinement, Refine the Design, Simplification, Verify Quality (+2 more)

### Community 239 - "detect-csp.mjs"
Cohesion: 0.35
Nodes (10): detectCsp(), INLINE_HEADER_SIGNALS, LAYOUT_EXTS, MONOREPO_HELPER_SIGNALS, NUXT_ROUTE_RULES_SIGNALS, NUXT_SECURITY_SIGNALS, SCAN_EXTS, SKIP_DIRS (+2 more)

### Community 240 - "embed-prompt.mjs"
Cohesion: 0.20
Nodes (7): args, buf, crc32(), crcTable, file, pngChunk(), readMode

### Community 241 - "renderGroupedTemplate"
Cohesion: 0.25
Nodes (11): clampGroupedToBudget(), clampToBudget(), directiveFooter(), formatFindingIgnoreCommand(), formatFindingLine(), quoteCommandArg(), relativize(), renderCleanAck() (+3 more)

### Community 242 - "generation-preflight.mjs"
Cohesion: 0.30
Nodes (10): buildGenerationPreflight(), compactError(), execFileAsync, insertTarget(), normalizeTarget(), replaceTarget(), runGenerationPreflight(), sourceResolutionCache (+2 more)

### Community 243 - "palette.mjs"
Cohesion: 0.24
Nodes (7): args, buildWeights(), hashUnit(), pickSeed(), seed, SEEDS, weightedPick()

### Community 244 - "Quick Reference"
Cohesion: 0.18
Nodes (11): 10. Charts & Data (LOW), 1. Accessibility (CRITICAL), 2. Touch & Interaction (CRITICAL), 3. Performance (HIGH), 4. Style Selection (HIGH), 5. Layout & Responsive (HIGH), 6. Typography & Color (MEDIUM), 7. Animation (MEDIUM) (+3 more)

### Community 245 - "project-form.contract.test.ts"
Cohesion: 0.18
Nodes (10): actionPath, completionDateFormPath, contextPath, editActionPath, editModalPath, formPath, metadataControlsPath, modalPath (+2 more)

### Community 246 - "google-calendar-integration.test.ts"
Cohesion: 0.18
Nodes (9): callbackRoute, connectRoute, disconnectRoute, en, integrationUi, migration, sync, tokenCrypto (+1 more)

### Community 247 - "candidates-workspace.tsx"
Cohesion: 0.20
Nodes (12): CandidateDetail(), CandidatesWorkspace(), CycleLoader, formatDate(), formatDateTime(), isNestedInteractiveTarget(), PositionField(), positionLabel() (+4 more)

### Community 248 - "20260819110000_calendar_event_invitations.sql"
Cohesion: 0.31
Nodes (9): notify_calendar_event_invite_after_insert, private.can_view_calendar_event(), private.notify_calendar_event_invite(), private.validate_calendar_event(), private.validate_calendar_event_invite(), public.calendar_event_invites, public.calendar_events, set_calendar_event_invites_updated_at (+1 more)

### Community 249 - "20260904135441_office_assignments.sql"
Cohesion: 0.24
Nodes (6): enforce_office_assignment_write_before_write, private.enforce_office_assignment_write(), public.manage_office_assignment(), public.office_assignments, public.transition_office_assignment(), set_office_assignments_updated_at

### Community 250 - "20260916221929_finance_actual_movements.sql"
Cohesion: 0.33
Nodes (8): finance_entries_immutable, finance_movements_immutable, private.add_finance_entry(), private.reject_finance_history_change(), public.finance_accounts, public.finance_movement_entries, public.finance_movements, public.finance_settings

### Community 253 - "Brand"
Cohesion: 0.20
Nodes (9): Brand, Brand Sync Workflow, Quick Start, References, Routing, Scripts, Subcommands, Templates (+1 more)

### Community 254 - "Component Tokens"
Cohesion: 0.20
Nodes (9): Alert Tokens, Badge Tokens, Button Tokens, Card Tokens, Component Tokens, Dialog/Modal Tokens, Input Tokens, Table Tokens (+1 more)

### Community 255 - "generate-tokens.cjs"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 256 - "button"
Cohesion: 0.15
Nodes (15): $type, $value, bg, fg, font-size, hover-bg, bg, button (+7 more)

### Community 257 - "primitive"
Cohesion: 0.18
Nodes (11): fast, normal, slow, $type, $value, $type, $value, primitive (+3 more)

### Community 258 - "CORE DIRECTIVE: AWWWARDS-LEVEL DESIGN ENGINEERING"
Cohesion: 0.20
Nodes (9): 1. PYTHON-DRIVEN TRUE RANDOMIZATION (BREAKING THE LOOP), 2. AIDA STRUCTURE & SPACING, 3. HERO ARCHITECTURE & THE 2-LINE IRON RULE, 4. THE GAPLESS BENTO GRID, 5. ADVANCED GSAP MOTION & HOVER PHYSICS, 6. COMPONENT ARSENAL & CREATIVITY, 7. CONTENT, ASSETS & STRICT BANS, 8. MANDATORY PRE-FLIGHT <design_plan> (+1 more)

### Community 259 - "Init flow"
Cohesion: 0.20
Nodes (10): Completion gate, Init flow, Step 1: Load current state, Step 2: Explore the project, Step 3: Interview for product truth, Step 4: Write PRODUCT.md, Step 5: Configure live mode when useful, Step 6: Wrap up or resume (+2 more)

### Community 260 - "staleness-notice.mjs"
Cohesion: 0.46
Nodes (7): cachePath(), filterFreshFindings(), pruneCache(), readCache(), readJson(), stalenessCheckDisabled(), writeCache()

### Community 261 - "board-collapse.spec.ts"
Cohesion: 0.14
Nodes (11): accounts, card(), column(), login(), projectId, service, settings, smallProjectId (+3 more)

### Community 262 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 263 - "Section Definitions"
Cohesion: 0.20
Nodes (9): 1. Query Performance (query), 2. Connection Management (conn), 3. Security & RLS (security), 4. Schema Design (schema), 5. Concurrency & Locking (lock), 6. Data Access Patterns (data), 7. Monitoring & Diagnostics (monitor), 8. Advanced Features (advanced) (+1 more)

### Community 264 - "Tasks"
Cohesion: 0.20
Nodes (10): Authorization and mutation invariants, Board interaction, Boundary, Canonical sources, Checklists, Milestone deadlines, Progress, Stages and workflow (+2 more)

### Community 265 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, bootstrap-studio, build, catalog:import, db:start, db:status, db:stop, dev (+2 more)

### Community 266 - "legal-document.tsx"
Cohesion: 0.24
Nodes (5): metadata, metadata, LegalDocument(), LegalDocumentProps, LegalSection

### Community 267 - "equipment-workspace.test.ts"
Cohesion: 0.20
Nodes (9): actions, animatedContent, binarySwitch, cron, form, query, shell, styles (+1 more)

### Community 268 - "20260728214907_in_app_notifications.sql"
Cohesion: 0.24
Nodes (5): enforce_notification_read_only_before_update, notify_task_change_after_write, private.enforce_notification_read_only(), private.notify_task_change(), public.notifications

### Community 269 - "20260818170000_project_stage_columns_and_internal_review.sql"
Cohesion: 0.22
Nodes (4): private.validate_task_stage_status(), public.project_task_stage_columns, public.tasks, validate_task_stage_status_before_write

### Community 270 - "20260827120000_task_collaborators.sql"
Cohesion: 0.27
Nodes (6): notify_task_collaborators_after_details_change, private.notify_task_collaborators_of_details_change(), private.validate_task_collaborator(), public.get_personal_task_ids(), public.task_collaborators, validate_task_collaborator_before_write

### Community 271 - "20260908144506_create_crm_foundation.sql"
Cohesion: 0.27
Nodes (9): enforce_crm_candidate_admin_reference, enforce_crm_lead_admin_reference, private.enforce_crm_admin_reference(), public.crm_candidates, public.crm_leads, public.crm_recruiting_cycles, set_crm_candidates_updated_at, set_crm_leads_updated_at (+1 more)

### Community 272 - "20260920121044_finance_opening_valuation.sql"
Cohesion: 0.27
Nodes (7): clear_draft_finance_opening_valuations, guard_finance_opening_finalization, guard_finance_opening_valuation, private.clear_draft_finance_opening_valuations(), private.guard_finance_opening_finalization(), private.guard_finance_opening_valuation(), public.finance_accounts

### Community 274 - "finance-foundation.spec.ts"
Cohesion: 0.24
Nodes (8): actors, clearFoundation(), client, local, record(), select(), sql(), studioId

### Community 275 - "finance-overview.spec.ts"
Cohesion: 0.20
Nodes (7): actors, bank, client, foreign, local, secondBank, studio

### Community 276 - "sync-brand-to-tokens.cjs"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 277 - "_run"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 278 - "Common Cognitive Load Violations"
Cohesion: 0.22
Nodes (9): 1. The Wall of Options, 2. The Memory Bridge, 3. The Hidden Navigation, 4. The Jargon Barrier, 5. The Visual Noise Floor, 6. The Inconsistent Pattern, 7. The Multi-Task Demand, 8. The Context Switch (+1 more)

### Community 279 - "Shape"
Cohesion: 0.22
Nodes (8): Cadence, Confirm and stop, Phase 1: Discovery interview, Phase 2: Resolve the design direction, Phase 3: Write the brief, Round 1: purpose, people, and outcome, Round 2: material, behavior, and boundaries, Shape

### Community 280 - "Prerequisites"
Cohesion: 0.22
Nodes (9): Available Domains, Available Stacks, Common Sticking Points, Output Formats, Pre-Delivery Checklist, Prerequisites, Query Strategy, Search Reference (+1 more)

### Community 281 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 282 - "equipment-form.spec.ts"
Cohesion: 0.17
Nodes (12): admin, captureContainedTransition(), choose(), localSql(), login(), open(), panel(), readConfiguration() (+4 more)

### Community 283 - "app-shell.test.ts"
Cohesion: 0.22
Nodes (8): controlPath, dashboardPath, headerPath, layoutPath, mobileNavigationPath, rootLayoutPath, sidebarPath, stylesPath

### Community 284 - "[requestId]/route.ts"
Cohesion: 0.21
Nodes (11): Context, PATCH(), canTransitionTimeOff(), deriveTimeOffUpdate(), base, TimeOffAction, TimeOffActorRole, TimeOffUpdate (+3 more)

### Community 285 - "time-off-stabilization-migration.test.ts"
Cohesion: 0.22
Nodes (7): foundation, insertPolicyFix, migration, migrationNames, migrations, migrationsDirectory, notificationShapeFix

### Community 286 - "20260825150000_project_stage_configuration.sql"
Cohesion: 0.28
Nodes (6): ensure_project_has_enabled_stage_after_update, prevent_invalid_project_stage_configuration_before_update, private.ensure_project_has_enabled_stage(), private.prevent_invalid_project_stage_configuration(), public.project_task_stage_columns, public.projects

### Community 287 - "20260829170000_add_business_trip_participants.sql"
Cohesion: 0.28
Nodes (4): private.can_view_calendar_event(), private.validate_calendar_event_participant(), public.calendar_event_participants, validate_calendar_event_participant_before_write

### Community 288 - "20260910193120_equipment_domain_foundation.sql"
Cohesion: 0.31
Nodes (8): enforce_equipment_studio_identity_before_update, enforce_workstation_assignment_before_write, private.enforce_equipment_studio_identity(), private.enforce_workstation_assignment(), public.equipment, public.workstations, set_equipment_updated_at, set_workstations_updated_at

### Community 289 - "20260917170558_finance_budget_forecast.sql"
Cohesion: 0.22
Nodes (4): public.finance_budget_revisions, public.finance_current_budget, public.finance_forecast_snapshots, public.finance_planning_actuals

### Community 290 - "20260920170000_finance_serialized_capture.sql"
Cohesion: 0.31
Nodes (7): finance_movement_posting_order, finance_snapshot_capture_order, private.assign_finance_capture_order(), private.assign_finance_posting_order(), public.finance_forecast_snapshots, public.finance_movements, public.finance_planning_actuals

### Community 294 - "test_core.py"
Cohesion: 0.18
Nodes (11): format_markdown(), format_master_md(), generate_design_system(), persist_design_system(), Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…, Slugify a name into a single safe path segment. Only [a-z0-9_-] survives; every…, Persist design system to design-system/<project>/ folder using Master +… (+3 more)

### Community 295 - "forgot-password/actions.ts"
Cohesion: 0.27
Nodes (7): requestPasswordRecovery(), ForgotPasswordForm(), getAuthConfirmationUrl(), getPasswordRecoveryInput(), PasswordRecoveryActionState, PasswordRecoveryField, passwordRecoverySchema

### Community 296 - "StudioFlow"
Cohesion: 0.25
Nodes (8): Context routing, Database workflow, Documentation maintenance, Graphify, Skill routing, Source of truth, StudioFlow, Working rules

### Community 297 - "input"
Cohesion: 0.15
Nodes (17): $type, $value, padding-x, padding-y, border, border, input, $type (+9 more)

### Community 298 - "Persona-Based Design Testing"
Cohesion: 0.25
Nodes (8): 1. Impatient Power User: "Alex", 2. Confused First-Timer: "Jordan", 3. Accessibility-Dependent User: "Sam", 4. Deliberate Stress Tester: "Riley", 5. Distracted Mobile User: "Casey", Persona-Based Design Testing, Project-Specific Personas, Selecting Personas

### Community 299 - "doctor.md"
Cohesion: 0.25
Nodes (7): Monorepo notes, Opting out of the boot check, Step 1: Run the pass, Step 2: Act by severity, Step 3: Deprecated fields are binding, Step 4: Do not overclaim on truth drift, What this owns, and what it does not

### Community 300 - "Extract Flow"
Cohesion: 0.25
Nodes (7): Extract Flow, Step 1: Discover the Design System, Step 2: Identify Patterns, Step 3: Plan Extraction, Step 4: Extract & Enrich, Step 5: Migrate, Step 6: Document

### Community 301 - "template-extensions.mjs"
Cohesion: 0.36
Nodes (6): extensionCache, LIVE_TEMPLATE_EXTENSIONS, mergeExtensions(), normalizeExtensionEntries(), readLiveTemplateExtensions(), safeReadJson()

### Community 302 - "search"
Cohesion: 0.36
Nodes (4): Main search function with auto-domain detection, search(), Known query -> expected top-domain sanity checks (not exact-row pinning, since…, TestSearchDomains

### Community 303 - "ui-ux-pro-max"
Cohesion: 0.25
Nodes (7): How to Use, Primary Use Cases, Recommended, Rule Categories by Priority, Skip, ui-ux-pro-max, When to Apply

### Community 305 - "Productivity and progress"
Cohesion: 0.25
Nodes (8): Attribution ledger, Canonical sources, Current unresolved boundary, Leaderboard, Productivity and progress, Project progress, Separate concepts, Stage accounting

### Community 306 - "StudioFlow product specification"
Cohesion: 0.25
Nodes (8): Current non-goals, Open product decisions, Privacy and authorization promises, Product areas, Purpose, StudioFlow product specification, User model, Vocabulary

### Community 307 - "StudioFlow"
Cohesion: 0.25
Nodes (8): Common commands, Database changes and generated types, Documentation map, Environment variables, Local setup, Prerequisites, Stack, StudioFlow

### Community 308 - "app-sidebar.tsx"
Cohesion: 0.36
Nodes (9): StudioFlowMark(), AppSidebar(), MobileNavigation(), formatNavigationAttentionCount(), getNavigationItems(), isNavigationItemActive(), navigationIcons, NavigationItem (+1 more)

### Community 309 - "confirm/route.ts"
Cohesion: 0.50
Nodes (5): GET(), getInvalidLinkRedirect(), getSafeConfirmationDestination(), getSupportedEmailOtpType(), SupportedEmailOtpType

### Community 310 - "ukrainian-phone.ts"
Cohesion: 0.35
Nodes (10): PhoneInput(), PhoneInputProps, formatUkrainianPhone(), getUkrainianPhoneDigits(), normalizePhoneForCountry(), normalizeUkrainianPhone(), removeCountryPrefix(), shouldFormatAsUkrainianPhone() (+2 more)

### Community 311 - "20260728145920_project_lifecycle_workflow.sql"
Cohesion: 0.32
Nodes (4): activate_planned_project_after_task_status_change, private.activate_planned_project_from_task(), private.validate_project_lifecycle_transition(), validate_project_lifecycle_transition_before_update

### Community 313 - "20260729200758_project_activity_history.sql"
Cohesion: 0.32
Nodes (5): log_project_member_activity_after_change, log_task_activity_after_insert_or_update, private.log_project_member_activity(), private.log_task_activity(), public.project_activity

### Community 314 - "20260805212420_structured_project_metadata.sql"
Cohesion: 0.36
Nodes (7): assign_project_code_before_insert, enforce_structured_project_metadata_before_insert, enforce_structured_project_metadata_before_update, private.assign_project_code(), private.enforce_structured_project_metadata(), private.project_code_counters, public.projects

### Community 315 - "20260821130000_project_templates.sql"
Cohesion: 0.36
Nodes (6): public.create_project_from_template(), public.project_template_tasks, public.project_templates, public.save_project_template(), set_project_template_tasks_updated_at, set_project_templates_updated_at

### Community 316 - "20260902140546_google_calendar_automatic_reconciliation.sql"
Cohesion: 0.29
Nodes (4): private.enqueue_google_calendar_event_change(), public.google_calendar_event_mappings, public.google_calendar_reconciliation_jobs, set_google_calendar_reconciliation_jobs_updated_at

### Community 318 - "20260910112451_review_note_privacy.sql"
Cohesion: 0.36
Nodes (5): public.approve_time_off_request(), public.reject_time_off_request(), public.time_off_request_reviews, public.time_off_requests, set_time_off_request_reviews_updated_at

### Community 319 - "20260912124803_equipment_reference_catalog.sql"
Cohesion: 0.25
Nodes (3): public.equipment_catalog_manufacturers, public.equipment_catalog_products, public.equipment_catalog_sync_state

### Community 320 - "20260913214647_add_crm_follow_up_state.sql"
Cohesion: 0.36
Nodes (7): guard_crm_invalid_lead_project_link_before_update, normalize_crm_lead_invalid_state_before_write, private.guard_crm_invalid_lead_project_link(), private.normalize_crm_lead_invalid_state(), private.sync_crm_lead_follow_up_notification(), public.crm_leads, sync_crm_lead_follow_up_notification_after_write

### Community 321 - "archive/page.tsx"
Cohesion: 0.23
Nodes (7): ArchivePage(), ProjectStatusAction(), ArchivedProject, ArchivedProjectsResult, getArchivedProjects(), ProjectRow, getProjectLifecycleBadgeStyle()

### Community 322 - "Generate Report"
Cohesion: 0.29
Nodes (7): Audit Health Score, Detailed Findings by Severity, Executive Summary, Generate Report, Patterns & Systemic Issues, Platform Conformance Verdict, Positive Findings

### Community 323 - "Cognitive Load Assessment"
Cohesion: 0.29
Nodes (7): Cognitive Load Assessment, Cognitive Load Checklist, Extraneous Load: Bad Design, Germane Load: Learning Effort, Intrinsic Load: The Task Itself, The Working Memory Rule, Three Types of Cognitive Load

### Community 324 - "Impeccable Manual Edit Applier"
Cohesion: 0.29
Nodes (6): Checks, Entry Atomicity, Impeccable Manual Edit Applier, Input Contract, Output Contract, Workflow

### Community 325 - "checkTextOcclusionDOM"
Cohesion: 0.22
Nodes (11): checkTextOcclusionDOM(), clippedByInset(), clippedByRect(), elementDirectText(), expandBoxShorthand(), firstMetricLengthPx(), isLayeredElement(), isOpaqueDecoratedBox() (+3 more)

### Community 326 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 327 - "detect_domain"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 328 - "How to Use This Skill"
Cohesion: 0.29
Nodes (7): How to Use This Skill, Step 1: Analyze User Requirements, Step 2: Generate Design System (REQUIRED), Step 2b: Persist Design System (Master + Overrides Pattern), Step 2c: Design Dials (optional), Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 329 - "events/route.test.ts"
Cohesion: 0.29
Nodes (6): canonicalEventTypeMigration, eventDetailsQuery, interviewMigration, migration, organizerAuthorizationMigration, route

### Community 330 - "office-workspace.test.ts"
Cohesion: 0.29
Nodes (6): assignments, dialog, legacy, overview, routing, shell

### Community 331 - "task-stage-assignment.test.ts"
Cohesion: 0.29
Nodes (6): boardPath, membershipGuardMigrationPath, migrationPath, mutationPath, privilegeMigrationPath, routePath

### Community 332 - "20260730120000_productivity_attribution.sql"
Cohesion: 0.38
Nodes (5): private.record_project_fallback_productivity_attribution(), private.record_task_productivity_attribution(), public.productivity_attributions, public.tasks, record_project_fallback_productivity_attribution_after_status_change

### Community 333 - "20260802192102_studio_checklist_templates.sql"
Cohesion: 0.38
Nodes (5): public.checklist_template_items, public.checklist_templates, public.save_checklist_template(), set_checklist_template_items_updated_at, set_checklist_templates_updated_at

### Community 334 - "20260813120000_studio_member_lifecycle.sql"
Cohesion: 0.52
Nodes (6): private.can_access_project(), private.can_view_profile(), public.get_studio_member_removal_impact(), public.remove_studio_member(), public.restore_studio_member(), public.studio_members

### Community 335 - "20260817172631_leaderboard_bonus_rules.sql"
Cohesion: 0.38
Nodes (5): create_default_leaderboard_bonus_rules_after_studio_insert, private.create_default_leaderboard_bonus_rules(), public.leaderboard_bonus_rules, public.studios, set_leaderboard_bonus_rules_updated_at

### Community 336 - "20260821100000_stage_progress_methods.sql"
Cohesion: 0.43
Nodes (5): private.validate_stage_progress_method(), private.validate_task_stage_area_allocation(), public.project_task_stage_columns, public.projects, validate_task_stage_area_allocation_before_write

### Community 337 - "20260830130000_google_calendar_phase_one.sql"
Cohesion: 0.38
Nodes (6): public.google_calendar_connections, public.google_calendar_event_mappings, public.google_calendar_server_credentials, set_google_calendar_connections_updated_at, set_google_calendar_event_mappings_updated_at, set_google_calendar_server_credentials_updated_at

### Community 338 - "Diagnostic Scan"
Cohesion: 0.33
Nodes (6): 1. Accessibility (VoiceOver / TalkBack), 2. Performance, 3. Appearance & Theming, 4. Platform Conformance (CRITICAL), 5. Adaptivity, Diagnostic Scan

### Community 339 - "bolder.md"
Cohesion: 0.33
Nodes (5): Before you finish, Scope is sovereign, The amplification, The skeleton test, Why it reads flat

### Community 340 - "normalizeGitHubEvent"
Cohesion: 0.47
Nodes (6): applyPatchText(), envProjectDir(), looksLikeApplyPatch(), normalizeGitHubEvent(), normalizeHookEvent(), parseGitHubToolArgs()

### Community 341 - "Slides"
Cohesion: 0.33
Nodes (5): References (Knowledge Base), Routing, Slides, Subcommands, When to Use

### Community 342 - "Supabase Postgres Best Practices"
Cohesion: 0.33
Nodes (5): How to Use, References, Rule Categories by Priority, Supabase Postgres Best Practices, When to Apply

### Community 343 - "Pre-Delivery Checklist"
Cohesion: 0.33
Nodes (6): Accessibility, Interaction, Layout, Light/Dark Mode, Pre-Delivery Checklist, Visual Quality

### Community 344 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 345 - "Equipment reference catalog"
Cohesion: 0.33
Nodes (5): Category mapping, Controlled operator workflow, Equipment reference catalog, History, search and synchronization, Source contract

### Community 346 - "Core workflows"
Cohesion: 0.33
Nodes (6): Availability and events, Core workflows, Productivity, Project delivery, Studio operations, Task delivery and progress

### Community 347 - "leads-workspace.test.ts"
Cohesion: 0.33
Nodes (5): actionsPath, cityComboboxPath, metadataControlsPath, projectFormPath, workspacePath

### Community 348 - "finance-project-builder.spec.ts"
Cohesion: 0.20
Nodes (10): actors, bankId, categoryId, clearFoundation(), client, contractorId, local, projectId (+2 more)

### Community 349 - "crm-lead-lifecycle-migration.test.ts"
Cohesion: 0.33
Nodes (5): backfillMigration, enumMigration, markAllRoute, migration, notificationsQuery

### Community 353 - "20260909104850_add_crm_lead_lifecycle_behavior.sql"
Cohesion: 0.47
Nodes (5): log_crm_lead_history_after_write, private.log_crm_lead_history(), private.sync_crm_lead_follow_up_notification(), public.crm_lead_history, sync_crm_lead_follow_up_notification_after_write

### Community 356 - "vercel.json"
Cohesion: 0.33
Nodes (5): crons, main, git, deploymentEnabled, $schema

### Community 358 - "Brand Guidelines Template"
Cohesion: 0.40
Nodes (4): Brand Guidelines Template, Document Structure, Extractable Fields, Usage

### Community 359 - "finance-project-visual.spec.ts"
Cohesion: 0.20
Nodes (10): actors, bankId, categoryId, clearFoundation(), client, contractorId, local, projectId (+2 more)

### Community 360 - "inline-ignores.mjs"
Cohesion: 0.40
Nodes (9): addRules(), applyInlineIgnores(), getSet(), hasDirectives(), isInlineIgnored(), normalizeRule(), parseInlineIgnores(), parseRuleList() (+1 more)

### Community 361 - "time-picker.tsx"
Cohesion: 0.31
Nodes (8): isTimePickerDiscreteWheel(), parseTime(), scrollToSelected(), globalsPath, TIME_PICKER_HOURS, TIME_PICKER_MINUTES, TimePicker(), TimePickerProps

### Community 362 - "readConfig"
Cohesion: 0.40
Nodes (5): cloneDefaultConfig(), detectorSection(), hookSection(), readConfig(), safeReadJson()

### Community 363 - "Common Rules for Professional UI"
Cohesion: 0.40
Nodes (5): Common Rules for Professional UI, Icons & Visual Elements, Interaction (App), Layout & Spacing, Light/Dark Mode Contrast

### Community 364 - "Example Workflow"
Cohesion: 0.40
Nodes (5): Example Workflow, Step 1: Analyze Requirements, Step 2: Generate Design System (REQUIRED), Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 365 - "Q: Trace Office submission comments from database schema and RLS through server mutation and client drawer Realtime synchronization"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Trace Office submission comments from database schema and RLS through server mutation and client drawer Realtime synchronization, Source Nodes

### Community 366 - "Q: Fix the leaderboard previous period leader calculation."
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Fix the leaderboard previous period leader calculation., Source Nodes

### Community 367 - "Q: Investigate and fix the stale-session/auth-resume failure after StudioFlow is left open"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Investigate and fix the stale-session/auth-resume failure after StudioFlow is left open, Source Nodes

### Community 368 - "Q: Which modules own the Finance information architecture, Accounts configuration, and Movements ledger UX?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Which modules own the Finance information architecture, Accounts configuration, and Movements ledger UX?, Source Nodes

### Community 369 - "package.json"
Cohesion: 0.40
Nodes (4): name, packageManager, private, version

### Community 370 - "legal-pages.test.ts"
Cohesion: 0.40
Nodes (4): englishMessagesPath, layoutPath, privacyPath, termsPath

### Community 371 - "theme-switch.test.ts"
Cohesion: 0.40
Nodes (4): layoutPath, shellControlPath, stylesPath, switchPath

### Community 372 - "floor-plan-view.test.ts"
Cohesion: 0.40
Nodes (4): actions, floorPlan, query, workspace

### Community 373 - "project-code-visibility.test.ts"
Cohesion: 0.40
Nodes (4): archivePath, projectContextPath, projectDetailsPath, projectListPath

### Community 374 - "project-template-stage-dialog.test.ts"
Cohesion: 0.40
Nodes (4): boardPath, dialogPath, mutationPath, projectPagePath

### Community 375 - "notification-insert-shape-migration.test.ts"
Cohesion: 0.50
Nodes (4): insertParts(), notificationsMigration, patchMigration, topLevelExpressions()

### Community 378 - "20260818120000_add_contractor_category_colors.sql"
Cohesion: 0.50
Nodes (4): public.contractor_categories, public.contractors, public.resolve_contractor_category(), set_contractor_categories_updated_at

### Community 380 - "20260829180000_add_meeting_presentation_mode.sql"
Cohesion: 0.50
Nodes (3): private.validate_meeting_presentation_event(), public.calendar_events, validate_meeting_presentation_event_before_write

### Community 383 - "20260909113540_link_crm_leads_to_projects.sql"
Cohesion: 0.60
Nodes (4): public.create_project_from_template(), public.crm_lead_history, public.crm_leads, public.projects

### Community 387 - "finance-visual-audit.spec.ts"
Cohesion: 0.20
Nodes (7): actors, bank, client, foreign, local, secondBank, studio

### Community 388 - "task-payload.spec.ts"
Cohesion: 0.20
Nodes (7): accounts, login(), projectId, service, settings, studioId, tasks

### Community 389 - "finance_project_terms"
Cohesion: 0.39
Nodes (9): Coverage diagnostics, Explicit manual visit override, finance_project_terms, Historical Kyiv visit pricing, Historical retainer extra pricing, Overview attention, Planning request audit, Project agreement revisions (+1 more)

### Community 390 - "Heuristics Scoring Guide"
Cohesion: 0.50
Nodes (4): Heuristics Scoring Guide, Issue Severity (P0–P3), Reference Material, Score Summary

### Community 391 - "detect.mjs"
Cohesion: 0.50
Nodes (3): candidates, detectorPath, __dirname

### Community 392 - "hook.mjs"
Cohesion: 0.83
Nodes (3): isStopEvent(), main(), readStdin()

### Community 393 - "validate_data.py"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 394 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 395 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 396 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 397 - "calendar/page.tsx"
Cohesion: 0.31
Nodes (7): CalendarPage(), validDate(), CalendarWorkspace(), getCalendarRange(), reconcileCalendarItems(), removeCalendarItem(), CalendarView

### Community 398 - "contractor-permissions.contract.test.ts"
Cohesion: 0.50
Nodes (3): actionsPath, directoryPath, pagePath

### Community 399 - "stage-configuration-controls.test.ts"
Cohesion: 0.50
Nodes (3): boardPath, dialogPath, mutationPath

### Community 400 - "task-details-drawer.test.ts"
Cohesion: 0.50
Nodes (3): collaboratorControlPath, deadlineEditorPath, drawerPath

### Community 401 - "task-drawer-reopen.test.ts"
Cohesion: 0.50
Nodes (3): myTasksPath, projectBoardPath, taskDrawerCallers

### Community 402 - "finance-opening-valuation.spec.ts"
Cohesion: 0.22
Nodes (6): actors, bank, client, dollars, local, studio

### Community 403 - "auth-autocomplete.test.ts"
Cohesion: 0.50
Nodes (3): loginPath, recoveryPath, resetPath

### Community 404 - "crm-lead-follow-up-migration.test.ts"
Cohesion: 0.50
Nodes (3): enumMigration, stateMigration, statusSyncMigration

### Community 405 - "crm-lead-metadata-migration.test.ts"
Cohesion: 0.50
Nodes (3): constraintMigrationPath, currencyMigrationPath, migrationPath

### Community 406 - "project-city-geonames-mutation.test.ts"
Cohesion: 0.50
Nodes (3): createActionPath, editActionPath, projectQueryPath

### Community 407 - "public-table-privileges-migration.test.ts"
Cohesion: 0.50
Nodes (3): migrationPath, taskDeleteMigrationPath, taskStatusInsertMigrationPath

### Community 409 - "20260806175022_add_project_city_geonames_id.sql"
Cohesion: 0.67
Nodes (3): enforce_structured_project_metadata_before_update, private.enforce_structured_project_metadata(), public.projects

### Community 413 - "20260818180000_canonical_project_types.sql"
Cohesion: 0.67
Nodes (3): enforce_structured_project_metadata_before_update, private.enforce_structured_project_metadata(), public.projects

### Community 420 - "20260910120551_task_deadline_completion_history.sql"
Cohesion: 0.67
Nodes (3): private.record_task_deadline_completion(), public.task_deadline_completions, record_task_deadline_completion_after_status_change

### Community 430 - "checkRadialSpotlight"
Cohesion: 0.32
Nodes (8): checkElementRadialSpotlight(), checkElementRadialSpotlightDOM(), checkRadialSpotlight(), elementGradientValue(), parseColorMix(), parseRadialGradientStops(), splitTopLevelCommas(), spotlightLabel()

### Community 431 - "source-lock.mjs"
Cohesion: 0.50
Nodes (7): isLiveServerPidReachable(), clearStaleLock(), readLock(), releaseOwnLock(), sleepSync(), sourceLockPath(), withSourceLockSync()

### Community 432 - "[dayOffId]/route.ts"
Cohesion: 0.43
Nodes (7): Context, DELETE(), isDateOnly(), isRecord(), parseDayOff(), PATCH(), requireAdmin()

### Community 433 - "project-form.spec.ts"
Cohesion: 0.25
Nodes (4): admin, choose(), login(), settings

### Community 434 - "Project value and payment schedule builder"
Cohesion: 0.47
Nodes (5): Project value and payment schedule builder, finance_project_plan_immutable, public.finance_project_plan_items, public.finance_project_plan_revisions, public.save_finance_project_plan()

### Community 435 - "checkCreamPalette"
Cohesion: 1.00
Nodes (3): checkCreamPalette(), creamFromClassList(), isCreamColor()

## Knowledge Gaps
- **2479 isolated node(s):** `fs`, `path`, `fs`, `path`, `fs` (+2474 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **211 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buffer` connect `buffer` to `getActiveStudioMembership`, `queries/crm.ts`, `manual-edit-routes.mjs`, `hook.mjs`, `live-server.mjs`, `queries/equipment.ts`, `detect-csp.mjs`, `embed-prompt.mjs`, `createAdminClient`, `generate-image.mjs`, `live-wrap.mjs`, `hook-before-edit.mjs`, `tag-strategy.mjs`, `detect-antipatterns.mjs`, `equipment-catalog/sync.ts`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `handleKeyDown()` connect `setLiveState` to `live-browser.js`, `dialog.tsx`, `semantic-styles.ts`, `init`, `connectSSE`, `project-task-board.tsx`, `showToast`, `el`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `saveFinanceProject()` connect `project-value-builder.tsx` to `finance_project_items`, `schedules-workspace.tsx`, `createClient`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `fs` to the rest of the system?**
  _2479 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Finance` be split into smaller, more focused modules?**
  _Cohesion score 0.03212576896787423 - nodes in this community are weakly interconnected._
- **Should `live-browser.js` be split into smaller, more focused modules?**
  _Cohesion score 0.033870749220972766 - nodes in this community are weakly interconnected._
- **Should `queries/finance.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0388748419721871 - nodes in this community are weakly interconnected._