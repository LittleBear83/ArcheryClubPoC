# Golden Records Integration To-Do

This document turns the proposed Golden Records integration into a repo-specific implementation checklist for `ArcheryClubPoC`.

## Current Status

Implementation status as of `2026-07-24`:

- Complete:
  - local member profiles now include `archeryGbMembershipNumber`
  - the records page already frames score submission as a future Golden Records workflow
  - PostgreSQL bootstrap no longer injects seeded users
- Not started:
  - no Golden Records client exists
  - no Golden Records sync tables exist
  - no connection settings UI exists
  - no member linking exists
  - no score import/export exists
  - no handicap/classification import exists
- Delivery direction agreed:
  - start with pull / read-only integration
  - move to push / `POST` / `PUT` only after pull is stable

## Legend

- `[x]` complete
- `[~]` partially complete, changed shape, or still worth reviewing
- `[ ]` still open

## Goal

Integrate `ArcheryClubPoC` with Golden Records in a safe staged rollout.

Recommended approach:

- Start with server-side read-only integration.
- Mirror and cache external data locally instead of calling the API directly from page loads.
- Match members using `archeryGbMembershipNumber` first, then manual reconciliation.
- Delay all remote writes until read-only sync, member linking, and operational monitoring are stable.

## Scope Decision

Golden Records should become the system of record for:

- members
- scores
- club records
- current handicaps
- current classifications
- personal bests
- scoresheets if later required

This app should remain the system of record for:

- announcements
- attendance and club reporting
- events and coaching calendar
- tournaments
- committee and role management
- equipment
- local sign-off and operational workflows

## Phase 1: Integration Foundation

### 1. Create Golden Records integration module boundary `[ ]`

Create a clear server-side integration seam rather than spreading API calls across route files.

Suggested folders:

- `server/domain/gateways/`
- `server/application/usecases/golden-records/`
- `server/infrastructure/golden-records/`

Suggested core pieces:

- `GoldenRecordsGateway`
- `goldenRecordsHttpClient`
- `goldenRecordsRateLimiter`
- `goldenRecordsSyncService`

### 2. Add Golden Records runtime config `[ ]`

Add environment-driven config for:

- `GOLDEN_RECORDS_BASE_URL`
- `GOLDEN_RECORDS_AUTH_MODE`
- `GOLDEN_RECORDS_API_KEY`
- `GOLDEN_RECORDS_USERNAME`
- `GOLDEN_RECORDS_PASSWORD`
- `GOLDEN_RECORDS_USER_AGENT`
- `GOLDEN_RECORDS_ENABLED`

Update:

- [server/config/runtime.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/config/runtime.js)

Notes:

- keep credentials server-only
- do not expose them through frontend config
- support both club API key auth and member credential auth if needed

### 3. Build authenticated HTTP client `[ ]`

Create:

- `server/infrastructure/golden-records/goldenRecordsHttpClient.js`

Responsibilities:

- send `Authorization` header in the required `Basic {TOKEN}` format
- send `User-Agent`
- centralize base URL handling
- centralize JSON parsing
- normalize non-2xx failures into app-safe errors
- set conservative timeouts

### 4. Add request throttling and retry policy `[ ]`

Golden Records documents limits of:

- `1/second`
- `20/minute`
- `200/hour`

Implement:

- serialized request scheduling
- short retry with backoff for transient failures
- no blind retry for auth failures or validation failures
- local caching to avoid using live API calls to render hot screens

### 5. Add integration audit and diagnostics `[ ]`

Create:

- integration-specific logging for connection tests, sync runs, imports, and exports

Track:

- endpoint called
- duration
- page number
- items imported/exported
- throttling wait time
- auth failures
- validation failures

## Phase 2: Persistence For Sync State

### 6. Add Golden Records sync tables `[ ]`

Create local tables for:

- `golden_records_connection_status`
- `golden_records_sync_runs`
- `golden_records_sync_cursors`
- `golden_records_member_links`
- `golden_records_score_exports`

Suggested responsibilities:

- connection health snapshot
- per-entity sync history
- paging checkpoint / last sync timestamp
- local-to-remote member mapping
- local-to-remote score export tracking

### 7. Add optional local snapshot tables `[ ]`

Recommended read-model tables:

- `golden_records_members_snapshot`
- `golden_records_scores_snapshot`
- `golden_records_clubrecords_snapshot`
- `golden_records_current_handicaps_snapshot`
- `golden_records_current_classifications_snapshot`
- `golden_records_personal_bests_snapshot`

