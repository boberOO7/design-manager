# Graph Report - design-manager  (2026-08-03)

## Corpus Check
- 349 files · ~183,809 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3188 nodes · 5313 edges · 220 communities (169 shown, 51 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f9b68140`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- project-context-band.tsx
- BM25
- lib/project-progress.ts
- task.ts
- slide_search_core.py
- [projectId]/page.tsx
- calendar-workspace.tsx
- queries/dashboard.ts
- lib/project-activity.ts
- spacing
- radius
- project-task-board.tsx
- validation/calendar.ts
- TestTailwindConfigGenerator
- design_system.py
- compilerOptions
- team/actions.ts
- html-token-validator.py
- administration-workspace.tsx
- gray
- project-list-presentation.ts
- addCalendarDays
- BM25
- Tailwind CSS Utility Reference
- lib/project-lifecycle.ts
- DesignSystemGenerator
- devDependencies
- dashboard/page.tsx
- createClient
- generate-slide.py
- TailwindConfigGenerator
- color
- main
- productivity.ts
- MonthView
- Brand Guidelines v1.0
- fetch-background.py
- queries/project-members.ts
- notification-bell.tsx
- lib/calendar.ts
- button
- TestShadcnInstaller
- BM25
- dependencies
- calendar-event-form.ts
- icon/generate.py
- fontSize
- project.ts
- extract-colors.cjs
- validate-asset.cjs
- ShadcnInstaller
- scripts/core.py
- leaderboard/page.tsx
- mock/index.ts
- app-header.tsx
- .add_components
- primitive
- validate-tokens.cjs
- queries/index.ts
- test_tailwind_config_gen.py
- inject-brand-context.cjs
- embed-tokens.cjs
- duration
- patch
- search
- logo/generate.py
- generate-tokens.cjs
- theme-switch.tsx
- ._base_config
- sync-brand-to-tokens.cjs
- _run
- package.json
- time-off-stabilization-migration.test.ts
- confirm/route.ts
- ._generate_javascript
- types/calendar.ts
- theme-switch.test.ts
- detect_domain
- checklist-autosave.ts
- button.tsx
- language-selector.test.ts
- primary
- notification-insert-shape-migration.test.ts
- task-progress.ts
- Design
- project-routes.localization.test.ts
- validate_data.py
- test_sync_brand_to_tokens.py
- main
- checklist-template-manager.tsx
- Canvas Design System
- shell-control.tsx
- Form & Input Components
- Tailwind CSS Responsive Design
- lib/administration.ts
- clsx
- .__init__
- app-layout.tsx
- calendar-migration.test.ts
- .test_add_components_dry_run
- .test_add_components_no_config
- .test_list_installed_no_config
- .test_init_dry_run
- .test_add_components_no_components
- .test_recommend_plugins
- .test_recommend_plugins_nextjs
- .test_init_default_typescript
- .test_generate_javascript_config
- .test_generate_config_with_colors
- .test_validate_config_valid
- .test_write_config_invalid_path
- .test_full_configuration_typescript
- .test_base_config_structure
- .test_default_content_paths_react
- task-details-drawer.tsx
- app-shell.test.ts
- eslint.config.mjs
- sm
- next.config.ts
- @supabase/supabase-js
- postcss.config.mjs
- administration-workspace.test.ts
- calendar-attendee-update-contract.test.ts
- calendar-fixes-migration.test.ts
- notifications-migration.test.ts
- Typography Specifications
- Logo Usage Rules
- Component Specifications
- shadcn/ui Accessibility Patterns
- Asset Approval Checklist
- Logo AI Prompt Engineering
- Color Palette Management
- CIP Deliverable Guide
- States and Variants
- UI Styling Skill
- What You Must Do When Invoked
- Workflow
- Design System
- Tailwind CSS Customization
- Routing by Task Type
- shadcn/ui Theming & Customization
- Asset Organization Guide
- Primary Color Meanings
- Core Logo Types
- Brand Consistency Checklist
- CIP Mockup Prompt Engineering
- Color Semantics
- Supabase
- Design Principles
- Design Principles
- CIP Design Reference
- Icon Design Reference
- Copywriting Formulas
- Copywriting Formulas
- Banner Design - Multi-Format Creative Banner System
- Messaging Framework
- Brand Voice Framework
- Layout Patterns
- Tailwind Integration
- Layout Patterns
- brand/references/update.md
- Logo Design Reference
- Token Architecture
- StudioFlow architecture decisions
- Primitive Tokens
- Core Visual Elements
- CIP Design Style Guide
- Changelog
- Quick Reference
- Brand
- Slide Strategies
- Component Tokens
- Slide Strategies
- StudioFlow product specification
- StudioFlow roadmap
- Prerequisites
- graphify reference: extra exports and benchmark
- ui-ux-pro-max
- Slides Reference
- HTML Slide Template
- HTML Slide Template
- How to Use This Skill
- Slides
- Pre-Delivery Checklist
- graphify reference: query, path, explain
- Brand Guidelines Template
- Common Rules for Professional UI
- Example Workflow
- @dnd-kit/react
- StudioFlow
- studio-checklist-template-migration.test.ts
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- README.md
- checklist-template-manager.test.ts
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- slides-create.md
- create.md
- extraction-spec.md
- productivity-migration.test.ts
- project-activity-migration.test.ts
- task-details-drawer.test.ts
- task-progress-migration.test.ts
- task-status.test.ts
- ring
- add-task-dialog.test.ts
- task-checklist-template-migration.test.ts
- @supabase/ssr
- calendar-workspace.localization.test.ts
- next-intl
- @radix-ui/react-slot
- zod

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 83 edges
2. `TailwindConfigGenerator` - 58 edges
3. `getActiveStudioMembership()` - 36 edges
4. `TestTailwindConfigGenerator` - 35 edges
5. `cn()` - 35 edges
6. `ShadcnInstaller` - 34 edges
7. `getCurrentUserProfile` - 28 edges
8. `TestShadcnInstaller` - 26 edges
9. `getActiveStudioAdmin()` - 25 edges
10. `getCanonicalRoleTranslationKey()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `TestDomainDetection` --uses--> `BM25`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_core.py → .agents/skills/design/scripts/cip/core.py
- `TestPersistence` --uses--> `BM25`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_core.py → .agents/skills/design/scripts/cip/core.py
- `TestReasoningMatch` --uses--> `BM25`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_core.py → .agents/skills/design/scripts/cip/core.py
- `TestSearchDomains` --uses--> `BM25`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_core.py → .agents/skills/design/scripts/cip/core.py
- `TestTokenizer` --uses--> `BM25`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_core.py → .agents/skills/design/scripts/cip/core.py

## Import Cycles
- None detected.

## Communities (220 total, 51 thin omitted)

### Community 0 - "project-context-band.tsx"
Cohesion: 0.20
Nodes (11): ProjectContextBand(), ProjectContextProject, LifecycleContext, ProjectLifecycleProvider(), useProjectLifecycle(), ProjectLifecycleControls(), ProjectWorkspace(), getProjectAttributionMode() (+3 more)

### Community 1 - "BM25"
Cohesion: 0.07
Nodes (42): BM25, detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+34 more)

