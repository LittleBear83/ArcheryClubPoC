# Dashboard, Reporting and Audit reconciliation

## Sources and counting rules

| View | Source | Count | Dates |
| --- | --- | --- | --- |
| Reporting Dashboard, Member login methods | `login_events`, grouped by `login_method` | One persisted successful member access event per row; includes RFID, mobile check-in, mobile password, website password, and historical other methods | Inclusive UTC days; 7, 30, 90 days, year or all time |
| Reporting, access events | `login_events` plus `guest_login_events` | One row per access event, including repeat visits; member figure matches the Dashboard for the same UTC dates; guest figure is additional | User-selected inclusive UTC days, default current month |
| Range Usage Dashboard | `login_events` with `rfid` or `mobile-app`, plus guest events | Member range events grouped into visits starting more than two hours apart; password sign-ins do not prove on-site presence | Current UTC week/month or selected inclusive UTC days |
| Audit | `audit_events` | Human-readable action history, including failed attempts and other actions; list limited to 250 recent entries and may include generic request and entity records for one action | Optional inclusive UTC dates; no range by default |

## Root causes and changes

- `password-mobile` was displayed in Audit as Mobile but counted in Dashboard as Website. The method grouping now places both mobile password sign-ins and on-site mobile check-ins under Mobile. They remain separate persisted methods and separate actions in Audit.
- Failed mobile password attempts now retain `password-mobile` in Audit, matching successful attempts; they remain excluded from successful access totals.
- Dashboard excluded unknown historical login methods from its total while Reporting included their rows. Dashboard now includes an Other category when these exist, so its member total matches Reporting without changing historical rows.
- SQLite Reporting used inner joins to profiles and roles, which dropped persisted historical events when the profile was missing. Its event list now uses left joins, as PostgreSQL already did.
- The views had different default windows and used vague “login” labels for access events versus range visits. Labels now state the distinction and the UTC date basis. Use matching start/end dates to compare Dashboard and Reporting.

## Remaining intentional differences

Audit records are an evidence trail, not the metric source. Failed attempts are audit-only, and audit writes can finish after the successful login response. Older or synced login events may have no corresponding audit action. Its 250-row cap means the number shown must not be compared directly with access totals. The persisted `login_events` table remains the source for successful member access metrics. Range Usage intentionally omits password sign-ins and collapses repeated on-site check-ins into visits. Guest events appear only in Reporting and the guest part of Range Usage.

The reconciliation regression fixture covers a seven-day UTC window including RFID, mobile check-in, mobile password, website password, boundary exclusions and a failed audit action. No production data or schema was modified.
