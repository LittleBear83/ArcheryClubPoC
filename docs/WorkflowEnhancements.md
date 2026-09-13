# Application workflow enhancements

Branch: `feat/app-workflow-enhancements`, based directly on deployed commit
`36df59826eb5caad14cfa4a8e462860e609f6044`.

## Behaviour

- Homepage signed-up events and coaching reminders disappear after the local end date/time, including while the page stays open. Same-day events remain visible through their end time. Undated-end reminders remain until the end of their day. Cancelled lessons are excluded; history is retained.
- Closed courses and taster sessions offer **View details**, opening the existing full attendee and attendance view. Existing transfer, reallocation and member conversion actions retain their existing permission and completion rules. The course stays closed. Cancelling every date closes its management listing without allowing early member conversion.
- **Cancel session date(s)** selects one or more active lesson dates and explicitly confirms cancellation. The API checks permissions, ownership, duplicate IDs, course membership and cancellation state. PostgreSQL and SQLite apply the entire selection atomically. Dates remain visible as **Cancelled** in management/calendar views. Attendees, coaches and attendance records remain intact. Whole-course cancellation retains its existing workflow.
- **Randomise every round** is a tournament setup option. Each ready round gets a fresh server draw. The generated pairings are saved in the existing tournament round-plan JSON before match persistence. Saved rounds and overrides survive reads/reloads. Later rounds use the existing winner and highest-loser progression rules and retain bye slots. Existing fixed and initial random draws continue to work.
- **Edit pairings** uses the current unplayed round's existing participants. Captains with `MANAGE_TOURNAMENTS` can assign each archer exactly once and preserve bye slots. Self, duplicate, missing, additional and malformed assignments are rejected. Recorded results, disputed matches, completed rounds and later result-bearing rounds prevent editing. Saved overrides use the same persisted round metadata as automatic draws.

## Persistence and sync

New forward migration **012_lesson_cancellation** adds
`beginners_course_lessons.is_cancelled INTEGER NOT NULL DEFAULT 0`, restricted to
`0` or `1`. Existing rows stay active and retain their identities and relationships.
No deployed migration was edited.

The existing lesson change-log trigger serialises the whole row and already
suppresses echoes during pull/maintenance. New Cloud snapshots select the flag;
Pi snapshot and incremental apply persist it. SQLite bootstrap and legacy
SQLite-to-PostgreSQL import also preserve the field and default older databases
to active. Apply migration 012 to both PostgreSQL databases before running the
updated application/sync reader. No deployment or production data operation was
performed during this work.

Tournament options/pairings extend `round_schedule_json`; they require no
new tournament columns. Existing technical identifiers such as
`supportsRandomizedDraw` remain compatible. User-facing text uses UK spelling.

## Permissions and audit

Date cancellation permits the existing course coordinator or users with the
course type's manage/approve permission. Attendee management/conversion retains
its existing server permissions. Tournament pairing edits require the existing
`MANAGE_TOURNAMENTS` permission. Both new management operations use the existing
entity-change audit logger and event broadcasts.

Tournament reads that can generate draws and all tournament/match writes share
a request queue. PostgreSQL holds an advisory lock across server instances,
preventing a score submission from racing an override. Lock failures discard
the affected database connection. Setup edits are rejected after saved pairings
or match activity, so they cannot reset a draw/results.

## Validation

- `npm test`: 255 passed, zero failures/skips.
- `npm run typecheck`: passed.
- `node scripts/lintChangedFiles.mjs 36df59826eb5caad14cfa4a8e462860e609f6044`: passed, zero errors; two existing `exhaustive-deps` warnings in `TournamentsPage.tsx`. Final course-page lint also passed after the refresh change.
- `npm run build`: passed.
- `git diff --check`: passed.
- `npm run test:postgres-integration`: 39 passed, zero failures/skips (PostgreSQL 17.6).

PostgreSQL checks use a disposable local PostgreSQL 17.6 instance and temporary
databases protected by the existing integration safety guards. The final Windows
test cluster uses `fsync=off` because filesystem flushing stalled test cleanup.
The suite verifies transaction/replication and backend-crash behaviour; it does
not establish operating-system crash durability. PostgreSQL 15 and the default
PostgreSQL configuration remain checks for the existing CI matrix. Physical
mobile browser interaction remains a useful review check.

## Changed files

- scripts/migrateSqliteToPostgres.mjs
- scripts/run-tests.mjs
- server/domain/services/localDatabaseSyncService.js
- server/domain/services/tournamentEngine.js
- server/domain/services/tournamentPairings.js
- server/domain/services/tournamentPairings.test.js
- server/domain/services/tournamentRoundPlan.js
- server/index.js
- server/infrastructure/persistence/beginnersCourseReadGateway.js
- server/infrastructure/persistence/beginnersCourseWriteGateway.js
- server/infrastructure/persistence/bootstrapSqliteCourseScheduleCompatibility.js
- server/infrastructure/persistence/committeeMinutesSyncPostgresIntegration.test.js
- server/infrastructure/persistence/createSqliteBeginnersCourseStatements.js
- server/infrastructure/persistence/phase2a1PostgresIntegration.test.js
- server/infrastructure/persistence/postgresMigrations/012_lesson_cancellation.js
- server/infrastructure/persistence/postgresMigrations/index.js
- server/infrastructure/persistence/sqliteToPostgresMigration.js
- server/infrastructure/persistence/syncGateway.js
- server/infrastructure/persistence/tournamentGateway.js
- server/presentation/http/registerCourseDateCancellationRoutes.js
- server/presentation/http/registerTournamentPairingRoutes.js
- server/presentation/http/registerTournamentRoutes.js
- server/presentation/http/tournamentWorkflowLock.js
- server/presentation/http/workflowEnhancements.test.js
- shared/tournamentPairingRules.js
- src/api/beginnersCoursesApi.ts
- src/domain/entities/Tournament.ts
- src/presentation/pages/BeginnersCoursesPage.tsx
- src/presentation/pages/HomeSection.tsx
- src/presentation/pages/TournamentsPage.tsx
- src/presentation/pages/beginnersCourseWorkflow.js
- src/presentation/pages/home/homeActivityFilters.test.ts
- src/presentation/pages/home/homeActivityFilters.ts
- src/presentation/pages/tournaments/tournamentViewTypes.ts
- docs/WorkflowEnhancements.md