### Community 2 - "lib/project-progress.ts"
Cohesion: 0.15
Nodes (20): ProjectProgressSettings(), calculatePersonalProgress(), calculateProjectProgress(), calculateTaskProgress(), calendarDate(), ChecklistItemForProgress, clampPercent(), getCalendarDaysBetween() (+12 more)

### Community 3 - "task.ts"
Cohesion: 0.09
Nodes (41): PATCH(), PATCH(), createProjectTask(), revalidateMyTasks(), revalidateTaskCreationRoutes(), updateTaskStatus(), TaskStatusControl(), updateTaskDetailsMutation() (+33 more)

### Community 4 - "slide_search_core.py"
Cohesion: 0.09
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 5 - "[projectId]/page.tsx"
Cohesion: 0.13
Nodes (29): PATCH(), ArchivePage(), metadata, metadata, MyTasksPage(), archiveProject(), restoreProject(), revalidateProjectRoutes() (+21 more)

### Community 6 - "calendar-workspace.tsx"
Cohesion: 0.10
Nodes (25): AgendaView(), CalendarWorkspace(), dateLabel(), Drawer, eventTypeKey, isCalendarItem(), isMutationResult(), ItemPanel() (+17 more)

### Community 7 - "queries/dashboard.ts"
Cohesion: 0.13
Nodes (36): DashboardTaskList(), AdminDashboard, DashboardData, DashboardDeadline, DashboardProjectRow, DashboardTaskForDrawer, DashboardTaskRow, EmployeeDashboard (+28 more)

### Community 8 - "lib/project-activity.ts"
Cohesion: 0.30
Nodes (13): ActivityRow(), initials(), ProjectActivitySection(), ActivityChange, ActivityChanges, formatActivityValue(), formatRelativeTime(), getActivityChangeText() (+5 more)

### Community 9 - "spacing"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 10 - "radius"
Cohesion: 0.13
Nodes (22): $type, $value, lg, $type, $value, $type, $value, $type (+14 more)

### Community 11 - "project-task-board.tsx"
Cohesion: 0.10
Nodes (34): BoardColumn(), DraggableTaskCard(), getColumnDropId(), getColumnIdFromDropTarget(), interactiveSelector, keyboardSensor, pointerSensor, ProjectTaskBoard() (+26 more)

### Community 12 - "validation/calendar.ts"
Cohesion: 0.09
Nodes (31): CalendarSupabaseClient, getVerifiedActiveAdminMembership(), POST(), Context, PATCH(), CalendarSupabaseClient, getVerifiedTimeOffMembership(), POST() (+23 more)

### Community 13 - "TestTailwindConfigGenerator"
Cohesion: 0.07
Nodes (15): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test generating TypeScript configuration., Test generating config with plugins., Test validating config with no content paths., Test validating config with empty theme extensions. (+7 more)

### Community 14 - "design_system.py"
Cohesion: 0.11
Nodes (25): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides() (+17 more)

### Community 15 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 16 - "team/actions.ts"
Cohesion: 0.13
Nodes (20): inviteEmployee(), isExistingAuthUserError(), requestPasswordRecovery(), ForgotPasswordForm(), InviteEmployeeForm(), getAuthConfirmationUrl(), createAdminClient(), EmployeeInvitationActionState (+12 more)

