# Golden Records sign-off integrity audit (29 October 2026)

## Existing workflow and reusable components

The profile desktop and mobile views expose unsigned distances to an actor with
`sign_off_distances`. The profile action hook calls
`POST /api/user-profiles/:username/distance-sign-offs`. The route resolves the
target member from the URL, checks the actor's permission, rejects self-sign-off,
checks that the discipline belongs to the member and the yards are supported,
and verifies the **target member's password**. It records the authenticated
actor as `signed_off_by_username` with current UTC date and time. There is no
second actor login. The route writes a `distance_sign_off` audit event after the
database write and broadcasts member and outdoor table updates. Desktop and
mobile show signer and date for manual approvals and provenance for imported
ones. A manual re-sign at the same key replaces the current row; there is no
dedicated revoke endpoint. Historic manual re-signs are visible in audit events,
whose write is asynchronous and therefore not atomic with the approval.

`member_distance_sign_offs` has primary key `(username, discipline,
distance_yards)`, a member foreign key, a human signer foreign key, `source`,
date and time. PostgreSQL also maps both usernames to user IDs. SQLite checks
allowed disciplines and distances. `source` was added to legacy SQLite files
and PostgreSQL via earlier compatibility migrations. The key holds one current
approval per distance; manual and imported approvals at the same key cannot
coexist as separate rows. This is acceptable for current display if the manual
approval wins. A future external acknowledgement can be associated with the
current row, while full multi-approval history would require a separate table.

Individual refresh and full-club sync use the Golden Records member sync
service for matching, snapshots, outdoor and indoor achievement mapping, and
sign-off import. Manual matching uses a transaction across the match, snapshot,
table writes and sign-offs. Unchanged snapshots and sign-offs are detected.
Cloud sync jobs use a PostgreSQL advisory lock and persist job status; the
nightly route validates the configured Scheduler job identity and schedule
time, while private Cloud Run IAM authenticates requests. The hotfix at
`79754881be05171f11999ba2ed50937260e7badb` remains intact.

Cloud/Pi sync already includes this table in snapshots and change logs using
the composite key. **The live Pi uses local PostgreSQL**, as required by
`server/config/runtime.js` and documented in `LocalDatabaseSync.md`; SQLite
is a non-live compatibility path. Cloud-to-Pi rows can carry a null signer
only after migration 025 has run on the Pi PostgreSQL database. Pi-to-Cloud
upserts derive a nullable signer user ID. Deletion events still use the stable
composite key. Existing manual rows retain their foreign keys and attribution.
The SQLite table rebuild remains necessary for non-live SQLite installations.

## Faults and correction

The nightly execution identity `scheduler` was passed into the signer field
for Golden Records achievements. PostgreSQL correctly rejected that value.
`replaceForDiscipline()` also deleted every sign-off in a discipline, so an
external response could erase manually approved distances. The repository now
imports additively in a transaction. It updates only rows already sourced from
Golden Records; manual rows always win, including concurrent conflicts. Omitted
external achievements remain recorded. Repeating the import does not duplicate
rows, and unchanged detection skips writes. Imported rows have a null human
signer and preserve the achievement date and time. PostgreSQL migration 025
drops only the signer `NOT NULL` constraint; SQLite rebuilds this table once
while preserving rows, key and foreign keys. No scheduler user is created.

The nightly route used to return HTTP 500 for `completed-with-errors`, causing
Scheduler to rerun the entire club for member-level errors. It now returns
HTTP 200 with `success: false`, the complete error report and persisted partial
status. A repeated request for the same nightly date returns that status
without another full-club run. A whole-job failure still returns HTTP 500 and
can retry. After correcting member data, an authorised manual full-club sync
can recover affected members. Golden Records Admin shows the status, error
count and first ten member errors; the persisted job status retains the full
error list. The HTTP client retries 429 and transient server
responses at most twice, honours `Retry-After` within a 60-second total
rate-limit wait budget, and returns a 429 without retrying when the requested
wait exceeds the remaining budget. An aborted sync cancels a pending retry
wait. It keeps its existing per-request timeout. The nine observed executions are consistent
with the old HTTP 500 retry path; cloud logs would be needed to assign each
execution to a specific Scheduler attempt.

## Future outbound integration

The existing sign-off route is the correct authorization point. A later change
should create a durable outbox entry in the same transaction as the manual
approval, with the composite sign-off key and an idempotency identifier. A
worker can submit it after the Golden Records outbound contract is reviewed,
retry temporary failures with a bound, and store external reference ID,
confirmation time and status. Inbound matching should correlate that reference
or idempotency identifier, retain the original human signer, and avoid
re-enqueueing a confirmed approval. The present async audit write is a
transactionality gap to resolve before outbound delivery. No outbound API
calls or schema for an unreviewed contract were added.

## Release and rollback

### Disposable PostgreSQL 15 rehearsal

