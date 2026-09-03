# Local Database Sync

This document describes the production-safe local database sync slices for the Selby Archery Club portal, including Phase 2A1 reporting parity.

## Scope implemented

Implemented up to Phase 2A1:

- initial cloud-to-local population of member authentication/reference data
- incremental pull of cloud changes using a server-issued monotonic checkpoint
- idempotent push of Pi-originated `login_events`
- idempotent push of Pi-originated `guest_login_events`
- offline login against the Pi's local PostgreSQL database
- offline member lookup, role/permission lookup, and RFID lookup
- local sync status inspection
- systemd-based scheduled sync on the Pi
- cloud-to-Pi announcements, club events, coaching sessions, and equipment catalogue data
- local-first Pi event/coaching booking commands with durable acknowledgements or terminal conflicts
- cloud-to-Pi historical and incremental `login_events` for local range reporting
- cloud-to-Pi historical and incremental `guest_login_events` for local range reporting
- cloud-to-Pi `range_presence_extensions` state with versioned stale-command rejection
- cloud-to-Pi read-only `beginners_courses` and `beginners_course_participants` needed by reporting
- local reporting/range-usage calculation from replicated source rows instead of synchronized aggregates

Still out of scope after Phase 2A1:

- equipment loans, returns, assignments, and storage mutations
- tournaments
- member profile editing
- full beginners/taster/have-a-go workflow mutation
- audit log parity
- questions, suggestions, lost-and-found sync
- committee/minutes sync
- Golden Records cache sync
- outdoor table sync
- broader operational/admin domains

Those tables may still exist locally for other reasons, but they are not yet synchronized with domain-specific conflict rules.

Synced operational masters use opaque `sync_id` values. Existing numeric IDs remain
local database implementation details and are never used as cross-database identities.
Booking commands use the master `sync_id`, member username, and a stable outbox event
ID. Cloud acknowledgements retain the outbox record with `acknowledged_at`; deterministic
rejections are retained with rejection metadata for audit/recovery. Pull writes run with
`archery.sync.apply_mode=pull`, so imported cloud data cannot create change-log or outbox
entries.

## Architecture

Preferred flow:

```text
Pi PostgreSQL -> Node sync client -> HTTPS sync API on Cloud Run -> Cloud SQL PostgreSQL
```

The sync API is fail-closed and is only registered when all of the following are true:

- runtime is PostgreSQL
- `SYNC_NODE_MODE=cloud-server`
- `SYNC_SERVER_ENABLED=true`
- `SYNC_MACHINE_CREDENTIALS_JSON` contains at least one credential

This prevents the Raspberry Pi deployment from accidentally exposing a functional sync-server endpoint unless it is explicitly configured to do so.

## Domains and ownership

Cloud-authoritative, pull-only in this slice:

- `users`
- `user_types`
- `user_disciplines`
- `roles`
- `permissions`
- `role_permissions`

Pi-authoritative, append-only push:

- `login_events`
- `guest_login_events`

Cloud-authoritative pull or pull-resulting state:

- `range_presence_extensions`
- `beginners_courses`
- `beginners_course_participants`

Reporting source dependencies confirmed from code:

- `login_events`
- `guest_login_events`
- `range_presence_extensions`
- `users`
- `user_types`
- `user_disciplines`
- `beginners_courses`
- `beginners_course_participants`
- `club_events`
- `event_bookings`
- `coaching_sessions`
- `coaching_session_bookings`

Conflict rules:

- `users`: cloud is authoritative for synchronized member/admin fields including password hash, RFID assignment, membership flags, and role-linked access data.
- `users` on the Pi are still subject to the app's existing deterministic expiry normalization during auth/session checks. If `membership_fees_due` is in the past, current code may set `active_member=0` and append `-deactivated` to `rfid_tag`. Those derived local changes are **not** pushed back to cloud in this slice.
- `roles`, `permissions`, `role_permissions`, `user_types`, `user_disciplines`: cloud replaces local state.
- `login_events`: append-only with stable `sync_event_id` and authenticated `sync_source_machine_id`; repeated pushes do not duplicate rows. Historical cloud rows are backfilled with persistent IDs and Pi pull uses a conservative exact-field legacy match before inserting a second copy.
- `guest_login_events`: append-only with stable `sync_event_id` and optional `sync_source_machine_id`; repeated pushes do not duplicate rows. Historical cloud rows use the same conservative reconciliation pattern as `login_events`.
- `range_presence_extensions`: mutable cloud-authoritative state keyed by username with `sync_version`. Pi commands carry `expectedVersion`; cloud rejects stale commands instead of trusting Pi wall-clock ordering.
- `beginners_courses` and `beginners_course_participants`: cloud-authoritative read-only reporting inputs in Phase 2A1. Numeric local IDs remain local-only; sync uses opaque `sync_id` values plus parent `course_sync_id`.

Deletes are first-class change-stream records. The cloud trigger writes one row to `sync_change_log` with `operation="delete"`, the domain record key, and the deleted row in `payload_json`. The Pi applies those records transactionally: `user_types`, `user_disciplines`, and `role_permissions` are deleted directly; removed roles and permissions are deleted after their dependent role-permission records; removed users are security-tombstoned locally (password removed, RFID deactivated, membership disabled) so existing local history is retained but access is not.

## Checkpoints

Incremental pull uses `sync_change_log.change_id`, a monotonically increasing server-issued sequence number.

- The Pi stores only the last successful checkpoint.
- Pull application runs inside a local transaction.
- The checkpoint is updated only inside the same transaction, after the full batch applies successfully.
- Re-running the same batch is safe.

Initial sync is intentionally one complete snapshot, not a client-paginated sequence. Cloud Run reads the synchronized domains and checkpoint in one `REPEATABLE READ` transaction. That gives the Pi a single database-consistent image and the highest change ID visible in that same image. Changes committed after that transaction are above the returned checkpoint and appear in the next incremental pull, so there is no gap between an initial snapshot and incremental change processing. If the reporting history grows enough that this single snapshot becomes too large, pagination must be introduced as a server-side snapshot session with a fixed upper checkpoint; client-side paging against a changing live snapshot is not safe.

Phase 2A1 event-history snapshot semantics:

- missing snapshot property means "older cloud does not know this domain yet", so local rows are left untouched
- explicit empty array for `range_presence_extensions`, `beginners_courses`, or `beginners_course_participants` is authoritative empty state and reconciles local rows
- explicit empty array for `login_events` or `guest_login_events` is treated non-destructively; history domains merge and dedupe but do not bulk-delete local history

## Change tracking and loop prevention

Cloud and local PostgreSQL instances share the same schema additions for operational consistency, but loop prevention is explicit:

- Pi-originated browser logins create an outbox row only when both `SYNC_NODE_MODE=local-pi` and `SYNC_MACHINE_ID` are set. Cloud Run logins use the normal login insert path and cannot create a Pi outbox row, even if a machine ID is mistakenly present.
- Pi-originated guest logins follow the same outbox rule.
- Cloud-side sync push handling writes directly to `login_events`; it does not use the local-origin login path and does not create outbox rows.
- Cloud-side sync push handling also writes directly to `guest_login_events` and authoritative `range_presence_extensions`.
- Local pull application sets a session-local PostgreSQL flag so `sync_change_log` triggers do not record pull-applied rows.
- Pulled data in this slice never writes to the outbox.

Legacy login reconciliation algorithm:

1. Migration `006_phase_2a1_reporting_sync` backfills stable `sync_event_id` values for legacy cloud and Pi `login_events` / `guest_login_events`.
2. Backfill uses a deterministic fingerprint plus partitioned row number inside identical legacy duplicates so existing rows retain a persistent ID without rewriting numeric primary keys.
3. During pull, if the incoming `sync_event_id` is not already present locally, the Pi attempts one conservative exact-field match on immutable event fields plus source machine.
4. If exactly one local candidate exists, the Pi updates that row with the cloud `sync_event_id`.
5. If zero or multiple candidates exist, the Pi inserts the cloud row and retains the existing local row(s). Ambiguity is resolved non-destructively rather than by guessing.

