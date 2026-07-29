# Graph Report - .  (2026-07-29)

## Corpus Check
- 300 files · ~158,310 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1731 nodes · 3564 edges · 131 communities (97 shown, 34 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- gray
- BM25
- lib/tasks.ts
- task-actions.ts
- slide search core.py
- lib/calendar.ts
- types/calendar.ts
- queries/dashboard.ts
- queries/index.ts
- spacing
- calendar-workspace.tsx
- validation/calendar.ts
- administration-workspace.tsx
- TestTailwindConfigGenerator
- design system.py
- compilerOptions
- team/actions.ts
- html-token-validator.py
- cn()
- createClient()
- project-list-presentation.ts
- queries/project-members.ts
- BM25
- project-context-band.tsx
- lib/project-lifecycle.ts
- DesignSystemGenerator
- devDependencies
- project.ts
- semantic-styles.ts
- generate-slide.py
- TailwindConfigGenerator
- color
- main()
- getCurrentUserProfile
- database.types.ts
- lib/project-progress.ts
- fetch-background.py
- getActiveStudioMembership()
- dashboard/page.tsx
- task-details-drawer.tsx
- card
- TestShadcnInstaller
- BM25
- dependencies
- app-header.tsx
- icon/generate.py
- fontSize
- notification-bell.tsx
- extract-colors.cjs
- validate-asset.cjs
- ShadcnInstaller
- scripts/core.py
- server.ts
- types/index.ts
- design-tokens-starter.json
- .add components()
- [requestId]/route.ts
- validate-tokens.cjs
- input
- test tailwind config gen.py
- inject-brand-context.cjs
- embed-tokens.cjs
- primitive
- patch
- search()
- logo/generate.py
- generate-tokens.cjs
- button
- . base config()
- sync-brand-to-tokens.cjs
- run()
- package.json
- time-off-stabilization-migration.test.ts
- radius
- . generate javascript()
- confirm/route.ts
- login/page.tsx
- detect domain()
- shadow
- radius
- lg
- app/layout.tsx
- notification-insert-shape-migration.test.ts
- xl
- md
- none
- validate data.py
- test sync brand to tokens.py
- main()
- destructive
- foreground
- muted
- muted-foreground
- primary-hover
- ring
- test shadcn add.py
- . init ()
- app-layout.tsx
- calendar-migration.test.ts
- .test add components dry run()
- .test check shadcn config exists()
- .test get installed components empty()
- .test get installed components with
- .test add components no components()
- .test recommend plugins()
- .test recommend plugins nextjs()
- .test init default typescript()
- .test generate javascript config()
- .test generate config with colors()
- .test validate config valid()
- .test write config invalid path()
- .test full configuration typescript()
- .test base config structure()
- .test default content paths react()
- clsx
- @dnd-kit/react
- eslint.config.mjs
- lucide-react
- next.config.ts
- react
- @supabase/ssr
- @supabase/supabase-js
- postcss.config.mjs
- administration-workspace.test.ts
- calendar-attendee-update-contract.test.ts
- calendar-fixes-migration.test.ts
- notifications-migration.test.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 71 edges
2. `TailwindConfigGenerator` - 58 edges
3. `TestTailwindConfigGenerator` - 35 edges
4. `ShadcnInstaller` - 34 edges
5. `getActiveStudioMembership()` - 32 edges
6. `cn()` - 30 edges
7. `getCurrentUserProfile` - 27 edges
8. `TestShadcnInstaller` - 26 edges
9. `getActiveStudioAdmin()` - 23 edges
10. `DesignSystemGenerator` - 19 edges

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

## Communities (131 total, 34 thin omitted)

### Community 0 - "gray"
Cohesion: 0.05
Nodes (53): $type, $value, $type, $value, $type, $value, $type, $value (+45 more)

### Community 1 - "BM25"
Cohesion: 0.07
Nodes (42): BM25, detect_domain(), get_cip_brief(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+34 more)

### Community 2 - "lib/tasks.ts"
Cohesion: 0.09
Nodes (39): ProjectContextProject, ProjectWorkspace(), BoardColumn(), DraggableTaskCard(), getColumnDropId(), getColumnIdFromDropTarget(), interactiveSelector, keyboardSensor (+31 more)

### Community 3 - "task-actions.ts"
Cohesion: 0.10
Nodes (35): PATCH(), PATCH(), revalidateMyTasks(), revalidateTaskCreationRoutes(), updateTaskStatus(), TaskStatusControl(), updateTaskDetailsMutation(), AuthorizedTask (+27 more)

### Community 4 - "slide search core.py"
Cohesion: 0.09
Nodes (36): format_context(), format_result(), main(), Format a single search result for display, Format contextual recommendations for display., BM25, calculate_pattern_break(), detect_domain() (+28 more)

### Community 5 - "lib/calendar.ts"
Cohesion: 0.11
Nodes (36): AgendaView(), CalendarWorkspace(), MonthView(), param(), addCalendarDays(), calendarItemTimestamp(), canAttendCalendarEvent(), DEFAULT_CALENDAR_FILTERS (+28 more)

### Community 6 - "types/calendar.ts"
Cohesion: 0.12
Nodes (31): CalendarPage(), metadata, validDate(), EventForm(), CalendarQueryInput, getCalendarData(), deduplicateCalendarItems(), CalendarEventFormValues (+23 more)

### Community 7 - "queries/dashboard.ts"
Cohesion: 0.14
Nodes (33): AdminDashboard, DashboardData, DashboardDeadline, DashboardProjectRow, DashboardTaskForDrawer, DashboardTaskRow, EmployeeDashboard, getDashboard() (+25 more)

### Community 8 - "queries/index.ts"
Cohesion: 0.09
Nodes (31): LeaderboardPage(), dashboardMetrics, employeeWorkload, getAccessibleProjects(), getDashboardMetrics(), getEmployeeWorkload(), getLeaderboard(), getMyTasks() (+23 more)

### Community 9 - "spacing"
Cohesion: 0.06
Nodes (34): $type, $value, $type, $value, $type, $value, $type, $value (+26 more)

### Community 10 - "calendar-workspace.tsx"
Cohesion: 0.11
Nodes (26): CalendarPill(), dateLabel(), DayDetails(), Drawer, eventLabels, isCalendarItem(), isMutationResult(), itemLabel() (+18 more)

### Community 11 - "validation/calendar.ts"
Cohesion: 0.11
Nodes (25): CalendarSupabaseClient, getVerifiedActiveAdminMembership(), POST(), CalendarSupabaseClient, getVerifiedTimeOffMembership(), POST(), VerifiedTimeOffMembership, getNormalizedTimeOffRequest() (+17 more)

### Community 12 - "administration-workspace.tsx"
Cohesion: 0.17
Nodes (23): AdminPage(), metadata, AdministrationWorkspace(), AvailabilityRow(), DecisionRow(), labels, PendingRequestRow(), RequestDrawer() (+15 more)

### Community 13 - "TestTailwindConfigGenerator"
Cohesion: 0.07
Nodes (15): Test adding colors multiple times., Test adding full color palette., Test adding custom breakpoints., Test TailwindConfigGenerator class., Test generating TypeScript configuration., Test generating config with plugins., Test validating config with no content paths., Test validating config with empty theme extensions. (+7 more)

### Community 14 - "design system.py"
Cohesion: 0.11
Nodes (25): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides() (+17 more)

### Community 15 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 16 - "team/actions.ts"
Cohesion: 0.14
Nodes (17): inviteEmployee(), isExistingAuthUserError(), requestPasswordRecovery(), ForgotPasswordForm(), InviteEmployeeForm(), getAuthConfirmationUrl(), createAdminClient(), EmployeeInvitationActionState (+9 more)

### Community 17 - "html-token-validator.py"
Cohesion: 0.14
Nodes (24): get_context(), is_allowed_exception(), is_allowed_rgba(), is_inside_block(), load_css_variables(), main(), print_result(), print_summary() (+16 more)

### Community 18 - "cn()"
Cohesion: 0.14
Nodes (17): DashboardSection(), MetricStrip(), metricToneClasses, OperationalSurface(), MetricCard(), AddTaskDialog(), Drawer(), FormField() (+9 more)

### Community 19 - "createClient()"
Cohesion: 0.21
Nodes (22): Context, DELETE(), PATCH(), archiveProject(), restoreProject(), revalidateProjectRoutes(), updateProject(), getProjectView() (+14 more)

### Community 20 - "project-list-presentation.ts"
Cohesion: 0.16
Nodes (20): metadata, ProjectsPage(), labels, ProjectListControls(), getAccessibleProjectsWithTasks(), compareNullableDate(), defaultFilters, filterAndSortProjects() (+12 more)

### Community 21 - "queries/project-members.ts"
Cohesion: 0.14
Nodes (19): addProjectMember(), getFormString(), ProjectMemberActionState, removeProjectMember(), revalidateProjectMembership(), AddProjectMemberForm(), getInitials(), ProjectTeamSection() (+11 more)

### Community 22 - "BM25"
Cohesion: 0.12
Nodes (19): BM25, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection, Search across all domains and combine results (+11 more)

### Community 23 - "project-context-band.tsx"
Cohesion: 0.14
Nodes (14): DeadlineSummary(), LifecycleContext, ProjectLifecycleProvider(), useProjectLifecycle(), actions, ProjectLifecycleControls(), ProjectDeadlines(), ProjectStatusAction() (+6 more)

### Community 24 - "lib/project-lifecycle.ts"
Cohesion: 0.17
Nodes (17): PATCH(), ProjectLifecycleMutationResult, updateProjectLifecycleStatus(), canUpdateProjectMetadata(), countOpenLifecycleTasks(), getAutomaticProjectStatus(), getLifecycleCompletedAt(), getRestoredProjectStatus() (+9 more)

### Community 25 - "DesignSystemGenerator"
Cohesion: 0.13
Nodes (12): DesignSystemGenerator, Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., Generates design system recommendations from aggregated searches. (+4 more)

### Community 26 - "devDependencies"
Cohesion: 0.10
Nodes (21): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, supabase, tailwindcss, @tailwindcss/postcss (+13 more)

### Community 27 - "project.ts"
Cohesion: 0.16
Nodes (16): createProject(), metadata, NewProjectPage(), ProjectForm(), ProjectFormAction, ProjectFormDefaults, dateSchema, EditProjectFormValues (+8 more)

### Community 28 - "semantic-styles.ts"
Cohesion: 0.20
Nodes (16): ProjectContextBand(), ProjectDesktopRow(), ProjectItem, ProjectList(), ProjectMobileCard(), ProjectProgress(), getProjectHref(), getProjectProgressLabel() (+8 more)

### Community 29 - "generate-slide.py"
Cohesion: 0.15
Nodes (19): _e(), generate_chart_slide(), generate_cta_slide(), generate_deck(), generate_metrics_slide(), generate_problem_slide(), generate_solution_slide(), generate_testimonial_slide() (+11 more)

### Community 30 - "TailwindConfigGenerator"
Cohesion: 0.10
Nodes (11): Generate Tailwind CSS configuration files., Add full color palette (50-950 shades) for a base color. Args: name: Color name…, TailwindConfigGenerator, Test adding custom fonts., Test adding custom spacing., Test that adding same plugin twice doesn't duplicate., Test initialization for JavaScript config., Test initialization with different frameworks. (+3 more)

### Community 31 - "color"
Cohesion: 0.11
Nodes (19): $type, $value, background, destructive-foreground, primary, primary-foreground, secondary, secondary-foreground (+11 more)

### Community 32 - "main()"
Cohesion: 0.11
Nodes (10): main(), Add custom font families. Args: fonts: Dict of font_type: [font_names] e.g.,…, Add custom spacing values. Args: spacing: Dict of name: value e.g., {'18':…, Add custom breakpoints. Args: breakpoints: Dict of name: width e.g., {'3xl':…, Add plugin requirements. Args: plugins: List of plugin names e.g.,…, Get plugin recommendations based on configuration. Returns: List of recommended…, Generate configuration file content. Returns: Configuration file as string, Write configuration to file. Returns: Tuple of (success, message) (+2 more)

### Community 33 - "getCurrentUserProfile"
Cohesion: 0.20
Nodes (13): ArchivePage(), metadata, AppLayout(), metadata, metadata, MyTasksPage(), EditProjectPage(), metadata (+5 more)

### Community 34 - "database.types.ts"
Cohesion: 0.13
Nodes (15): ArchivedProject, ArchivedProjectsResult, ProjectRow, updateSession(), proxy(), CompositeTypes, Constants, Database (+7 more)

### Community 35 - "lib/project-progress.ts"
Cohesion: 0.16
Nodes (15): AccessibleProjectWithTasks, ProjectListRow, ProjectRow, calculatePersonalProgress(), calculateProjectProgress(), calendarDate(), getCalendarDaysBetween(), getProjectHealth() (+7 more)

### Community 36 - "fetch-background.py"
Cohesion: 0.17
Nodes (17): generate_css_for_background(), get_background_image(), get_curated_images(), get_overlay_css(), get_pexels_search_url(), load_backgrounds_config(), load_brand_colors(), main() (+9 more)

### Community 37 - "getActiveStudioMembership()"
Cohesion: 0.19
Nodes (12): PATCH(), POST(), getInitials(), metadata, TeamPage(), ActiveStudioMembership, getActiveStudioMembership(), StudioMembershipRow (+4 more)

### Community 38 - "dashboard/page.tsx"
Cohesion: 0.21
Nodes (14): AdminDashboard(), DashboardPage(), Deadlines(), EmployeeDashboard(), metadata, EmptyState(), DASHBOARD_EMPTY_STATES, DashboardMetric (+6 more)

### Community 39 - "task-details-drawer.tsx"
Cohesion: 0.29
Nodes (14): DashboardTaskList(), MyTasksList(), sections, TaskCardContent(), makeFormValues(), TaskDetailsDrawer(), TaskEditResponse, getTaskStatusBadgeStyle() (+6 more)

### Community 40 - "card"
Cohesion: 0.15
Nodes (17): $type, $value, $type, $value, bg, bg, border, padding (+9 more)

### Community 41 - "TestShadcnInstaller"
Cohesion: 0.12
Nodes (10): Test ShadcnInstaller class., Test adding all components without config., Test adding all components in dry run mode., Create temporary project structure., Test listing installed components when none exist., Test listing installed components when they exist., Test initialization with default project root., Test initialization with custom project root. (+2 more)

### Community 42 - "BM25"
Cohesion: 0.15
Nodes (9): BM25, _normalize(), Apply synonym substitution before tokenizing., BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes. (+1 more)

### Community 43 - "dependencies"
Cohesion: 0.12
Nodes (17): class-variance-authority, @hookform/resolvers, next, dependencies, class-variance-authority, @hookform/resolvers, next, @radix-ui/react-slot (+9 more)

### Community 44 - "app-header.tsx"
Cohesion: 0.27
Nodes (10): AppHeader(), AppSidebar(), MobileNavigation(), getNavigationItems(), isNavigationItemActive(), navigationIcons, NavigationItem, navigationItems (+2 more)

### Community 45 - "icon/generate.py"
Cohesion: 0.20
Nodes (15): apply_color(), apply_viewbox_size(), extract_svgs(), generate_batch(), generate_icon(), generate_sizes(), load_env(), main() (+7 more)

### Community 46 - "fontSize"
Cohesion: 0.12
Nodes (16): $type, $value, $type, $value, $type, $value, $type, $value (+8 more)

### Community 47 - "notification-bell.tsx"
Cohesion: 0.26
Nodes (12): iconFor(), NotificationBell(), relativeTime(), NotificationData, NotificationItem, NotificationRow, markAllNotificationsRead(), markNotificationRead() (+4 more)

### Community 48 - "extract-colors.cjs"
Cohesion: 0.22
Nodes (11): calculateCompliance(), colorDistance(), displayPalette(), extractHexColors(), findNearestBrandColor(), fs, generateImageMagickCommand(), hexToRgb() (+3 more)

### Community 49 - "validate-asset.cjs"
Cohesion: 0.25
Nodes (13): checkManifest(), formatBytes(), formatOutput(), fs, main(), parseFilename(), path, RULES (+5 more)

### Community 50 - "ShadcnInstaller"
Cohesion: 0.14
Nodes (8): Handle shadcn/ui component installation., ShadcnInstaller, Test adding components without shadcn config., Test adding components that are already installed., Test listing installed components without config., Test initialization with dry run mode., Test checking for non-existent shadcn config., Test getting installed components without config.

### Community 51 - "scripts/core.py"
Cohesion: 0.21
Nodes (12): _domain_keywords(), _get_bm25(), _load_csv(), _load_product_keywords(), Load CSV and return list of dicts, with mtime-based caching., Fitted BM25 index for this file+columns, with mtime-based caching., Core search function using BM25. Returns (results, bm25_or_none)., Nearest known vocabulary terms for a query that returned 0 hits, so the caller… (+4 more)

### Community 52 - "server.ts"
Cohesion: 0.29
Nodes (8): setUserPassword(), SetPasswordPage(), SetPasswordForm(), getSetPasswordInput(), SetPasswordActionState, SetPasswordField, setPasswordSchema, SetPasswordValues

### Community 53 - "types/index.ts"
Cohesion: 0.15
Nodes (11): AuthSession, LeaderboardEntry, ProjectAreaProgressEntry, ProjectMember, ProjectPriority, ProjectStatus, SystemRole, Task (+3 more)

### Community 54 - "design-tokens-starter.json"
Cohesion: 0.15
Nodes (12): component, $type, $value, dark, semantic, $schema, $type, $value (+4 more)

### Community 55 - ".add components()"
Cohesion: 0.22
Nodes (7): main(), Add all available shadcn/ui components. Args: overwrite: If True, overwrite…, List installed components. Returns: Tuple of (success, message with component…, Check if shadcn is initialized in project. Returns: True if components.json…, Get list of already installed components. Returns: List of installed component…, Read shadcn version from project package.json; fall back to a pinned default., Add shadcn/ui components. Args: components: List of component names to add…

### Community 56 - "[requestId]/route.ts"
Cohesion: 0.24
Nodes (10): Context, PATCH(), canTransitionTimeOff(), deriveTimeOffUpdate(), base, TimeOffAction, TimeOffActorRole, TimeOffUpdate (+2 more)

### Community 57 - "validate-tokens.cjs"
Cohesion: 0.24
Nodes (11): extensions, formatReport(), fs, getFiles(), main(), parseArgs(), path, patterns (+3 more)

### Community 58 - "input"
Cohesion: 0.20
Nodes (12): padding-x, padding-y, input, $type, $value, focus-ring, padding-x, padding-y (+4 more)

### Community 59 - "test tailwind config gen.py"
Cohesion: 0.20
Nodes (8): Tests for tailwind_config_gen.py, Reduce a generated TS/JS config to a bare assignable object so it can be handed…, Regression guard for the missing-comma bug between the ``theme`` block and…, The property preceding ``plugins`` must end with a comma (pure-Python check, so…, The emitted config parses as valid JS via ``node --check``., _strip_to_object(), TestGeneratedConfigIsValidJs, parametrize

### Community 60 - "inject-brand-context.cjs"
Cohesion: 0.31
Nodes (10): extractColorsFromTable(), extractCoreAttributes(), extractHexColors(), extractImageStyle(), extractTypography(), extractVoice(), fs, generatePromptAddition() (+2 more)

### Community 61 - "embed-tokens.cjs"
Cohesion: 0.20
Nodes (9): args, extractTokens(), fs, minimal, MINIMAL_TOKENS, path, projectRoot, tokensPath (+1 more)

### Community 62 - "primitive"
Cohesion: 0.18
Nodes (11): fast, normal, slow, $type, $value, $type, $value, primitive (+3 more)

### Community 63 - "patch"
Cohesion: 0.18
Nodes (6): Test adding components with overwrite flag., Test successful component addition., Test component addition with subprocess error., Test component addition when npx is not found., Test successful addition of all components., patch

### Community 64 - "search()"
Cohesion: 0.24
Nodes (6): Main search function with auto-domain detection, search(), format_output(), Format results for Claude consumption (token-optimized), Known query -> expected top-domain sanity checks (not exact-row pinning, since…, TestSearchDomains

### Community 65 - "logo/generate.py"
Cohesion: 0.29
Nodes (9): enhance_prompt(), generate_batch(), generate_logo(), load_env(), main(), Enhance the logo prompt with style and industry modifiers, Generate a logo using Gemini models with image generation Args: aspect_ratio:…, Generate multiple logo variants with different styles (+1 more)

### Community 66 - "generate-tokens.cjs"
Cohesion: 0.36
Nodes (9): flattenTokens(), fs, generateCSS(), generateTailwind(), main(), parseArgs(), path, resolveReference() (+1 more)

### Community 67 - "button"
Cohesion: 0.20
Nodes (10): fg, font-size, hover-bg, button, $type, $value, $type, $value (+2 more)

### Community 68 - ". base config()"
Cohesion: 0.22
Nodes (6): Path, Initialize generator. Args: typescript: If True, generate .ts config, else .js…, Determine default output path., Create base configuration structure., Get default content paths for framework., Any

### Community 69 - "sync-brand-to-tokens.cjs"
Cohesion: 0.33
Nodes (8): adjustBrightness(), { execFileSync }, extractColorsFromMarkdown(), fs, generateColorScale(), main(), path, updateDesignTokens()

### Community 70 - "run()"
Cohesion: 0.28
Nodes (8): Path, Regression tests for validate-tokens.cjs. The validator used to skip any line…, A hardcoded hex on the same line as a var() token is still a violation., A line that references only tokens produces no false positives., _run(), test_flags_hardcoded_hex_sharing_line_with_token(), test_token_only_line_reports_no_violation(), CompletedProcess

### Community 71 - "package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 72 - "time-off-stabilization-migration.test.ts"
Cohesion: 0.22
Nodes (7): foundation, insertPolicyFix, migration, migrationNames, migrations, migrationsDirectory, notificationShapeFix

### Community 73 - "radius"
Cohesion: 0.29
Nodes (8): $type, $value, $type, $value, radius, default, full, default

### Community 74 - ". generate javascript()"
Cohesion: 0.29
Nodes (4): Generate TypeScript configuration., Generate JavaScript configuration., Format plugins array for config. Validates each plugin name against a strict…, Add indentation to JSON string.

### Community 75 - "confirm/route.ts"
Cohesion: 0.50
Nodes (5): GET(), getInvalidLinkRedirect(), getSafeConfirmationDestination(), getSupportedEmailOtpType(), SupportedEmailOtpType

### Community 76 - "login/page.tsx"
Cohesion: 0.43
Nodes (4): LoginPage(), SignOutButton(), createClient(), loginSchema

### Community 77 - "detect domain()"
Cohesion: 0.43
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 78 - "shadow"
Cohesion: 0.47
Nodes (6): sm, shadow, sm, sm, $type, $value

### Community 79 - "radius"
Cohesion: 0.60
Nodes (5): radius, radius, radius, $type, $value

### Community 80 - "lg"
Cohesion: 0.60
Nodes (5): lg, $type, $value, lg, lg

### Community 81 - "app/layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 82 - "notification-insert-shape-migration.test.ts"
Cohesion: 0.50
Nodes (4): insertParts(), notificationsMigration, patchMigration, topLevelExpressions()

### Community 83 - "xl"
Cohesion: 0.67
Nodes (4): xl, xl, $type, $value

### Community 84 - "md"
Cohesion: 0.67
Nodes (4): $type, $value, md, md

### Community 85 - "none"
Cohesion: 0.67
Nodes (4): $type, $value, none, none

### Community 86 - "validate data.py"
Cohesion: 0.83
Nodes (3): _check_file(), main(), _read_rows()

### Community 89 - "destructive"
Cohesion: 0.67
Nodes (3): destructive, $type, $value

### Community 90 - "foreground"
Cohesion: 0.67
Nodes (3): foreground, $type, $value

### Community 91 - "muted"
Cohesion: 0.67
Nodes (3): muted, $type, $value

### Community 92 - "muted-foreground"
Cohesion: 0.67
Nodes (3): muted-foreground, $type, $value

### Community 93 - "primary-hover"
Cohesion: 0.67
Nodes (3): primary-hover, $type, $value

### Community 94 - "ring"
Cohesion: 0.67
Nodes (3): ring, $type, $value

## Knowledge Gaps
- **337 isolated node(s):** `fs`, `path`, `fs`, `path`, `fs` (+332 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient()` to `task-actions.ts`, `types/calendar.ts`, `queries/dashboard.ts`, `queries/index.ts`, `validation/calendar.ts`, `administration-workspace.tsx`, `team/actions.ts`, `project-list-presentation.ts`, `queries/project-members.ts`, `lib/project-lifecycle.ts`, `project.ts`, `getCurrentUserProfile`, `database.types.ts`, `lib/project-progress.ts`, `getActiveStudioMembership()`, `app-header.tsx`, `notification-bell.tsx`, `server.ts`, `[requestId]/route.ts`, `confirm/route.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `primitive` connect `primitive` to `gray`, `radius`, `spacing`, `fontSize`, `shadow`, `design-tokens-starter.json`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `Button` connect `project-context-band.tsx` to `task-actions.ts`, `task-details-drawer.tsx`, `calendar-workspace.tsx`, `administration-workspace.tsx`, `team/actions.ts`, `cn()`, `project-list-presentation.ts`, `server.ts`, `queries/project-members.ts`, `project.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `TailwindConfigGenerator` (e.g. with `TestGeneratedConfigIsValidJs` and `TestTailwindConfigGenerator`) actually correct?**
  _`TailwindConfigGenerator` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `fs` to the rest of the system?**
  _337 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `gray` be split into smaller, more focused modules?**
  _Cohesion score 0.05370101596516691 - nodes in this community are weakly interconnected._
- **Should `BM25` be split into smaller, more focused modules?**
  _Cohesion score 0.06693877551020408 - nodes in this community are weakly interconnected._