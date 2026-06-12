# ArcheryClubPoC Developer Guide

## Purpose

This is the main orientation document for the current application.

Use it to understand:

- what the app does today
- how the frontend and backend are organized
- which user journeys are implemented
- where realtime updates, auth, and persistence now live
- which docs are still active versus historical

This guide reflects the codebase as it exists on `2026-06-08`.

## Application Snapshot

ArcheryClubPoC is a browser-based club operations portal for Selby Archers. It
is still a proof of concept, but it now includes a fairly broad internal
operations surface rather than just a small login-and-calendar demo.

Implemented areas include:

- member login with username/password
- RFID-based login and session handoff flows
- guest sign-in
- cookie-backed authenticated sessions
- announcements with active ticker behaviour
- home dashboards for members, beginners, and coaches
- event and coaching scheduling with approvals and bookings
- tournament setup, registration, scoring, and competitor export
- profile management and member administration
- role and permission administration
- committee role management and org chart display
- equipment inventory, storage, assignment, returns, and decommissioning
- loan bow management
- beginners course administration
- Have a Go session administration
- range activity and attendance reporting
- records, general information, and other supporting club pages

## Architecture At A Glance

The app has two main runtime parts:

- a React 19 + Vite frontend in `src/`
- an Express 5 backend in `server/`

The frontend:

- renders the authenticated shell and login flow
- uses React Query for data fetching and cache invalidation
- switches between desktop and mobile layouts for larger pages
- consumes REST-style JSON APIs
- listens for server-sent events to refresh data in near real time

The backend:

- owns session auth and permission checks
- serves JSON APIs and SSE endpoints
- persists data through SQLite or PostgreSQL-backed gateways
- applies CSRF protection and rate limiting
- serves the built frontend when `dist/` is present

## Current Runtime Model

### Frontend runtime

Key entry points:

- `src/main.tsx`
- `src/bootstrap/AppCompositionRoot.tsx`
- `src/bootstrap/AppProviders.tsx`
- `src/App.tsx`

Important current behavior:

- auth state is cached in local storage for fast reloads, then validated against
  `/api/auth/session`
- the authenticated app shell is rendered through `HomePage.tsx`
- React Query drives most page data fetching
- SSE is enabled after authentication and feeds query invalidation
- selected areas fall back to visible-only polling if SSE is unavailable

### Backend runtime

Key entry points:

- `server/index.js`
- `server/bootstrap/startServer.js`
- `server/config/runtime.js`
- `server/bootstrap/bootstrapPersistence.js`

Important current behavior:

- Express serves API routes and optionally the built SPA
- SQLite is still the default working runtime
- PostgreSQL support is implemented and migration-ready, but still a tracked
  rollout
- runtime configuration is centralized in `server/config/runtime.js`
- live mode requires `SESSION_SECRET`

## Authentication And Sessions

The app currently supports:

- username/password login
- RFID login
- guest sign-in

Relevant files:

- `src/presentation/pages/LoginPage.tsx`
- `src/api/authApi.ts`
- `server/presentation/http/registerAuthRoutes.js`
- `server/infrastructure/persistence/memberAuthGateway.js`

Current auth model:

- sessions are stored in an `HttpOnly` cookie
- session payloads are signed rather than stored server-side
- mutating requests use CSRF protection except for session-creation endpoints
- auth endpoints are rate limited
- the frontend logs users out locally after inactivity and also clears the
  backend session cookie

## Realtime Updates

Realtime refresh is now a first-class part of the application.

Implemented pieces:

- authenticated SSE stream at `/api/events`
- public pre-login SSE stream at `/api/public-events`
- in-memory event bus
- client event subscription and diagnostics
- React Query invalidation driven by server events
- fallback polling when SSE is down

Relevant files:

