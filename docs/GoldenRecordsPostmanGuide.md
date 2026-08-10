# Golden Records Postman Guide

This repo now includes a Postman collection for the Golden Records API under:

- `postman/GoldenRecords.postman_collection.json`
- `postman/GoldenRecords.local.postman_environment.json`

## What it covers

The collection includes the Golden Records endpoints currently used by the app:

- `GET /api/members`
- `GET /api/achievements`
- `GET /api/currenthandicaps`
- `GET /api/currentclassifications`

It also includes the next planned endpoints from
`docs/GoldenRecordsIntegrationTodo.md`:

- `GET /api/scores`
- `GET /api/clubrecords`
- `GET /api/personalbests`
- `POST /api/scores`
- `PUT /api/scores`
- `POST /api/Scoresheets`
- `PUT /api/Scoresheets`
- `POST /api/members`
- `PUT /api/members`

## Auth behavior

The collection matches the app's Golden Records auth logic:

- `authMode=api-key`
  sends `Authorization: Basic {{apiKey}}`
- `authMode=member-credentials`
  sends `Authorization: Basic <base64(username:password)>`

This mirrors:

- [goldenRecordsAuth.js](/C:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/golden-records/goldenRecordsAuth.js)
- [goldenRecordsHttpClient.js](/C:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/golden-records/goldenRecordsHttpClient.js)

## Import and use

1. Import the collection JSON into Postman.
2. Import the environment JSON into Postman.
3. Set `authMode` to either `api-key` or `member-credentials`.
4. Fill in the matching credentials.
5. Run `Connection / List Members (smoke test)` first.

## Notes

- The read-only requests match the paths and query parameters currently used in
  code.
- The planned write requests are starter templates based on the integration to-do
  document, so their request bodies may need adjusting once the live Golden
  Records write contract is confirmed.