Reason:

- keep page rendering fast
- avoid rate-limit pressure
- make sync results inspectable and auditable

### 8. Add migrations for SQLite and PostgreSQL `[ ]`

Update:

- [server/infrastructure/persistence/bootstrapSqliteBaseSchema.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/persistence/bootstrapSqliteBaseSchema.js)
- [server/infrastructure/persistence/runPostgresMigrations.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/persistence/runPostgresMigrations.js)
- [server/infrastructure/persistence/sqliteToPostgresMigration.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/persistence/sqliteToPostgresMigration.js)

## Phase 3: Read-Only Connection And Reference Data

### 9. Add admin-only connection test route `[x]`

Create:

- `GET /api/golden-records/health`

Responsibilities:

- test credentials
- test outbound connectivity
- return safe masked diagnostics

Restrict to:

- developer
- admin

### 10. Add admin-only integration settings page `[x]`

Create:

- `src/presentation/pages/GoldenRecordsAdminPage.tsx`

Show:

- enabled/disabled
- auth mode
- last successful connection test
- last sync status
- last failure summary

### 11. Import lookup/reference data first `[x]`

Pull and cache:

- rounds
- classes
- age groups
- types
- settings if useful

Use cases:

- `SyncGoldenRecordsLookupsUseCase`

Reason:

- gives stable IDs and labels before member or score synchronization

## Phase 4: Member Pull And Linking

### 12. Add members pull use case `[ ]`

Implement:

- paged fetch from `GET api/members?pageNumber={pageNumber}&pageSize={pageSize}`

Store:

- remote member id
- display name
- archival status if returned
- any useful lookup references

### 13. Build local member matching rules `[ ]`

Primary match:

- local `archeryGbMembershipNumber` to Golden Records member identifier fields if available

Fallback:

- exact username if club policy supports it
- exact name match only as a suggestion, never auto-link

Rules:

- do not auto-link ambiguous matches
- do not overwrite local member identity data during first import

### 14. Add member link table workflow `[ ]`

Store:

- local username
- local user id
- remote member id
- link status
- linked by
- linked at
- matched via `agb_number`, `manual`, or `seeded-import`

### 15. Add reconciliation UI `[ ]`

Add to the admin page:

- matched members
- unmatched local members
- unmatched remote members
- conflict cases needing manual review

Actions:

- approve suggested link
- unlink
- manually select remote member

### 16. Do not write member changes back yet `[ ]`

Explicitly keep member sync read-only in phase 1.

Notes:

- no `POST api/members`
- no `PUT api/members`
- no `DELETE api/members`

## Phase 5: Score And Records Pull

### 17. Add scores pull use case `[ ]`

Implement:

- `GET api/scores?pageNumber={pageNumber}&pageSize={pageSize}`

Store:

- remote score record id
- linked member id where possible
- round, date, score, hits, golds, tens/xs
- updated timestamp

### 18. Add club records pull use case `[ ]`

Implement:

- `GET api/clubrecords?pageNumber={pageNumber}&pageSize={pageSize}`

Use this for:

- the club records sidebar / summary in the records page

### 19. Add current handicap and classification pull `[ ]`

Implement:

- `GET api/currenthandicaps`
- `GET api/currentclassifications`
- optionally `GET api/personalbests`

Use this for:

- profile page read models
- records page summary

### 20. Add profile read-only Golden Records sections `[ ]`

Update:

- [src/presentation/pages/ProfilePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/ProfilePage.tsx)
- related profile section components

Show:

- synced handicap
- synced classification
- last sync timestamp
- read-only marker

### 21. Add records page read-only data view `[ ]`

Update:

- [src/presentation/pages/RecordsPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/RecordsPage.tsx)
- [src/presentation/pages/records/useRecordsPageState.ts](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/records/useRecordsPageState.ts)

Replace placeholder-only content with:

- pulled club records
- pulled score history
- import status
- last sync indicator

## Phase 6: Scheduling, Operations, And Safety

### 22. Add manual sync actions `[ ]`

Admin actions:

- sync lookups
- sync members
- sync scores
- sync records
- sync classifications and handicaps

### 23. Add scheduled sync strategy `[ ]`

Recommended cadence:

- lookups: daily or manual
- members: nightly
- scores and records: nightly, plus manual on demand
- handicaps/classifications: nightly

### 24. Make syncs idempotent `[ ]`