- `server/presentation/http/registerSseRoutes.js`
- `server/domain/services/serverEventBus.js`
- `src/lib/serverEvents.ts`
- `src/lib/publicServerEvents.ts`
- `src/presentation/state/useServerEvents.ts`
- `src/presentation/state/useSseFallbackPolling.ts`
- `src/presentation/state/useServerEventDiagnostics.ts`
- `docs/SSEImplementationTodo.md`

Current event coverage includes:

- announcements
- calendar and approvals
- tournaments
- members and roles
- committee updates
- equipment
- beginners and Have a Go
- RFID scans
- range member refreshes

## Core User Journeys

### 1. Sign-in and kiosk/RFID flow

Users can sign in with credentials or RFID. Once authenticated, later RFID scans
can hand an idle kiosk session over to another member.

Relevant files:

- `src/App.tsx`
- `src/utils/rfidScanHub.js`
- `server/presentation/http/registerAuthRoutes.js`

### 2. Home dashboard

The home screen aggregates:

- members currently active at the range
- personal event and coaching bookings
- tournament reminders
- active announcements
- beginner dashboards for enrolled beginners
- coaching assignments for coaches

Relevant files:

- `src/presentation/pages/HomePage.tsx`
- `src/presentation/pages/HomeSection.tsx`
- `src/api/homeApi.ts`
- `server/presentation/http/registerMemberActivityRoutes.js`
- `server/index.js` for beginner dashboard endpoints

### 3. Scheduling and approvals

The scheduling area now covers:

- club events
- coaching sessions
- bookings
- approval/rejection workflows

Relevant files:

- `src/presentation/pages/EventCalendarPage.tsx`
- `src/presentation/pages/ApprovalsPage.tsx`
- `src/api/scheduleApi.ts`
- `server/presentation/http/registerScheduleRoutes.js`

### 4. Tournaments

Tournament workflows now include:

- creation and editing
- registration and withdrawal
- score submission
- competitor export

Relevant files:

- `src/presentation/pages/TournamentsPage.tsx`
- `src/api/tournamentApi.ts`
- `src/api/tournamentCrudApi.ts`
- `src/application/usecases/TournamentUseCases.ts`
- `server/presentation/http/registerTournamentRoutes.js`

### 5. Member and role administration

Admin workflows include:

- creating and updating member profiles
- assigning RFID tags
- managing distance sign-offs
- returning loan bows
- managing role definitions and permission sets
- managing committee roles and photos

Relevant files:

- `src/presentation/pages/ProfilePage.tsx`
- `src/presentation/pages/UserCreationPage.tsx`
- `src/presentation/pages/RolePermissionsPage.tsx`
- `src/presentation/pages/CommitteeAdminPage.tsx`
- `server/presentation/http/registerAdminMemberRoutes.js`

### 6. Equipment management

The equipment area supports:

- inventory dashboards
- storage locations
- assignments and returns
- case/member/cupboard location tracking
- decommissioning
- beginner case assignment integration

Relevant files:

- `src/presentation/pages/EquipmentPage.tsx`
- `src/presentation/pages/equipment/`
- `src/api/equipmentApi.ts`
- `server/presentation/http/registerEquipmentRoutes.js`

### 7. Beginners and Have a Go

Beginners-course functionality is now substantial and still partly lives in
`server/index.js`.

Implemented flows include:

- course dashboards
- course creation, approval, rejection, and cancellation
- participant creation and editing
- password resets
- participant conversion into members
- case assignment
- lesson coach assignment
- personal beginner dashboard
- coach lesson assignments

Relevant files:

- `src/presentation/pages/BeginnersCoursesPage.tsx`
- `src/presentation/pages/HaveAGoSessionsPage.tsx`
- `src/api/beginnersCoursesApi.ts`
- `server/index.js`
- `server/infrastructure/persistence/beginnersCourseReadGateway.js`
- `server/infrastructure/persistence/beginnersCourseWriteGateway.js`

## Route And Page Surface

The authenticated shell currently routes to these main page areas:

