# Pi / Cloud sync and audit investigation — 5 October 2026

This investigation started from `bf91a43` on `feat/feedback-sync`. The fix is on
`fix/sync-rfid-audit-reconciliation`. Existing uncommitted feedback reconciliation
work was present and is excluded from this fix's commit.

## Deployment evidence

The documented SSH targets were found in `scripts/Connect-SelbyPi.ps1`:
`archeryadmin@selby-range-pi`, `192.168.1.173`, and `100.68.101.101`, using
`~/.ssh/selby-range-pi`. The hostname failed to resolve and both addresses timed
out using Windows OpenSSH. No remote command ran. The user subsequently requested
that Pi checks be left for manual verification.

Consequently the deployed branch, SHA, dirty state, service health, watcher
command/feed, logs, environment, timer installation and drift from this checkout
are **unverified**. The observations below describe code, not a verified live Pi.
No production database was accessed or changed, and no physical reader test ran.

## Architecture traced

- `memberAuthGateway.recordLoginEvent` calls `syncGateway.enqueueLoginEvent` on
  PostgreSQL. A Pi login row and its `sync_local_outbox` command share a transaction.
  Stable scan IDs deduplicate the headless reader and kiosk delivery of one scan.
  Server startup runs `startRfidBridgeConsumer` on a local Pi, independently of a browser.
- Migration 013 sends `archery_local_sync_outbox` after inserts, delivered on commit.
  `watchSyncEvents.mjs` / `localOutboxListener.mjs` LISTEN and query pending durable
  work after every connection/reconnection. `liveSyncWatcher.mjs` serializes runs
  of the existing `syncLocalDatabase.mjs` child, retaining work on failure.
- That client takes advisory lock 81420731, pushes stable event IDs to the
  machine-authenticated `POST /api/sync/v1/push`, persists accepted/rejected
  outcomes, then pulls and transactionally applies Cloud changes. Login/guest
  IDs are unique; mutable commands use `sync_received_commands` to remember
  terminal results. Booking eligibility is rechecked, RFID uses expected previous
  values and ownership locks, and presence/feedback use server versions.
- Supported Cloud writes have PostgreSQL change-log triggers. The durable
  `sync_change_log` is the replication source; `archery_sync_change` notifications
  wake the machine SSE listener. V1 pulls use numeric change IDs in
  `sync_local_state.local_machine_sync`. V2 uses `sync_publication`,
  `sync_publication_state`, and a separate `local_machine_publication_sync_v2`
  state with exact string BIGINT cursors.
- V1 has a known sequence-versus-commit ordering gap: a lower change ID can commit
  after the Pi has advanced past it. Existing PostgreSQL characterization tests
  demonstrate this. V2 publishes committed rows in serialized publication order
  and tests prove recovery of late commits. This fix preserves both protocols;
  nightly full snapshots repair v1 omissions instead of changing a live feed.
- Local apply and checkpoint persistence share a transaction. Failed apply rolls
  back the cursor too. `archery.sync.apply_mode=pull` suppresses replication echoes.
  Numeric database IDs are remapped from portable identities. Local history is
  merged, not bulk deleted; missing members are tombstoned to preserve history.
- HTTP requests have timeouts and limited transient retries; the watcher retries
  failures/no progress with bounded backoff. Outbox rows remain durable until
  acknowledged or terminally rejected. Terminal conflicts are diagnostic records,
  not endless retries. The existing `available_at` filtering remains in place.
- Browser SSE is separate: `localSyncBrowserBridge` converts committed domain
  hints to the existing UI event bus. The Cloud listens to `archery_sync_change`;
  the Pi listens to `archery_local_sync_applied`. Only domain invalidations are
  broadcast, not member rows, RFID values or credentials. Reconnect refreshes
  mapped UI groups. A browser is not needed for any database sync command.

Before this fix, immediate replication required the separately running headless
watcher; the portal server alone did not start it. That remains a deployment
requirement. Pi commits wake it through PostgreSQL; Cloud commits wake it through
authenticated machine SSE. A new 60-second fallback now invokes the same serialized
push/pull worker even when no SSE hint arrives. SSE affects latency, not durability.

## Supported domains

This table is derived from `SYNCED_DOMAINS`, `REPLICATED_DOMAINS`, the snapshot
queries, push route allowlist, migrations 002–017, apply switches and UI mappings.
The older phase-oriented scope list in `LocalDatabaseSync.md` is not a complete
description of the current implementation.

