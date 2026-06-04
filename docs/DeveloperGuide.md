# ArcheryClubPoC Onboarding Guide

## Purpose

This document is the main starting point for:

- support team members who need to understand what the app does and how to
  triage common issues
- developers who are new to the repository and need to become productive
  quickly

Use this guide as the first stop. Follow the linked documents for deeper
security, migration, or user-facing detail.

## What This App Is

ArcheryClubPoC is a browser-based club operations portal for Selby Archers.

It currently supports:

- member login with username/password
- RFID-based member sign-in flows
- guest sign-in
- home/dashboard views
- profile editing and member administration
- role and permission administration
- event, coaching, and tournament workflows
- range usage and reporting
- equipment and beginner-course administration

The system is a proof of concept, but it already contains real application
structure and operational flows.

## Who This Guide Is For

### Support Team

You likely need to know:

- what the major user journeys are
- which pages and roles exist
- what "normal" behavior looks like
- where to look when something fails
- when an issue is probably user error, data/state drift, or a code defect

### New Developers

You likely need to know:

- how to run the app locally
- how the frontend and backend are organized
- where data comes from
- which files are the best entry points for common changes
- which docs are current and authoritative

## High-Level Mental Model

The app has two main parts:

- a React frontend under `src/`
- an Express backend under `server/`

The frontend renders pages, collects user input, and calls JSON APIs.

The backend:

- authenticates users
- applies permission checks
- reads/writes data
- returns normalized JSON responses

The default local database is SQLite. PostgreSQL support exists, but rollout is
still tracked separately.

## Core User Flows

These are the most important flows to understand before troubleshooting.

### 1. Member login

Member login can happen through:

- username and password
- RFID tag/card

Relevant frontend files:

- `src/presentation/pages/LoginPage.tsx`
- `src/App.tsx`
- `src/api/authApi.ts`

Relevant backend files:

- `server/presentation/http/registerAuthRoutes.js`
- `server/infrastructure/persistence/memberAuthGateway.js`

### 2. Guest sign-in

Guests are signed in separately and are associated with an inviting member.

Relevant files:

- `src/presentation/pages/LoginPage.tsx`
- `server/presentation/http/registerAuthRoutes.js`

### 3. Home/dashboard

The home page shows:

- members currently at the range
- upcoming bookings and reminders
- beginner-related items for beginner users

Relevant files:

- `src/presentation/pages/HomePage.tsx`
- `src/presentation/pages/HomeSection.tsx`
- `src/api/homeApi.ts`
- `src/api/memberApi.ts`
- `server/presentation/http/registerMemberActivityRoutes.js`

### 4. Admin and operational flows

Important admin areas include:

- profile and member management
- roles and permissions
- committee administration
- reporting
- equipment
- tournaments
- beginner-course administration

Most of these flows use permission-gated routes on the backend and page-level
permission checks on the frontend.

## Repository Map

### Frontend

- `src/presentation/`
  Pages, shared UI components, view-specific rendering, and presentation hooks.
- `src/api/`
  Frontend API wrappers around the backend routes.
- `src/application/`
  Frontend use cases and workflow coordination.
- `src/domain/`
  Frontend entities and repository contracts.
- `src/data/`
  Repository implementations that bridge frontend logic to API/data sources.
- `src/bootstrap/`
  App composition and dependency wiring.
- `src/theme/`
  Theme provider and theme helpers.
- `src/utils/`
  General utility helpers used across the app.

### Backend

- `server/index.js`
  Main backend composition root.
- `server/presentation/http/`
  Route registration modules.
- `server/infrastructure/persistence/`
  SQLite/PostgreSQL gateways, statements, migrations, and compatibility logic.
- `server/domain/`
  Backend constants and shared domain services.
- `server/bootstrap/`
  Startup/bootstrap helpers.
- `server/security/`
  CSRF and rate limiting.
- `server/observability/`
  Logging and security event helpers.

## How To Run The App

Install dependencies:

```bash
npm ci
```

Run frontend only:

```bash
npm run dev
```

Run backend only:

```bash
npm run dev:server
```

Run both together:

```bash
npm run dev:full
```

Useful validation commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Support Triage Guide

When a user reports a problem, classify it into one of these buckets first.

### Login issue

Examples:

- incorrect username/password
- RFID not recognized
- session expired
- guest sign-in not completing

Check:

- `src/presentation/pages/LoginPage.tsx`
- `src/api/authApi.ts`
- `server/presentation/http/registerAuthRoutes.js`

Typical causes:

- wrong credentials
- expired or inactive member status
- missing backend server
- RFID route/service problems
- local/session cookie issues

### Permission issue

Examples:

- page missing from menu
- action button disabled or absent
- API returns 403

Check:

- current user role and permissions
- `src/utils/userProfile.js`
- page-level permission checks in the relevant screen
- backend permission checks in the relevant route module

Typical causes:

- expected permission not assigned to the role
- frontend correctly hiding restricted actions
- backend correctly blocking restricted requests

