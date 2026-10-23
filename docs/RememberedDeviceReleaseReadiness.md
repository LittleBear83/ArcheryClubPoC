# Remember This Device: release preparation

Prepared on 22 October 2026 and updated on 23 October 2026 for `feature/golden-records-indoor-sync`. This is a procedure, not approval to deploy. The branch also contains the Handicap Allowance Percentage change (`3eb7f8a2`); review both commits before merging.

## Verified state and limits

- The production PostgreSQL 15 instance is `archeryclub-postgres` in project `project-80fa0060-de93-4eb6-ab4`. A read-only Cloud SQL Studio query found migration `023_coaching_participant_notes` applied and no row for `024_remembered_devices`.
- Cloud SQL reported `RUNNABLE`, scheduled backups disabled, and transaction log storage state `UNSPECIFIED`. Do not assume point-in-time recovery. On-demand backup `1792657807070` was `SUCCESSFUL` at 08:31 UTC on 22 October, before this prospective release. No restore was tested. Create a **new** recovery point in the approved release window, immediately before merging.
- Cloud Run `archeryclub-poc` currently serves `archeryclub-poc-00111-2gg` at 100%. Record this revision again just before release. The global Cloud Build trigger `035036f8-b2a0-4f0d-896b-f0b35adffd4c` builds and deploys this portal on pushes to `^main$`; a merge is a deployment action. The Golden Records worker and Pi are outside that trigger.
- The feature's 708 unit tests and 58 isolated PostgreSQL integration tests passed on 22 October, as did typecheck, build, and lint on changed files. Integration PostgreSQL was version 17.6. No PostgreSQL 15 executable or GCP connection is available in this workspace. Craig confirmed that `archeryclub-postgres-phase2a1-check` is disposable and approved for temporary test databases. A read-only Cloud SQL check reported it `RUNNABLE`, `POSTGRES_15`, in `europe-west2`, with public IPv4 enabled and connection name `project-80fa0060-de93-4eb6-ab4:europe-west2:archeryclub-postgres-phase2a1-check`. A Cloud Shell proxy connected to that instance, and a read-only query reported PostgreSQL 15.19 and `CREATEDB` for `archeryclub_app`. The focused remembered-device PostgreSQL test passed (1/1). The concurrent full suite reported numerous sync-test failures and 30-second timeouts, then stopped producing output and was interrupted; it has no final total. A serial rerun is pending. Repository-wide lint still fails on unrelated existing source issues and generated `.tmp` files.
- Migration 024 adds a token table, indexes, and a `users` trigger. The existing runner applies it once by version inside a transaction; a failure rolls back both DDL and version entry. It has no delete or update of existing rows. Trigger creation locks `users` until the startup transaction commits. The release owner has accepted the existing unmeasured startup-lock risk for a monitored release, subject to new contention evidence.
- The old portal revision does not query `remembered_devices`; the additive schema and trigger are structurally compatible with it. This is a code review conclusion, not a live rollback test. Routing traffic back will not undo migration 024 or recover data written after a backup.

## PostgreSQL 15 integration handoff

Craig confirmed that `archeryclub-postgres-phase2a1-check` is disposable and approved for temporary test databases. The workspace has no GCP CLI, Cloud SQL proxy or credentials. A small source archive from commit `68f946ba` was uploaded to Cloud Shell from `.tmp/remembered-device-pg15-tests.zip`; its SHA-256 matched `719cc6eae556385a8cdf792acc265835d15c62e6221266d867daf2224b2c73eb`. It contains tracked `server`, `shared`, `scripts`, `package.json` and lockfile only; it does not include `.env` files or production data. `npm ci --legacy-peer-deps` completed in Cloud Shell, matching the repository's `.npmrc` setting (omitted from the archive). The focused `rememberedDevicePostgresIntegration.test.js` passed on PostgreSQL 15.19. The concurrent full suite did not complete; the cause of its sync-test timeouts remains unverified.