### Community 17 - "html-token-validator.py"
Cohesion: 0.14
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 18 - "administration-workspace.tsx"
Cohesion: 0.27
Nodes (9): AvailabilityRow(), DecisionRow(), PendingRequestRow(), RequestDrawer(), typeKey(), Drawer(), getDrawerTabFocusTarget(), formatAdministrationDateRange() (+1 more)

### Community 19 - "gray"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 20 - "project-list-presentation.ts"
Cohesion: 0.08
Nodes (38): metadata, ProjectsPage(), DeadlineSummary(), ProjectListControls(), controlsPath, healthKeys, ProjectDeadlines(), ProjectDesktopRow() (+30 more)

### Community 21 - "addCalendarDays"
Cohesion: 0.67
Nodes (6): addCalendarDays(), getCalendarRange(), getMonthGrid(), parseDateOnly(), startOfMondayWeek(), toDateOnly()

### Community 22 - "BM25"
Cohesion: 0.12
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 23 - "Tailwind CSS Utility Reference"
Cohesion: 0.05
Nodes (43): Arbitrary Values, Aspect Ratio, Background Colors, Border Color, Border Radius, Border Style, Border Width, Borders (+35 more)

### Community 24 - "lib/project-lifecycle.ts"
Cohesion: 0.16
Nodes (19): PATCH(), ProjectLifecycleMutationResult, updateProjectLifecycleStatus(), canUpdateProjectMetadata(), countOpenLifecycleTasks(), getAutomaticProjectStatus(), getLifecycleCompletedAt(), getRestoredProjectStatus() (+11 more)

### Community 25 - "DesignSystemGenerator"
Cohesion: 0.13
Nodes (12): DesignSystemGenerator, Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., Generates design system recommendations from aggregated searches. (+4 more)

### Community 26 - "devDependencies"
Cohesion: 0.10
Nodes (21): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, supabase, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 27 - "dashboard/page.tsx"
Cohesion: 0.12
Nodes (23): Admin(), Availability(), DashboardPage(), Deadlines(), Employee(), DashboardSection(), MetricStrip(), metricToneClasses (+15 more)

### Community 28 - "createClient"
Cohesion: 0.09
Nodes (30): Context, DELETE(), PATCH(), PATCH(), POST(), ActiveStudioMembership, getActiveStudioMembership(), StudioMembershipRow (+22 more)

### Community 29 - "generate-slide.py"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 30 - "TailwindConfigGenerator"
Cohesion: 0.10
Nodes (11): Generate Tailwind CSS configuration files., Add full color palette (50-950 shades) for a base color. Args: name: Color name…, TailwindConfigGenerator, Test adding custom fonts., Test adding custom spacing., Test that adding same plugin twice doesn't duplicate., Test initialization for JavaScript config., Test initialization with different frameworks. (+3 more)

### Community 31 - "color"
Cohesion: 0.06
Nodes (31): $type, $value, background, destructive, destructive-foreground, foreground, muted, muted-foreground (+23 more)

### Community 32 - "main"
Cohesion: 0.11
Nodes (10): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate configuration file content. Returns: Configuration file as string, Write configuration to file. Returns: Tuple of (success, message) (+2 more)

### Community 33 - "productivity.ts"
Cohesion: 0.23
Nodes (11): getLeaderboardForMonth(), canCompleteAttributedTask(), getKyivMonthBounds(), isEligibleProjectFallbackContributor(), kyivParts(), LEADERBOARD_BONUS_BY_RANK, LeaderboardBonusPercent, ProductivityAttribution (+3 more)

### Community 34 - "MonthView"
Cohesion: 0.25
Nodes (11): CalendarPill(), DayDetails(), itemTone(), MonthView(), formatCalendarTime(), getMonthDateLaneLayout(), getMonthFlowItemOffset(), getMonthItemGeometry() (+3 more)

### Community 35 - "Brand Guidelines v1.0"
Cohesion: 0.05
Nodes (37): 1. Color Palette, 2. Typography, 3. Logo Usage, 4. Voice & Tone, 5. Imagery Guidelines, 6. Design Components, Accessibility, AI Image Generation (+29 more)

### Community 36 - "fetch-background.py"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 37 - "queries/project-members.ts"
Cohesion: 0.11
Nodes (25): addProjectMember(), getFormString(), ProjectMemberActionState, removeProjectMember(), revalidateProjectMembership(), getInitials(), metadata, TeamPage() (+17 more)

### Community 38 - "notification-bell.tsx"
Cohesion: 0.19
Nodes (14): iconFor(), NotificationBell(), relativeTime(), getSegmentedControlItemProps(), SegmentedControl(), SegmentedControlItem, NotificationData, NotificationItem (+6 more)

### Community 39 - "lib/calendar.ts"
Cohesion: 0.09
Nodes (37): WeekView(), calendarItemTimestamp(), canAttendCalendarEvent(), compareCanonical(), deduplicateCalendarItems(), DEFAULT_CALENDAR_FILTERS, formatTimeOffAvailabilityTitle(), getCurrentWeekTimePosition() (+29 more)