Presence conflict behaviour:

- Pi queues at most one pending presence-extension command per username
- local Pi updates its visible row optimistically
- cloud accepts only when `expectedVersion` matches current `sync_version`
- stale or late commands are rejected with `range_presence_conflict`
- rejected optimistic rows revert to the prior local state until the next pull applies authoritative cloud state

Migration/version added:

- `006_phase_2a1_reporting_sync`

Before enabling Phase 2A1 in production, use the explicit aggregate-only
diagnostic below. It connects directly to the configured PostgreSQL database,
builds the normal initial snapshot, and prints only row counts, serialized byte
length, and elapsed milliseconds. It never prints event rows or snapshot data:

```bash
ARCHERY_SYNC_SNAPSHOT_DIAGNOSTIC=1 DATABASE_URL='postgresql://...' node scripts/measureInitialSyncSnapshot.mjs
```

This is a developer/operations command, not a portal endpoint. Run it only in
an approved maintenance window and record its JSON output in deployment notes.

Recovery considerations:

- if the Pi misses sync for an extended period, the next snapshot/pull still rebuilds reporting inputs from source rows rather than synchronized report tables
- repeated snapshots and repeated push retries remain idempotent
- guest/member history is sensitive and must not be exposed through sync status output
- history volume now includes complete reporting event history; review real production row counts before rollout if snapshot size is close to Cloud Run or network timeout limits

## Machine credentials

Cloud stores only secret verifiers, not plaintext machine secrets.

Use:

```bash
node scripts/hashMachineSecret.mjs "<new-secret>"
```

Then place the resulting verifier in `SYNC_MACHINE_CREDENTIALS_JSON`, for example:

```json
[
  {
    "machineId": "selby-pi-1",
    "secretHash": "scrypt$16384$8$1$..."
  }
]
```

Pi-side environment:

- `SYNC_MACHINE_ID=selby-pi-1`
- `SYNC_MACHINE_SECRET=<plaintext secret stored outside git>`

Rotation:

1. Generate a new secret.
2. Hash it with `node scripts/hashMachineSecret.mjs`.
3. Update `SYNC_MACHINE_CREDENTIALS_JSON` in cloud config with the new verifier.
4. Update `SYNC_MACHINE_SECRET` on the Pi.
5. Restart the relevant services.

Revocation:

- remove the machine entry from `SYNC_MACHINE_CREDENTIALS_JSON`
- redeploy/restart the cloud service

Adding a second Pi:

- create a second distinct `machineId`
- generate a distinct secret
- add a second verifier entry
- set that Pi's own `SYNC_MACHINE_ID` and `SYNC_MACHINE_SECRET`

## Environment variables

Cloud/Cloud Run:

- `SYNC_NODE_MODE=cloud-server`
- `SYNC_SERVER_ENABLED=true`
- `SYNC_MACHINE_CREDENTIALS_JSON=[{"machineId":"selby-pi-1","secretHash":"..."}]`

Pi sync client:

- `SYNC_NODE_MODE=local-pi`
- `SYNC_API_BASE_URL=https://<cloud-run-service>`
- `SYNC_MACHINE_ID=selby-pi-1`
- `SYNC_MACHINE_SECRET=<secret>`
- `SYNC_LOCAL_DB_HOST=/var/run/postgresql`
- `SYNC_LOCAL_DB_PORT=5432`
- `SYNC_LOCAL_DB_NAME=archeryportal`
- `SYNC_LOCAL_DB_USER=archeryapp`

Do not set `SYNC_LOCAL_DATABASE_URL` or `SYNC_LOCAL_DB_PASSWORD` on the current Pi. The service runs as the `archeryapp` operating-system user and connects through the local PostgreSQL Unix socket using the existing peer-auth configuration.

