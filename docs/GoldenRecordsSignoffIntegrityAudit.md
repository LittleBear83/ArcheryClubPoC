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
the composite key. Cloud-to-Pi rows can carry a null signer after the SQLite
schema upgrade. Pi-to-Cloud upserts derive a nullable signer user ID. Deletion
events still use the stable composite key. Existing manual rows retain their
foreign keys and attribution. A Pi must run the SQLite migration before it
receives a null-signer row.

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
can recover affected members. The HTTP client retries 429 and transient server
responses at most twice, honours `Retry-After` up to 60 seconds, and returns a
429 without retrying when the requested wait exceeds that budget. It keeps its
existing per-request timeout. The nine observed executions are consistent
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

Back up PostgreSQL and Pi SQLite data before rollout. Deploy the application
and PostgreSQL migration together; migrate each Pi before allowing it to pull
null-signer imports. Verify migration 025, foreign-key checks, one manual
approval, one imported approval, a repeated import, and a nightly partial
status. Keep Scheduler paused until that verification and explicit approval.
For rollback, stop the new worker and restore the application and database
backup together. Reapplying `NOT NULL` is safe only after removing or
reconciling null-signer imported rows. Do not simply roll back application code
against the new imported data.
