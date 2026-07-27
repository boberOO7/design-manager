# StudioFlow product specification

StudioFlow is a project and productivity manager for interior design studios
with approximately 20–30 active projects plus an archive.

## Access roles

Access roles define permissions in StudioFlow and are separate from a
person's profession or project role.

### Admin

- Sees all studio projects, employees, tasks and productivity metrics.
- Creates and edits projects.
- Assigns employees to projects.
- Creates and assigns tasks.
- Records completed project area.
- Manages employees and studio settings.

### Employee

- Sees only projects where they have an active assignment.
- Sees tasks assigned to them.
- Updates information permitted by the application's access rules.
- Sees their own workload and productivity information.

All non-admin employees initially have the same application permissions.

## Professional titles

A professional title describes the employee's profession and does not
determine application permissions.

Examples:

- Interior Designer
- Architect
- Visualizer
- Project Manager
- Studio Director

Professional titles are stored separately from access roles.

## Project roles

A project role describes the employee's responsibility within a particular
project.

Examples:

- Lead Designer
- Designer
- Architect
- Visualizer
- Manager
- Other

The same employee may have different roles in different projects.

## Projects

Each project includes:

- name and optional project code;
- client;
- description;
- total area in square metres;
- status and priority;
- start date and deadline;
- assigned employees and project roles;
- completed area;
- tasks and recent activity.

Project statuses:

- planned;
- active;
- paused;
- completed;
- archived.

## Productivity

StudioFlow tracks:

- assigned area per employee;
- completed area per employee;
- remaining area;
- active projects;
- open and overdue tasks;
- completed tasks;
- studio and employee workload.

## Access

- Admins can access every project in their studio.
- Employees can access only projects where they have an active project assignment.
- Database access is enforced by Supabase RLS.