Use the following `/etc/selby-portal/sync.env` content (replace the placeholders only):

```dotenv
SYNC_NODE_MODE=local-pi
SYNC_API_BASE_URL=https://<cloud-run-service>
SYNC_MACHINE_ID=selby-pi-1
SYNC_MACHINE_SECRET=<machine-secret>
SYNC_LOCAL_DB_HOST=/var/run/postgresql
SYNC_LOCAL_DB_PORT=5432
SYNC_LOCAL_DB_NAME=archeryportal
SYNC_LOCAL_DB_USER=archeryapp
SYNC_REQUEST_TIMEOUT_MS=15000
SYNC_PUSH_BATCH_SIZE=100
SYNC_PULL_BATCH_SIZE=200
```

Secure this file before enabling the timer. `systemd` reads `EnvironmentFile` as PID 1 and then starts the unit as `archeryapp`, so this is compatible with the service user while excluding ordinary users:

```bash
sudo chown root:archeryapp /etc/selby-portal/sync.env
sudo chmod 0640 /etc/selby-portal/sync.env
```

Optional sync tuning:

- `SYNC_REQUEST_TIMEOUT_MS=15000`
- `SYNC_PUSH_BATCH_SIZE=100`
- `SYNC_PULL_BATCH_SIZE=200`

## Initial sync

Before first population of a non-empty local database, take a backup. These commands deliberately use the existing Unix socket/peer authentication and do not depend on `sync.env` being exported into your shell:

```bash
sudo install -d -o archeryapp -g archeryapp -m 0750 /var/backups/selby-portal
sudo -u archeryapp pg_dump --format=custom --file="/var/backups/selby-portal/archeryportal-before-sync-$(date +%F-%H%M%S).dump" --dbname=archeryportal
```

Run the first sync:

```bash
npm run sync:local:initial
```

Expected result:

- local `users` populated
- local `user_types` populated
- local `user_disciplines` populated
- local `roles`, `permissions`, and `role_permissions` populated
- existing member password hashes available locally for offline login

## Incremental sync

Manual run:

```bash
npm run sync:local
```

Status:

```bash
npm run sync:status
```

The status output includes:

- last attempted sync
- last successful sync
- current checkpoint
- pending outbox count
- last error
- sync client/server version

## Recovery

If sync fails:

- the local portal continues to run
- the checkpoint is not advanced
- unacknowledged outbox rows remain available
- acknowledged outbox rows are retained with timestamps

To restore a local backup, stop both the portal and sync scheduler first. This is destructive to the local database only; do not run it for routine sync failures.

```bash
sudo systemctl stop selby-db-sync.timer selby-db-sync.service selby-portal.service
sudo -u postgres dropdb --if-exists archeryportal
sudo -u postgres createdb --owner=archeryapp archeryportal
sudo -u archeryapp pg_restore --exit-on-error --dbname=archeryportal /var/backups/selby-portal/<backup-file>.dump
sudo systemctl start selby-portal.service
sudo systemctl start selby-db-sync.timer
```

Then rerun:

```bash
npm run sync:local:initial
```

The restore is run as the `archeryapp` database role, so restored objects remain owned by `archeryapp`; `createdb --owner=archeryapp` also preserves the required database owner.

## Offline test

1. Run `npm run sync:local:initial`.
2. Confirm `npm run sync:status` shows a successful checkpoint.
3. Stop external network access on the Pi.
4. Access `https://localhost`.
5. Log in with a genuine member account that existed in cloud before sync.
6. Confirm member lookup and RFID/member lookup still work locally.

Do not treat bookings, equipment, tournaments, or admin-edit workflows as offline-safe yet.

## Timer verification

Check the timer:

```bash
systemctl status selby-db-sync.timer
systemctl list-timers selby-db-sync.timer
```

Trigger immediately for a manual service run:

```bash
systemctl start selby-db-sync.service
journalctl -u selby-db-sync.service -n 100 --no-pager
```
