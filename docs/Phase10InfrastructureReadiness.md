# Phase 10: infrastructure and deployment readiness

Review date: 21 October 2026. Branch: `bug/refactor` at `3dd71820` before this
documentation commit. This review did not connect to GCP or the Pi, run a
production sync, change infrastructure, or deploy. Pi observations below were
supplied by the operator; code and test observations were made locally.

## Deployment and infrastructure assessment

| Question | Evidence | Assessment |
| --- | --- | --- |
| Does a merge to `main` deploy? | The repository's only GitHub Actions workflow, `.github/workflows/phase2a1-postgres-integration.yml`, runs tests on three named feature branches or by manual dispatch. It has no `main` trigger or deploy step. Phase 9 also inspected the remote `main` workflow. No Cloud Build, GitHub webhook, or external deployment configuration was accessible here. | Repository GitHub Actions do not deploy on `main`; **automatic deployment by an external trigger remains unknown**. Do not merge until the trigger owner confirms it. |
| Which Cloud Run revisions serve traffic? | `gcloud` and project credentials are unavailable in this workspace. Repository deployment documentation names a public portal and `selby-golden-records-worker`, but does not prove either active service, image, revision, or traffic split. | **Unverified.** Record active service names, revision image digests and traffic percentages before release. |
| Is there scheduled Pi/cloud reconciliation? | The operator reports active `selby-live-sync.service` and disabled/inactive `selby-db-sync.service` and `.timer`; `systemctl list-timers --all 'selby*'` showed none. The repository documents Cloud Scheduler `selby-golden-records-nightly` and a Cloud Tasks queue for Golden Records imports, which are separate from Pi database reconciliation. Active GCP jobs/queues and other cron mechanisms were not inspected. | No scheduled full Pi reconciliation through the reported systemd units. **Do not treat the Golden Records job as Pi database recovery.** Other schedules remain unknown. |

## Pi and proposed cloud compatibility

The operator reports Pi SHA `82ecbf7fedb6e551e9ec9855da8c3285c7a48202`,
an active watcher command ending in `watchSyncEvents.mjs --v2`, and a read-only
database check returning `valid` for `local_machine_publication_sync_v2`.
The Pi `git status --short` could not read `server/data/`, so worktree cleanliness
is not established. These observations confirm the running watcher is configured
for v2 and has an initialized v2 baseline. The known v1 late-commit cursor
omission therefore does not apply to this reported watcher; other v1 clients
have not been ruled out.

Compared with the Pi SHA, `shared/syncPublicationProtocol.js`,
`registerPublicationSyncRoutes.js`, `streamPublicationEvents.js`, and
`syncPublicationGateway.js` are byte-identical on `bug/refactor`. The v2
authenticated events, status, snapshot, and pull routes, feed version, cursor
format, and publication ordering therefore retain their wire contract. The
refactor moves local database operations into gateways without changing the
deployed Pi. Isolated PostgreSQL tests exercise publication ordering, late
commits, authentication, retries, rollback, snapshot/pull, and reconnect.
This is **code-level protocol compatibility**, not an end-to-end confirmation
against the active Cloud Run revision or actual network.

There is a feature-level limit: the proposed cloud snapshot adds
`required_coach_count` to beginner lesson data. The deployed Pi's lesson
upsert ignores that extra property and its older schema uses its existing
lesson behaviour. The extra property does not invalidate the v2 message, but
new coach-count settings may not have equivalent Pi behaviour until that
feature is assessed in staging. Do not infer full feature parity from protocol
compatibility. No Pi update is required as a condition of this review.

## Synchronisation recovery

| Scenario | Current code path and evidence | Remaining validation |
| --- | --- | --- |
| Missed PostgreSQL `NOTIFY` while SSE stays connected | The unchanged cloud v2 stream polls publication backlog/head every 25 seconds in its heartbeat. If the checkpoint advances, it emits `sync.available`; the deployed Pi v2 watcher consumes it. The heartbeat comment alone is ignored by the Pi, but the head check supplies a real event. | Verify lag and event delivery across the actual Cloud Run network and under production-like load. |
| SSE disconnect or Cloud Run timeout | The deployed watcher reconnects with backoff. Each v2 connection receives `sync.ready` with the current checkpoint, which wakes a pull. Local and PostgreSQL tests cover reconnect catch-up. | Verify timeouts, proxy buffering, auth, reconnect rate, and catch-up in staging. |
| Pi offline, cloud writes | Publication rows remain durable in PostgreSQL and the v2 checkpoint enables catch-up on reconnect. Tests cover late commits and paginated pull. | Compare checkpoint and expected records after a staged outage; avoid production data export. |
| Cloud offline, Pi writes | Pi outbox events are durable; the watcher listens for local outbox notifications and retries failed/no-progress passes with backoff. A new process initially checks pending outbox. | Stage an outage and ambiguous retry; verify idempotency, conflicts, and no lost or duplicate commands. |
| Every local wake is missed while the old Pi stream stays healthy | The deployed Pi watcher has no periodic local sync timer. A later wake, SSE event/reconnect, or restart can cause a pass. The branch's 60-second fallback is **not deployed to the Pi**. Its nightly systemd timer is disabled. | This is a residual recovery gap. Measure whether it occurs in staging and prepare an operator-run, reviewed ordinary sync or a separately approved cloud-compatible recovery mechanism. Do not change the stable Pi in this phase. |