Ensure:

- re-running the same page import does not duplicate rows
- remote records are upserted by remote id
- sync runs can resume after interruption

### 25. Add failure handling and alert surface `[ ]`

Show on the admin page:

- last failure
- last successful run
- entity counts
- whether throttling is delaying jobs

### 26. Keep core app flows independent of Golden Records availability `[ ]`

If Golden Records is down:

- login still works
- announcements still work
- attendance still works
- equipment still works
- calendar still works

Only Golden Records surfaces should degrade.

## Phase 7: Push / POST / PUT Preparation

### 27. Freeze write scope before implementation `[ ]`

Before phase 2 begins, decide:

- whether only scores can be written back first
- whether members can be created remotely from this app
- whether member updates are limited to admin-only workflows

### 28. Add export tracking table and status model `[ ]`

Before any remote writes, make sure local export state exists for:

- local entity id
- remote entity id
- payload checksum
- exported at
- last failure
- retry count

### 29. Add dry-run mode for non-production `[ ]`

Support:

- payload generation without remote send
- validation of mapping logic
- admin preview of what would be posted

## Phase 8: Push / POST / PUT Delivery

### 30. Start with score submission only `[ ]`

First write-back step:

- `POST api/scores`

Reason:

- the current records page is already the closest fit
- lower blast radius than full member writes

### 31. Add score update flow after create is stable `[ ]`

Second write-back step:

- `PUT api/scores?record_id={record_id}`

Requirements:

- keep local-to-remote mapping
- prevent duplicate remote score creation on retries

### 32. Consider scoresheet upload only after score create/update is proven `[ ]`

Later optional step:

- `POST api/Scoresheets`
- `PUT api/Scoresheets`

### 33. Add member `POST` only after linking is stable `[ ]`

Only consider:

- `POST api/members`

after:

- member link workflow is proven
- admin reconciliation process is in place
- field mapping is reviewed club-wide

### 34. Add member `PUT` only after create is stable `[ ]`

Later optional step:

- `PUT api/members?member_id={member_id}`

Rules:

- no blind overwrite of remote data
- only mapped fields should be pushed
- local source-of-truth rules must be explicit

### 35. Keep remote deletes out of the first write phase `[ ]`

Do not enable:

- `DELETE api/members`
- `DELETE api/scores`

until:

- all write flows are stable
- there is a recovery playbook
- club policy explicitly approves delete propagation

## Phase 9: Testing And Verification

### 36. Add unit tests for the client and mapper layer `[ ]`

Test:

- auth header construction
- error normalization
- paging behaviour
- throttling guard
- member mapping
- score mapping

### 37. Add integration tests for sync services `[ ]`

Test:

- first import
- repeat import
- partial page failure
- interrupted sync resume
- member link conflict handling

### 38. Add admin route security tests `[ ]`

Ensure:

- only admin/developer users can access integration controls
- credentials are never returned in API payloads

### 39. Add manual QA checklist `[ ]`

Check:

- connection test
- member match suggestions
- manual link override
- records page synced data display
- profile synced data display
- sync failure visibility
- throttling-safe behaviour over repeated sync runs

## Rollout Order

### 40. Delivery sequence `[ ]`

Recommended order:

1. Add runtime config
2. Build Golden Records HTTP client
3. Add sync tables
4. Add connection test route
5. Add admin integration page
6. Sync lookups
7. Sync members
8. Add member linking and reconciliation
9. Sync scores
10. Sync club records
11. Sync current handicaps and classifications
12. Surface read-only data in profile and records views
13. Add manual and scheduled sync actions
14. Review operational safety
15. Start `POST api/scores`
16. Add `PUT api/scores`
17. Only then assess member `POST` / `PUT`

## Estimated Effort

Approximate effort:

- foundation and client: 1 to 2 days
- persistence and admin diagnostics: 1 to 2 days
- member pull and linking: 2 to 4 days
- score / records / handicap pull: 2 to 4 days
- UI surfacing and operational hardening: 1 to 3 days
- first write-back phase for scores: 2 to 4 days

Expected total:

- pull / read-only phase: roughly 1.5 to 3 weeks
- first push / `POST` / `PUT` score phase: roughly 1 to 2 additional weeks

## Immediate Next Task

Start with:

- [ ] add Golden Records runtime config
- [ ] create `goldenRecordsHttpClient`
- [ ] create connection test route
- [ ] add sync state tables
- [ ] create admin integration page shell
