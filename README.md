# ArcheryClubPoC

ArcheryClubPoC is a proof-of-concept web application for Selby Archers. It
combines a React frontend with an Express backend to explore how club members,
guests, bookings, coaching, tournaments, equipment, and beginner workflows can
be managed in one internal portal.

The project is still positioned as a proof of concept, but the current codebase
is much broader than a simple login-and-calendar demo.

## Current Feature Surface

The application currently includes:

- member login with username/password
- RFID-based sign-in and session handoff flows
- guest sign-in
- automatic inactivity logout and session revalidation
- cookie-backed authenticated sessions
- a home dashboard with announcements, range members, bookings, reminders, and
  beginner/coach dashboards
- mobile on-site geofenced range check-in
- theme switching
- announcements management
- audit log viewing with filter and sort controls
- announcement seen-tracking and audience email sending
- event and coaching scheduling with approvals and bookings
- tournament setup, registration, score submission, and competitor export
- member profile administration and RFID assignment
- member distance sign-offs and loan bow return workflows
- role and permission management
- committee role administration and org chart display
- equipment inventory, assignment, storage, returns, and decommissioning
- loan bow management
- beginners course administration
- beginner participant password reset, case assignment, and conversion to
  member workflows
- Have a Go session administration
- range usage and attendance reporting
- outdoor table viewing for classifications, 252 awards, and clout marks
- lost-and-found tracking for arrows
- records, general information, and suggestion box pages
- mobile-specific layouts for larger feature areas
- server-sent events for near-real-time refresh, with fallback polling in
  selected views

## Tech Stack

- Frontend: React 19, React Router, React Query, Vite, TypeScript
- Backend: Express 5
- Database: SQLite by default, PostgreSQL supported in code
- Tooling: ESLint

## Project Structure

- `src/`
  Frontend application code.
- `src/bootstrap/`
  Frontend composition root and provider wiring.
- `src/application/usecases/`
  Frontend use cases for richer CRUD and workflow areas.
- `src/domain/`
  Frontend entities and repository contracts.
- `src/data/`
  Frontend repository implementations.
- `src/lib/`
  Shared infrastructure such as the API client, query client, and SSE helpers.
- `src/presentation/pages/`
  Main screens and page-specific feature folders.
- `src/presentation/components/`
  Shared UI components.
- `src/presentation/state/`
  Shared page state, realtime diagnostics, and SSE fallback hooks.
- `server/`
  Backend composition root, routes, and infrastructure.
- `server/bootstrap/`
  Backend startup and persistence bootstrap.
- `server/config/`
  Runtime and environment-derived configuration.
- `server/domain/`
  Backend constants and shared services.
- `server/infrastructure/`
  Persistence, migrations, and infrastructure helpers.
- `docs/DeveloperGuide.md`
  Main developer-facing guide to the current application.

## Running Locally

1. Install dependencies:

```bash
npm ci
```

2. Start frontend and backend together:

```bash
npm run dev:full
```

3. Open the Vite development URL shown in the terminal.

Useful alternatives:

- `npm run dev`
  Starts the Vite client only.
- `npm run dev:server`
  Starts the Express server only.
- `npm run preview`
  Serves the built frontend only, not the backend.
- `npm run start`
  Starts the Express server and serves the built frontend when `dist/` exists.

## Available Scripts

- `npm run dev`
- `npm run dev:server`
- `npm run dev:full`
- `npm run build`
- `npm run preview`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run migrate:postgres`
- `npm test`

## Database And Runtime Notes

The backend currently supports two database engines:

- `sqlite`
  Default for local development.
- `postgres`
  Implemented for migration and runtime validation work, but still part of the
  active rollout.

SQLite notes:

- the local database is created automatically if needed
- non-live mode defaults to `server/data/auth.sqlite`
- live mode defaults to `server/data/auth.live.sqlite`
- you can override the path with `DATABASE_PATH`

PostgreSQL notes:

- set `DATABASE_URL`, or set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
  `DB_PASSWORD`
- `INSTANCE_CONNECTION_NAME` can be used for Cloud SQL socket connections

Other important runtime notes:

- `ARCHERY_APP_MODE` or `APP_ENV` controls development versus live mode
- live mode requires `SESSION_SECRET`
- Express timeouts are configurable through
  `HEADERS_TIMEOUT_MS`, `KEEP_ALIVE_TIMEOUT_MS`, and `REQUEST_TIMEOUT_MS`
- exports are written under `server/data/exports`

## Realtime And Auth Notes

Current runtime behavior includes:

- `HttpOnly` cookie-backed sessions
- CSRF protection for mutating APIs, excluding session-creation routes
- auth and API rate limiting
- authenticated SSE at `/api/events`
- public pre-login SSE at `/api/public-events`
- frontend fallback polling when SSE is unavailable in selected areas

## Related Documentation

- `docs/DeveloperGuide.md`
  Main architecture and onboarding guide.
- `docs/SSEImplementationTodo.md`
  Current SSE rollout status and remaining hardening work.
- `docs/PostgresMigrationPlan.md`
  PostgreSQL migration details.
- `docs/ProductionSecurity.md`
  Security and deployment guidance.
- `docs/NewMemberPortalGuide.md`
  Member-facing usage guide.

## Current Status

This repository is a working internal proof of concept with real workflow
coverage across auth, scheduling, equipment, and beginner operations. It is not
yet a finished production platform, and the biggest active platform-level work
items remain PostgreSQL rollout, deployed-runtime hardening, and continued
modularization of some large backend areas such as the beginners-course logic.
