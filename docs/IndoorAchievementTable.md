# Indoor Achievement Table

The Achievement Tables page uses the existing `/outdoor-table` route. `?tab=outdoor` is the default; `?tab=indoor` shows the separate indoor matrix. Members' indoor progress is edited from their profiles by users with `manage_members`; self sign-off is blocked.

Indoor rows are stored in `indoor_table_entries` for one member, bow style and season. The forward-only PostgreSQL migration is `017_indoor_table`; SQLite creates the equivalent table during bootstrap. The API is `GET/POST /api/indoor-table` and `PUT/DELETE /api/indoor-table/:id`. Changes emit `indoor-table.updated` and audit as `indoor_table_entry`.

The existing Golden Records member sync imports only current handicaps whose normalized `type` is `indoor`, matching by Golden Records member ID and bow class. A cached test snapshot confirms the source label `Indoor Handicap`. It keeps indoor and outdoor rows separate and updates indoor handicaps during member refresh, manual match and full-club sync. Manual matches use the same database transaction for both tables.

On the first cloud request for the current year's Indoor table, the server also creates missing rows from valid stored Golden Records snapshots. This one-time backfill uses only indoor handicaps and never overwrites an existing row or calls the remote API. Local Pi nodes receive the cloud rows through database sync.

The current cached snapshots and API tests have no indoor classification examples or score/award records for the paper table's 300–600 columns. The known snapshot format contains `classification`, `type`, `bow_class` and `achieved`, while achievements contain `achievement`, `round`, `bow_class` and `achieved`; neither establishes how the paper's indoor columns correspond to source records. The app therefore does **not** infer indoor classification or score award status from Golden Records. Those dated cells can be entered manually on the member profile. No false achievement states are created during sync. Confirm live source labels and semantics before adding automatic mappings.
