# SSE Implementation To-Do

This document turns the proposed Server-Sent Events rollout into a repo-specific implementation checklist for `ArcheryClubPoC`.

## Current Status

Implementation status as of `2026-06-05`:

- Complete:
  - authenticated SSE stream
  - public pre-login SSE stream for RFID
  - in-memory event bus
  - client SSE transport and React integration
  - route emitters across announcements, schedule, approvals, tournaments, members, roles, committee, equipment, beginners, RFID, and range-members
  - main polling replacement
  - dev diagnostics badge
  - graceful fallback polling
  - approval and equipment permission-aware fanout
- Complete with a different shape than originally proposed:
  - no `home.updated` event was added
  - home refreshes are handled by more specific events such as `calendar.updated`, `beginners.updated`, `tournaments.updated`, and `range-members.updated`
- Still open:
  - finish reviewing `members.updated` / `roles.updated` fanout for the least-privilege version
  - validate timeout and buffering behaviour in the real deployed runtime
  - future multi-instance scaling plan remains documented only

## Legend

- `[x]` complete
- `[~]` partially complete, changed shape, or still worth reviewing
- `[ ]` still open

## Goal

Install SSE so the app can push lightweight update events from the server to connected clients, reduce polling, and refresh the UI in near real time using existing React Query fetch paths.

Recommended approach:

- Start with invalidation-only SSE.
- Reuse existing API queries rather than streaming full page payloads.
- Replace polling gradually, not all at once.

## Phase 1: Server SSE Foundation

### 1. Add SSE route module `[x]`

Create:

- [server/presentation/http/registerSseRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerSseRoutes.js)

Responsibilities:

- Expose `GET /api/events`
- Require an authenticated member via `getActorUser(req)`
- Set SSE headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- Flush an initial connection event
- Track connected clients
- Remove clients on `req.close`
- Send heartbeat comments or `ping` events every 20-30 seconds

### 2. Add in-memory event bus / broadcaster `[x]`

Either export this from the SSE route module or create:

- [server/domain/services/serverEventBus.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/domain/services/serverEventBus.js)

Suggested API:

- `broadcastToAll(eventName, data)`
- `broadcastToUsers(usernames, eventName, data)`
- `broadcastToPermission(permissionKey, eventName, data)`
- `broadcastToAnyPermission(permissionKeys, eventName, data)`

Notes:

- Track `username`, permissions, and `res` per open SSE connection
- In-process storage is fine for the current single-node architecture
- If the app later scales to multiple instances, this will need shared pub/sub

### 3. Register SSE in server startup `[x]`

Update:

- [server/index.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/index.js)

Tasks:

- Create the event bus
- Register `registerSseRoutes`
- Pass the event bus to route modules that will emit update events

## Phase 2: Client SSE Foundation

### 4. Add shared SSE client `[x]`

Create:

- [src/lib/serverEvents.ts](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/lib/serverEvents.ts)

Responsibilities:

- Open one `EventSource("/api/events")`
- Expose:
  - `connect()`
  - `disconnect()`
  - `subscribe(eventName, handler)`
- Handle reconnect logging/state
- Stay transport-focused, without page-specific logic

### 5. Add React integration hook `[x]`

Create:

- [src/presentation/state/useServerEvents.ts](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/state/useServerEvents.ts)

Responsibilities:

- Connect only while authenticated
- Subscribe to named server events
- Invalidate React Query caches via `queryClient.invalidateQueries`
- Provide a clean place to maintain query-key mapping

### 6. Wire SSE lifecycle into auth/session flow `[x]`

Update:

- [src/App.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/App.tsx)

Tasks:

- Open SSE after login/session validation succeeds
- Close SSE on logout
- Stop reconnect loops on auth expiry

## Phase 3: Event Contract

### 7. Define event names `[~]`

Recommended first set:

- `announcements.updated`
- `calendar.updated`
- `approvals.updated`
- `tournaments.updated`
- `equipment.updated`
- `committee.updated`
- `members.updated`
- `roles.updated`
- `beginners.updated`
- `rfid.scan`
- `range-members.updated`
- `ping`

Notes:

- `home.updated` was not added because narrower event names gave better invalidation control.
- `connected` is also emitted as an initial stream event.