`H` = headless event wake + 60-second fallback after this fix. `CL` = Cloud change
log; `OB` = Pi outbox. `Full` = nightly snapshot using existing reconciliation
after this fix; timer installation on the actual Pi remains a manual check.
`Yes` under retry means the supported direction is idempotent; it does not claim
that arbitrary local edits have a supported push path.

Test groups: `G` sync gateway; `L` local apply; `P` PostgreSQL integration;
`F` feedback; `T` tournaments; `C` committee/sign-off; `B` browser bridge;
`A` new audit/nightly PostgreSQL integration. These are test groups, not a claim
that every field has exhaustive coverage.

| Domain | Pi → Cloud | Cloud → Pi | Immediate | Outbox/change log | Retry safe | Nightly | SSE notification | Tests |
|---|---|---|---|---|---|---|---|---|
| users / member profile | RFID assignment only | Yes | H | RFID OB + CL | Yes | Full | members, range | G,L,P,A,B |
| user_types | No | Yes | H | CL | Yes | Full | members, roles, range | L,P,B |
| user_disciplines | No | Yes | H | CL | Yes | Full | members, range | L,P,B |
| roles | No | Yes | H | CL | Yes | Full | roles | L,P,B |
| permissions | No | Yes | H | CL | Yes | Full | roles | L,P,B |
| role_permissions | No | Yes | H | CL | Yes | Full | roles | L,P,B |
| login_events | Append | Yes | H | OB + CL | Yes | Full, history merge | range | G,L,P,A,B |
| guest_login_events | Append | Yes | H | OB + CL | Yes | Full, history merge | range | G,L,P,B |
| range_presence_extensions | Versioned command | Yes | H | OB + CL | Yes | Full | range | G,L,P,B |
| club_events | No | Yes | H | CL | Yes | Full | calendar, approvals | L,P,B |
| coaching_sessions | No | Yes | H | CL | Yes | Full | calendar, approvals | L,P,B |
| event_bookings | Create/withdraw command | Yes | H | OB + CL | Yes | Full | calendar | G,L,P,B |
| coaching_session_bookings | Create/withdraw command | Yes | H | OB + CL | Yes | Full | calendar | G,L,P,B |
| announcements | No | Yes | H | CL | Yes | Full | announcements | L,P,B |
| equipment_storage_locations | No | Yes | H | CL | Yes | Full | equipment | L,P,B |
| equipment_items | No | Yes | H | CL | Yes | Full, retain referenced rows | equipment, members | L,P,B |
| beginners_courses | No | Yes | H | CL | Yes | Full | beginners, calendar, approvals | L,P,B |
| beginners_course_participants | No | Yes | H | CL | Yes | Full | beginners, members | L,P,B |
| beginners_course_lessons | No | Yes | H | CL | Yes | Full | beginners, calendar | L,P,B |
| beginners_course_lesson_coaches | No | Yes | H | CL | Yes | Full | beginners, calendar | L,P,B |
| golden_records_member_sync | No | Yes | H | CL | Yes | Full | Golden Records, tables, members | L,P,B |
| golden_records_integration_status | No | Yes | H | CL | Yes | Full | Golden Records | L,P,B |
| golden_records_lookup_cache | No | Yes | H | CL | Yes | Full | Golden Records | L,P,B |
| outdoor_table_entries | No | Yes | H | CL | Yes | Full | outdoor table | L,P,B |
| indoor_table_entries | No | Yes | H | CL | Yes | Full | indoor table | L,B |
| member_distance_sign_offs | No | Yes | H | CL | Yes | Full | members, outdoor table | L,C,P,B |
| committee_roles | No | Yes | H | CL | Yes | Full | committee, members (fixed) | L,C,P,B |
| committee_meeting_minutes | No | Yes | H | CL | Yes | Full | committee minutes | L,C,P,B |
| member_questions | Create, respond, seen commands | Yes | H | OB + CL | Yes | Full | questions, inbox | F,L,P,B |
| suggestions | Create, status commands | Yes | H | OB + CL | Yes | Full | suggestions | F,L,P,B |
| tournament_templates | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_handicap_tables | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_handicap_table_rows | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournaments | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_registrations | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_rounds | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_scores | No | Yes | H | CL | Yes | Full | tournaments | T,B |
| tournament_matches | No | Yes | H | CL | Yes | Full | tournaments | T,B |

