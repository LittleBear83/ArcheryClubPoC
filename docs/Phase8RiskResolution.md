# Phase 8 risk resolution

This review used an isolated PostgreSQL 17.6 server on `127.0.0.1`. It did not
connect to the Raspberry Pi, Cloud Run, Cloud SQL, or production member data.

## Four integration failures reproduced on `main`

| Failure | Finding and resolution |
| --- | --- |
| Login-method totals | The seven-day period is inclusive of 29 September and unknown methods appear as **Other**. The test expected four events and excluded the unknown method, contrary to existing unit tests and reporting behaviour. Corrected the test totals, groups, and all-time count. |
| Local suggestion after v2 rebaseline | An authoritative snapshot prunes a local suggestion absent from Cloud unless its creation is pending in the durable outbox. The isolated test inserted a suggestion without the outbox entry that the normal sync path creates. The fixture now records a pending creation and verifies that it survives. The CLI still drains pending commands before rebaseline. |
| Lesson coach requirement after v2 rebaseline | The snapshot SQL omitted `required_coach_count`, so a configured lesson count could be lost or defaulted when applied to the Pi. The snapshot now includes the column. The existing PostgreSQL test verifies snapshot and incremental replication. |
| Taster coach default | The application and both persistence gateways default Beginners and Taster lessons to five coaches. The integration assertion expected one. Corrected the assertion to five. |

All 57 PostgreSQL integration tests pass after these changes. The first,
second, and fourth failures were stale tests or fixtures; the third was a
production-code defect. No API, permission, or schema changed.

## v1 sync and deployed configuration

The PostgreSQL integration tests reproduce a v1 change-ID cursor omission:
transaction A can reserve a lower ID, transaction B can commit a higher ID,
and a pull advancing past B can permanently miss A when it commits later.
The v2 publication cursor orders visible committed changes and passes the
same late-commit tests. Changing the v1 wire protocol in place would risk
existing Pi deployments; moving a Pi to v2 requires a successful `--v2
--rebaseline` and a v2 watcher.

The repository's `npm run sync:watch` starts v1 unless passed `-- --v2`.
The checked-in `selby-db-sync.service` runs `--reconcile`, which chooses v2
only when valid `local_machine_publication_sync_v2` state exists; otherwise
it uses v1. Both feeds are served by the Cloud sync API when its machine
authentication and sync-server configuration are enabled. The deployed Pi
unit, its arguments, its state key, and the Cloud Run revision/configuration
were not available here. **Whether production currently uses the vulnerable
v1 feed is unverified.**

Before deployment, inspect the deployed Pi watcher command, the presence and
validity of its v2 baseline state, the nightly service unit, and the deployed
Cloud Run revision. Check compatibility in staging with Cloud updated before
the Pi, including offline recovery and a controlled late-commit rehearsal.
Do not reset a cursor or run a rebaseline against production as a diagnostic.

## Merge and deployment automation

The only checked-in GitHub Actions workflow is
`.github/workflows/phase2a1-postgres-integration.yml`. Its push triggers
list three feature branches and do not include `main`; it runs tests and
builds, with no deployment step. **This repository does not define an
automatic deployment on merge to `main`.** External Cloud Build triggers,
GitHub Apps, webhooks, or manual release processes were not accessible, so
the absence of automatic deployment outside this repository is unverified.
Confirm those settings with the deployment owner before merging.

## Remaining priorities

1. **Deployment gate:** establish the active Pi protocol and Cloud revision;
   migrate to v2 with an approved rollout if v1 is active.
2. **Deployment gate:** verify external deployment triggers and rehearse Pi ↔
   Cloud Run sync, SSE reconnect, offline recovery, and nightly reconciliation
   in staging.
3. **Future debt:** address the existing full-project lint errors, manual test
   registration, and the size of `server/index.js` and `src/App.css` in
   separate scoped work. These did not cause the Phase 8 data defect.