### Community 40 - "button"
Cohesion: 0.06
Nodes (45): $type, $value, $type, $value, bg, fg, font-size, hover-bg (+37 more)

### Community 41 - "TestShadcnInstaller"
Cohesion: 0.12
Nodes (10): Test ShadcnInstaller class., Test adding all components without config., Test adding all components in dry run mode., Create temporary project structure., Test listing installed components when none exist., Test listing installed components when they exist., Test checking for existing shadcn config., Test getting installed components without config. (+2 more)

### Community 42 - "BM25"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 43 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, @hookform/resolvers, lucide-react, next, dependencies, class-variance-authority, @hookform/resolvers, lucide-react (+9 more)

### Community 44 - "calendar-event-form.ts"
Cohesion: 0.26
Nodes (11): EventForm(), CalendarEventFormValues, createCalendarEventFormValues(), getAllDayEventBounds(), splitWallDateTime(), baseValues, toCalendarEventMutationPayload(), instantToWallInput() (+3 more)

### Community 45 - "icon/generate.py"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 46 - "fontSize"
Cohesion: 0.11
Nodes (20): $type, $value, $type, $value, $type, $value, $type, $value (+12 more)

### Community 47 - "project.ts"
Cohesion: 0.16
Nodes (15): createProject(), NewProjectPage(), ProjectForm(), ProjectFormAction, ProjectFormDefaults, dateSchema, EditProjectFormValues, getOptionalString() (+7 more)

### Community 48 - "extract-colors.cjs"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 49 - "validate-asset.cjs"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 50 - "ShadcnInstaller"
Cohesion: 0.14
Nodes (8): Handle shadcn/ui component installation., ShadcnInstaller, Test adding components that are already installed., Test initialization with default project root., Test initialization with custom project root., Test checking for non-existent shadcn config., Test getting installed components when none exist., Test getting installed components when files exist.

### Community 51 - "scripts/core.py"
Cohesion: 0.21
Nodes (12): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+4 more)

### Community 52 - "leaderboard/page.tsx"
Cohesion: 0.33
Nodes (8): BonusBadge(), formatArea(), LeaderboardPage(), metadata, getLeaderboardData(), getLeaderboardOverviewData(), getLeaderboardBonusPercent(), getLeaderboardTotals()

### Community 53 - "mock/index.ts"
Cohesion: 0.10
Nodes (24): dashboardMetrics, employeeWorkload, leaderboardEntries, projectAreaProgress, projectMembers, studioProfiles, studioProjects, studioTasks (+16 more)

### Community 54 - "app-header.tsx"
Cohesion: 0.23
Nodes (12): AppLayout(), StudioFlowMark(), AppHeader(), getInitials(), AppSidebar(), MobileNavigation(), getNavigationItems(), isNavigationItemActive() (+4 more)

### Community 55 - ".add_components"
Cohesion: 0.17
Nodes (8): main(), Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…, Tests for shadcn_add.py

### Community 56 - "primitive"
Cohesion: 0.15
Nodes (12): $type, $value, dark, semantic, primitive, $schema, $type, $value (+4 more)

### Community 57 - "validate-tokens.cjs"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 58 - "queries/index.ts"
Cohesion: 0.15
Nodes (16): getAccessibleProjects(), getDashboardMetrics(), getEmployeeWorkload(), getMyTasks(), getProjectAreaProgress(), getProjectById(), AccessibleProjectRow, AccessibleProjectsResult (+8 more)

### Community 59 - "test_tailwind_config_gen.py"
Cohesion: 0.20
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 60 - "inject-brand-context.cjs"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 61 - "embed-tokens.cjs"
Cohesion: 0.20
Nodes (9): args, extractTokens(), fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath (+1 more)

### Community 62 - "duration"
Cohesion: 0.20
Nodes (10): fast, normal, slow, $type, $value, $type, $value, duration (+2 more)

