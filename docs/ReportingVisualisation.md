# Reporting visualisation audit and design

## Existing data and capabilities

| Source | Available data | Meaning and limit |
| --- | --- | --- |
| `login_events` | Username, method, UTC date and time | Successful account access or on-site check-in. Password logins do not prove range attendance. |
| `guest_login_events` | Guest name, inviter, UTC date and time | Each sign-in is one recorded guest visit. |
| `users` and `user_types` | Current membership status, role and active flag | A current profile snapshot. There is no reliable historical membership snapshot for trend or retention calculations. |
| `beginners_course_participants` and courses | Start date, origin route, current route and recorded conversion | Supports cohort conversion by original programme. A participant may convert after the selected start-date window. |
| Coaching, event and tournament booking tables | Bookings and registrations | These are intentions to participate. They do not consistently prove attendance, so the dashboard does not label them as participation. |

The existing attendance API returns date-filtered access rows and daily totals for users with `view_reports`. The member-journey API returns cohort rows and conversion totals under the same permission. Admins and developers can additionally request two-hour-deduplicated range visits and the member follow-up report. Exports are generated from the same permission-gated API responses shown by the visualisations. The local development database inspected on 26 October 2026 contained 18 users, 99 login events, 8 guest sign-ins, 5 programme participants, and small booking samples; these counts are not production metrics.

## Charting choice

Use the installed [`@mui/x-charts` Community package](https://mui.com/x/react-charts/overview/) for bar and pie charts. The project already uses its PieChart, and the [MIT-licensed Community package](https://mui.com/x/introduction/licensing/) supplies the axes, legends and tooltips needed here. Reusing it avoids an additional dependency and a second chart design system. The dashboard uses ordinary HTML controls as keyboard equivalents for chart selection. The original hand-built reporting bar chart is no longer used by the page.

## 3-10-300 layout

1. **3 seconds:** access-event KPIs, with explicit definitions; permitted viewers also see recorded range-visit KPIs.
2. **10 seconds:** date trend, weekday comparison, method mix, busiest-day cue and programme cohort comparison.
3. **300 seconds:** a compact disclosure for custom dates and sources, chart and keyboard drill-downs, member follow-up, detailed records and filtered CSV exports.

Daily activity becomes seven-day buckets for selections longer than 62 days. All buckets, weekday bars, method counts and exported rows derive from the same access API response. Visit counts and unique checked-in accounts derive from the separate visit response. The distinction between access and visits is visible in the UI.
Chart dropdowns show only non-empty choices. Selecting one focuses its chart and shows the matching count and export action beside it; the same selection controls the detailed rows below.

## Prioritised additional insights

| Priority | Insight | Status |
| --- | --- | --- |
| 1 | Access trend, busiest days and weekdays, guest/member mix, login method mix | Implemented from existing event data. |
| 1 | Unique checked-in accounts versus recorded visits and visit start hour | Implemented for admins/developers from deduplicated visit data. |
| 1 | Starter versus conversion comparison by original programme | Implemented from journey cohort data. |
| 2 | Member inactivity follow-up | Preserved in the existing permission-gated member follow-up report. |
| 2 | Membership growth and retention | Needs historical membership status events or snapshots before reliable trends can be reported. |
| 3 | Coaching, event and tournament attendance | Needs consistent attendance records; current booking counts alone would mislabel participation. |

## Operational notes

- Dates and hours use UTC, matching the APIs.
- Access exports include exactly the rows selected by the chart or keyboard filter. Visit and journey exports use their respective selections.
- The on-screen detail tables preview 100 rows; CSV includes every matching row.
- The visual dashboard retains the existing permission checks and does not expose member visit or follow-up data to other reporting users.
