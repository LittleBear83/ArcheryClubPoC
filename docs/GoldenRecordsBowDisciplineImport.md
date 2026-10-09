# One-off Golden Records bow-discipline import

The importer adds each active portal member's mapped Golden Records bow class
to `user_disciplines`. It is additive: other existing disciplines are kept.
It does not update archived/inactive portal accounts, and it never guesses a
member match by name or email.

## Matching and mapping

- Match by stored Golden Records member ID first.
- If that ID is not found, use an exact Archery GB membership-number match.
- Skip conflicting identifiers, duplicate matches, archived records, unknown
  bow classes, and members without a strong identifier match.
- Map Recurve, Compound, Barebow, and Longbow to Recurve Bow, Compound Bow,
  Bare Bow, and Long Bow respectively.

## Preview and apply

Run from the repository root in an environment configured with the portal's
PostgreSQL and Golden Records runtime settings. Do not put credentials in the
command line or in the plan file.

```bash
node scripts/importGoldenRecordsBowDisciplines.mjs
```

This is a dry run. It prints a row-by-row summary and writes a timestamped JSON
plan under `server/data/exports/` (ignored by Git). Review the `add`,
`unchanged`, and `skip` rows before applying.

```bash
node scripts/importGoldenRecordsBowDisciplines.mjs \
  --apply-from server/data/exports/golden-records-bow-disciplines-<timestamp>.json
```

Apply refetches Golden Records and the portal member records. It refuses to
write if the reviewed plan no longer exactly matches the current records or
runtime/database target. The importer locks affected portal user rows, checks
their identities and existing disciplines again, writes all additions in one
transaction, and records an audit event for each inserted discipline. The
existing PostgreSQL sync trigger publishes the discipline changes to the Pi.

Applying to a non-live database requires the additional
`--allow-non-live` flag. The importer refuses SQLite targets. A second apply
using an already-applied plan will fail its freshness check.
