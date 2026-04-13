# Developer Guide

## Purpose

This document explains how the ArcheryClubPoC application is put together so a new developer can understand the current design and continue building on it.

The application is a single-repository proof of concept for archery club operations. It combines:

- a React frontend served by Vite in development
- a single Express server in `server/index.js`
- a SQLite database in `server/data/auth.sqlite`

The codebase is feature-rich, but most backend behaviour lives in one large server file and most frontend behaviour lives in page-level React components.

## High-Level Architecture

At runtime the app has two main pieces:

1. The frontend runs in the browser.
   It uses React Router for navigation and TanStack Query for server state.
2. The backend runs as an Express app on port `3001`.
   It owns authentication, authorization, database setup, migrations, API routes, and static file serving in production.

In development:

- `npm run dev` starts both Vite and the backend using `concurrently`
- Vite proxies `/api/*` requests to `http://localhost:3001`

In production-style local preview:

- `npm run preview` builds the frontend and starts the Express server
- Express serves the built frontend from `dist/`

## Tech Stack

- Frontend: React 19, React Router 6, TanStack Query
- Backend: Express 5
- Database: SQLite via `better-sqlite3`
- Build tooling: Vite
- Linting: ESLint
- Language mix: mostly TypeScript/TSX on the frontend, plain JavaScript on the backend

## Repository Layout

The directories that matter most for day-to-day work are:

- `src/App.tsx`
  Application entry for authentication, RFID handoff, and routing into the authenticated shell.
- `src/presentation/pages/`
  The main feature pages. This is where most frontend business logic lives.
- `src/presentation/components/`
  Reusable UI pieces such as `Modal`, `Calendar`, `SectionPanel`, `Button`, and form controls.
- `src/lib/api.ts`
  Shared fetch helper that expects JSON responses with a `success` flag.
- `src/utils/userProfile.js`
  Shared user-profile normalization and permission checks.
- `src/utils/rfidScanHub.js`
  Client-side polling hub for `/api/auth/rfid/latest-scan`.
- `server/index.js`
  The backend. It contains schema creation, migrations, seed data, SQL statements, helper functions, and all API routes.
- `server/data/auth.sqlite`
  The main development database file.
- `docs/`
  Supporting project documentation.

There are also `src/data`, `src/domain`, and `src/usecases` folders that look like an earlier clean-architecture experiment. At the moment they are not central to how the app works. `App.tsx` still instantiates those classes and passes them into `HomePage`, but the main feature development path today is the React pages plus the Express API.

## Application Flow

### 1. App startup

`src/main.tsx` mounts the app and query client. `App.tsx` then decides whether to show:

- `LoginPage` when unauthenticated
- `HomePage` when authenticated

`App.tsx` is responsible for:

- restoring the authenticated user from `localStorage`
- handling username/password login
- handling RFID login
- handling guest login
- refreshing the authenticated user profile from the backend
- timing out inactive sessions
- listening for RFID scans so one idle user session can hand off to another user
- showing the demo payment-card modal if a contactless payment card is scanned

### 2. Authenticated shell

`HomePage.tsx` is the main shell once the user is logged in. It provides:

- the side drawer and page navigation
- the page header and theme toggle
- query-driven home dashboard data
- route definitions for all feature pages

The available menu entries are filtered using `hasPermission(...)` from `src/utils/userProfile.js`.

### 3. Feature pages

Each page tends to follow the same pattern:

- fetch data with TanStack Query or direct `fetch`
- build request headers including `x-actor-username`
- call backend routes under `/api/...`
- update local UI state
- dispatch custom browser events like `profile-data-updated` or `event-data-updated`
- listen for those events in other pages and invalidate or refresh queries

This event-based coordination is important. The frontend does not use a large global state container; instead it relies on:

- React local state
- TanStack Query caches
- custom `window.dispatchEvent(...)` events for cross-page refreshes

## Authentication And Authorization

### Authentication modes

The backend supports three sign-in paths:

- member username/password via `/api/auth/login`
- member RFID via `/api/auth/rfid`
- guest sign-in via `/api/auth/guest-login`

The frontend stores auth state in:

- `archeryclubpoc-authenticated`
- `archeryclubpoc-authenticated-user`
- `archeryclubpoc-auth-message`

### User profile shape

The normalized frontend user profile has four sections:

- `auth`
- `personal`
- `membership`
- `meta`

This shape is defined in `src/types/app.ts` and normalized in `src/utils/userProfile.js`.

