# Phase 12: production recovery assurance

Review date: 22 October 2026. Branch: `bug/refactor`. Production evidence below came from operator-run **read-only** Cloud SQL Studio and Cloud Shell commands. This review did not create a backup, restore a database, change Cloud SQL or Cloud Run, modify the Pi, push, merge or deploy.

## Recovery readiness

| Check | Verified finding | Limit |
| --- | --- | --- |
| Production schema | On `archeryclub-postgres`, database `archeryclub`, schema `public`, migrations 021, 022 and 023 are recorded at `2026-10-08T20:37:47.375603Z`, `2026-10-09T15:26:00.989727Z` and `2026-10-09T15:26:00.989727Z` respectively. A second query returned 23 migration rows and latest version 023. | An earlier listing stopped at 020 despite these older application timestamps. That listing was incomplete or inconsistent; its cause is unknown. Recheck before release. |
| Backups | Instance is PostgreSQL 15, zonal, Standard backup tier, with `backupConfiguration.enabled=false`. Seven `SUCCESSFUL ON_DEMAND` backups were listed. Newest is ID `1790601993361`, completed **28 September 2026 13:28:04 UTC**. | No current release recovery point. A successful backup listing verifies recorded completion, **not** that restore has been rehearsed. |
| PITR | No `pointInTimeRecoveryEnabled: true` appears in the refreshed configuration; transactional log storage state is `UNSPECIFIED`. Scheduled backups are disabled. | Treat PITR as **unavailable for the release**. The configured seven transaction-log retention days do not prove any recoverable PITR window. Enabling it would change production configuration and is outside this review. |
| Cloud Run rollback | Portal currently serves `archeryclub-poc-00110-gg8` at 100%, digest `sha256:d963fe0a9c7df61aca5e65f0c0cc5472dd0e61a3f06c56e6e4f89dd7ce70355f`, source label `cfac684c92b71ed917a754c526ae91e9487fa782`. That commit and this branch have byte-identical migration definitions through 023, migration runner and persistence bootstrap. The old revision already operates with migration 023 recorded. | Recheck revision and traffic before release. Traffic rollback reverts code routing only; it cannot undo committed writes or schema changes. |

Google documents that [on-demand backups can be created even when automatic backups are disabled](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups). Its [PITR procedure](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr) requires scheduled backups before enabling PITR. The backup and PITR settings above were rechecked on 22 October.

## Startup locking and data impact