### Data display issue

Examples:

- range member list looks wrong
- profile details not updating
- reporting totals look unexpected
- tournament or event lists differ from expectation

Check:

- API response first
- query invalidation/refresh behavior on the frontend
- normalization logic in `src/utils/userProfile.js`
- backend aggregation/query logic in reporting or activity gateways

Typical causes:

- stale frontend state
- expected polling delay
- older login/activity records still inside the reporting window
- query/filter logic mismatch

### File or image upload issue

Examples:

- committee photo upload fails
- "request entity too large"

Check:

- `src/presentation/pages/CommitteeAdminPage.tsx`
- `server/index.js`
- `server/presentation/http/registerAdminMemberRoutes.js`

Typical causes:

- image too large before compression
- invalid image type
- body size limits

## Common Issue Playbooks

### "The app loads but sign-in fails"

1. Confirm the backend is running.
2. Check whether the error is a 401, 403, or network/API failure.
3. If password login fails, inspect the auth route behavior.
4. If RFID fails, check the RFID-specific routes and reader state.

### "A page is missing"

1. Confirm the user is signed in.
2. Confirm the user role.
3. Confirm the role has the required permission.
4. Check both frontend page gating and backend route protection.

### "The home page says someone is at the range when they should not be"

1. Check whether the backend `/api/range-members` response includes them.
2. Check whether they had an older qualifying login within the current time
   window.
3. Check recent login method behavior if the issue is mobile vs RFID vs desktop.

### "Saving changes does nothing or reverts"

1. Check browser console/network tab for failed API requests.
2. Confirm CSRF-protected mutating requests are succeeding.
3. Check whether the page invalidates/refetches the relevant query after save.
4. Confirm the backend persistence gateway updated the expected records.

## Current Frontend Pattern

Most newer frontend work follows this shape:

1. Page container owns route-level queries, permissions, and mutations.
2. Shared state may be extracted into a page-specific hook when the page is
   large.
3. Desktop and mobile markup may be split into separate view components when
   the layout differs materially.
4. Shared UI primitives live in `src/presentation/components/`.

Examples already using this approach include:

- `src/presentation/pages/reporting/`
- `src/presentation/pages/range-usage/`
- `src/presentation/pages/records/`
- `src/presentation/pages/equipment/`
- `src/presentation/pages/event-calendar/`
- `src/presentation/pages/tournaments/`
- `src/presentation/pages/profile/`
- `src/presentation/pages/roles/`

## Current Backend Pattern

The backend is still centered on `server/index.js`, but most feature behavior is
registered through focused route modules and gateway/repository helpers.

Typical backend flow:

1. Express route receives the request.
2. Route-level permission/session checks run.
3. A gateway or service handles persistence and business coordination.
4. A normalized JSON response is returned to the frontend.

Important backend abstractions include:

- `memberAuthGateway`
- `memberProfileGateway`
- `roleCommitteeGateway`
- `activityReportingGateway`
- `scheduleGateway`
- `tournamentGateway`
- `equipmentGateway`

## Mobile Support

The app supports mobile-specific presentation patterns without changing the
underlying routes or APIs.

Guidelines:

- use `src/presentation/hooks/useIsMobile.ts` for mobile/desktop switching
- keep queries and business logic shared between variants
- prefer cards and stacked forms over squeezed tables on narrow screens
- preserve desktop behavior unless the same change clearly improves both views

The active mobile checklist lives in `docs/MobileImplementationTodo.md`.
Historical mobile planning notes live under `docs/archive/`.

## Data And Runtime Notes

- local development defaults to SQLite
- PostgreSQL support exists, but rollout is still tracked as migration work
- auth is cookie-based
- CSRF protection is enabled for mutating API requests except session-creation
  routes
- committee role photos are stored as compressed image data URLs

## Best Entry Points For Changes

If you are changing:

- login/session behavior
  Start with `src/App.tsx`, `src/api/authApi.ts`, and
  `server/presentation/http/registerAuthRoutes.js`.
- page layout or interaction behavior
  Start in `src/presentation/pages/` and related shared components.
- API calls or frontend data flow
  Check `src/api/`, `src/data/`, and `src/application/`.
- permission behavior
  Check `src/utils/userProfile.js` and the relevant backend route module.
- persistence or migrations
  Check `server/infrastructure/persistence/`.

## Related Docs

- `docs/ProductionSecurity.md`
  Security and deployment baseline.
- `docs/PostgresMigrationPlan.md`
  PostgreSQL migration and rollout status.
- `docs/MobileImplementationTodo.md`
  Active mobile implementation checklist.
- `docs/NewMemberPortalGuide.md`
  End-user/member-facing guide.

## Maintenance Notes

- Prefer updating existing docs instead of creating parallel docs for the same
  topic.
- Treat `docs/archive/` as historical reference, not current guidance.
- If you change scripts, runtime assumptions, or folder structure, update
  `README.md` and this guide in the same change.
