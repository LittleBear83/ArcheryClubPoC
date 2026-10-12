# Golden Records nightly Cloud Run deployment

The existing `goldenRecordsSyncJob.start()` runs `syncAllMembers()` and retains
its PostgreSQL advisory lock, progress record and SSE completion events. The
private worker's `/api/internal/golden-records/nightly-sync` request waits for
the job to finish. The public portal returns 404 from this route because its
Cloud Run service name does not match `GOLDEN_RECORDS_WORKER_SERVICE_NAME`.
Keep the worker private: the scheduler job name header is only a secondary
check; Cloud Run IAM validates the OIDC token before Express sees the request.

## Schedule and clock changes

Cloud Scheduler's wall-clock `Europe/London` cron can skip or repeat 01:00 on
the spring and autumn clock changes. Use **one** Scheduler job at `0 0,1 * * *`
UTC. The route selects 01:00 London: 00:00 UTC in BST and 01:00 UTC in GMT.
The other UTC trigger returns a skipped 200 response. On the spring transition,
01:00 London does not exist, so the sync runs at 02:00 BST (the first valid
instant). On the autumn transition, the first 01:00 runs; the second is skipped
using a date-keyed status in PostgreSQL. A successful date is never rerun by
Scheduler; failed or partial runs may retry. The database lock also prevents a
retry from overlapping a still-running request or a manual sync.

## Deployment preparation

Deploy the **same tested container image** to the existing public portal and a
new private worker service. Complete these PowerShell variables with the live
project's values before running the commands. Use the existing Cloud SQL
instance and Golden Records API configuration. The examples use API-key auth;
for basic auth, supply the existing username/password secrets and set
`GOLDEN_RECORDS_AUTH_MODE=basic` instead. Secrets must stay in Secret Manager.

```powershell
$project = "PROJECT_ID"
$region = "europe-west2"
$portal = "EXISTING_PORTAL_SERVICE"
$worker = "selby-golden-records-worker"
$job = "selby-golden-records-nightly"
$image = "TESTED_ARTIFACT_REGISTRY_IMAGE_URI"
$cloudSql = "PROJECT_ID:europe-west2:CLOUD_SQL_INSTANCE"
$dbName = "DATABASE_NAME"
$dbUser = "DATABASE_USER"
$dbPasswordSecret = "DB_PASSWORD_SECRET_NAME"
$sessionSecret = "SESSION_SECRET_NAME"
$goldenApiKeySecret = "GOLDEN_RECORDS_API_KEY_SECRET_NAME"
$goldenBaseUrl = "https://api2.archery-records.net"
$schedulerSa = "golden-records-scheduler@$project.iam.gserviceaccount.com"
$workerSa = "golden-records-worker@$project.iam.gserviceaccount.com"
$taskSa = "golden-records-task-invoker@$project.iam.gserviceaccount.com"
$manualQueue = "golden-records-manual"
$manualQueueName = "projects/$project/locations/$region/queues/$manualQueue"
$schedulerJobName = "projects/$project/locations/$region/jobs/$job"
```

Create identities and grant only the worker's required resource permissions.
The deployer also needs permission to act as the worker service account. Do
not grant `roles/run.invoker` to `allUsers` on the worker.

