# Indoor achievement table and Golden Records mapping

The existing Indoor Table and member profile retain the same 8 classification keys and 17 score keys. Dates are shown as ticks with achievement dates in tooltips and remain editable by authorised members. Each row belongs to a portal member, bow style and indoor season starting year. Golden Records' published indoor seasons run from 1 July through 30 June; for example, a result on 30 June 2026 belongs to portal season `2025`, and one on 1 July 2026 belongs to `2026`.

## Verified source fields

The Golden Records [API documentation](https://api2.archery-records.net/help) defines dated `achievements`, `classifications`, `currentclassifications`, `currenthandicaps`, `rounds`, `scores`, `seasons` and `achievementslist`. The sync reads achievements and classification history; it does not derive an award from a raw score. A read-only check of the club API on 14 October 2026 found the following source labels:

| Golden Records source | Portal field | Condition |
| --- | --- | --- |
| `Indoor Archer 3rd Class`, `Indoor Archer 2nd Class`, `Indoor Archer 1st Class` | `archer3rd`, `archer2nd`, `archer1st` | `classifications.type = Indoor` and a valid `achieved` date |
| `Indoor Bowman 3rd Class`, `Indoor Bowman 2nd Class`, `Indoor Bowman 1st Class` | `bowman3rd`, `bowman2nd`, `bowman1st` | Same |
| `Indoor MB` | `indoorMasterBowman` | Same |
| `Portsmouth 300`, `325`, `350`, `375`, `400`, `425`, `450`, `475`, `500`, `525`, `550`, `575`, `580`, `585`, `590`, `595` | Matching numeric score key | Explicit achievement label, `round = Portsmouth`, valid `achieved` date |
| `Portsmouth 600` | `600` | Same exact-label rule if an explicit award appears in future source data |

Every imported record must match the selected Golden Records member ID and an eligible, matching bow class (`Recurve`, `Compound`, `Barebow`, `Longbow`). Ambiguous member matches remain unlinked. Earlier dated achievements stay in their historical season; the nightly and individual member sync write only the current indoor season. Repeated runs fill empty fields only. Existing manually entered dates are retained, and a manually edited handicap is retained. Empty or incomplete API responses do not clear cells.

A verified higher Portsmouth award also awards every lower score column for that same member, bow style and indoor season. Newly filled lower columns use the earliest qualifying higher-award date. A lower score with its own recorded date keeps that date. The same progression is applied when an authorised member saves indoor score dates from a profile; dates from another season do not unlock current-season awards. Raw score records still never award a column.

## Historical preview

Golden Records Admin provides **Preview Indoor Backfill** and a separate **Apply Indoor Backfill** action. The preview compares stored snapshots with existing indoor rows and lists proposed inserts, updates, skipped rows and unmapped values. Apply rechecks the plan hash before writing; a changed plan must be previewed again. Apply fills missing dated fields and preserves existing achievement dates. A repeated preview and apply produces no changes. Stored snapshots may not contain all historical classifications until members have been refreshed with the updated sync; the preview identifies its `stored-snapshots` source.

The current-season stored-snapshot pass also fills missing dates on existing rows, including lower awards earned through a higher dated score. The preview and current-season pass include existing manual high awards even if no Golden Records snapshot exists. Profile saves merge only edited dates against the latest row, so a profile opened before a sync does not replace newly imported dates.

## Fields without confirmed source records

No `Indoor Grand Master Bowman` or equivalent verified indoor classification was present in the checked source classifications. `indoorGrandMasterBowman` remains manual. No `Portsmouth 600` achievement was present; the exact explicit award would map if it appears later. Historical `A`–`H`, `Archer`, and `Unclassified` source values have no verified mapping to the portal's eight classifications and are reported as unmapped. The `achievementslist` master list did not contain the club's `Portsmouth N` labels; the mapping uses the explicit member achievement text and its `Portsmouth` round instead.

## Worker budget

The existing nightly job keeps its 26-minute time limit and 1.1-second minimum Golden Records request gap. Full-club sync fetches classification history (955 records) and current classifications (199 records) club-wide, one page each at the time of inspection, rather than per member. Manual single-member refresh adds one member-specific history request. The current Golden Records member list returned 593 records; with one member-specific handicap endpoint per matched member, the throttling floor is about 11 minutes in a worst-case 593-member match, leaving time for database work, network variability and retries within the 26-minute budget. Monitor job duration and retry counts as club size changes.
