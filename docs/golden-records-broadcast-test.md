# Golden Records manual-match broadcast test

The full suite failed at `goldenRecordsManualMatchRoute.test.js`: the successful assignment fixture expected an `outdoor-table.updated` SSE event but supplied only aggregate `createdCount` and `syncedCount` values. The route emits that event when `outdoorChangeCount > 0`. The real `assignMemberMatch` service returns `outdoorChangeCount` and `indoorChangeCount` separately from the aggregate counts.

Comparison with `main` showed the same test fixture and the same route condition. This was a pre-existing test fixture error, not an application defect. The fixture now models one outdoor change and zero indoor changes, and asserts that only the outdoor invalidation is emitted. No production route, nightly sync, SSE, Pi synchronisation, database, or Dashboard/Reporting/Audit code changed.

Validation: the test passed in isolation; `npm test` passed 581/581 tests; `npm run typecheck` and `npm run build` passed. No production data was touched.