On 29 October 2026, an isolated PostgreSQL 15.19 server was started on
`127.0.0.1:55432` with a disposable data directory and test-only user. The
repository's environment guards were used; no Cloud SQL connection or proxy
was involved. The integration suite passed **61/61** tests, including two new
sign-off migration rehearsals. The first restored the old `NOT NULL` signer
constraint and removed migration 025's marker and check in a throwaway
database, inserted a real manual approval, and ran the actual migration runner.
It verified the retained signer, source and timestamps; nullable external
signer; manual-signer check and foreign key; additive, repeated imports;
Pi-to-Cloud payload upsert; failed-import transaction rollback; and safe
runner repeat. The second used a separate disposable Pi PostgreSQL database:
its old `NOT NULL` schema rejected a null-signer Cloud row, migration 025
made the same payload apply successfully, and its existing manual approval
remained intact. SQLite rehearsal verified the old-table rebuild twice,
retained rows, no duplicate imports, manual precedence and a rejected null
manual signer. The full unit suite, typecheck, changed-file lint and production
build also passed after the fix.

### Deployment order and mixed versions

1. Keep Scheduler paused. Ensure no manual Golden Records job is queued or
   running. Freeze member refresh and full-club Golden Records actions for the
   maintenance window. Stop Pi sync while each Pi is being upgraded.
2. Take a verified Cloud PostgreSQL backup and a local PostgreSQL backup of
   **every** Pi, including its outbox and sync checkpoint. Back up SQLite only
   on any non-live installation that actually uses it. Record Cloud Run
   revision IDs and the Scheduler state.
3. Upgrade every Pi application and let its startup apply PostgreSQL migration
   025 to the Pi's local database. Verify `signed_off_by_username` is nullable,
   the manual-signer check and
   foreign-key check pass, and the Pi can sync existing non-null rows from the
   still-old Cloud portal. Wait for all Pi versions and checkpoints to be
   confirmed before allowing any null-signer import.
4. Apply PostgreSQL migration 025 using the new application's guarded startup
   migration runner while Golden Records writes are frozen. A new public Cloud
   Run revision can be deployed with traffic held, then started deliberately
   to apply migrations before traffic moves. Verify the migration marker,
   nullable column, manual-signer check, retained row count and sample manual
   approvals. PostgreSQL's migration runner is transactional and serializes
   startups with an advisory lock.
5. Move all public portal traffic to the new revision. Verify a manual
   approval, member refresh and Cloud-to-Pi replication using a controlled
   test member. Confirm no old public revision is serving sign-off or Golden
   Records writes.
6. Deploy the new private worker with Scheduler still paused. Verify its
   revision, identity check and database migration state. Run one controlled
   manual club sync, inspect `completed` or `completed-with-errors`, sample
   manual and imported rows, and confirm Pi pull accepts a null signer.
7. Only after these checks and explicit approval, resume Scheduler. Check the
   next London nightly slot for one run, preserved manual approvals and honest
   partial-failure status. A failed whole job remains retryable; a completed
   partial run is deduplicated for that nightly date and can be repaired via
   an authorised manual sync after the member issue is corrected.

New Pi against old Cloud PostgreSQL is compatible with existing non-null rows
while Golden Records writes remain frozen. New PostgreSQL against old public code
supports ordinary manual writes, but the old Golden Records import still has
the signer and replacement defects; keep those actions frozen. An old Pi
PostgreSQL schema against new imported null-signer rows is **incompatible**;
the two-database rehearsal observed SQLSTATE `23502`. An old private
worker still writes `scheduler` as signer; it must not run. The new public
revision can also initiate imports, so it must not receive traffic until every
Pi is upgraded. Generic Cloud/Pi sync still uses the composite key and its
existing conflict policy; do not use an offline, stale Pi snapshot as an
authoritative replacement without checking its outbox and checkpoint.

If rollout fails before any new import, keep Scheduler and Golden Records
writes paused and return traffic to the recorded revisions; the additive
database schemas can remain while diagnosing. After null-signer imports,
rolling back to an old Pi or worker is unsafe. Prefer a forward fix. A full
data rollback requires coordinated Cloud PostgreSQL and every Pi PostgreSQL
backup restore, with reconciliation of writes made since backup. Reapplying `NOT NULL` requires
first reconciling every null-signer row; it must never invent a human signer.

**Release decision: NO-GO for an immediate production change.** The code and
migrations have passed the disposable rehearsals, but production backups, Pi
database/version inventory, a Golden Records write freeze and post-deployment
checks have not been performed. Once those prerequisites are confirmed, the
ordered rollout above is technically ready for approval. Scheduler reactivation
remains NO-GO until every Pi migration and post-deployment check has passed.
The remaining code risk is the pre-existing non-atomic sign-off audit write;
it does not require a new sign-off design for this fix.
