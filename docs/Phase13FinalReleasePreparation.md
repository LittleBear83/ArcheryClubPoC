# Phase 13: final release preparation

Review date: 22 October 2026. Branch: `bug/refactor`. Recovery owner: **Craig Fleetham**. All GCP and database observations below were supplied from read-only Cloud Shell or Cloud SQL Studio commands. No production operation has been performed by this review.

## Verified preflight

- Production target: Cloud SQL `archeryclub-postgres`, project `project-80fa0060-de93-4eb6-ab4`, region `europe-west2`, PostgreSQL 15, state `RUNNABLE`, zonal. Database: `archeryclub`, schema `public`.
- Migrations 021, 022 and 023 remain applied. Their `applied_at` values are `2026-10-08T20:37:47.375603Z`, `2026-10-09T15:26:00.989727Z` and `2026-10-09T15:26:00.989727Z` respectively. The branch contains no later numbered migration, and its migrations/bootstrap are byte-identical to the serving portal commit.
- Portal serving revision: `archeryclub-poc-00110-gg8` at **100%**. The prior recorded image digest is `sha256:d963fe0a9c7df61aca5e65f0c0cc5472dd0e61a3f06c56e6e4f89dd7ce70355f`; recheck the immutable revision if rollback arrangements change. Other tagged revisions have no main traffic.
- Backup settings remain `enabled=false`, tier `STANDARD`, with no affirmative PITR setting. The configured seven transaction-log retention days do not establish a usable PITR window. A fresh inventory still showed newest successful on-demand backup ID `1790601993361`, completed 28 September 2026 13:28:04 UTC. A current backup is still **pending**.
- The observed global Cloud Build trigger deploys `archeryclub-poc` automatically on a GitHub push matching `^main$`. A merge to `main` is therefore a deployment action. No separate manual portal deployment should follow it. The Pi and Golden Records worker are outside the observed trigger target.
- Final local validation at current source: `npm test` **694/694**, `npm run typecheck` passed, `npm run build` passed, and `node scripts/lintChangedFiles.mjs` passed. Vite initially hit sandbox `spawn EPERM`; its approved local rerun succeeded. No application code or schema files were changed in Phase 13.

## Startup-lock decision

Startup calls the existing PostgreSQL migration runner in a transaction with advisory lock `81420732`. With migrations 021–023 recorded, numbered DDL is skipped, but existing startup code still checks base schema, issues `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, recreates triggers and backfills user references across 23 mapped tables, plus two unconditional `users` updates. This can hold table and row locks and generate WAL until commit. A prior synthetic PostgreSQL 17 rehearsal verified rollback and repeat startup in milliseconds on tiny data, but no production-size or restored-copy lock timing is known. The same runner is already in the currently serving revision, so this release does not introduce that behaviour.

**Assessment:** Craig explicitly accepted the existing but unmeasured startup-lock risk **with monitoring**, conditional on a fresh successful backup. Monitor Cloud Run readiness, database locks/connections, failed requests and sync lag in an agreed release window; stop the rollout and route traffic back if critical errors appear. A Cloud Run traffic rollback does not undo committed database changes.

## Approved-operation playbook (not yet approved)

1. **Recovery point.** Craig confirmed the instance and explicitly approved **one** on-demand backup on 22 October 2026. Cloud SQL supports on-demand backups while automatic backups are disabled ([Google backup guide](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups)). The command has been supplied to Craig for execution in Cloud Shell; completion is not yet verified:

   ```bash
   gcloud sql backups create --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --description=pre-refactor-release-20261022
   ```

2. **Verify.** Record the new ID, type, start/end time and `SUCCESSFUL` status. Do not infer success from command submission alone. These commands are read-only:

   ```bash
   gcloud sql backups list --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --limit=5 --format='table(id,status,type,startTime,endTime)'
   gcloud sql backups describe BACKUP_ID --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --format='yaml(id,status,type,startTime,endTime)'
   ```

   This verifies Cloud SQL's successful completion record, **not** a test restore. An isolated restore rehearsal requires separate approval and a target with no production app or Pi connection. The September backup is not an acceptable current release recovery point.

3. **Release gate.** Reconfirm branch and tests, migrations 021–023, portal traffic, the `main` trigger and backup status. Craig accepts the startup-lock and backup-to-restore data-loss window. Only then ask for **separate explicit approval to push and merge**. Let Cloud Build perform the one portal deployment. Do not modify the Pi, worker, database schema or production configuration.

4. **Application rollback.** If critical errors arise, Craig checks that `archeryclub-poc-00110-gg8` remains available and routes main traffic back to it, then verifies health and sync. This revision contains the same migration runner and 023 schema definitions.

   ```bash
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=archeryclub-poc-00110-gg8=100
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.traffic,status.latestReadyRevisionName)'
   ```

5. **Database recovery.** Prefer code rollback. A database restore is a separate incident decision: a backup only recovers to its capture time, and overwriting production would lose later writes. Craig must assess those writes, select an isolated restore/reconciliation strategy if feasible, and obtain explicit destructive-operation approval. Do not execute a production restore merely to test release readiness. See [Phase 12 recovery procedure](Phase12ProductionRecoveryAssurance.md) and [Google's restore guide](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restoring).

## Decision

**Merge: NO-GO. Deployment: NO-GO** until the approved on-demand backup completes successfully and its ID is verified, and separate final push/merge approval is given. Craig is the recorded recovery owner and has accepted the startup-lock risk with monitoring. The merge and deployment decisions are coupled by the automatic `main` trigger. No additional migration or application code change is required by this review.
