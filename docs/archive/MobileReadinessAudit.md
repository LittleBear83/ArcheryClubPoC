# Mobile Readiness Audit

Archived: this audit reflects the state of the mobile effort on 2026-06-03 and
is preserved for historical context. The active checklist now lives in
`docs/MobileImplementationTodo.md`.

Date: 2026-06-03

## Summary

This app is much closer to a mobile-friendly web experience than to a native mobile app.

The current frontend already has:

- responsive breakpoints in `src/App.css`
- large touch targets and a drawer-based navigation pattern
- a custom date picker designed for touch use
- several layouts that already collapse to one column

The main blockers are not the backend or domain logic. They are the UI patterns used by several pages:

- dense tables
- fixed-width graphs and bracket views
- browser-only APIs and DOM event usage
- page workflows that assume desktop width

## Delivery Paths

### 1. Mobile-friendly web

Estimated effort: 1 to 3 weeks

Best for:

- members opening the portal in a browser on their phone
- staff using the app on tablets
- lowest-cost path to a usable phone interface

### 2. Installable PWA

Estimated effort: 2 to 4 weeks

Adds on top of mobile-friendly web:

- install to home screen
- app-like launch
- optional caching/offline shell work

### 3. Separate native app

Estimated effort: 6 to 12+ weeks

This would require substantial UI rework because the current presentation layer is tightly coupled to browser concepts such as `window`, `document`, HTML tables, and CSS-driven layouts.

## Screen Audit

### Low effort

These are already close to phone-ready and mainly need spacing, testing, and a few layout adjustments.

- Login page
  - File: `src/presentation/pages/LoginPage.tsx`
  - Notes: already uses a stacked layout on smaller screens and touch-sized controls.
- Home page shell and navigation
  - Files: `src/presentation/pages/HomePage.tsx`, `src/presentation/components/SideDrawer.tsx`
  - Notes: drawer navigation is a good mobile pattern already.
- Home dashboard
  - File: `src/presentation/pages/HomeSection.tsx`
  - Notes: card/list content is naturally adaptable to single-column mobile layout.

Estimated effort: 2 to 4 days

### Medium effort

These should work on mobile web after focused redesign of dense sections, but they do not need a full rewrite.

- Profile
  - File: `src/presentation/pages/ProfilePage.tsx`
  - Risks: multiple admin actions, modal flows, distance sign-off matrix, equipment loan tables.
- Range usage
  - File: `src/presentation/pages/RangeUsagePage.tsx`
  - Risks: graph density and date/filter layout.
- Reporting
  - File: `src/presentation/pages/ReportingPage.tsx`
  - Risks: graph readability and report table usability on narrow screens.
- Records
  - File: `src/presentation/pages/RecordsPage.tsx`
  - Risks: score-entry table in modal; likely better as stacked numeric fields on phones.

Estimated effort: 4 to 7 days total for a solid web-mobile pass

### High effort

These pages are usable on desktop web, but are the least naturally suited to phones in their current form.

- Event calendar
  - File: `src/presentation/pages/EventCalendarPage.tsx`
  - Risks: month grid, multiple modal workflows, booking/approval states, mixed item types.
- Tournaments
  - File: `src/presentation/pages/TournamentsPage.tsx`
  - Risks: bracket graphic is visually rich but space-hungry on small screens.
- Equipment
  - File: `src/presentation/pages/EquipmentPage.tsx`
  - Risks: inventory tables, assignment workflows, sorting/filtering, case management.
- Role permissions
  - File: `src/presentation/pages/RolePermissionsPage.tsx`
  - Risks: permission matrix is structurally desktop-first.
- Beginners courses
  - File: `src/presentation/pages/BeginnersCoursesPage.tsx`
  - Risks: several wide tables and dense row actions.

Estimated effort: 1 to 2 weeks depending on how much redesign is acceptable

## Structural Mobile Blockers

### Browser-only dependencies

The current app uses browser APIs directly in several places, including:

- `window.localStorage`
- `window.history`
- `window.dispatchEvent`
- `window.confirm`
- `window.prompt`
- `document.createElement`
- `window.showSaveFilePicker`

This is acceptable for mobile web, but it increases the cost of a native app significantly.

Notable files:

- `src/App.tsx`
- `src/presentation/pages/HomePage.tsx`
- `src/presentation/pages/ReportingPage.tsx`
- `src/presentation/pages/TournamentsPage.tsx`
- `src/presentation/pages/EventCalendarPage.tsx`

### Table-heavy UI

Several features rely on HTML tables with minimum widths and horizontal scrolling.

This is acceptable as a fallback on mobile web, but it is not a strong phone-first experience. The best mobile result would replace some tables with:

- cards
- stacked rows
- drill-in detail views
- segmented forms

Notable files:

- `src/presentation/components/Calendar.tsx`
- `src/presentation/pages/EquipmentPage.tsx`
- `src/presentation/pages/ProfilePage.tsx`
- `src/presentation/pages/ReportingPage.tsx`
- `src/presentation/pages/RolePermissionsPage.tsx`
- `src/presentation/pages/RecordsPage.tsx`
- `src/presentation/pages/BeginnersCoursesPage.tsx`

### Dense visual components

The following UI elements are likely to be awkward on smaller phones even if technically responsive:

- tournament bracket graphic
- usage and reporting graphs with many columns
- monthly calendar grid with multiple event labels
- permission matrix

## Recommended Plan

### Phase 1: Mobile web audit and polish

Estimated effort: 5 to 8 working days

Suggested scope:

- test at 390px, 430px, 768px, and 1024px widths
- tighten top banner and toolbar spacing
- confirm drawer, modals, and date pickers remain usable
- convert the worst phone-unfriendly tables to stacked card/list views where practical
- keep horizontal scroll only where redesign would be expensive

### Phase 2: PWA support

Estimated effort: 2 to 4 days

Suggested scope:

- manifest
- icons
- installability
- optional offline shell and cache strategy

### Phase 3: Native app only if needed

Only do this if there is a clear product need for:

- App Store / Play Store distribution
- deeper device integration
- richer offline behavior
- push notifications

## Best First Targets

If the goal is fast visible improvement, start here:

1. Home
2. Login
3. Profile
4. Reporting
5. Range usage

If the goal is full operational mobile support for staff/admin users, tackle these next:

1. Equipment
2. Event calendar
3. Tournaments
4. Role permissions
5. Beginners courses

## Bottom Line

This codebase is a good candidate for a mobile-friendly web interface and a PWA.

It is not yet a cheap candidate for a separate native mobile app because the presentation layer is still strongly web-specific.