Cloud-side periodic publication checks substantially reduce the risk of a
missed cloud notification. They do not replace a full Pi reconciliation or
guarantee recovery of an isolated lost local outbox wake. No production sync
lag, Cloud Run behaviour, or independent scheduler was measured here.

## Read-only checks for an operator with GCP/Pi access

Run these with an account that can *view* the resources; share only names,
branch filters, revision/image identifiers, traffic percentages, schedule
targets, and redacted status. Do not share environment values, tokens, member
rows, machine secrets, or full service definitions.

```powershell
$project = 'project-80fa0060-de93-4eb6-ab4'
$region = 'europe-west2'

# Cloud Build triggers can be global or regional. Also inspect any other
# locations listed in Cloud Build > Triggers and external/GitHub webhooks.
gcloud builds triggers list --project $project --region global
gcloud builds triggers list --project $project --region $region
# For each enabled trigger, inspect its branch/tag filter, build config,
# target image/service, and whether a main merge invokes it.
gcloud builds triggers describe TRIGGER_ID --project $project --region TRIGGER_REGION

gcloud run services list --project $project --region $region
gcloud run services describe SERVICE --project $project --region $region `
  --format='yaml(status.latestReadyRevisionName,status.traffic)'
gcloud run revisions list --project $project --region $region --service SERVICE
gcloud run jobs list --project $project --region $region

gcloud scheduler jobs list --project $project --location $region
gcloud scheduler jobs describe JOB --project $project --location $region
gcloud tasks queues list --project $project --location $region
```

For each Cloud Run revision receiving traffic, view its immutable container
image digest and source/deployed SHA in the Cloud Run console; compare these
with the proposed build and the currently running Pi. Check Cloud Build,
Artifact Registry, Cloud Deploy, GitHub webhooks, and any external CI/CD path
for `main` branch filters. Inspect scheduler jobs/queue consumers for any
**Pi database** reconciliation mechanism; a Golden Records import is a
different workflow. If resources use other regions, repeat the list commands
there. Do not invoke a job, enqueue a task, or send a sync request.

Read-only Pi checks, if an operator wants to resolve the remaining schedule
and worktree uncertainty:

```bash
systemctl show selby-live-sync.service -p ExecStart -p ActiveState --no-pager
systemctl list-timers --all --no-pager
systemctl list-unit-files 'selby*' --no-pager
crontab -l
sudo crontab -l
git -C /opt/selby-portal status --short
```

The final `git status` may still warn about `server/data/` permissions; do not
change permissions merely to complete this assessment. Do not display
`/etc/selby-portal/sync.env`, query member rows, reset a cursor, rebaseline,
or run `sync:local` on production as a verification step.

## Validation and decisions

Local validation on this branch: `npm test` passed **694/694**; the isolated
PostgreSQL 17.6 loopback suite passed **57/57**; `npm run typecheck` passed;
`npm run build` passed after the sandbox blocked Vite's child process. The
initial sandbox-only PostgreSQL attempt also failed to spawn Node test workers;
the retry used the isolated cluster outside that sandbox, which was stopped
afterward. `node scripts/lintChangedFiles.mjs`, the repository's changed-file
lint gate, passed. `npm run lint -- --ignore-pattern '.tmp/**'` completed with
14 errors and 5 warnings in source/test files; this documentation-only phase
made no code changes, and these whole-tree findings were not compared with
`main` in this phase. The unqualified lint run was stopped because it scanned
a large temporary browser profile. No staging Pi/Cloud Run test was available.
These local results do not prove the active cloud revision, deployed schema,
traffic routing, scheduler state, or live Pi/cloud connectivity.

**Merge: NO-GO** until Cloud Build, webhook, and external CI/CD triggers are
inspected and an unintended automatic deployment from `main` is ruled out or
explicitly controlled. This is the immediate release-control blocker.

**Deploy: NO-GO** until active Cloud Run revisions/traffic and migration path
are recorded, old-Pi/new-cloud compatibility and the recovery scenarios above
are exercised in staging, and the residual local-wake gap has an accepted
operational recovery plan. The Pi remains unchanged. There is no confirmed
new code defect requiring a Phase 10 code fix.

Minimal next actions: (1) collect the redacted GCP trigger and traffic output;
(2) stage the proposed cloud revision against an unchanged Pi-compatible v2
client and disposable PostgreSQL data; (3) test missed notification, reconnect,
offline outbox, retry, conflict, and rollback; (4) document an operator-run
ordinary sync and rollback procedure before requesting production deployment.