```powershell
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com cloudtasks.googleapis.com --project $project
gcloud iam service-accounts create golden-records-worker --project $project --display-name "Golden Records worker runtime"
gcloud iam service-accounts create golden-records-scheduler --project $project --display-name "Golden Records Scheduler invoker"
gcloud iam service-accounts create golden-records-task-invoker --project $project --display-name "Golden Records manual task invoker"
gcloud projects add-iam-policy-binding $project --member "serviceAccount:$workerSa" --role roles/cloudsql.client
gcloud secrets add-iam-policy-binding $dbPasswordSecret --project $project --member "serviceAccount:$workerSa" --role roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding $sessionSecret --project $project --member "serviceAccount:$workerSa" --role roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding $goldenApiKeySecret --project $project --member "serviceAccount:$workerSa" --role roles/secretmanager.secretAccessor
gcloud tasks queues create $manualQueue --project $project --location $region --max-concurrent-dispatches 1 --max-attempts 5 --min-backoff 60s --max-backoff 300s --max-retry-duration 10800s
gcloud tasks queues add-iam-policy-binding $manualQueue --project $project --location $region --member "serviceAccount:EXISTING_PORTAL_RUNTIME_SERVICE_ACCOUNT" --role roles/cloudtasks.enqueuer
gcloud iam service-accounts add-iam-policy-binding $taskSa --project $project --member "serviceAccount:EXISTING_PORTAL_RUNTIME_SERVICE_ACCOUNT" --role roles/iam.serviceAccountUser
```

Deploy the private worker with the same database, Golden Records base URL and
auth mode as the portal. The worker must connect to the **same PostgreSQL
database** as the portal so its lock, status and member writes are shared.
Use `SYNC_NODE_MODE=standalone` and leave `SYNC_SERVER_ENABLED` unset on the
worker: it does not serve Pi sync requests or need the cloud server's persistent
PostgreSQL notification listener. Keep the public portal's Pi sync settings.
Preserve any other live environment settings required by the existing image.
The request timeout is 30 minutes, Cloud Scheduler's maximum HTTP deadline.
The application stops between members after 26 minutes and records a retryable
failure, leaving time to respond before that deadline. The Node setting covers
slow request bodies; the worker route itself awaits the job. Use one container
instance at a time on the worker to limit load; the
PostgreSQL lock remains the cross-service guard.

```powershell
gcloud run deploy $worker --project $project --region $region --image $image --service-account $workerSa --no-allow-unauthenticated --add-cloudsql-instances $cloudSql --timeout 1800s --concurrency 1 --max-instances 1 --set-env-vars "ARCHERY_APP_MODE=live,DATABASE_ENGINE=postgres,SYNC_NODE_MODE=standalone,INSTANCE_CONNECTION_NAME=$cloudSql,DB_NAME=$dbName,DB_USER=$dbUser,GOLDEN_RECORDS_BASE_URL=$goldenBaseUrl,GOLDEN_RECORDS_AUTH_MODE=api-key,GOLDEN_RECORDS_WORKER_SERVICE_NAME=$worker,GOLDEN_RECORDS_SCHEDULER_JOB_NAME=$schedulerJobName,GOLDEN_RECORDS_MANUAL_TASK_QUEUE=$manualQueueName,REQUEST_TIMEOUT_MS=1800000" --set-secrets "DB_PASSWORD=${dbPasswordSecret}:latest,SESSION_SECRET=${sessionSecret}:latest,GOLDEN_RECORDS_API_KEY=${goldenApiKeySecret}:latest"
gcloud run services add-iam-policy-binding $worker --project $project --region $region --member "serviceAccount:$schedulerSa" --role roles/run.invoker
gcloud run services add-iam-policy-binding $worker --project $project --region $region --member "serviceAccount:$taskSa" --role roles/run.invoker
$workerUrl = gcloud run services describe $worker --project $project --region $region --format "value(status.url)"
```

The public portal must also run the new image so its in-process nightly timer
is gone. Manual sync enqueues a Cloud Task and returns HTTP 202 promptly. The
task calls the same private worker with OIDC; the admin page polls the persisted
`queued` and `running` statuses. Replace
`EXISTING_PORTAL_RUNTIME_SERVICE_ACCOUNT` above with the service account shown
by `gcloud run services describe $portal`. Keep the portal's existing runtime
environment, secrets, Cloud SQL connection and ingress settings. Add only the
three manual queue settings, preserving all existing settings:

```powershell
gcloud run deploy $portal --project $project --region $region --image $image --update-env-vars "GOLDEN_RECORDS_MANUAL_TASK_QUEUE=$manualQueueName,GOLDEN_RECORDS_WORKER_URL=$workerUrl,GOLDEN_RECORDS_TASK_INVOKER_SERVICE_ACCOUNT=$taskSa"
```

Create **one** UTC Scheduler job. OIDC audience is the worker service root URL,
not the URL with its path. The service account has `roles/run.invoker` on this
worker only. HTTP 5xx responses from a failed, partial or locked sync are
retried up to three times; a completed nightly date responds 200 without
repeating the sync.

```powershell
gcloud scheduler jobs create http $job --project $project --location $region --schedule "0 0,1 * * *" --time-zone UTC --uri "$workerUrl/api/internal/golden-records/nightly-sync" --http-method POST --oidc-service-account-email $schedulerSa --oidc-token-audience $workerUrl --attempt-deadline 1800s --max-retry-attempts 3 --max-retry-duration 10800s --min-backoff 60s --max-backoff 300s
gcloud scheduler jobs describe $job --project $project --location $region
gcloud run services describe $worker --project $project --region $region
```

Verify the service is private, the Scheduler and task-invoker service accounts
are its only non-operator invokers, and the portal is running the same code before enabling
the job. The old `GOLDEN_RECORDS_ALWAYS_ALLOCATED_CPU` setting is no longer
used and can be removed after this rollout.

## First-night verification and recovery

1. Check Cloud Scheduler's execution log for both UTC invocations. One should
   report `skipped`; the other should report a completed job. At the spring
   change, the run is at 02:00 BST. At the autumn change, the repeated hour is
   skipped after the first successful run.
2. Inspect worker Cloud Run logs for `Golden Records member sync job started`
   and `Golden Records member sync job finished`. Compare `attemptedCount`,
   `matchedCount`, `unmatchedCount`, `achievementCount`, `errorCount` and
   `durationMs` with the Golden Records Admin job-status card.
3. Confirm a member's updated snapshot and awards in Golden Records Admin and
   verify the normal Pi pull/SSE update path. The sync uses the existing
   persistence and change-log triggers.
4. On failure, read the persisted status and worker logs. Scheduler retries
   transient failures; an admin can also run the existing manual sync. The
   advisory lock prevents overlap. An interrupted run is marked when its lock
   disappears and status is next read.

```powershell
gcloud scheduler jobs describe $job --project $project --location $region
gcloud run services logs read $worker --project $project --region $region --freshness 1d --limit 100
gcloud run services get-iam-policy $worker --project $project --region $region
```

The HTTP target has a hard 30-minute Scheduler deadline. Measure a manual
full-club run before enabling the schedule; if it approaches 20 minutes, move
execution to a Cloud Run Job before production scheduling. Retries restart
the full-club scan, so a scan that consistently exceeds the 26-minute
application budget cannot complete through this HTTP target. Increasing a Cloud
Run service timeout alone cannot extend Scheduler's HTTP deadline.

## Deployment gates

This repository does not record the live project ID, portal service name,
Cloud SQL instance, secret names or image URI. Discover them with read-only
`gcloud` commands and compare the portal's existing configuration before
running the commands above. The portal deploy command must retain its current
environment, secret references, Cloud SQL attachment, service account, ingress,
and Pi sync settings; export the existing service configuration and revision
before changing it. Do not use `--set-env-vars` or `--set-secrets` on the
existing portal: those flags replace all existing entries.

The manual admin action now enqueues a durable Cloud Task. Test browser closure
after the 202 response and confirm the worker finishes and the persisted status
is visible on reopening the admin page. The private worker and task queue must
be deployed before the public portal: if queue configuration is missing, the
portal returns 503 rather than starting background work on Cloud Run.

Unchanged snapshots and distance sign-offs are skipped during full-club sync.
Progress status still writes during a run to support admin polling. Verify
the remaining write volume and Pi sync lag with a production-sized rehearsal.
