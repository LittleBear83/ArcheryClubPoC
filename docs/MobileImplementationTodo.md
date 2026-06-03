# Mobile Implementation Todo

Date: 2026-06-03

## Purpose

This is the definitive working checklist for adding a mobile-friendly presentation layer while keeping the current desktop experience intact.

Principles:

- keep desktop layouts and behavior stable
- reuse existing routes, APIs, queries, and permissions
- add mobile-specific renderers only where the current UI is not phone-friendly
- deliver visible value in small slices over several days

## Definition Of Done

The mobile work is complete when:

- key member flows are comfortable on a phone
- key admin flows are usable on a phone
- desktop layouts remain unchanged or only receive safe shared improvements
- no route becomes mobile-only or desktop-only
- the app is tested at phone, tablet, and desktop widths

## Working Order

### Phase 0: Foundation

- [x] Add `src/presentation/hooks/useIsMobile.ts`
  - Use `window.matchMedia`
  - Start with one breakpoint at `900px`
- [ ] Decide and document the primary breakpoints
  - `phone < 640px`
  - `tablet 640px - 899px`
  - `desktop >= 900px`
- [x] Add shared mobile UI primitives under `src/presentation/components/mobile/`
  - `MobileSectionHeader.tsx`
  - `MobileCardList.tsx`
  - `MobileKeyValueList.tsx`
  - `MobileActionBar.tsx`
  - `MobileEmptyState.tsx`
- [ ] Add a short note to developer docs describing the desktop/mobile split pattern
- [ ] Sanity-test the existing app shell at `390px`, `430px`, `768px`, and `1024px`

Outcome:

- one consistent mechanism for choosing mobile vs desktop views
- reusable mobile building blocks before page work begins

### Phase 1: Prove The Pattern On Low-Risk Pages

#### Reporting

- [x] Extract reporting state into `src/presentation/pages/reporting/useReportingPageState.ts`
- [x] Create `src/presentation/pages/reporting/ReportingDesktopView.tsx`
- [x] Create `src/presentation/pages/reporting/ReportingMobileView.tsx`
- [x] Update route page to choose variant by `useIsMobile()`
- [x] Keep desktop table as-is
- [x] Replace mobile report table with stacked row cards
- [x] Stack date filters and export action cleanly on small screens
- [ ] Confirm CSV export still works on desktop and mobile browsers

#### Records

- [x] Split `RecordsPage` into desktop and mobile views
- [x] Keep desktop records table as-is
- [x] Replace mobile score-entry table with vertical fields
- [x] Make mobile modal fit within viewport without sideways scroll
- [ ] Verify keyboard usability for numeric entry on phones

#### Range Usage

- [x] Split `RangeUsagePage` into desktop and mobile views
- [x] Keep desktop graphs as-is
- [x] Make mobile filters stack cleanly
- [x] Reduce mobile graph density where labels become unreadable
- [ ] Ensure no graph section requires horizontal scrolling on common phone widths

Outcome:

- one full implementation pattern proven
- three easier pages made phone-friendly

### Phase 2: Member-Facing Polish

#### Home

- [x] Review `HomePage` and `HomeSection` at phone widths
- [x] Make sure cards stack cleanly with consistent spacing
- [x] Check banner/menu/theme controls do not overlap
- [x] Ensure long member names and event titles wrap safely

#### Login

- [x] Review login spacing on narrow screens
- [x] Verify guest flow is comfortable on phone
- [x] Verify inviting-member modal works well on touch devices
- [x] Check RFID-related messages and actions remain readable

#### Profile

- [x] Identify desktop-only sections in `ProfilePage`
- [x] Split into `ProfileDesktopView` and `ProfileMobileView` only if needed
- [x] Keep data loading and mutations shared
- [x] Convert loan/equipment and distance sign-off tables to mobile cards or stacked sections
- [x] Ensure card assignment and distance sign-off modals fit on phones

Outcome:

- key member journeys feel solid on mobile

### Phase 3: Admin Operational Screens

#### Equipment

- [x] Extract state into `src/presentation/pages/equipment/useEquipmentPageState.ts`
- [x] Create `EquipmentDesktopView.tsx`
- [x] Create `EquipmentMobileView.tsx`
- [x] Keep desktop inventory table and action layout intact
- [x] Build mobile inventory cards with search/filter support
- [x] Build mobile action sections for:
  - add equipment
  - assign equipment
  - return equipment
  - update storage
  - manage storage locations
  - decommission equipment
- [x] Convert case contents into collapsible mobile cards
- [x] Ensure case assignment modal works within phone viewport

#### Role Permissions

- [x] Split into desktop and mobile views
- [x] Keep desktop matrix intact
- [x] Build mobile grouped permission editor by category
- [x] Replace full role matrix on mobile with role summary cards or grouped lists
- [x] Verify create, edit, and delete role flows remain clear on phone

#### Reporting Follow-Up

- [ ] Re-check reporting mobile experience with realistic large datasets
- [ ] Confirm export messaging remains understandable on phones