- `/`
- `/profile`
- `/user-creation`
- `/role-permissions`
- `/reporting`
- `/approvals`
- `/equipment`
- `/beginners-courses`
- `/have-a-go-sessions`
- `/event-calendar`
- `/range-usage`
- `/tournaments`
- `/tournament-setup`
- `/records`
- `/committee-org-chart`
- `/committee-admin`
- `/announcements`
- `/general-info`
- `/feedback-form`
- `/ideas-form`
- `/lost-and-found`

The route-to-page mapping is owned by:

- `src/presentation/pages/HomePage.tsx`

Navigation visibility is controlled in practice by the signed-in user profile and
permission checks in the page shell and drawer components.

## Repository Map

### Frontend

- `src/api/`
  Client API wrappers for backend endpoints.
- `src/application/usecases/`
  Use-case classes coordinating domain operations for richer CRUD areas.
- `src/bootstrap/`
  App dependency wiring and provider composition.
- `src/data/repositories/`
  Concrete repository implementations for frontend use cases.
- `src/domain/`
  Frontend entities and repository contracts.
- `src/lib/`
  Shared infrastructure such as API client, query client, and SSE transport.
- `src/presentation/components/`
  Shared UI primitives and reusable feature components.
- `src/presentation/pages/`
  Route-level page components and feature folders.
- `src/presentation/state/`
  Shared page state, diagnostics, and SSE fallback behavior.
- `src/theme/`
  Theme provider and theme definitions.
- `src/utils/`
  Normalizers and cross-cutting utility helpers.

### Backend

- `server/bootstrap/`
  Startup helpers and persistence bootstrap.
- `server/config/`
  Runtime configuration derived from environment variables.
- `server/domain/`
  Shared constants and domain-level services.
- `server/infrastructure/persistence/`
  SQLite statements, PostgreSQL migrations, gateways, and compatibility layers.
- `server/observability/`
  Security and error logging helpers.
- `server/presentation/http/`
  Feature route registration modules.
- `server/security/`
  CSRF and rate limiting.
- `server/index.js`
  Main backend composition root. Some beginners-course logic still lives here.

## How To Run The App

Install dependencies:

```bash
npm ci
```

Run the frontend only:

```bash
npm run dev
```

Run the backend only:

```bash
npm run dev:server
```

This uses Node's watch mode, so backend route and persistence changes restart
automatically during local development.

Run both together:

```bash
npm run dev:full
```

Build the frontend:

```bash
npm run build
```

Serve the built frontend through Vite preview:

```bash
npm run preview
```

Start the Express server:

```bash
npm run start
```

Note:

- `npm run preview` does not start the backend
- `npm run start` serves the built frontend only when `dist/` exists
- local API development usually means running `npm run dev:full`

Useful validation commands:

```bash
npm run lint
npm run typecheck
npm test
```

## Database And Environment Notes

Current runtime support:

- `sqlite`
  Default local runtime.
- `postgres`
  Supported in code and migrations, but still part of the migration rollout.

Important runtime settings live in:

- `server/config/runtime.js`

Key environment variables include:

- `PORT`
- `ARCHERY_APP_MODE` or `APP_ENV`
- `SESSION_SECRET`
- `DATABASE_ENGINE`
- `DATABASE_PATH`
- `DATABASE_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `INSTANCE_CONNECTION_NAME`
- `TRUST_PROXY`
- `HEADERS_TIMEOUT_MS`
- `KEEP_ALIVE_TIMEOUT_MS`
- `REQUEST_TIMEOUT_MS`
- `RFID_READER_NAME`

Operational notes:

- local SQLite databases are created and bootstrapped automatically
- live mode defaults to `server/data/auth.live.sqlite` unless overridden
- baseline live accounts are seeded in SQLite live mode
- exports are written under `server/data/exports`

## Security And Reliability

Current security and resilience features include:

- `helmet`
- signed cookie-backed sessions
- CSRF protection for mutating APIs
- auth-specific and global API rate limiting
- security event logging and API error logging
- configurable server timeouts

Relevant files:

- `server/security/csrf.js`
- `server/security/rateLimit.js`
- `server/observability/securityEventLogger.js`
- `server/bootstrap/startServer.js`

One active follow-up area remains validating SSE timeout and buffering behavior
in deployed environments.

## Support And Debugging Guide

### Login or session issues

Check:

- `src/presentation/pages/LoginPage.tsx`
- `src/api/authApi.ts`
- `server/presentation/http/registerAuthRoutes.js`
- browser cookies and session validation flow in `src/App.tsx`

Typical causes:

- invalid credentials
- disabled or missing member data
- RFID tag not assigned
- missing backend server
- expired session or auth state drift

### Missing page or blocked action

Check:

- the current user profile
- permission checks in `src/utils/userProfile.js`
- relevant page-level gating
- backend permission checks in the relevant route module

Typical causes:

- permission not assigned to the user role
- page correctly hidden by design
- backend correctly returning `403`

### Data not refreshing

Check:

- the underlying API response first
- SSE connection state in development
- relevant query invalidation logic
- fallback polling state for the affected page

Relevant files:

- `src/presentation/state/useServerEvents.ts`
- `src/presentation/state/useSseFallbackPolling.ts`
- `src/lib/serverEvents.ts`

### Equipment, beginners, or reporting mismatch

Check:

- the feature page state hook under `src/presentation/pages/**/`
- the API wrapper in `src/api/`
- the backend gateway or route module feeding the page

These areas now have enough business logic that the mismatch is often in
normalization or workflow rules rather than simple rendering.

## Current Frontend Development Pattern

Most newer frontend work follows this shape:

1. Route-level page component owns permissions and high-level queries.
2. Large pages move logic into a page-specific state hook.
3. Mobile and desktop rendering split when the layout meaningfully diverges.
4. Shared UI primitives live in `src/presentation/components/`.
5. Data refresh is usually driven by React Query invalidation plus SSE.

Examples:

- `src/presentation/pages/reporting/`
- `src/presentation/pages/range-usage/`
- `src/presentation/pages/records/`
- `src/presentation/pages/equipment/`
- `src/presentation/pages/event-calendar/`
- `src/presentation/pages/tournaments/`
- `src/presentation/pages/profile/`
- `src/presentation/pages/roles/`

## Current Backend Development Pattern

The backend is still composed centrally in `server/index.js`, but feature work is
increasingly split into focused route registration modules and persistence
gateways.

Typical flow:

1. Express route receives the request.
2. Auth and permission checks run.
3. A gateway or service performs persistence and workflow coordination.
4. The server emits an SSE update when needed.
5. A normalized JSON response is returned.

Key backend abstractions:

- `memberAuthGateway`
- `memberProfileGateway`
- `roleCommitteeGateway`
- `activityReportingGateway`
- `scheduleGateway`
- `tournamentGateway`
- `equipmentGateway`
- beginners course read/write gateways

## Related Docs

- `docs/ProductionSecurity.md`
  Security and deployment notes.
- `docs/PostgresMigrationPlan.md`
  PostgreSQL rollout and migration details.
- `docs/SSEImplementationTodo.md`
  Current SSE rollout and remaining hardening work.
- `docs/MobileImplementationTodo.md`
  Active mobile implementation checklist.
- `docs/NewMemberPortalGuide.md`
  Member-facing guidance.
- `docs/archive/`
  Historical notes only.

## Maintenance Notes

- Update this guide and `README.md` together when the app surface changes
  materially.
- Prefer updating current docs over adding overlapping docs.
- Treat `docs/archive/` as historical reference, not current guidance.
- If you move more beginners-course logic out of `server/index.js`, update this
  guide because that is still a notable current exception.
