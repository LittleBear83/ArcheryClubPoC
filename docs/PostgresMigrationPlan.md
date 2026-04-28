# PostgreSQL Migration Plan

This repository now has environment, bootstrap, and cutover-tooling support for
selecting a PostgreSQL runtime connection. The main remaining work is no longer
basic engine wiring; it is staging verification, route-parity confidence, and
deployment rollout.

## What Is Already Done

- Runtime config can now select `sqlite` or `postgres`.
- PostgreSQL connection settings can be supplied with:
  - `DATABASE_URL`
  - or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - or `INSTANCE_CONNECTION_NAME` for Cloud SQL Unix socket connections
- The persistence bootstrap has been split so a PostgreSQL pool can be created
  independently from SQLite file initialization.
- Auth-route persistence is now behind `memberAuthGateway`, with both SQLite and
  PostgreSQL implementations for:
  - user lookup by username, credentials, and RFID
  - user discipline lookup
  - guest/member login event writes
  - password hash upgrades
- Member profile writes and loan-bow persistence are now behind
  `memberProfileGateway`, with both SQLite and PostgreSQL implementations for:
  - role existence checks during profile saves
  - transactional user/user-type/discipline/profile saves
  - loan bow reads and writes
- Role and committee administration persistence is now behind
  `roleCommitteeGateway`, with both SQLite and PostgreSQL implementations for:
  - role CRUD plus role-permission rewrites
  - permission definition listing
  - assigned-user counts
  - committee-role CRUD and display-order lookups
- Activity and reporting queries are now behind `activityReportingGateway`, with
  both SQLite and PostgreSQL implementations for:
  - personal booking lookups
  - range member and guest activity lookups
  - attendance reporting rows
  - usage dashboard totals and hourly/weekday/daily breakdown queries
  - discipline list reads used by the range-members view
- Tournament persistence is now behind `tournamentGateway`, with both SQLite
  and PostgreSQL implementations for:
  - tournament CRUD
  - tournament registration add/remove flows
  - score submission upserts
  - registration/score list reads used by tournament views and reminders
- Schedule, event, and coaching persistence is now behind `scheduleGateway`,
  with both SQLite and PostgreSQL implementations for:
  - club event CRUD-adjacent flows
  - event booking add/remove flows
  - coaching session CRUD-adjacent flows
  - coaching booking add/remove flows
  - event/coaching booking list reads used by calendar views
  - schedule conflict helper reads used by event/session creation
- Equipment persistence is now behind `equipmentGateway`, with both SQLite and
  PostgreSQL implementations for:
  - equipment item CRUD-adjacent flows
  - assignment and return flows
  - storage-location CRUD
  - open-loan and case-contents reads
  - equipment dashboard reads used by admin and beginner-course views
- SQLite user seeding and legacy-password bootstrap now run through
  `bootstrapSqliteUserData`, which starts moving startup-only concerns out of
  `server/index.js`.
- SQLite base table creation and early compatibility fixes now run through
  `bootstrapSqliteBaseSchema`, so the core schema bootstrap no longer lives
  inline in `server/index.js`.
- SQLite role/permission seeding plus early legacy datetime compatibility
  migrations now run through `bootstrapSqliteLegacySupport`, further shrinking
  the inline startup migration block.
- SQLite user compatibility rebuilds now run through
  `bootstrapSqliteUserCompatibility`, covering the legacy `users` table rebuild,
  user-id backfills/triggers, and loan-bow column patching.
- SQLite equipment compatibility rebuilds now run through
  `bootstrapSqliteEquipmentCompatibility`, covering the equipment table rebuilds
  and the dependent beginner-course participant foreign-key repair.
- SQLite beginner-course, coaching, event, and tournament approval/date
  compatibility patches now run through
  `bootstrapSqliteCourseScheduleCompatibility`.
- PostgreSQL now has a startup migration runner in
  `runPostgresMigrations`, which creates the base schema plus permission,
  role, committee-role, equipment-location, and initial user seed data.
- PostgreSQL startup now runs through `bootstrapPersistence`, so Postgres skips
  all SQLite-only schema-compatibility bootstrap paths cleanly.
- The remaining SQLite query layer is also starting to move out of
  `server/index.js`; beginner-course statements now live in
  `createSqliteBeginnersCourseStatements`.
- Reporting/login analytics statements now live in
  `createSqliteReportingStatements`, further reducing the SQLite query surface
  still embedded in `server/index.js`.
- Schedule, event-booking, coaching-booking, and tournament SQLite statements
  now live in `createSqliteScheduleTournamentStatements`.
- Role/committee and loan-bow SQLite statements now live in
  `createSqliteRoleCommitteeStatements` and
  `createSqliteLoanBowStatements`.
- Member distance sign-offs now run through a dual-engine repository, so the
  distance sign-off read/write path no longer depends on SQLite-only
  `db.prepare(...)` internals.
- Beginner-course write flows now have a dual-engine gateway for course
  creation/review/cancellation, participant creation/editing/conversion, lesson
  coach assignment, and participant password resets, which removes another
  large cluster of direct SQLite writes from `server/index.js`.