### 8. Keep payloads lightweight `[x]`

Use small payloads like:

```json
{ "changedAt": "2026-06-05T10:30:00Z" }
```

or:

```json
{ "username": "Cfleetham", "scanType": "rfid" }
```

The client should mostly respond by invalidating queries and refetching existing APIs.

## Phase 4: Server Emitters

### 9. Announcements `[x]`

Update:

- [server/presentation/http/registerAnnouncementRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerAnnouncementRoutes.js)

Emit:

- `announcements.updated`

Trigger after:

- create
- amend
- soft delete

### 10. Schedule / calendar / approvals `[x]`

Update:

- [server/presentation/http/registerScheduleRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerScheduleRoutes.js)

Emit:

- `calendar.updated`
- `approvals.updated`

Trigger after:

- event creation
- approvals
- rejections
- cancellations
- coaching session changes

### 11. Tournaments `[x]`

Update:

- [server/presentation/http/registerTournamentRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerTournamentRoutes.js)

Emit:

- `tournaments.updated`

Trigger after:

- create
- edit
- delete
- registrations
- score submissions if relevant to live views

### 12. Members / committee / roles `[~]`

Update:

- [server/presentation/http/registerAdminMemberRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerAdminMemberRoutes.js)

Emit:

- `committee.updated`
- `members.updated`
- `roles.updated`

Trigger after:

- committee role changes
- member profile updates
- role/permission changes

Open follow-up:

- review `members.updated` and `roles.updated` fanout further for least-privilege routing
- current behaviour is functionally correct, but less tightly scoped than approvals/equipment

### 13. Equipment `[x]`

Update:

- [server/presentation/http/registerEquipmentRoutes.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerEquipmentRoutes.js)

Emit:

- `equipment.updated`

Trigger after:

- add
- assign
- return
- storage updates
- decommission

### 14. Beginners / Have a Go `[x]`

Update:

- [server/index.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/index.js)

Reason:

- a large amount of beginners-course route logic still lives directly in this file

Emit:

- `beginners.updated`

Trigger after:

- course creation
- approval/rejection
- cancellation
- participant updates
- coach assignment
- equipment assignment

### 15. RFID `[x]`

Current client polling:

- [src/utils/rfidScanHub.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/utils/rfidScanHub.js)

Current server scan flow:

- [server/index.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/index.js)

Implemented emit:

- `rfid.scan`

Notes:

- authenticated RFID updates now use SSE
- pre-login RFID login also uses a public SSE stream
- the old latest-scan and latest-login polling paths were removed

## Phase 5: Client Query Invalidation Mapping

### 16. Announcements query invalidation `[x]`

Invalidate:

- `["announcements", actorUsername]`
- `["active-announcements", actorUsername]`

Related files:

- [src/presentation/pages/AnnouncementsPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/AnnouncementsPage.tsx)
- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

### 17. Home/dashboard invalidation `[x]`

Invalidate:

- home activity queries
- admin warning queries
- range member queries

Related file:

- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

### 18. Calendar / approvals invalidation `[x]`

Invalidate the query keys used in:

- [src/presentation/pages/EventCalendarPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/EventCalendarPage.tsx)
- [src/presentation/pages/ApprovalsPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/ApprovalsPage.tsx)

### 19. Committee / members / roles invalidation `[x]`

Invalidate query keys used in:

- [src/presentation/pages/CommitteeAdminPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/CommitteeAdminPage.tsx)
- [src/presentation/pages/UserCreationPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/UserCreationPage.tsx)
- [src/presentation/pages/roles/useRolePermissionsPageState.ts](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/roles/useRolePermissionsPageState.ts)

### 20. Equipment invalidation `[x]`

Invalidate query keys used in:

- [src/presentation/pages/equipment/useEquipmentPageState.ts](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/equipment/useEquipmentPageState.ts)

### 21. Tournaments invalidation `[x]`

Invalidate tournament-related queries in:

- [src/presentation/pages/TournamentsPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/TournamentsPage.tsx)
- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

### 22. Beginners invalidation `[x]`

Invalidate beginner-related queries in:

- [src/presentation/pages/BeginnersCoursesPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/BeginnersCoursesPage.tsx)
- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

## Phase 6: Replace Polling Gradually

### 23. Replace announcement polling first `[x]`

