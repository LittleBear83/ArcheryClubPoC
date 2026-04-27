# PostgreSQL Migration Plan

This repository now has environment and bootstrap support for selecting a
PostgreSQL runtime connection, but the application logic is still implemented
through SQLite-specific statements embedded in `server/index.js`.

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
  role, committee-role, and default equipment-location seed data before the
  remaining Postgres safety guard stops the server.
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
- `server/index.js` no longer prepares SQLite statements directly with
  `db.prepare(...)`; its remaining PostgreSQL blockers are now higher-level
  helpers and startup flows rather than inline statement definitions.
- The server now fails fast with a clear message if PostgreSQL is configured
  before the remaining query layer is migrated.

## Remaining Work

1. Finish splitting startup/bootstrap so PostgreSQL can skip all SQLite-only
   initialization paths cleanly.
2. Replace remaining synchronous SQLite helper access in `server/index.js`
   with async repository or gateway calls.
3. Replace SQLite-specific SQL, including:
   - `PRAGMA table_info(...)`
   - `sqlite_master`
   - `INSERT OR IGNORE`
   - `INTEGER PRIMARY KEY AUTOINCREMENT`
4. Add a data migration path from SQLite to PostgreSQL for live cutover.

## Recommended Order

1. Replace SQLite-only startup wiring with engine-specific bootstrap branches.
2. Port helper-heavy flows that still read users/disciplines synchronously from
   `server/index.js`.
3. Exercise `DATABASE_ENGINE=postgres` at startup and fix the next runtime
   blockers iteratively.
4. Enable PostgreSQL in a staging environment only after route parity tests
   pass.