### Authorization model

The backend defines permission keys at the top of `server/index.js`, for example:

- `manage_members`
- `manage_roles_permissions`
- `add_events`
- `approve_events`
- `add_coaching_sessions`
- `assign_equipment`
- `manage_beginners_courses`
- `manage_tournaments`

System roles are also seeded in `server/index.js`, such as:

- `general`
- `admin`
- `developer`
- `coach`
- `beginner`

Most protected routes:

- read the acting user from the `x-actor-username` request header
- load the actor from the database
- check permissions with helper functions before continuing

This means frontend requests usually need to include the actor username header even for read APIs.

## Backend Structure

`server/index.js` is currently a monolithic service. It contains, in order:

- constants and permission definitions
- database path setup
- schema creation
- schema migrations
- seed/reference data
- prepared SQL statements
- helper functions that shape domain responses
- Express route handlers
- RFID reader monitor startup
- `app.listen(...)`

This file is large, but it is still organized by feature in broad blocks.

### Database setup and migrations

On startup the server:

- ensures the data directories exist
- opens `auth.sqlite`
- creates tables with `CREATE TABLE IF NOT EXISTS`
- inspects schemas using `PRAGMA table_info(...)` and `sqlite_master`
- runs in-place migrations when columns or enum-style constraints change

The app does not use a separate migration framework. Startup code is the migration framework.

When changing persistence, treat startup carefully:

- schema fixes must be safe on already-populated databases
- tables may need rebuilding when SQLite constraints change
- related foreign keys may need refreshing if a table is recreated

### Static serving

In preview/production-style mode the backend serves the built frontend from `dist/`.

### RFID support

The server tries to start a PowerShell-based smart-card/RFID monitor on startup. That monitor:

- reads reader devices
- detects RFID tags
- also detects payment cards for the demo warning modal

Important:

- the monitor is best-effort
- in restricted environments it can fail with `spawn EPERM`
- that warning is non-fatal for the rest of the app

## Data Model

These are the core tables created in `server/index.js`.

### Authentication and members

- `users`
  Main member records including username, name, password, RFID tag, active status, and fee due date.
- `user_types`
  Role assigned to each user.
- `roles`
  Role definitions.
- `permissions`
  Permission definitions.
- `role_permissions`
  Permissions granted to each role.
- `user_disciplines`
  Disciplines for each member.
- `login_events`
  Member sign-in records.
- `guest_login_events`
  Guest sign-in records, including inviting member information.

### Calendar and activity

- `club_events`
  Club events such as competitions, socials, and range-closed entries.
- `event_bookings`
  Member bookings onto club events.
- `coaching_sessions`
  Coaching session requests and approved sessions.
- `coaching_session_bookings`
  Member bookings onto coaching sessions.

### Tournaments

- `tournaments`
  Tournament definitions and registration windows.
- `tournament_registrations`
  Which members are competing.
- `tournament_scores`
  Score submissions.

### Equipment and loan bows

- `member_loan_bows`
  Legacy loan-bow tracking attached to member profiles.
- `equipment_items`
  Cases, risers, limbs, quivers, sights, rods, guards, finger tabs, arrows.
- `equipment_loans`
  Equipment issued to members, optionally linked to a case as the loan context.

### Beginners courses

- `beginners_courses`
  Course headers and approval state.
- `beginners_course_lessons`
  Expanded lesson rows for a course.
- `beginners_course_participants`
  Beginners attached to a course and optionally to a case.
- `beginners_course_lesson_coaches`
  Coaches assigned to each lesson.

### Committee

- `committee_roles`
  Committee-role definitions and member assignments.

## API Surface By Feature

The route handlers are all in `server/index.js`. The main groups are:

### Auth and health

- `POST /api/auth/login`
- `POST /api/auth/rfid`
- `GET /api/auth/rfid/latest-scan`
- `POST /api/auth/guest-login`
- `GET /api/guest-inviter-members`
- `GET /api/health`

### Members and roles

- `GET /api/profile-options`
- `GET /api/roles`
- `POST /api/roles`
- `PUT /api/roles/:roleKey`
- `DELETE /api/roles/:roleKey`
- `GET /api/committee-roles`
- `PUT /api/committee-roles/:id`
- `GET /api/user-profiles/:username`
- `POST /api/user-profiles`
- `PUT /api/user-profiles/:username`
- `POST /api/user-profiles/:username/assign-rfid`

### Loan bows and equipment