### Community 63 - "patch"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 64 - "search"
Cohesion: 0.24
Nodes (6): Main search function with auto-domain detection, search(), format_output(), Format results for Claude consumption (token-optimized), Known query -> expected top-domain sanity checks (not exact-row pinning, since…, TestSearchDomains

### Community 65 - "logo/generate.py"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 66 - "generate-tokens.cjs"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 67 - "theme-switch.tsx"
Cohesion: 0.18
Nodes (14): geistMono, geistSans, viewport, applyTheme(), getServerThemeSnapshot(), getThemeSnapshot(), subscribeToTheme(), syncThemeColor() (+6 more)

### Community 68 - "._base_config"
Cohesion: 0.22
Nodes (6): Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework., Any

### Community 69 - "sync-brand-to-tokens.cjs"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 70 - "_run"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 71 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 72 - "time-off-stabilization-migration.test.ts"
Cohesion: 0.22
Nodes (7): foundation, insertPolicyFix, migration, migrationNames, migrations, migrationsDirectory, notificationShapeFix

### Community 73 - "confirm/route.ts"
Cohesion: 0.50
Nodes (5): GET(), getInvalidLinkRedirect(), getSafeConfirmationDestination(), getSupportedEmailOtpType(), SupportedEmailOtpType

### Community 74 - "._generate_javascript"
Cohesion: 0.29
Nodes (4): Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string.

### Community 75 - "types/calendar.ts"
Cohesion: 0.18
Nodes (19): CalendarPage(), metadata, validDate(), CalendarQueryInput, getCalendarData(), getInclusiveAllDayEndDate(), instantToDateOnly(), normalizePrivateTimeOff() (+11 more)

### Community 76 - "theme-switch.test.ts"
Cohesion: 0.40
Nodes (4): layoutPath, shellControlPath, stylesPath, switchPath

### Community 77 - "detect_domain"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 78 - "checklist-autosave.ts"
Cohesion: 0.13
Nodes (18): ChecklistAutosaveStore, ChecklistChange, ChecklistMutationResult, ChecklistSnapshot, getChecklistAutosaveStore(), isChecklistMutationResult(), Listener, PendingUpdate (+10 more)

### Community 79 - "button.tsx"
Cohesion: 0.17
Nodes (12): setUserPassword(), SetPasswordPage(), SetPasswordForm(), ProjectStatusAction(), Button, ButtonProps, buttonVariants, getSetPasswordInput() (+4 more)

### Community 81 - "primary"
Cohesion: 0.67
Nodes (3): primary, $type, $value

### Community 82 - "notification-insert-shape-migration.test.ts"
Cohesion: 0.50
Nodes (4): insertParts(), notificationsMigration, patchMigration, topLevelExpressions()

### Community 83 - "task-progress.ts"
Cohesion: 0.22
Nodes (14): DELETE(), PATCH(), POST(), PATCH(), authorizeChecklistEdit(), createChecklistItem(), deleteChecklistItem(), loadUpdatedTask() (+6 more)

### Community 84 - "Design"
Cohesion: 0.06
Nodes (35): Banner Design (Built-in), Banner: Design Rules, Banner: Quick Size Reference, Banner: Top Art Styles, Banner: Workflow, CIP Design (Built-in), CIP: Generate Brief, CIP: Generate Mockups (+27 more)

### Community 86 - "validate_data.py"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 89 - "checklist-template-manager.tsx"
Cohesion: 0.16
Nodes (20): ChecklistTemplateManager(), createStage(), Draft, SortableStageRow(), stageKeyboardSensor, stagePointerSensor, stageSensors, TemplateEditor() (+12 more)

### Community 90 - "Canvas Design System"
Cohesion: 0.06
Nodes (35): 1. Visual Communication First, 2. Minimal Text Integration, 3. Expert Craftsmanship, 4. Systematic Patterns, Analog Meditation, Approach, Canvas Boundaries, Canvas Design System (+27 more)

### Community 91 - "shell-control.tsx"
Cohesion: 0.16
Nodes (11): LoginPage(), SignOutButton(), LanguageSelector(), ShellControl, ShellControlProps, AppLocale, isAppLocale(), locales (+3 more)

### Community 92 - "Form & Input Components"
Cohesion: 0.06
Nodes (32): Accordion, Alert, Alert Dialog, Avatar, Badge, Button, Card, Checkbox (+24 more)

### Community 93 - "Tailwind CSS Responsive Design"
Cohesion: 0.06
Nodes (32): 1. Mobile-First Design, 2. Consistent Breakpoint Usage, 3. Test at Breakpoint Boundaries, 4. Use Container for Content Width, 5. Progressive Enhancement, 6. Avoid Too Many Breakpoints, Best Practices, Breakpoint System (+24 more)

### Community 94 - "lib/administration.ts"
Cohesion: 0.23
Nodes (16): AdminPage(), metadata, AdministrationWorkspace(), getAdministrationData(), AdministrationModel, AdministrationRequest, applyAdministrationDecision(), canReceiveAdministrationModel() (+8 more)

### Community 114 - "task-details-drawer.tsx"
Cohesion: 0.12
Nodes (24): ProjectBadges(), MyTasksList(), sections, ChecklistItemRow(), makeFormValues(), TaskDetailsDrawer(), TaskEditResponse, TaskWorkResponse (+16 more)

### Community 115 - "app-shell.test.ts"
Cohesion: 0.33
Nodes (5): controlPath, dashboardPath, headerPath, sidebarPath, stylesPath

### Community 117 - "sm"
Cohesion: 0.60
Nodes (5): sm, sm, sm, $type, $value

### Community 131 - "Typography Specifications"
Cohesion: 0.06
Nodes (30): Accessibility, Base System, Best Practices, Clean & Modern, Common Font Pairings, Contrast Requirements, CSS Implementation, Editorial (+22 more)

### Community 132 - "Logo Usage Rules"
Cohesion: 0.07
Nodes (28): Absolute Don'ts, Approved Backgrounds, Before Using Logo, Clear Space, Co-branding, Color Rules, Color Usage, Color Variants (+20 more)

### Community 133 - "Component Specifications"
Cohesion: 0.07
Nodes (28): Alert, Anatomy, Anatomy, Anatomy, Anatomy, Anatomy, Badge, Button (+20 more)

### Community 134 - "shadcn/ui Accessibility Patterns"
Cohesion: 0.07
Nodes (28): Accordion, Alert, ARIA Labels, Checkbox and Radio, Color Contrast, Command Palette Navigation, Component-Specific Patterns, Dialog/Modal Navigation (+20 more)

### Community 135 - "Asset Approval Checklist"
Cohesion: 0.08
Nodes (25): Accessibility, Archival, Asset Approval Checklist, Automation Support, Color Compliance, Common Issues & Fixes, Content Accessibility, Content Quality (+17 more)

### Community 136 - "Logo AI Prompt Engineering"
Cohesion: 0.08
Nodes (25): Common Pitfalls, Core Prompt Structure, Detailed Brief, Eco/Sustainable, Effective Keywords by Style, Fashion Brand, Healthcare, Industry-Specific Prompts (+17 more)

### Community 137 - "Color Palette Management"
Cohesion: 0.08
Nodes (24): Accessibility Requirements, Brand Compliance Validation, Checking Contrast, Color Documentation Format, Color Extraction, Color Palette Examples, Color Palette Management, Color System Structure (+16 more)

### Community 138 - "CIP Deliverable Guide"
Cohesion: 0.08
Nodes (24): Apparel, Business Card, Car/Sedan, CIP Deliverable Guide, Core Identity, Digital Assets, Email Signature, Envelope (+16 more)

### Community 139 - "States and Variants"
Cohesion: 0.08
Nodes (24): Accessibility, Accessibility Requirements, ARIA States, Color Contrast, Color Variants, Disabled States, Error Messages, Error States (+16 more)

### Community 140 - "UI Styling Skill"
Cohesion: 0.08
Nodes (24): Accessibility Patterns, Alternative: Tailwind-Only Setup, Best Practices, Common Patterns, Component Layer: shadcn/ui, Component Library Guide, Component + Styling Setup, Core Stack (+16 more)

### Community 141 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 142 - "Workflow"
Cohesion: 0.08
Nodes (23): Art Direction Styles (Reuse from Banner), Color & Contrast, Design Best Practices, HTML Design Rules, HTML Template Structure, Option A: Chrome Headless CLI (Recommended — zero dependencies), Option B: chrome-devtools skill, Option C: Playwright script (+15 more)

### Community 143 - "Design System"
Cohesion: 0.09
Nodes (22): Best Practices, Chart.js Integration, Command, Component Spec Pattern, Contextual Decision Flow, Decision System CSVs, Design System, Integration (+14 more)

### Community 144 - "Tailwind CSS Customization"
Cohesion: 0.09
Nodes (22): @apply Directive, Best Practices, Color Customization, Complete Tailwind Config, Configuration Examples, Content Configuration, Custom Color Palette, Custom Font Sizes (+14 more)

### Community 145 - "Routing by Task Type"
Cohesion: 0.10
Nodes (19): Banner Design Tasks, Brand Identity Tasks, Component Creation, Corporate Identity Program Tasks, Design Routing Guide, Design System Migration, Icon Design Tasks, Implementation Tasks (+11 more)

### Community 146 - "shadcn/ui Theming & Customization"
Cohesion: 0.10
Nodes (19): Base Color Presets, Best Practices, Color Customization, Color Format, Component Customization, CSS Variable System, Customize Styles, Customize Variants (+11 more)

### Community 147 - "Asset Organization Guide"
Cohesion: 0.11
Nodes (18): Asset Entry (manifest.json), Asset Organization Guide, By Campaign, By Status, By Type, Cleanup Workflow, Components, Directory Structure (+10 more)

### Community 148 - "Primary Color Meanings"
Cohesion: 0.11
Nodes (18): Accessibility Considerations, Analogous, Black, Blue, Color Combinations by Industry, Color Harmony Types, Complementary, Green (+10 more)

### Community 149 - "Core Logo Types"
Cohesion: 0.11
Nodes (18): 1. Wordmark (Logotype), 2. Lettermark (Monogram), 3. Pictorial Mark (Brand Mark), 4. Abstract Mark, 5. Mascot, 6. Emblem, 7. Combination Mark, Aesthetic Styles (+10 more)

### Community 150 - "Brand Consistency Checklist"
Cohesion: 0.11
Nodes (17): Audit Frequency, Brand Consistency Checklist, Channel Audit, Collateral, Colors, Common Issues, Email, Imagery (+9 more)

### Community 151 - "CIP Mockup Prompt Engineering"
Cohesion: 0.11
Nodes (17): Apparel (Polo/T-Shirt), Base Prompt Structure, Business Card, CIP Mockup Prompt Engineering, Context Modifiers, Corporate Minimal, Deliverable-Specific Modifiers, Letterhead (+9 more)

### Community 152 - "Color Semantics"
Cohesion: 0.11
Nodes (17): Accent, Applying Semantic Tokens, Background & Foreground, Border & Ring, Color Semantics, Dark Mode Overrides, Destructive, Interactive States (+9 more)

### Community 153 - "Supabase"
Cohesion: 0.12
Nodes (14): Fix suggestion, Source, What happened, Skill Feedback, Steps, Core Principles, Making and Committing Schema Changes, Option A: Declarative schemas (+6 more)

### Community 154 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 155 - "Design Principles"
Cohesion: 0.12
Nodes (15): 22 Art Direction Styles, Banner Sizes & Art Direction Styles Reference, Complete Banner Sizes, CTA Rules, Design Principles, Pinterest Research Queries, Print, Print Specs (+7 more)

### Community 156 - "CIP Design Reference"
Cohesion: 0.13
Nodes (14): CIP Brief (Start Here), CIP Design Reference, Commands, Deliverable Categories, Design Styles, Detailed References, Generate Mockups, HTML Presentation Features (+6 more)

### Community 157 - "Icon Design Reference"
Cohesion: 0.13
Nodes (14): Available Styles, CLI Options, Commands, Generate Batch Variations, Generate Multiple Sizes, Generate Single Icon, Icon Categories, Icon Design Reference (+6 more)

### Community 158 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 159 - "Copywriting Formulas"
Cohesion: 0.13
Nodes (14): AIDA (Attention-Interest-Desire-Action), Before-After-Bridge, Contrast Patterns, Copywriting Formulas, Core Formulas, Cost of Inaction, FAB (Features-Advantages-Benefits), Formula-to-Slide Mapping (+6 more)

### Community 161 - "Banner Design - Multi-Format Creative Banner System"
Cohesion: 0.14
Nodes (13): Art Direction Styles (Top 10), Banner Design - Multi-Format Creative Banner System, Banner Size Quick Reference, Design Rules, Prerequisites, Security, Step 1: Gather Requirements (AskUserQuestion), Step 2: Research & Art Direction (+5 more)

### Community 162 - "Messaging Framework"
Cohesion: 0.14
Nodes (13): Core Statements, Elevator Pitches, Framework Structure, Message Architecture, Message by Audience, Message Testing, Messaging Framework, Mission Statement (+5 more)

### Community 163 - "Brand Voice Framework"
Cohesion: 0.14
Nodes (13): Brand Voice Framework, Character Spectrum, Emotion Spectrum, Language Spectrum, Step 1: Define Personality Traits, Step 2: Create Voice Chart, Step 3: Context Adaptation, Tone Spectrum (+5 more)

### Community 164 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 165 - "Tailwind Integration"
Cohesion: 0.14
Nodes (13): Animation Tokens, Base Layer, Button Example, Component Classes, CSS Variables Setup, Dark Mode Toggle, HSL Format Benefits, shadcn/ui Alignment (+5 more)

### Community 166 - "Layout Patterns"
Cohesion: 0.14
Nodes (13): Card Styles, Component Variants, CSS Structures, Feature Grid (3 columns), Layout Decision Flow, Layout Patterns, Layout Selection by Use Case, Metric Styles (+5 more)

### Community 167 - "brand/references/update.md"
Cohesion: 0.15
Nodes (12): Color Presets, Examples, Files Modified, Important, Overview, Skills Used, Step 1: Gather Brand Input, Step 2: Update Brand Guidelines (+4 more)

### Community 168 - "Logo Design Reference"
Cohesion: 0.15
Nodes (12): Available Styles, Color Psychology, Commands, Design Brief (Start Here), Detailed References, Generate Logo, Industry Defaults, Logo Design Reference (+4 more)

### Community 169 - "Token Architecture"
Cohesion: 0.15
Nodes (12): Categories, Dark Mode, File Organization, Layer 1: Primitive Tokens, Layer 2: Semantic Tokens, Layer 3: Component Tokens, Layer Overview, Migration from Flat Tokens (+4 more)

### Community 170 - "StudioFlow architecture decisions"
Cohesion: 0.13
Nodes (14): Administration, Calendar, Employee invitation and onboarding, In-app notifications, Productivity attribution, Project Activity History, Project archive lifecycle, Project lifecycle workflow (+6 more)

### Community 171 - "Primitive Tokens"
Cohesion: 0.17
Nodes (11): Border Radius, Color Scales, Gray Scale, Motion / Duration, Primary Colors (Blue), Primitive Tokens, Shadows, Spacing Scale (+3 more)

### Community 172 - "Core Visual Elements"
Cohesion: 0.18
Nodes (10): Color Palette, Colors, Core Visual Elements, Logo, Logo, Quick Checks, Typography, Typography (+2 more)

### Community 173 - "CIP Design Style Guide"
Cohesion: 0.18
Nodes (10): Bold Dynamic, CIP Design Style Guide, Classic Traditional, Color Psychology, Corporate Minimal, Fresh Modern, Luxury Premium, Modern Tech (+2 more)

### Community 174 - "Changelog"
Cohesion: 0.18
Nodes (10): [0.1.3](https://github.com/supabase/agent-skills/compare/v0.1.2...v0.1.3) (2026-06-02), [0.1.4](https://github.com/supabase/agent-skills/compare/v0.1.3...v0.1.4) (2026-06-05), [0.1.5](https://github.com/supabase/agent-skills/compare/v0.1.4...v0.1.5) (2026-07-10), Bug Fixes, Bug Fixes, Bug Fixes, Changelog, Features (+2 more)

### Community 175 - "Quick Reference"
Cohesion: 0.18
Nodes (11): 10. Charts & Data (LOW), 1. Accessibility (CRITICAL), 2. Touch & Interaction (CRITICAL), 3. Performance (HIGH), 4. Style Selection (HIGH), 5. Layout & Responsive (HIGH), 6. Typography & Color (MEDIUM), 7. Animation (MEDIUM) (+3 more)

### Community 176 - "Brand"
Cohesion: 0.20
Nodes (9): Brand, Brand Sync Workflow, Quick Start, References, Routing, Scripts, Subcommands, Templates (+1 more)

### Community 177 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 178 - "Component Tokens"
Cohesion: 0.20
Nodes (9): Alert Tokens, Badge Tokens, Button Tokens, Card Tokens, Component Tokens, Dialog/Modal Tokens, Input Tokens, Table Tokens (+1 more)

### Community 179 - "Slide Strategies"
Cohesion: 0.20
Nodes (9): Common Structures, Duarte Sparkline Pattern, Matching Strategy to Context, Product Demo (6 slides), Sales Pitch (9 slides), Search Commands, Slide Strategies, Strategy Selection (+1 more)

### Community 180 - "StudioFlow product specification"
Cohesion: 0.20
Nodes (9): Access, Access roles, Admin, Employee, Productivity, Professional titles, Project roles, Projects (+1 more)

### Community 181 - "StudioFlow roadmap"
Cohesion: 0.20
Nodes (9): Administration, Calendar, Foundation, Notifications, Production, Projects, StudioFlow roadmap, Tasks and progress (+1 more)

### Community 183 - "Prerequisites"
Cohesion: 0.22
Nodes (9): Available Domains, Available Stacks, Common Sticking Points, Output Formats, Pre-Delivery Checklist, Prerequisites, Query Strategy, Search Reference (+1 more)

### Community 184 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 185 - "ui-ux-pro-max"
Cohesion: 0.25
Nodes (7): How to Use, Primary Use Cases, Recommended, Rule Categories by Priority, Skip, ui-ux-pro-max, When to Apply

### Community 186 - "Slides Reference"
Cohesion: 0.29
Nodes (6): Key Features, Knowledge Base, Slides Reference, Usage, When to Use, Workflow

### Community 187 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 188 - "HTML Slide Template"
Cohesion: 0.29
Nodes (6): Animation Classes, Background Images, Base Structure, Chart.js Integration, CSS Variables Reference, HTML Slide Template

### Community 189 - "How to Use This Skill"
Cohesion: 0.29
Nodes (7): How to Use This Skill, Step 1: Analyze User Requirements, Step 2: Generate Design System (REQUIRED), Step 2b: Persist Design System (Master + Overrides Pattern), Step 2c: Design Dials (optional), Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 190 - "Slides"
Cohesion: 0.33
Nodes (5): References (Knowledge Base), Routing, Slides, Subcommands, When to Use

### Community 191 - "Pre-Delivery Checklist"
Cohesion: 0.33
Nodes (6): Accessibility, Interaction, Layout, Light/Dark Mode, Pre-Delivery Checklist, Visual Quality

### Community 192 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 193 - "Brand Guidelines Template"
Cohesion: 0.40
Nodes (4): Brand Guidelines Template, Document Structure, Extractable Fields, Usage

### Community 195 - "Common Rules for Professional UI"
Cohesion: 0.40
Nodes (5): Common Rules for Professional UI, Icons & Visual Elements, Interaction (App), Layout & Spacing, Light/Dark Mode Contrast

### Community 196 - "Example Workflow"
Cohesion: 0.40
Nodes (5): Example Workflow, Step 1: Analyze Requirements, Step 2: Generate Design System (REQUIRED), Step 3: Supplement with Detailed Searches (as needed), Step 4: Stack Guidelines

### Community 198 - "StudioFlow"
Cohesion: 0.50
Nodes (3): Context routing, graphify, StudioFlow

### Community 201 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 202 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 203 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 204 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 222 - "ring"
Cohesion: 0.67
Nodes (3): ring, $type, $value

## Knowledge Gaps
- **1285 isolated node(s):** `fs`, `path`, `fs`, `path`, `fs` (+1280 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `productivity.ts`, `task.ts`, `queries/project-members.ts`, `[projectId]/page.tsx`, `queries/dashboard.ts`, `confirm/route.ts`, `types/calendar.ts`, `validation/calendar.ts`, `project.ts`, `team/actions.ts`, `button.tsx`, `task-progress.ts`, `project-list-presentation.ts`, `lib/project-lifecycle.ts`, `queries/index.ts`, `lib/administration.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `primitive` connect `primitive` to `spacing`, `radius`, `fontSize`, `gray`, `duration`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `getCanonicalRoleTranslationKey()` connect `queries/project-members.ts` to `calendar-workspace.tsx`, `calendar-event-form.ts`, `team/actions.ts`, `task-details-drawer.tsx`, `leaderboard/page.tsx`, `app-header.tsx`, `checklist-template-manager.tsx`, `dashboard/page.tsx`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `fs` to the rest of the system?**
  _1285 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BM25` be split into smaller, more focused modules?**
  _Cohesion score 0.06693877551020408 - nodes in this community are weakly interconnected._
- **Should `task.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08734693877551021 - nodes in this community are weakly interconnected._