Current polling:

- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

Replace:

- active announcement `refetchInterval`

### 24. Replace home/admin warning polling `[x]`

Current polling:

- [src/presentation/pages/HomePage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/HomePage.tsx)

Replace:

- home activity refetch
- tournament warning refetch
- range members refetch if desired

### 25. Replace approvals and calendar polling `[x]`

Current polling:

- [src/presentation/pages/ApprovalsPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/ApprovalsPage.tsx)
- [src/presentation/pages/EventCalendarPage.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/EventCalendarPage.tsx)

### 26. Replace RFID polling last `[x]`

Current polling:

- [src/utils/rfidScanHub.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/utils/rfidScanHub.js)

Notes:

- authenticated RFID was moved first
- pre-login RFID polling was then replaced with the public SSE stream
- old fallback routes were removed afterward

## Phase 7: Security and Reliability

### 27. Enforce auth on SSE endpoint `[~]`

Ensure:

- unauthenticated requests return `401`
- expired sessions are handled cleanly
- client stops reconnecting forever on known auth failure

Relevant files:

- [server/index.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/index.js)
- [src/App.tsx](/c:/Users/cfleetham/personal/ArcheryClubPoC/src/App.tsx)

Status:

- authenticated endpoint returns `401`
- app disconnects stream on logout / disabled auth state
- browser `EventSource` retry behaviour is still largely native, not fully custom-managed on explicit auth expiry

### 28. Add permission-aware fanout `[~]`

Do not broadcast admin-only update events to everyone unless they are harmless invalidation events.

At minimum, the event bus should understand:

- by username
- by permission key

Status:

- done for approval events
- done for equipment events
- available in the event bus via `broadcastToUsers`, `broadcastToPermission`, and `broadcastToAnyPermission`
- still worth reviewing for members/roles/admin-heavy updates

### 29. Confirm timeout behavior `[ ]`

Review:

- [server/bootstrap/startServer.js](/c:/Users/cfleetham/personal/ArcheryClubPoC/server/bootstrap/startServer.js)

Check:

- `requestTimeout`
- `headersTimeout`
- `keepAliveTimeout`

Test:

- connection remains open for several minutes
- heartbeat prevents idle disconnects
- stream closes and reconnects cleanly

### 30. Check proxy/runtime buffering `[ ]`

When deployed behind a proxy or managed runtime, confirm streaming responses are not buffered or terminated early.

## Phase 8: Rollout Order

### 31. Delivery sequence `[x]`

Recommended order:

1. Create `registerSseRoutes.js`
2. Create event bus
3. Register SSE in `server/index.js`
4. Create `serverEvents.ts`
5. Create `useServerEvents.ts`
6. Wire SSE connection into `App.tsx`
7. Emit and consume `announcements.updated`
8. Remove announcement polling
9. Emit and consume `approvals.updated` and `calendar.updated`
10. Remove approvals/calendar polling
11. Add committee/member/role/equipment/tournament/beginners events
12. Replace RFID polling

Status:

- completed in substance, though some later cleanup and hardening happened after the core rollout

## Phase 9: Post-Install Nice-To-Haves

### 32. Add diagnostics `[x]`

Optional improvements:

- connection state badge for developers
- console logging in development
- event counters for troubleshooting

Status:

- dev badge implemented
- connection state, counters, last event, and fallback status are visible in development
- console logging is still optional and not currently added

### 33. Add graceful fallback `[x]`

If SSE connection is unavailable:

- keep or re-enable selected polling
- especially for RFID and home dashboard

Status:

- authenticated flows now fall back to visible-only polling after a delay if SSE stays down
- fallback state is exposed in diagnostics
- this is implemented as selective fallback rather than a full global polling mode

### 34. Prepare for future horizontal scaling `[ ]`

If the app ever runs on multiple server instances:

- replace in-memory event bus with Redis pub/sub or equivalent

Current note:

- no shared pub/sub has been added because the current app still runs as a single in-process server

## Estimated Effort

Approximate effort:

- SSE transport foundation: 0.5 to 1 day
- client connection + query invalidation: 0.5 day
- route emitters across main modules: 1 to 2 days
- polling replacement and testing: 1 day

Expected total:

- roughly 2 to 4 days