The disposable instance's metadata is confirmed, and Cloud Shell reports the Cloud SQL Auth Proxy at `/usr/bin/cloud-sql-proxy`. Do not point the proxy at `archeryclub-postgres`. The test runner requires a loopback host and `postgres` maintenance database; it creates and drops uniquely named databases beginning `archery_phase2a1_test_`. A read-only query confirmed the disposable `archeryclub_app` user has `CREATEDB`. [Google's proxy instructions](https://docs.cloud.google.com/sql/docs/postgres/connect-auth-proxy) document loopback TCP connections.

```bash
sha256sum ~/remembered-device-pg15-tests.zip
mkdir -p ~/remembered-device-pg15-check
unzip -q ~/remembered-device-pg15-tests.zip -d ~/remembered-device-pg15-check
cd ~/remembered-device-pg15-check
npm ci --legacy-peer-deps
cloud-sql-proxy --address 127.0.0.1 --port 55439 project-80fa0060-de93-4eb6-ab4:europe-west2:archeryclub-postgres-phase2a1-check > ~/remembered-device-pg15-proxy.log 2>&1 &
rd_proxy_pid=$!
read -rsp 'Disposable database password: ' rd_test_password; echo
NODE_ENV=test ARCHERY_POSTGRES_INTEGRATION_TESTS=1 PGHOST=127.0.0.1 PGPORT=55439 PGDATABASE=postgres PGUSER=archeryclub_app PGPASSWORD="$rd_test_password" npm run test:postgres-integration -- --test-concurrency=1
unset rd_test_password
kill "$rd_proxy_pid"
```

Check the archive hash before installing or running it. If proxy installation, connectivity or database credentials are unavailable, stop and record the version 15 suite as blocked. Never substitute the production instance or change the integration guards.

## HTTPS staging preparation and iPhone checks

No staging URL or test accounts currently exist. Before production approval, obtain a **separate** HTTPS Cloud Run staging service, not a tag on the production service, connected only to a disposable PostgreSQL 15 database. Use an isolated schema and synthetic test accounts plus a staging-only `SESSION_SECRET`; do not connect production Cloud SQL, sync credentials, the Pi, Cloud Scheduler, Cloud Tasks, or Golden Records worker. Confirm the staging service is not a `main` deployment target. Keep the staging secret stable across new/old staging revisions for a meaningful rollback test. Deploying staging and creating its test database require separate authorization. A local HTTP preview cannot validate production `Secure` cookies or iPhone Home Screen storage.

On an iPhone, record iOS and Safari versions and the staging URL, then test the following with synthetic member accounts. Do not record passwords, cookies, tokens, or member data in screenshots or reports.

1. **Safari login:** Verify the checkbox is initially unticked. Sign in with it unticked, end the normal session, and confirm password sign-in is required. Sign in again with it ticked; close and reopen Safari after ending the normal session and confirm automatic authentication.
2. **Inactivity:** After remembered login, leave the portal idle for the mobile five-minute timeout. Confirm the UI signs out. Reload the page and confirm remembered authentication returns without a password. Check that no expiry notification or ticker appears.
3. **Explicit logout:** Select Log Out, reload Safari, and confirm a password is required. A second synthetic device should retain its own remembered access when only the first device logs out.
4. **Home Screen app:** Add the staging URL to the Home Screen and open the installed app. Repeat opt-in, reopen, inactivity, and explicit logout inside that app. Do not assume it shares Safari cookies; opt in inside the installed app if needed. Confirm the checkbox and login layout fit the mobile viewport.
5. **Security and rollback:** On staging only, change the test account password and deactivate it, confirming remembered access fails; restore the account and confirm the old token stays invalid. After migration 024, run the prior portal image against the isolated staging schema to check rollback compatibility. Do not do these mutations on production.

The seven-day boundary is covered by automated time-controlled tests. An optional real-device expiry test requires a disposable staging token and seven days of elapsed time; do not alter clocks or production rows. Mark Safari/Home Screen checks **unverified** until results are recorded.

## Approved release sequence

Release owner: Craig Fleetham. Stop if a staging check fails, the build differs from the reviewed commits, backup creation fails, or significant startup contention appears. Do not modify the Pi, Golden Records worker, scheduled backup settings, or production schema manually.

1. **Preflight, read-only.** Confirm the reviewed branch and clean tree, full tests, production migration 023 present and 024 absent, Cloud Build trigger, and current portal traffic. Record the exact old revision and source commit. Review both branch commits against `main`. The production migration query is:

   ```sql
   SELECT version, applied_at FROM schema_migrations
   WHERE version IN ('023_coaching_participant_notes', '024_remembered_devices')
   ORDER BY version;
   ```

   ```bash
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.latestReadyRevisionName,status.traffic)'
   gcloud builds triggers list --project=project-80fa0060-de93-4eb6-ab4 --region=global --format='table(id,name,description)'
   ```

2. **Recovery point, only in the approved release window.** Create one on-demand backup immediately before merge, then identify and describe its new ID. Continue only when the new ID reports `SUCCESSFUL` and has an end time. The 08:31 backup above is historical evidence, not this release's fresh recovery point. No backup is created by this document.

   ```bash
   gcloud sql backups create --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --description=pre-remembered-device-release
   gcloud sql backups list --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --limit=3 --format='table(id,status,type,description,startTime,endTime)'
   gcloud sql backups describe BACKUP_ID --instance=archeryclub-postgres --project=project-80fa0060-de93-4eb6-ab4 --format='yaml(id,status,type,description,startTime,endTime)'
   ```

3. **Push and merge only after explicit release approval.** Push `feature/golden-records-indoor-sync`, review and merge its PR into `main` using the normal workflow. Do not start another portal build or deploy: the `main` Cloud Build trigger does that. Record the merge SHA, build ID, new revision name, and image digest. A successful build does not prove the revision received traffic; the current service uses an explicit revision split.

   ```bash
   gcloud builds list --project=project-80fa0060-de93-4eb6-ab4 --region=global --limit=5 --format='table(id,status,createTime,finishTime,substitutions.COMMIT_SHA,buildTriggerId)'
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic,status.conditions)'
   gcloud run revisions describe NEW_REVISION --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(metadata.labels,status.conditions,status.imageDigest)'
   ```

4. **Monitored traffic shift, if the new revision is Ready.** If the automatic deployment already serves the new revision, start monitoring immediately. If traffic remains pinned to the old revision, route 5% to the new revision and 95% to the recorded old revision. Confirm new-revision requests succeed, no 5xx/startup errors appear, database connections and locks remain healthy, and auth/permissions, remembered login, key portal pages, and Pi sync status pass read-only checks. Then route 100% to the new revision. `OLD_REVISION` must be the fresh preflight value, not an assumed value.

   ```bash
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=NEW_REVISION=5,OLD_REVISION=95
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="archeryclub-poc" AND resource.labels.revision_name="NEW_REVISION" AND (severity>=ERROR OR httpRequest.status>=500)' --project=project-80fa0060-de93-4eb6-ab4 --freshness=30m --limit=20 --format='table(timestamp,severity,httpRequest.status)'
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=NEW_REVISION=100
   ```

5. **Application rollback if critical regression occurs.** Stop the rollout and route portal traffic to the recorded old revision; verify its health, auth, permissions, failed requests, and sync. This does not reverse database changes. Database restore is a separate incident decision owned by Craig because it may overwrite writes after the backup. Prefer isolated restore and reconciliation; never restore production merely to test the backup.

   ```bash
   gcloud run services update-traffic archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --to-revisions=OLD_REVISION=100
   gcloud run services describe archeryclub-poc --project=project-80fa0060-de93-4eb6-ab4 --region=europe-west2 --format='yaml(status.latestReadyRevisionName,status.traffic)'
   ```

## Current gate

**NO-GO to merge/deploy now.** The branch is code-validated, and the startup-lock risk is accepted with monitoring. The iPhone HTTPS staging checks, PostgreSQL 15 execution, and fresh release-window backup are outstanding. A separate release approval is required before push or merge; staging deployment also requires approval. There is no production or Pi change from this preparation.
