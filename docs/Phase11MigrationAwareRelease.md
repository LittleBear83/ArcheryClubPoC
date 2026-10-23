# Phase 11: migration-aware release review

Review date: 22 October 2026. Branch: `bug/refactor` (`b60ebf088f0771b697fb153ccf731ed94730f040`). Read-only production evidence was supplied by the operator. No production changes, Pi changes, push, merge or deployment were made in this review.

## Confirmed production state

- The global Cloud Build trigger `035036f8-b2a0-4f0d-896b-f0b35adffd4c` builds and deploys `archeryclub-poc` on GitHub pushes matching `^main$`. The `europe-west2` trigger list was empty. **Merging into main automatically deploys the portal; do not perform a second manual portal deployment.** Other external deployment paths were not audited.
- The portal serves revision `archeryclub-poc-00110-gg8` at 100% with image digest `sha256:d963fe0a9c7df61aca5e65f0c0cc5472dd0e61a3f06c56e6e4f89dd7ce70355f` and source commit label `cfac684c92b71ed917a754c526ae91e9487fa782`. The Golden Records worker serves `selby-golden-records-worker-00004-wvh` at 100%, digest `sha256:5f3fe3e7ec84e71920f9c8c5cde3377e6a95a4d94929a5f7c2d6341eb6ba1512`. The main trigger targets only the portal.
- Filtered, non-secret portal revision settings show `ARCHERY_APP_MODE=live`, `DATABASE_ENGINE=postgres`, `DB_NAME=archeryclub`, `INSTANCE_CONNECTION_NAME=project-80fa0060-de93-4eb6-ab4:europe-west2:archeryclub-postgres`, and `SYNC_NODE_MODE=cloud-server`.
- A first Cloud SQL Studio query of `archeryclub` listed migrations only through 020. A later query confirmed `current_database()=archeryclub`, `current_schema()=public`, `search_path="$user", public`, `MAX(version)=023_coaching_participant_notes`, and 23 migration rows. Thus 021–023 **are now recorded as applied**. Their application timestamps and the reason the two observations differed are pending. Recheck immediately before release; do not infer that a release is migration-free from an older result.
- The PostgreSQL 15 instance `archeryclub-postgres` is zonal. Its read-only settings showed `backupConfiguration.enabled=false` and no affirmative PITR setting (`transactionalLogStorageState=UNSPECIFIED`). Seven listed on-demand backups were successful; the newest completed on **28 September 2026, 13:28 UTC**. This is not a current recovery point. PITR is **not verified** and must not be assumed available.

## Migrations and startup database work

Migrations 021–023 are already present on `main` and byte-identical on this branch. They create new tables: manual beginner lesson attendance (021), coaching assignment notifications (022), and coaching participant notes (023). They add foreign keys, a text-length check and indexes. They contain no deletes, updates or changes to existing columns. New table creation still takes PostgreSQL catalog and parent-table locks; production contention and duration were not measured. The previous serving portal commit contains these same migration files and bootstrap path, so its code is structurally compatible with the 023 schema. No schema rollback is planned or implied by Cloud Run traffic rollback.

At every PostgreSQL app start, `bootstrapPersistence` invokes `runPostgresMigrations` before listening. The runner wraps all work in a transaction guarded by database advisory lock `81420732`, creates any missing base objects, applies unrecorded numbered migrations, and commits or rolls back atomically. The 001 seed path is skipped on the reported database. **Even when numbered migrations are already applied**, the runner performs legacy `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` checks, recreates user-reference functions/triggers across many tables, and executes unqualified backfill `UPDATE`s against those tables and `users`. These can take row locks, generate WAL and hold DDL locks until transaction commit. They are pre-existing on `main`, but remain the main readiness and contention risk; advisory locking only serializes concurrent bootstraps.

After bootstrap, the server reads its role/permission snapshot, transactionally refreshes bundled handicap reference tables if source content differs (which can delete and replace rows in a changed table), and launches an asynchronous purge of expired coaching participant notes (`DELETE WHERE expires_at <= now`). The purge also runs daily. The purge is an intentional retention operation; it is not part of numbered migration rollback. Source reference data and note expiry behaviour were not changed in this branch. If startup fails, Cloud Run may leave the old ready revision serving, but any committed database work from a successful new instance remains.

## Validation and limits

- A synthetic isolated PostgreSQL 17 loopback rehearsal simulated a schema at 020 with representative rows, forced a 023 failure, confirmed transaction rollback of 021/022, then applied 021–023 and reran idempotently. It preserved the seeded rows. First and repeat runs took 77 ms and 37 ms on the small synthetic database. **This was not a copy of production and does not predict production lock time.** The temporary database was removed and local PostgreSQL stopped.
- Focused migration tests: 21/21 pass using `node --test --test-isolation=none` (the ordinary isolated runner hit sandbox `spawn EPERM`). Previous pre-release validation at the same branch commit: full suite 694/694, isolated PostgreSQL integration 57/57, typecheck, build and changed-file lint passed. No source code changed during this review.
- No authorized isolated production schema/data copy was available. Production row volumes, lock contention, migration application times, Cloud Run startup latency, live Pi/cloud recovery, permissions and portal workflows were not tested here. The Pi remains unchanged; the reported v2 watcher and valid baseline plus byte-identical v2 wire protocol provide code-level compatibility, not a live end-to-end guarantee.

## Controlled release and rollback procedure

This procedure is **conditional**; it is not approval to execute it. Resolve the blockers below before pushing.

1. Verify the current migration rows/timestamps, current Cloud Run traffic and image digest, source branch and clean working tree. Confirm the main trigger is still enabled and still targets only `archeryclub-poc`. Record the exact old revision `archeryclub-poc-00110-gg8` and existing traffic/tags. Re-run tests if code or main has moved. Reconfirm Pi v2 compatibility without modifying the Pi.
2. Establish a current recoverable database point using an approved production backup process. Confirm the backup finishes successfully and document its backup ID/time and restore ownership. The listed September backup and unverified PITR are insufficient. Do not restore over production as a test. Prefer a separately authorized isolated restore for representative migration/startup-lock testing.
3. During an agreed release window, push `bug/refactor`, merge it into `main` through the existing project workflow, and **allow the main Cloud Build trigger to deploy the portal once**. Monitor that build and new revision until ready; do not start a duplicate manual deployment. The worker is a separate service and is not targeted by the observed trigger.
4. Before moving on, verify the portal health endpoint, login, permissions, representative desktop/mobile pages, and key read-only API paths; review Cloud Run errors, failed requests, DB connection counts and sync lag. Observe Pi v2 stream/reconnect and backlog through non-invasive logs/metrics. Do not force a full-club or production sync merely to test the release.
5. If a critical regression appears, stop rollout and route portal traffic back to the recorded revision (after rechecking live service state):

   ```bash
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=archeryclub-poc-00110-gg8=100
   ```

   Verify traffic, health, errors and authentication afterward. This **does not reverse schema or data changes**. Restore is a separate, high-impact incident procedure requiring explicit authorization and consideration of writes since backup. Keep the Pi unchanged.

## Decision

**Merge: NO-GO; deployment: NO-GO** at this review point. Although migrations 021–023 are now recorded in the target schema and the old portal image already contains them, scheduled backups are disabled, the newest observed backup is several weeks old, PITR is unverified, and no representative production-copy rehearsal was available. Before release, obtain a current successful backup or an equivalent approved recovery point, establish restore ownership, recheck migration state, and accept or measure startup-lock risk. The earlier 020/023 discrepancy should be explained by the pending migration timestamps. No confirmed refactor code defect was found, so no code fix is proposed.
