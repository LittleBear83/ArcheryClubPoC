# Mobile Layer Architecture

Date: 2026-06-03

## Goal

Add a mobile-friendly presentation layer without materially changing the current desktop experience.

The intent is:

- keep existing routes
- keep existing APIs and use cases
- keep desktop layouts as the default
- add mobile-specific renderers only where the current desktop UI does not translate well to phones

## Recommended Pattern

Use a page-container plus variant-view split.

Each complex page should move toward this shape:

```tsx
export function SomePage(props) {
  const isMobile = useIsMobile();

  const pageState = useSomePageState(props);

  return isMobile
    ? <SomePageMobileView {...pageState} />
    : <SomePageDesktopView {...pageState} />;
}
```

This keeps:

- data fetching in one place
- business rules in one place
- mobile and desktop markup separated
- desktop behavior stable

## Breakpoints

Use these viewport ranges consistently when making layout decisions:

- `phone`: under `640px`
- `tablet`: `640px` to `899px`
- `desktop`: `900px` and above

Implementation note:

- `useIsMobile()` should continue to treat `900px` as the mobile/desktop split
- tablets can usually share the mobile layout unless a specific desktop pattern still fits comfortably

## Developer Note

When adding new screens or extending existing ones:

- keep route-level state, queries, mutations, and permissions in the page container or extracted page-state hook
- keep desktop markup as the default unless the mobile version truly needs different structure
- prefer `MobileCardList`, `MobileKeyValueList`, `MobileSectionHeader`, and stacked action bars over horizontally compressed tables
- treat modals as mobile-first surfaces: avoid sideways scroll, keep actions reachable, and prefer vertical form layouts

## Proposed Building Blocks

### 1. Viewport hook

Add a small hook for layout decisions:

- file: `src/presentation/hooks/useIsMobile.ts`

Suggested behavior:

- return `true` under a chosen breakpoint such as `900px`
- use `window.matchMedia`
- avoid mixing layout logic into page components

Optional follow-up:

- `useViewport()` returning `isMobile`, `isTablet`, `isDesktop`

### 2. Shared mobile primitives

Add a few reusable components rather than redesigning each page from scratch.

Suggested files:

- `src/presentation/components/mobile/MobileStack.tsx`
- `src/presentation/components/mobile/MobileCardList.tsx`
- `src/presentation/components/mobile/MobileKeyValueList.tsx`
- `src/presentation/components/mobile/MobileSectionHeader.tsx`
- `src/presentation/components/mobile/MobileActionBar.tsx`
- `src/presentation/components/mobile/MobileEmptyState.tsx`

These should cover the common replacements for desktop tables:

- table row -> card
- dense toolbar -> stacked filter/actions
- side-by-side stats -> vertical stat blocks

### 3. Page state extraction for complex screens

For large pages, move data/query/mutation/state orchestration into a hook or presenter object.

Suggested pattern:

- page file remains route entry
- extracted hook provides all state and handlers
- desktop and mobile views consume the same contract

Example files:

- `src/presentation/pages/event-calendar/useEventCalendarPageState.ts`
- `src/presentation/pages/equipment/useEquipmentPageState.ts`
- `src/presentation/pages/reporting/useReportingPageState.ts`

This is especially valuable for:

- `EventCalendarPage`
- `EquipmentPage`
- `RolePermissionsPage`

## File-Level Rollout

### First wave

These pages are the safest starting point because they have clear data/view boundaries.

#### Reporting

Current file:

- `src/presentation/pages/ReportingPage.tsx`

Suggested split:

- `src/presentation/pages/reporting/ReportingPage.tsx`
- `src/presentation/pages/reporting/ReportingDesktopView.tsx`
- `src/presentation/pages/reporting/ReportingMobileView.tsx`
- `src/presentation/pages/reporting/useReportingPageState.ts`

Desktop keeps:

- existing graph
- existing table
- existing export behavior

Mobile gets:

- stacked filter controls
- summary card first
- simplified graph presentation
- report rows as expandable cards instead of a full table

#### Range usage

Current file:

- `src/presentation/pages/RangeUsagePage.tsx`

Suggested split:

- `src/presentation/pages/range-usage/RangeUsagePage.tsx`
- `src/presentation/pages/range-usage/RangeUsageDesktopView.tsx`
- `src/presentation/pages/range-usage/RangeUsageMobileView.tsx`

Desktop keeps graph density.

Mobile gets:

- swipeable or stacked metric cards
- fewer columns visible at once
- simplified date-range controls

#### Records

Current file:

- `src/presentation/pages/RecordsPage.tsx`

Suggested split:

- `src/presentation/pages/records/RecordsPage.tsx`
- `src/presentation/pages/records/RecordsDesktopView.tsx`
- `src/presentation/pages/records/RecordsMobileView.tsx`

Desktop keeps:

- records table
- score table in modal

Mobile gets:

- records as stacked cards
- score entry fields as a vertical form instead of a table row

### Second wave

These are more important operationally but more complex.

#### Equipment

Current file:

- `src/presentation/pages/EquipmentPage.tsx`

Suggested split:

- `src/presentation/pages/equipment/EquipmentPage.tsx`
- `src/presentation/pages/equipment/EquipmentDesktopView.tsx`
- `src/presentation/pages/equipment/EquipmentMobileView.tsx`
- `src/presentation/pages/equipment/useEquipmentPageState.ts`

Desktop keeps:

- inventory table
- existing action panels
- case modal behavior

Mobile gets:

- inventory cards with filters at top
- segmented actions such as `Assign`, `Return`, `Storage`, `Decommission`
- case contents shown as collapsible cards

Important note:

This page already mixes state management and view rendering heavily, so extracting `useEquipmentPageState` first is the safest move.

#### Role permissions

Current file:

- `src/presentation/pages/RolePermissionsPage.tsx`

Suggested split:

- `src/presentation/pages/roles/RolePermissionsPage.tsx`
- `src/presentation/pages/roles/RolePermissionsDesktopView.tsx`
- `src/presentation/pages/roles/RolePermissionsMobileView.tsx`

Desktop keeps:

- full permission matrix

Mobile gets:

- role selector
- grouped permission toggles
- optional “summary by role” cards
- no full matrix by default

Important note:

The mobile version should probably omit the matrix entirely and replace it with grouped summaries. The desktop matrix can stay untouched.

### Third wave

These are the most specialized.

#### Event calendar

Current file:

- `src/presentation/pages/EventCalendarPage.tsx`

Suggested split:

- `src/presentation/pages/event-calendar/EventCalendarPage.tsx`
- `src/presentation/pages/event-calendar/EventCalendarDesktopView.tsx`
- `src/presentation/pages/event-calendar/EventCalendarMobileView.tsx`
- `src/presentation/pages/event-calendar/useEventCalendarPageState.ts`

Desktop keeps:

- month grid
- existing detail modals
- approval and booking actions

Mobile gets:

- agenda/list-first experience
- optional compact month picker rather than full month grid as the default
- event detail sheets/cards instead of depending on tiny grid cells

Important note:

This page is large enough that state extraction should happen before introducing the mobile view.

#### Tournaments

Current file:

- `src/presentation/pages/TournamentsPage.tsx`

Suggested split:

- `src/presentation/pages/tournaments/TournamentsPage.tsx`
- `src/presentation/pages/tournaments/TournamentsDesktopView.tsx`
- `src/presentation/pages/tournaments/TournamentsMobileView.tsx`

Desktop keeps bracket graphics.

Mobile gets:

- tournament cards
- registration/status actions
- bracket as a drill-in view or simplified round list

## What Should Stay Shared

These should remain common between desktop and mobile:

- route structure
- React Query queries and invalidation
- API calls
- permission checks
- mutation handlers
- page-level success/error state

That keeps the mobile layer cheap.

## What Should Diverge

These are good candidates for separate mobile markup:

- tables
- dense multi-column toolbars
- matrix/grid permission views
- bracket visualization
- calendar month grid default
- table-based score entry

## Suggested Breakpoint Strategy

Use one primary breakpoint first:

- mobile: `< 900px`
- desktop: `>= 900px`

This matches the current CSS direction closely enough to avoid fighting existing styles.

Later, if needed:

- phone: `< 640px`
- tablet: `640px - 899px`
- desktop: `>= 900px`

## Low-Risk Implementation Order

1. Add `useIsMobile()`
2. Convert `ReportingPage`
3. Convert `RecordsPage`
4. Convert `RangeUsagePage`
5. Extract `useEquipmentPageState()`
6. Add `EquipmentMobileView`
7. Add `RolePermissionsMobileView`
8. Extract `useEventCalendarPageState()`
9. Add `EventCalendarMobileView`
10. Add `TournamentsMobileView`

## Why This Works Well Here

This app’s domain logic is already separate enough that the risky part is mostly markup and interaction density.

That means we do not need:

- a second frontend app
- a second routing system
- duplicated API logic
- a big rewrite of the backend

We mostly need a controlled split in the presentation layer.

## Recommended First Technical Change

If implementation starts, the first real code change should be:

- add `useIsMobile.ts`
- split `ReportingPage.tsx` into state plus `DesktopView` and `MobileView`

That will prove the pattern with minimal risk before touching the largest pages.
