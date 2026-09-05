# StudioFlow product specification

## Purpose

StudioFlow is an internal operating system for an interior design studio. It is
designed for a working portfolio of roughly 20–30 active projects plus an
archive, and brings project delivery, personal work, team operations, studio
availability, and productivity reporting into one role-aware workspace.

The product favors clear operational state over broad analytics: what needs
attention, who is responsible, what is due, and what changed.

## User model

StudioFlow has two application access roles.

| Role | Product responsibility |
| --- | --- |
| Administrator | Manages the studio portfolio, project and task setup, team access, time-off decisions, operational assignments, templates, and reporting settings. |
| Employee | Works within assigned projects and tasks, participates in studio operations, manages personal availability, and sees information permitted by studio settings. |

Application access is separate from two descriptive concepts:

- A **professional title** describes a person's profession, such as architect,
  interior designer, visualizer, project manager, or studio director. It does
  not grant access.
- A **project membership** connects a person to a project. The database retains
  a project-role value, but per-project role selection is not currently part of
  the product workflow.

There is no public self-registration. Administrators invite employees into a
studio. An employee gains project access only when an administrator assigns the
person to that project.

## Product areas

| Area | Purpose |
| --- | --- |
| Dashboard | Role-specific operational summary: studio attention and workload for administrators; personal priorities and deadlines for employees. |
| Projects | Active project portfolio, project health, lifecycle, project details, team membership, task board, and activity history. |
| My Tasks | Personal assigned and collaborative work across accessible projects. |
| Calendar | Month, week, and agenda views combining studio events, availability, project deadlines, and task milestone deadlines. |
| Office | Internal work outside project production: submissions and standalone office assignments. |
| Team | Active and former studio members, profiles, invitations, and membership lifecycle. |
| Contractors | Shared contractor directory with studio-managed categories and subcategories. |
| Leaderboard | Monthly, quarterly, and yearly views of eligible productivity attribution; employee visibility is controlled by a studio setting. |
| Archive | Administrator view for archived projects and restoration. |
| Administration | Administrator action queue for time-off decisions plus checklist-template and leaderboard-bonus settings. |
| Notifications | Persistent, private updates delivered through the application header for relevant task, Calendar, time-off, submission, and office-assignment events. |

## Core workflows

### Project delivery

An administrator creates a project, assigns its team, and may create its task
structure directly or from a project template. Projects move through planned,
active, paused, completed, and archived states. Starting qualifying production
work can activate a planned project; pausing, completion, reopening, archiving,
and restoration remain controlled lifecycle actions.

The project workspace separates the board, project details, team, and immutable
activity history. Project health is a current operational signal derived from
lifecycle, deadlines, overdue work, and open priorities; it is not a stored
status chosen by a user.

### Task delivery and progress

Tasks belong to one of four project stages. Each stage exposes a configurable
subset of the shared workflow: To do, In progress, Internal review, Client
review, and Done. Tasks may have one assignee and additional collaborators.

An assigned employee can advance their work, record in-progress production,
and manage an eligible checklist. Administrators manage task definition,
assignment, stage configuration, and bulk movement. A checklist is a lightweight
weighted progress aid, not a hierarchy of subtasks.

Task progress feeds stage progress and project progress. Stage 4 is
post-completion work and does not contribute to the production progress total.

### Productivity

Productivity records completed work as durable attribution rather than
recalculating history from a task's current fields. Reopening work voids the
active completion attribution; completing it again creates a fresh attribution
from its stable snapshot.

The Leaderboard reports eligible credited area and task completions for a Kyiv
calendar month, quarter, or year. It is an operational production view, not a
substitute for performance review or broader people assessment.

### Availability and events

Employees submit time-off requests in Calendar. Administrators review them in
Calendar or Administration. Calendar also contains manually managed studio or
project events, live project deadlines, task milestone deadlines, approved
availability, company days off, and relevant people events.

Users may connect a dedicated StudioFlow-owned secondary Google calendar.
StudioFlow projects relevant real Calendar events outward to that calendar;
StudioFlow remains the authoritative source.

### Studio operations

Studio members use Office for non-project work. Submissions support requests,
suggestions, and complaints with type-specific privacy and workflow rules.
Office assignments are administrator-created responsibilities with a compact
assigned, in-progress, done, or cancelled lifecycle.

The contractor directory is collaborative: active members can add and update
contractors, while deletion and category administration remain administrator
actions.

## Vocabulary

| Term | Meaning |
| --- | --- |
| System role | `admin` or `employee`; controls application access. |
| Professional title | A person's stable profession; descriptive only. |
| Project membership | An active assignment that grants an employee visibility of a project. |
| Project lifecycle | Planned, active, paused, completed, or archived. |
| Task stage | One of four project phases; Stages 1–3 are production and Stage 4 is post-completion. |
| Task status | A workflow position from To do through Done. |
| Progress | Current completion state derived from tasks, checklists, and stage aggregation. |
| Productivity attribution | Immutable historical credit created by a qualifying completion transition. |
| Project health | Derived operational risk signal, separate from lifecycle and progress. |
| Relevant to me | The shared responsibility/participation rule used by Calendar filtering and Google projection. |
| Submission | Internal request, suggestion, or complaint in Office. |
| Office assignment | Non-project operational responsibility managed independently of tasks and productivity. |

## Privacy and authorization promises

- Studio data is tenant-scoped. An active user belongs to exactly one active
  studio in the current product model.
- Administrators can see all studio projects. Employees see projects only while
  actively assigned to them.
- Hiding a control never grants or removes authority; database policies remain
  the final access boundary.
- Private time-off and review notes are visible only to the requester and active
  administrators. Coworkers see approved availability as the person's name and
  the generic label “Out of office.”
- Notifications are recipient-private and exclude private time-off and review
  notes.
- Anonymous complaints do not expose an author identity or participant-oriented
  communication features.
- Project activity records safe structured changes, not descriptions, notes, or
  other free text.
- Productivity history survives task, project-member, and profile changes; studio
  deletion is the intentional tenant-wide deletion boundary.

## Current non-goals

- Public registration, multi-studio switching, and granular custom system roles.
- User-selected per-project roles or workload-area allocation during assignment.
- Treating checklist items as subtasks with assignees, comments, deadlines, or
  nested work.
- Google-to-StudioFlow synchronization, arbitrary external calendars, public
  holidays, attendees, or reminder mirroring.
- Email, push, realtime notification subscriptions, and scheduled deadline
  reminders.
- Using activity history as notification delivery or notification read state as
  an audit log.
- Combining Office records with project progress, project area, or productivity.

## Open product decisions

- Decide whether the legacy project-area progress model should receive a real
  recording workflow or be retired in favor of task-derived project progress.
- Decide whether per-project roles and assigned-area workload allocation should
  become user-facing features.
- Decide whether locale preference should persist on the profile across devices;
  it is currently a browser preference.
