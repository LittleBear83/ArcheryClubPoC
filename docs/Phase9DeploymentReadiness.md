# Phase 9 deployment and synchronisation readiness

Review date: 21 October 2026. Branch: `bug/refactor`. This review did not
connect to production or staging, change infrastructure, run a sync, or deploy.

## Evidence and limits

| Check | Evidence | Result |
| --- | --- | --- |
| Merge-triggered GitHub Actions | The remote `main` branch has one workflow, `phase2a1-postgres-integration.yml`. It runs tests/builds on three named feature branches or manual dispatch; it has no `main` trigger or deployment step. | No deployment by repository GitHub Actions on merge to `main`. |
| Cloud Build, Cloud Run, other triggers | No GCP CLI, Cloud Run/Build connection, or usable project credentials are available in this workspace. Repository search found no Cloud Build configuration. | External triggers, revision, image, and deployed environment are **unverified**. A merge could still deploy through a trigger outside the repository. |
| Active Pi watcher/feed | The operator reports `selby-live-sync.service` active and running, described as V2 Live Database Sync. A read-only query of `local_machine_publication_sync_v2` returned `valid`. The actual watcher `ExecStart` was not included. | A valid v2 baseline is **confirmed by operator output**; the active watcher feed remains **unverified** until its untruncated command is seen. |
| Pi revision and nightly reconciliation | The operator reports Pi Git SHA `82ecbf7f` and no active `selby*` timers. `git status --short` warned that `server/data/` could not be read. The `selby-db-sync.service` command was truncated in terminal output. | The deployed Pi is on a divergent, older revision; cleanliness and the installed nightly schedule are **unverified**. No active systemd timer appeared in the supplied output. |
| v1 late commit | Isolated PostgreSQL tests reproduce a lower-ID transaction committing after a higher-ID transaction and being omitted by a v1 cursor. The v2 publication tests deliver both transactions. | Confirmed v1 defect; production exposure depends on the unverified Pi feed. Nightly full reconciliation may repair drift later but cannot guarantee timely delivery. |
| Proposed application compatibility | Isolated PostgreSQL integration tests exercise v1 push, v2 snapshot/pull, SSE reconnect, offline/nightly CLI recovery, retries, idempotency, conflicts, and rollback. Machine-authenticated routes support both feeds in the proposed code. | Code-level compatibility passed. Deployed Pi/Cloud versions, migrations, network behaviour, and actual data volume are **unverified**. |
| Staging Pi ↔ Cloud Run | No staging endpoint, Pi, credentials, or Cloud Run access was provided. | No live staging checks executed. |

The Pi SHA is not an ancestor of `bug/refactor`: its headless RFID consumer
commit was merged separately as `b2e6728f` (PR #64), which is an ancestor of
this branch. The RFID consumer files match that merged version; the divergent
SHA does not by itself establish a missing RFID feature. Other changes since
the Pi revision still require staging compatibility checks.

The v1 feed should be treated as a deployment blocker if the Pi watcher still
uses it and timely cloud-to-Pi updates matter. The valid v2 baseline supports
using v2 but does not prove that the running watcher has `--v2`. If it does,
the v1 late-commit omission does not affect that watcher; if it does not, the
watcher can still miss committed changes until a full reconciliation. Confirm
the service command before choosing any rollout. Do not edit or reset either
cursor, clear the outbox, or use production as a test environment.

## Read-only evidence required before release

An operator with access should record these observations without printing
secrets or member records into a shared log:

1. **Deployment triggers:** list Cloud Build triggers for the GCP project,
   inspect branch filters and target services, and check GitHub webhooks and
   any external CI/CD service. Establish whether a `main` merge deploys and
   which image/revision it would deploy.
2. **Cloud Run:** record the portal and sync service names, latest ready
   revision, image digests, deployment source, and whether the authenticated
   v1/v2 endpoints are enabled. Compare the deployed SHA to `bug/refactor`.
3. **Pi:** obtain untruncated `selby-live-sync.service` `ExecStart` and confirm
   `--v2`; inspect `selby-db-sync.service` and `.timer` load/enabled/active
   states, plus any cron replacement. Check watcher health and recent redacted
   sync status. Resolve the `server/data/` permission warning before claiming
   the worktree is clean.
4. **Pi database:** the v2 baseline validity query returned `valid` in operator
   output. Check pending outbox count and last successful sync without
   exporting rows or secrets; do not repeat a rebaseline merely to verify it.
5. **Schema and compatibility:** compare Cloud and Pi migration versions and
   deployed SHA; verify the proposed migration path on disposable copies.
   Confirm backups and restore procedures before any approved rollout.

## Staging release checklist

1. Confirm a `main` merge cannot deploy unexpectedly, or arrange an approved
   deployment freeze. Pin the Cloud and Pi starting revisions and take
   restorable backups of both databases.
2. Use staging copies with disposable member data. Apply the proposed Cloud
   build and migrations first. Verify machine authentication and old-Pi v1
   push/pull compatibility while the Pi remains on its starting build.
3. Update the staging Pi application and migrations. Drain the outbox and
   perform `--v2 --rebaseline` under the existing maintenance gate. Confirm
   the v2 state key, checkpoint type, and unchanged historical/local-only
   records. Start the watcher explicitly with `--v2`.
4. Exercise authenticated SSE reconnect, a missed notification, an offline
   outbox retry, a conflicting command, a failed transaction, and the nightly
   reconciliation timer. Confirm no duplicate events, lost data, echo, or
   cursor regression. Compare relevant API responses and permissions with
   the starting build. Do not trigger a full-club Golden Records sync.
5. Check desktop/mobile affected pages and operational logs, then record
   observed latency and sync lag before requesting production approval.

## Rollback plan for an approved deployment

If the staged checks fail, stop the staging watcher and nightly timer first;
preserve the outbox and both cursor states. Restore the previous compatible
Cloud Run revision and Pi application build together, then resume sync only
after verifying their shared protocol and migration compatibility. Do not
reverse database migrations or restore a production database as an automatic
rollback step: forward-only schema changes and subsequent writes require a
separate recovery decision. If a v2 baseline was created, retain it and use
the v1 state only with a verified v1-compatible watcher. Reconcile from a
known-good snapshot after the compatible pair is running; verify pending
commands and history before considering the incident closed.

## Decisions

- **Merge: NO-GO** until external deployment triggers are inspected. The
  repository alone cannot rule out an automatic Cloud Build deployment.
- **Deploy: NO-GO** until the active Pi feed, Cloud/Pi revisions, migration
  compatibility, and staging recovery tests are verified. No live staging
  validation was available for this review.