`server/bootstrap/bootstrapPersistence.js` runs `runPostgresMigrations` before the HTTP listener starts. `server/infrastructure/persistence/runPostgresMigrations.js` uses one transaction and advisory lock `81420732`. Since 021–023 are recorded, their `CREATE TABLE`/index statements should be skipped. However, on **every** PostgreSQL startup the existing runner still checks base schema, executes `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, recreates user-reference functions and triggers, and runs unconditional backfill `UPDATE`s on 23 mapped tables and two `users` updates. The initial 001 seed path is skipped on this database. PostgreSQL documents that `ALTER TABLE` normally acquires an `ACCESS EXCLUSIVE` lock unless stated otherwise, and row updates can block conflicting writers until commit ([ALTER TABLE](https://www.postgresql.org/docs/15/sql-altertable.html), [explicit locking](https://www.postgresql.org/docs/15/explicit-locking.html)). The transaction keeps these operations together until commit or rollback. The advisory lock serializes bootstraps, but does not stop normal application traffic from competing for table/row locks.

After migration bootstrap, `server/index.js` loads a role/permission snapshot, transactionally refreshes bundled handicap reference tables if the source differs, and starts an asynchronous expired coaching-note purge. A changed handicap reference can replace its rows; expired notes are intentionally deleted. These paths existed in the serving revision and are not new Phase 12 code changes. They could still cause release-time contention or data writes. An isolated synthetic PostgreSQL 17 rehearsal in Phase 11 passed transaction rollback, 021–023 application and repeat startup (77 ms and 37 ms on small test data); it was **not** a production copy and gives no production lock-time estimate. No live lock monitoring or representative restored-copy rehearsal was performed.

## Conditional release and recovery procedure

The commands in this section are **instructions for a separately approved operator action**, not authorization to run them during this phase. Run them in Cloud Shell with the production project selected and an agreed release window. A backup incurs cost; a restore is much more consequential.

1. **Preflight, read-only.** Recheck backup settings, migration versions and current traffic. Record any changed revision, traffic split, and image digest. Confirm the `main` Cloud Build trigger still targets only `archeryclub-poc`; its observed `^main$` push filter means merge automatically deploys the portal once. Keep the worker and Pi unchanged.

   ```bash
   gcloud sql instances describe archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --format='yaml(settings.backupConfiguration,settings.availabilityType)'
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.latestReadyRevisionName,status.traffic)'
   ```

   In Cloud SQL Studio for `archeryclub`, run only:

   ```sql
   SELECT version, applied_at FROM schema_migrations
   WHERE version IN ('021_manual_lesson_attendance', '022_coaching_assignment_notifications', '023_coaching_participant_notes')
   ORDER BY version;
   ```

2. **Create a fresh recovery point only after explicit backup approval.** This is the smallest existing GCP capability that does not change database schema or backup configuration. Schedule it close to the release. The command is synchronous by default; capture the returned ID, then verify its `SUCCESSFUL` status and end time with read-only commands. Do not proceed on a failed or still-running backup. Keep the backup ID and restore operator in the release record.

   ```bash
   gcloud sql backups create --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --description=pre-refactor-release-20261022
   gcloud sql backups list --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --limit=5 --format='table(id,status,type,startTime,endTime)'
   gcloud sql backups describe BACKUP_ID --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --format='yaml(id,status,type,startTime,endTime)'
   ```

   If a true restore verification is required, obtain **separate approval** and restore this backup only to a newly named, isolated Cloud SQL instance with no app traffic or Pi connections. Confirm the target name does not already exist, access controls and cost, and test schema/row-count checks there. Google documents [restoring to a new instance](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restoring). This was **not performed**.

   ```bash
   gcloud sql backups restore BACKUP_ID --restore-instance=archeryclub-refactor-rehearsal-YYYYMMDD --backup-instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4
   ```

3. **Release, only after separate approval.** Push and merge through the existing project workflow. Let the verified `main` Cloud Build trigger deploy `archeryclub-poc`; do not launch a duplicate manual portal deployment. Watch build completion and readiness. Verify health, authentication, permissions, representative portal functions, database errors and sync lag without triggering a full-club sync. Keep the Pi and worker unchanged.

4. **Application rollback if a critical regression occurs.** Stop rollout and first verify the recorded old revision still exists and is compatible with any new schema/data changes. For this reviewed code, it contains the same 023 migrations. Route traffic back and verify health, auth, errors and sync. This operation does **not** restore the database.

   ```bash
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=archeryclub-poc-00110-gg8=100
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.traffic,status.latestReadyRevisionName)'
   ```

5. **Database recovery is a separate incident decision.** First assess writes after the backup; restoring it onto production would overwrite later data and cannot be equated with Cloud Run rollback. Preserve forensic evidence and obtain explicit incident approval. Prefer restoring to a newly named isolated instance and reconciling needed data. Only if the incident owner explicitly chooses a destructive production overwrite, after an additional current backup where feasible, use Google's [restore command](https://docs.cloud.google.com/sdk/gcloud/reference/sql/backups/restore) with `--restore-instance=archeryclub-postgres`. Do not run a production restore as a release test.

## Decision and minimum blockers

**Merge: NO-GO. Deployment: NO-GO.** A merge to `main` automatically deploys the portal, so both decisions share the same immediate blocker: there is no current verified production recovery point. The minimum path to reconsider is an explicitly approved, successful on-demand backup close to release; recorded backup ID and restore owner; a fresh migration/traffic check; and explicit acceptance of unmeasured startup-lock risk. A restored-copy rehearsal would improve confidence but has not been performed and requires separate authorization. PITR and scheduled backup policy are longer-term operational work, not a substitute for the immediate pre-release backup. No code defect or additional migration was confirmed in this phase.