- `GET /api/loan-bow-options`
- `GET /api/loan-bow-profiles/:username`
- `PUT /api/loan-bow-profiles/:username`
- `POST /api/loan-bow-profiles/:username/return`
- `GET /api/equipment/dashboard`
- `POST /api/equipment/items`
- `POST /api/equipment/items/:id/decommission`
- `POST /api/equipment/assignments`
- `POST /api/equipment/returns`
- `POST /api/equipment/storage`
- `GET /api/member-equipment-loans/:username`

### Beginners courses

- `GET /api/beginners-courses/dashboard`
- `GET /api/beginners-courses/calendar`
- `POST /api/beginners-courses`
- `POST /api/beginners-courses/:id/approve`
- `POST /api/beginners-courses/:id/reject`
- `DELETE /api/beginners-courses/:id`
- `POST /api/beginners-courses/:id/beginners`
- `PUT /api/beginners-course-participants/:id`
- `POST /api/beginners-course-participants/:id/assign-case`
- `POST /api/beginners-course-lessons/:id/coaches`
- `GET /api/my-beginner-dashboard`
- `GET /api/my-beginner-coaching-assignments`

### Events, coaching, tournaments, and range

- `GET /api/events`
- `POST /api/events`
- `POST /api/events/:id/approve`
- `POST /api/events/:id/reject`
- `POST /api/events/:id/book`
- `DELETE /api/events/:id/booking`
- `DELETE /api/events/:id`
- `GET /api/coaching-sessions`
- `POST /api/coaching-sessions`
- `POST /api/coaching-sessions/:id/approve`
- `POST /api/coaching-sessions/:id/reject`
- `POST /api/coaching-sessions/:id/book`
- `DELETE /api/coaching-sessions/:id/booking`
- `DELETE /api/coaching-sessions/:id`
- `GET /api/my-coaching-bookings`
- `GET /api/my-event-bookings`
- `GET /api/my-tournament-reminders`
- `GET /api/tournaments`
- `POST /api/tournaments`
- `PUT /api/tournaments/:id`
- `DELETE /api/tournaments/:id`
- `POST /api/tournaments/:id/register`
- `DELETE /api/tournaments/:id/register`
- `POST /api/tournaments/:id/score`
- `POST /api/tournaments/:id/competitors-export`
- `GET /api/range-members`
- `GET /api/range-usage-dashboard`

## Frontend Structure And Patterns

### Routing

`App.tsx` routes authenticated users into `HomePage.tsx`, and `HomePage.tsx` owns the application routes.

Key routes:

- `/`
  Home dashboard
- `/profile`
  Member profile and loan-bow management
- `/user-creation`
  Create new member profiles
- `/role-permissions`
  Roles and permission management
- `/approvals`
  Approval inbox for events and coaching
- `/equipment`
  Equipment register and assignment flows
- `/beginners-courses`
  Beginners course management
- `/event-calendar`
  Club events, coaching sessions, and beginners lesson calendar
- `/range-usage`
  Range usage reporting
- `/tournaments`
  Tournament browsing and participation
- `/tournament-setup`
  Tournament admin setup
- `/committee-org-chart`
  Committee roles page
- `/feedback-form`, `/ideas-form`, `/lost-and-found`
  Supporting forms/pages

### Data fetching

There are two main patterns in the frontend:

1. TanStack Query for data that is naturally query-shaped.
2. Direct `fetch(...)` in forms and profile screens where the page has more custom loading state.

`src/lib/api.ts` wraps `fetch` and throws when:

- the response is not JSON
- the HTTP status is not OK
- the JSON body has `success: false`

### Shared events for cache refresh

Cross-feature refreshes are coordinated with custom browser events. Common examples:

- `profile-data-updated`
- `loan-bow-data-updated`
- `member-bookings-updated`
- `member-session-updated`
- `event-data-updated`
- `coaching-data-updated`
- `tournament-data-updated`
- `beginners-course-data-updated`

When you add or change a mutation, check whether another page expects one of these events to refresh itself.

### Permission-based UI

Pages and menu entries rely heavily on `hasPermission(currentUserProfile, permissionKey)`.

This means feature work often needs changes in two places:

- backend route permission enforcement
- frontend visibility and action gating

## Feature Notes

### Home and dashboard

`HomePage.tsx` fetches:

- current range members
- the current user's bookings
- tournament reminders
- beginner/coaching assignments for the current user

It also shows:

- membership fee reminders based on `membershipFeesDue`
- tournament warnings for admins when knockout-style registrations are uneven near closing date