- `server/index.js` no longer prepares SQLite statements directly with
  `db.prepare(...)`; its remaining PostgreSQL blockers are now higher-level
  helpers and startup flows rather than inline statement definitions.
- Membership-fee status syncing and member-profile save orchestration now run
  through `memberPersistenceService`, so the remaining mixed sync/async helper
  logic is no longer embedded in `server/index.js`.
- The auth routes now await membership-status synchronization, which removes the
  last SQLite-era sync assumption from those flows.
- A SQLite-to-PostgreSQL cutover script now exists at
  `scripts/migrateSqliteToPostgres.mjs`, with a package script entry
  `npm run migrate:postgres`.
- The SQLite-specific SQL still present in the codebase is now isolated to the
  SQLite bootstrap and compatibility modules rather than the PostgreSQL runtime
  path.

## Remaining Work

1. Boot and exercise the full server with `DATABASE_ENGINE=postgres` in a real
   staging environment.
2. Add broader route-parity coverage so feature behavior is verified against
   PostgreSQL, not just the migration/bootstrap helpers.
3. Keep future PostgreSQL schema changes in numbered migrations instead of
   extending only the initial migration bootstrap.
4. Decide when to retire or freeze the SQLite compatibility modules after live
   PostgreSQL cutover.

## Recommended Order

1. Replace SQLite-only startup wiring with engine-specific bootstrap branches.
2. Port helper-heavy flows that still read users/disciplines synchronously from
   `server/index.js`.
3. Exercise `DATABASE_ENGINE=postgres` at startup and fix the next runtime
   blockers iteratively.
4. Enable PostgreSQL in a staging environment only after route parity tests
   pass.

## Working Checklist

### 1. Bootstrap and startup

- [x] Add a PostgreSQL user/bootstrap path for empty databases.
- [x] Decide what should be seeded in PostgreSQL for development versus live:
  demo users, developer account, committee roles, and any default reference
  data.
- [x] Move SQLite-only startup concerns behind a clearly named SQLite bootstrap
  branch so `server/index.js` stops assembling unused SQLite helpers in
  PostgreSQL mode.
- [x] Remove or shrink the `createUnsupportedPreparedStatement*` fallbacks once
  the Postgres path no longer depends on SQLite statement wiring.
- [ ] Confirm the server can boot with `DATABASE_ENGINE=postgres` and an empty
  database without manual SQL steps.

### 2. Service and gateway cleanup

- [x] Move remaining cross-engine business logic out of `server/index.js` and
  into focused services or gateways where practical.
- [x] Review helpers that still coordinate persistence across multiple concerns,
  especially member-profile saves and membership-fee status sync.
- [x] Replace any remaining mixed sync/async persistence assumptions with fully
  async repository or gateway calls.
- [x] Re-check route registration modules after cleanup so they depend on
  engine-agnostic interfaces only.

### 3. Schema and migration coverage

- [x] Verify `runPostgresMigrations` covers every table and index needed by the
  current app features.
- [ ] Add new numbered PostgreSQL migrations for future schema changes instead
  of growing the initial migration forever.
- [x] Audit remaining SQLite-only compatibility modules and confirm they are
  isolated to SQLite startup only.
- [ ] Document which SQLite compatibility files can eventually be retired after
  production cutover.

### 4. Data cutover tooling

- [x] Create a one-way export/import script to copy live SQLite data into
  PostgreSQL.
- [x] Migrate all current domains: users, roles, permissions, disciplines, loan
  bows, login events, guest logins, schedule/events, tournaments, equipment,
  beginners courses, and distance sign-offs.
- [x] Preserve key relationships during import, including username-based and
  user-id-based references.
- [x] Reset PostgreSQL sequences after import so future inserts do not collide
  with imported ids.
- [x] Add a dry-run mode and logging so the cutover can be rehearsed safely.
- [ ] Write a rollback/recovery note for failed imports or partial cutovers.

### 5. Verification and parity testing

- [ ] Add automated tests that boot the app with `DATABASE_ENGINE=postgres`.
- [ ] Add route-level parity coverage for auth, member profiles, roles,
  committee roles, schedule, tournaments, equipment, reporting, and
  beginners-course flows.
- [x] Add migration-runner tests beyond the current schema bootstrap coverage.
- [ ] Run a manual smoke test against PostgreSQL covering login, profile edits,
  bookings, approvals, equipment loans, and beginner-course operations.
- [ ] Stand up a staging environment on PostgreSQL before switching any live
  deployment.

### 6. Documentation and rollout

- [ ] Update `README.md` once PostgreSQL is a supported runtime rather than a
  partial migration target.
- [ ] Add a deployment runbook covering required environment variables,
  migration execution, and cutover steps.
- [ ] Document backup expectations for both the source SQLite database and the
  target PostgreSQL database before migration.
- [ ] Define the final go-live checklist: backup taken, import run, smoke tests
  passed, and old SQLite writes disabled.
