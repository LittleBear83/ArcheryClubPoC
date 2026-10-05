# Tournament manager additions

Branch: `feat/tournament-manager-additions` (based on the previously committed
sync/audit fix). This commit changes only tournament addition behaviour and its
tests/documentation. Pre-existing feedback work is excluded.

## Cause and behaviour

The tournament page already had searchable member selection, bow selection,
Add member and Add another member. Both candidate loading and the registration
API gated managers on the public registration dates. The remove action was still
visible, making the workflow appear to support removal only.

Managers with `MANAGE_TOURNAMENTS` can now add members before registration opens
or after it closes when the competition state permits it. Ordinary self-registration
keeps the existing dates. Creation already permits zero participants; managers
can create the shoot, select it and add participants incrementally. Desktop and
mobile use the same dialog. Add another member supports repeated additions.
Existing removal behaviour and tournament creation remain unchanged.

## State safety

- Check persisted scores and match activity, including zero scores, submissions,
  confirmation, disputes, resolved results and completed competition.
- Reject additions after competition activity, even with redraw consent.
- Unplayed previews during public registration do not block self-registration.
- A persisted draw or a bracket after registration closes requires explicit
  manager confirmation. Pairings/byes can change. Reset only unplayed matches
  and draw metadata; retain the schedule and randomise-every-round preference.
- Rebuild through the existing tournament engine, including frozen/random draws.
- The existing workflow/advisory lock serializes tournament operations. Registration,
  draw reset and reconstruction share a transaction. PostgreSQL gateway calls share
  a request-local connection, including the existing nested gateway operations.
- A regression test exposed registration committing before a failing rebuild.
  The transaction now includes rebuilding, and audit/SSE success occurs afterward.
- Canonical member usernames resolve to existing user references. Case variants,
  repeated HTTP requests and concurrent database inserts cannot add another entry.
  Duplicates return a clear conflict rather than another success audit.

No migration or new participant fields are introduced. Existing bow selection,
eligibility and handicap services remain in use. This feature does not invent
classification/category/allocation fields that the current registration model
does not contain. Existing participants' metadata is retained; unplayed match
snapshots are regenerated only when the manager consents.

## Sync and audit

Tournament writes remain Cloud-authoritative. Pi writes return 503 and the add
dialog explains that additions must be made on the Cloud portal. Cloud PostgreSQL
triggers publish registrations and rebuilt tournament state using the existing
stable tournament identity and portable member username. Existing apply logic
remaps local IDs, suppresses echoes and handles replay idempotently. Existing
`tournaments.updated` events refresh browser views. No sync protocol, watcher,
outbox, cursor or migration is added.

The existing human audit records actor, tournament, participant, bow, timestamp
and whether a draw was regenerated. Failed transactions produce no success audit.
The existing sync infrastructure audit exclusions remain unchanged. Audit writing
retains the application's existing asynchronous/best-effort logging behaviour.

## Verification

- Focused tournament tests: 60 passed.
- Full project tests: 499 passed, zero failed/skipped.
- Typecheck: passed.
- Production build: passed (Vite reported a plugin timing warning).
- Full PostgreSQL integration suite: 53 passed, zero failed/skipped.
- Git diff whitespace checks: passed.
- New PostgreSQL tests cover concurrent duplicate inserts, Cloud-to-Pi replay,
  no echo/outbox, atomic reset failure, real manager HTTP additions, Pi rejection,
  rebuilding failure rollback (including change-log rows), and score/dispute safety.

Tests use disposable PostgreSQL 17.6 databases on loopback, with `fsync=off`.
They verify transaction semantics, not operating-system crash durability. Tests
ran against the shared working tree, which includes unrelated feedback changes.
Live Pi/Cloud services and browser interaction have not been manually exercised.

## Manual acceptance checks

1. On Cloud, sign in with `MANAGE_TOURNAMENTS`. Create a future shoot with no
   participants. Add a member with a chosen bow, use Add another member, and reload.
2. Try an already registered username through another request, including different
   casing. Expect 409 and unchanged counts.
3. With public registration closed and no activity, open Add member. If a draw
   exists, cancel confirmation and verify nothing changes; then confirm and verify
   every participant appears once in the rebuilt draw and counts refresh.
4. Record a zero score or a disputed/submitted result. Attempt another addition
   with redraw consent. Expect a blocking reason and unchanged scores/results.
5. Check ordinary member self-registration dates and permissions, plus existing
   removal behaviour during its supported registration window.
6. Repeat the dialog checks at desktop/mobile widths, including bow selection,
   Add another member, Cancel, errors and immediate count updates.
7. Check the human audit for actor/member/tournament/time. Replaying a duplicate
   addition must not create another registration audit.
8. With the headless watcher running and no browser required, confirm the Cloud
   addition reaches Pi; reconnect/replay and verify no duplicates or outbound echo.
   On Pi, confirm the dialog explains Cloud authority and POST registration is blocked.

The existing tournament process remains available alongside this additive portal
capability. Results-bearing tournaments intentionally have no late insertion path.