### Profile and member management

`ProfilePage.tsx` serves both self-service and admin editing.

Important behaviours:

- admins can select any member
- RFID assignment listens for the next scanned tag while a modal is open
- profile saves can update the currently authenticated user, which causes `App.tsx` to refresh the stored session profile
- profile view also loads equipment currently on loan to the selected member

### Events and coaching

`EventCalendarPage.tsx` is one of the largest frontend pages. It combines:

- club events
- coaching sessions
- beginners lessons

All three are presented on one calendar but come from different backend routes and have different permissions and workflows.

Key behaviour:

- event and coaching creation supports single, recurring, and multi-date creation
- pending items can be approved or rejected
- members can book onto approved events/sessions
- range-closed events are not bookable

### Tournaments

`TournamentsPage.tsx` handles both member-facing tournament participation and admin tournament setup. The route `/tournament-setup` renders the same page with `showSetupForm`.

The backend also supports exporting competitors and recording scores.

### Equipment

`EquipmentPage.tsx` is the register for:

- adding equipment
- decommissioning equipment
- assigning equipment to members or cases
- returning equipment
- updating storage

The backend models equipment location using:

- cupboard storage
- case storage
- member loans

Cases are also equipment items. Case contents are represented by other equipment rows whose `location_case_id` points at the case.

### Beginners courses

`BeginnersCoursesPage.tsx` handles:

- submitting courses
- approval and rejection
- generating lesson schedules
- adding beginners
- assigning course cases
- assigning lesson coaches

This feature overlaps with equipment and coaching concepts, so changes here often need care across multiple route groups.

## Development Notes And Caveats

### 1. The backend is stateful and centralized

Most business rules are in helper functions and route handlers inside `server/index.js`. Before changing a frontend workflow, check the backend route that actually enforces it.

### 2. Startup code is sensitive

Because schema creation and migration happen inline on startup, careless changes can break existing databases. If you modify equipment, beginners-course, or role-related schemas, test against an already-populated `auth.sqlite`, not only a fresh database.

### 3. The frontend uses both React Query and manual refreshes

Do not assume React Query invalidation alone is enough. Many screens also depend on custom browser events.

### 4. The domain/usecase folders are not the main architecture

They exist, but most real feature work currently happens directly in:

- `src/presentation/pages/...`
- `server/index.js`

If you are adding a new major feature, decide early whether to:

- follow the current pragmatic page-plus-route style, or
- expand the cleaner layered architecture more consistently

Right now the codebase mostly follows the first option.

### 5. Permissions are part of the product model

A new admin feature often needs:

- a new permission key
- updates to permission definitions and seeded roles
- route enforcement
- menu visibility
- page/action gating in React

### 6. RFID and payment-card handling are demo-oriented

The app intentionally includes smart-card/payment-card detection behaviour for demonstrations. Treat these flows carefully when changing auth, timeouts, or scan handling.

## How To Add Or Change A Feature

For most work, this is the safest sequence:

1. Find the page component in `src/presentation/pages/`.
2. Find the API route it calls in `server/index.js`.
3. Identify the relevant tables and prepared statements near that route.
4. Check whether any custom browser events are dispatched or listened for.
5. Check whether the feature is permission-gated in both the backend and `SideDrawer.tsx`.
6. Test with an existing database, not only a fresh one.

Examples:

- Adding a new admin page:
  add a route in `HomePage.tsx`, a menu entry in `SideDrawer.tsx`, and permission checks if required.
- Adding a new API field:
  update the SQL row shaping helper in `server/index.js`, then update the corresponding page/component types.
- Changing equipment or course persistence:
  verify startup migrations still work on the current `auth.sqlite`.

## Suggested Future Refactors

These are not required to work on the app, but they would reduce maintenance cost:

- split `server/index.js` into feature modules
- move shared backend validation and response shaping into dedicated files
- standardize frontend data loading on TanStack Query where possible
- document custom browser events in a central file or replace them with a more explicit app-state pattern
- decide whether the `src/data`, `src/domain`, and `src/usecases` layers should be expanded or removed

## Quick Start For A New Developer

If you are brand new to the project, read in this order:

1. `README.md`
2. `docs/DeveloperGuide.md`
3. `src/App.tsx`
4. `src/presentation/pages/HomePage.tsx`
5. `server/index.js`
6. the specific page and route for the feature you need to change

That path will give you the fastest accurate understanding of how the app currently behaves.
