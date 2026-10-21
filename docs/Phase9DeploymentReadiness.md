# Phase 9 deployment and synchronisation readiness

Review date: 21 October 2026. Branch: `bug/refactor`. This review did not
connect to production or staging, change infrastructure, run a sync, or deploy.

## Evidence and limits

| Check | Evidence | Result |
| --- | --- | --- |
| Merge-triggered GitHub Actions | The remote `main` branch has one workflow, `phase2a1-postgres-integration.yml`. It runs tests/builds on three named feature branches or manual dispatch; it has no `main` trigger or deployment step. | No deployment by repository GitHub Actions on merge to `main`. |
| Cloud Build, Cloud Run, other triggers | No GCP CLI, Cloud Run/Build connection, or usable project credentials are available in this workspace. Repository search found no Cloud Build configuration. | External triggers, revision, image, and deployed environment are **unverified**. A merge could still deploy through a trigger outside the repository. |
| Active Pi watcher/feed | The operator reports `selby-live-sync.service` active with `ExecStart=/usr/bin/node /opt/selby-portal/scripts/watchSyncEvents.mjs --v2`. A read-only query of `local_machine_publication_sync_v2` returned `valid`. | The active watcher uses v2 with a valid v2 baseline. The v1 late-commit defect does **not** affect this active watcher. |
| Pi revision and nightly reconciliation | The operator reports Pi Git SHA `82ecbf7f`; `git status --short` warned that `server/data/` could not be read. Both `selby-db-sync.service` and `.timer` are disabled and inactive. At the deployed SHA, the service runs ordinary `sync:local` without `--reconcile`. | The deployed Pi is on a divergent, older revision; cleanliness is unverified. **Scheduled full reconciliation is absent from these systemd units.** A separate cron or other scheduler has not been ruled out. |
| v1 late commit | Isolated PostgreSQL tests reproduce a lower-ID transaction committing after a higher-ID transaction and being omitted by a v1 cursor. The v2 publication tests deliver both transactions. | The defect is confirmed but does not affect the running v2 watcher. Any other v1 client remains unverified. The disabled nightly timer provides no scheduled full repair through these units. |
| Proposed application compatibility | Isolated PostgreSQL integration tests exercise v1 push, v2 snapshot/pull, SSE reconnect, offline/nightly CLI recovery, retries, idempotency, conflicts, and rollback. Machine-authenticated routes support both feeds in the proposed code. | Code-level compatibility passed. Deployed Pi/Cloud versions, migrations, network behaviour, and actual data volume are **unverified**. |
| Staging Pi ↔ Cloud Run | No staging endpoint, Pi, credentials, or Cloud Run access was provided. | No live staging checks executed. |

The Pi SHA is not an ancestor of `bug/refactor`: its headless RFID consumer
commit was merged separately as `b2e6728f` (PR #64), which is an ancestor of
this branch. The RFID consumer files match that merged version; the divergent
SHA does not by itself establish a missing RFID feature. Other changes since
the Pi revision still require staging compatibility checks.

The running Pi watcher explicitly uses `--v2`, and its baseline is valid. Its
deployed version has no periodic fallback; it relies on SSE, reconnect, and
local outbox wakeups. The proposed branch adds a 60-second fallback, but this
has not been deployed to the Pi. Both nightly systemd units are disabled, and
the deployed service command is an incremental sync, not a full reconcile.
This is a recovery-coverage gap that requires staging validation and an
approved Pi rollout. Do not edit or reset either cursor, clear the outbox,
repeat the v2 rebaseline, or use production as a test environment.

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
3. **Pi:** the active watcher `--v2` and disabled nightly units are confirmed.
   Check for any cron replacement, recent redacted sync status, and pending
   outbox count. Resolve the `server/data/` permission warning before claiming
   the worktree is clean. Stage the proposed 60-second fallback and nightly
   reconciliation before enabling either in production with approval.
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
- **Deploy: NO-GO** until Cloud/Pi revisions, migration compatibility, and
  staging recovery tests are verified. The disabled nightly timer and absent
  deployed periodic fallback need an approved recovery plan. No live staging
  validation was available for this review.