Remaining domain limits: general profile edits and the pull-only domains above
do not gain Pi write replication. Equipment loans/returns, announcement seen
records, lost arrows, general-info/range-rules content and the complete audit
stream are not replicated domains. Local-only/reference-dependent rows may be
retained deliberately by reconciliation. This fix does not introduce new domain
conflict rules. Supported directionality must not be confused with universal
bidirectional database replication.

## Audit changes

`createAuditMiddleware` recorded every mutating API request except its explicit
exclusions. `POST /api/sync/v1/pull` and v2 pulls were not excluded. Their scalar
`checkpoint`/`limit` bodies were saved, and the frontend's generic POST fallback
rendered "Action completed". New requests under `/api/sync/` are excluded from
that human audit capture. The audit gateway filters historical sync targets
before sorting/limiting, preserving the underlying rows. Machine route diagnostics,
security logs, outbox errors and journal logging remain available.

The Pi auth route created an audit event independently of the login row. Cloud
push bypassed that route and inserted only `login_events`; audit rows themselves
are not a replicated domain. Cloud apply now inserts an RFID audit in the same
push transaction, selecting original date/time, username, source machine and
stable ID from the persisted login row. A changed retry payload cannot change the
audit timestamp. A unique nullable `audit_events.sync_event_id` index prevents
concurrent/repeated audit inserts. A failed push transaction rolls back both rows.

Migration `018_synced_rfid_audit` adds that nullable column/index and backfills
missing machine-originated RFID audits with original timestamps. It preserves
existing successful Pi RFID auth audits by matching their actor, original time,
action and RFID target. In ambiguous historical matches it conservatively retains
the existing audit rather than inventing another entry. No login history is
rewritten or deleted. Password, password-mobile and mobile-app audit behavior is
unchanged; they do not gain another audit through the sync push path.

The Audit Report labels RFID login/check-in activity "RFID Sign-in" and displays
the source machine beside the RFID source when available. The event ID and success
result are retained in API metadata; the normal report also displays its status.

## Nightly reconciliation

The original `selby-db-sync.timer` was persistent and scheduled at 00:01 plus
two minutes after boot. However its service ran one ordinary incremental pass
(one push batch and one pull page). It did not repair already-missed v1 changes or
fully drain a backlog.

The same service now runs `npm run sync:local -- --reconcile`; the timer explicitly
uses Europe/London. The command takes the existing sync lock and mutation
maintenance gate, drains durable outbox batches, requests a full snapshot and
uses the existing authoritative reconciliation routines. It detects an existing
valid v2 baseline and uses `/api/sync/v2/snapshot`; otherwise it uses the v1 snapshot
and writes only the v1 checkpoint. It never converts one cursor into the other.
It drains additional legacy-history outbox work after application and records
`lastReconciledAt` in local sync state. Reconciliation broadcasts all replicated
domains after commit; a missing committee-role invalidation was also added.

HTTP mutations can receive the existing maintenance-gate 503 while the snapshot
is applied. Historical/local-only records are retained according to existing
rebaseline rules. Remote failures leave pending work durable; application failure
rolls back its checkpoint. The service retries failure or lock contention after
five minutes and bounds each attempt to fifteen minutes. Diagnostics are written
to local sync state and the service journal. No browser is involved.

Golden Records' 01:00 server scheduler is a separate external-service import,
disabled on the Pi. It is not the Pi/Cloud nightly reconciliation mechanism.

## Manual Pi checks (read-only)

Run these on the Pi when connected. Do not print environment file values or
credential-bearing command lines into a shared transcript.

```bash
cd /opt/selby-portal
git branch --show-current
git rev-parse HEAD
git status --short
systemctl is-active selby-portal.service selby-db-sync.timer
systemctl show selby-portal.service selby-db-sync.service -p FragmentPath -p ActiveState -p SubState -p EnvironmentFiles
systemctl list-units --all --type=service 'selby*'
systemctl list-timers --all 'selby*'
systemctl cat selby-db-sync.timer
sudo crontab -l
crontab -l
```

Inspect the watcher unit locally to determine whether it uses `--v2`, then inspect
the portal/sync/watcher journals locally. Redact secrets and member data before
sharing excerpts. For a safe configuration-name listing:

```bash
sudo awk -F= '/^[[:space:]]*(SYNC_|DATABASE_ENGINE|DB_|DATABASE_URL)/ { gsub(/^[[:space:]]*/, "", $1); print $1 "=<configured>" }' /etc/selby-portal/sync.env
```

Once its SHA is known, compare it against this fix with `git diff --stat PI_SHA
FIX_SHA` and review the sync/migration changes; the exact deployment delta cannot
be established without that SHA. Also verify the timer's timezone and the presence
of both migrations 013 and 018 after an approved deployment.