Outcome:

- admin work becomes practically usable from a phone, not just technically responsive

### Phase 4: Complex Specialized Screens

#### Event Calendar

- [ ] Extract state into `src/presentation/pages/event-calendar/useEventCalendarPageState.ts`
- [ ] Create `EventCalendarDesktopView.tsx`
- [ ] Create `EventCalendarMobileView.tsx`
- [ ] Keep desktop month grid as default desktop experience
- [x] Make mobile default to agenda/list view instead of dense month grid
- [ ] Keep booking/approval actions shared
- [ ] Make event and coaching details comfortable in mobile modal/sheet layout
- [ ] Verify multi-date and recurring flows on touch devices
- [ ] Confirm selected-day summaries are still easy to scan on mobile

#### Tournaments

- [ ] Split into desktop and mobile views
- [ ] Keep desktop bracket graphic intact
- [ ] Replace mobile default bracket view with:
  - tournament cards
  - registration status
  - score entry
  - simplified rounds/winner summary
- [ ] Keep detailed bracket as optional drill-in if still usable
- [ ] Verify export behavior and setup form usability on phones

#### Beginners Courses

- [ ] Review whether a mobile split is needed immediately or later
- [ ] Replace widest tables with stacked card layouts where practical
- [ ] Rework row action clusters that do not fit on narrow screens

Outcome:

- hardest desktop-first pages gain real mobile alternatives

### Phase 5: Shared Cleanup

- [ ] Standardize mobile spacing tokens where needed
- [ ] Standardize mobile card/list/table replacement patterns
- [ ] Replace any remaining phone-hostile tables in important flows
- [ ] Review all modals for:
  - max height
  - internal scrolling
  - safe action button placement
- [ ] Review all forms for:
  - touch target size
  - label clarity
  - stacked layout
  - numeric keyboard/input mode where useful

### Phase 6: Verification

- [ ] Test all major routes at `390px`
- [ ] Test all major routes at `430px`
- [ ] Test all major routes at `768px`
- [ ] Test all major routes at `1024px`
- [ ] Check orientation changes on phones/tablets
- [ ] Check long text, empty states, and loading states
- [ ] Check all important modals
- [ ] Check drawer open/close behavior across breakpoints
- [ ] Check date picker layering and dismissal
- [ ] Check event, equipment, and reporting actions for regressions
- [ ] Run lint
- [ ] Run typecheck
- [ ] Run tests

## Priority Order

If time is limited, do the work in this exact order:

1. Foundation
2. Reporting
3. Records
4. Range Usage
5. Home
6. Login
7. Profile
8. Equipment
9. Role Permissions
10. Event Calendar
11. Tournaments
12. Beginners Courses
13. Final verification

## Files Most Likely To Change

### New files

- `src/presentation/hooks/useIsMobile.ts`
- `src/presentation/components/mobile/*`
- `src/presentation/pages/reporting/*`
- `src/presentation/pages/range-usage/*`
- `src/presentation/pages/records/*`
- `src/presentation/pages/equipment/*`
- `src/presentation/pages/event-calendar/*`
- `src/presentation/pages/tournaments/*`
- `src/presentation/pages/roles/*`

### Existing files likely to be updated

- `src/App.css`
- `src/presentation/pages/HomePage.tsx`
- `src/presentation/pages/HomeSection.tsx`
- `src/presentation/pages/LoginPage.tsx`
- `src/presentation/pages/ProfilePage.tsx`
- `src/presentation/pages/ReportingPage.tsx`
- `src/presentation/pages/RangeUsagePage.tsx`
- `src/presentation/pages/RecordsPage.tsx`
- `src/presentation/pages/EquipmentPage.tsx`
- `src/presentation/pages/RolePermissionsPage.tsx`
- `src/presentation/pages/EventCalendarPage.tsx`
- `src/presentation/pages/TournamentsPage.tsx`

## Notes For Implementation

- Prefer extracting shared state before splitting very large pages.
- Do not rewrite desktop markup unless the same change genuinely improves both variants.
- For mobile, prefer cards, stacked fields, and segmented actions over shrunken desktop tables.
- Keep route APIs and business behavior identical between mobile and desktop.
- If a desktop component is already acceptable on tablet, do not split it unnecessarily.

## Suggested Daily Milestones

### Day 1

- [ ] Complete Phase 0 foundation
- [ ] Start and finish Reporting split

### Day 2

- [ ] Finish Records
- [ ] Finish Range Usage
- [ ] Review Home and Login

### Day 3

- [ ] Tackle Profile
- [ ] Start Equipment state extraction

### Day 4

- [ ] Finish Equipment mobile view
- [ ] Start Role Permissions mobile view

### Day 5+

- [ ] Event Calendar
- [ ] Tournaments
- [ ] Beginners Courses
- [ ] full regression pass

## Immediate Next Task

Start with:

- [x] create `useIsMobile.ts`
- [x] create mobile shared components
- [x] split `ReportingPage` into shared state plus desktop/mobile views