## Deployment handoff — do not execute without instruction

Deploy Cloud before Pi so Cloud understands the audit migration and keeps accepting
the existing push protocol. No database reset, outbox deletion or manual cursor
reset is required. PostgreSQL startup runs migration 018 on each database; it adds
audit history as described above. Cloud project/service/deployment commands are
not configured in this repo and cannot safely be invented.

After the reviewed commit has been made available through the approved release
process, the following are the Pi commands. `FIX_SHA` is the reviewed commit;
`WATCHER_UNIT` must be set to the actual existing watcher service from the manual
inspection. Do not switch a dirty Pi checkout. These commands were not run.

```bash
cd /opt/selby-portal
test -z "$(git status --porcelain)" || exit 1
git cat-file -e "$FIX_SHA^{commit}" || exit 1
test -n "$WATCHER_UNIT" || exit 1
sudo systemctl stop selby-db-sync.timer selby-db-sync.service "$WATCHER_UNIT"
git switch --detach "$FIX_SHA"
npm ci
npm run build
sudo install -m 0644 deploy/systemd/selby-db-sync.service /etc/systemd/system/selby-db-sync.service
sudo install -m 0644 deploy/systemd/selby-db-sync.timer /etc/systemd/system/selby-db-sync.timer
sudo systemctl daemon-reload
sudo systemctl restart selby-portal.service
sudo systemctl start "$WATCHER_UNIT"
sudo systemctl enable --now selby-db-sync.timer
```

After deployment, verify service/migration status, inspect one existing synced
RFID event by stable ID and compare its original date/time with the audit row.
Confirm the report hides checkpoint requests while diagnostic logs remain. Run
one approved reconciliation with `sudo systemctl start selby-db-sync.service`,
check its journal and outbox counts, and verify the next timer firing. Confirm
Cloud profile/assignment changes reach Pi without an open browser. Use existing
queued events or the automated fixtures; physical reader taps are unnecessary.

## Verification record

Project tests: 493 passed, none skipped. Typecheck and production build passed.
Full PostgreSQL integration suite: 50 passed, zero failed or skipped. It ran the
four files in `test:postgres-integration` directly with Node's `--env-file` option
outside the subprocess-restricted sandbox. Git diff whitespace checks passed.
The integration run uses disposable loopback PostgreSQL 17.6 databases with
`fsync=off`; it tests transaction/retry semantics, not operating-system crash durability.
The stale lesson fixture retains its original migration-012 ID and cancellation
assertions, then applies later migrations before calling today's snapshot gateway.
Tests include
ordinary sync/apply/domain regressions, periodic no-hint sync, nightly timer
wiring, real PostgreSQL push/retry/audit/backfill checks, and actual reconciliation
CLI runs for both feeds. The Pi deployment itself remains a manual verification.

## Final review limits

- Nightly reconciliation serializes with other sync clients, gates supported HTTP
  mutations, drains local commands before reading the Cloud snapshot, and applies
  data/checkpoint atomically. Headless RFID appends are retained and drained again.
  It does not write an old Pi snapshot over newer Cloud data. Cloud-authoritative
  fields on the Pi are replaced: unsupported direct database writes or local edits
  without an outbox can be overwritten. V1's late-commit gap still requires a later
  snapshot; v2 avoids that ordering gap.
- Confirm the installed watcher feed agrees with retained local state. A retained
  v2 baseline selects v2 nightly reconciliation; stale v2 state beside an explicitly
  v1 watcher requires operator review, not an automatic cursor conversion.
- Pull apply suppresses outbound triggers; one serialized worker handles hints and
  the 60-second fallback. This avoids sync loops and overlapping polling. The
  fallback processes ordinary batches; nightly reconciliation drains the backlog.
- The historical audit match uses actor, timestamp, action and RFID endpoint. It
  preserves matching local audits but cannot distinguish ambiguous legacy events
  with identical values. Machine-route filtering does not remove domain audits;
  future human actions should not be hosted under the reserved `/api/sync/` prefix.
- Migration 018 adds a nullable column, unique index and missing audit rows. It
  neither deletes nor rewrites existing production history. Index creation and
  backfill can hold locks and take time on a large audit/history table; production
  volume and deployment timing remain unverified.
- Unrelated pre-existing feedback changes and temporary test artifacts are excluded
  from the fix commit. Verification ran against the shared working tree, including
  those pre-existing feedback changes.
