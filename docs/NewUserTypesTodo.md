# New User Types Todo

Last updated: 2026-08-12

## Goal

Separate these concerns so the portal reflects reality without losing the existing roles and permissions model:

- club relationship
- programme participation
- portal permissions

Target outcome:

- keep roles and permissions for access control
- support both `have-a-go` and `taster-session`
- make beginners, Have a Go participants, and taster participants clearly non-members

## Proposed Model

### 1. Membership status

Add a dedicated membership status field:

- `member`
- `non-member`
- `guest`

Purpose:

- drives wording in the portal
- reflects whether someone is actually a club member
- does not control granular permissions by itself

### 2. Programme type

Add a separate programme type field:

- `none`
- `beginners`
- `have-a-go`
- `taster-session`

Purpose:

- explains why a non-member exists in the system
- lets us support both Have a Go and Taster Session as different journeys
- avoids misusing role as a programme label

### 3. Role

Keep role for permissions and access control:

- `general`
- `coach`
- `admin`
- `developer`
- committee and custom roles

Purpose:

- continues to drive permission checks
- remains the source of truth for admin/member capability differences

## Implementation Phases

### Phase 1. Confirm behaviour and wording

- [x] Confirm the exact visible wording for:
- [x] `membershipStatus = non-member`
- [x] `programmeType = beginners`
- [x] `programmeType = have-a-go`
- [x] `programmeType = taster-session`
- [x] Confirm whether existing `have-a-go` users should display as `Non-member` plus `Have a Go`, or whether they need a special suffix/label
- [x] Confirm whether beginners and taster participants should be blocked from the same pages today, or whether Taster Session needs a different menu access level
- [x] Phase 1 decision: use visible labels `Non-member`, `Beginners`, `Have a Go`, and `Taster Session`
- [x] Phase 1 decision: show both programme label and non-member status in display suffixes
- [x] Phase 1 decision: beginners and taster participants share the same restricted member-page access for now

### Phase 2. Data model

- [x] Add `membership_status` to user persistence layer
- [x] Add `programme_type` to user persistence layer
- [x] Set safe defaults for existing users:
- [x] members currently on standard club roles -> `member`
- [x] guest login users -> `guest`
- [x] existing `beginner` users -> `non-member` + `beginners`
- [x] existing `have-a-go` users -> `non-member` + `have-a-go`
- [x] Decide whether to retain legacy `beginner` and `have-a-go` role keys for compatibility during migration
- [x] Phase 2 decision: keep the legacy `beginner` and `have-a-go` role keys alongside the new membership/programme fields
- [x] Add migration/backfill logic for SQLite and Postgres

### Phase 3. Backend domain rules

- [x] Add domain constants for membership status values
- [x] Add domain constants for programme type values
- [x] Update user normalization so membership status and programme type are returned to the frontend
- [x] Keep current permission resolution role-based
- [x] Add helper functions for:
- [x] `isNonMemberUser`
- [x] `isGuestUser`
- [x] `isProgrammeUser`
- [x] `isBeginnersProgrammeUser`
- [x] `isHaveAGoProgrammeUser`
- [x] `isTasterProgrammeUser`

### Phase 4. Taster Session feature

- [x] Add `taster-session` as a supported course/programme type in the beginners/session workflow
- [x] Review whether Taster Session should:
- [x] reuse the same API endpoints as beginners/Have a Go
- [x] reuse the same approval model
- [x] reuse the same participant workflow
- [x] Add backend course type normalization for `taster-session`
- [x] Add permission mapping decision:
- [x] either reuse Have a Go permissions initially
- [x] or add dedicated `manage_taster_sessions` and `approve_taster_sessions`
- [x] Update persistence validation to allow `taster-session` in course type fields
- [x] Phase 4 decision: reuse the existing Have a Go permissions for Taster Sessions in this migration

### Phase 5. Frontend navigation and labels

- [x] Update menu structure to show both:
- [x] `Have a Go Sessions`
- [x] `Taster Sessions`
- [x] Add page title mapping for `Taster Sessions`
- [x] Add route mapping for a new Taster Sessions page
- [x] Decide whether Taster Sessions can reuse `BeginnersCoursesPage` with a new variant
- [x] Update home page approval summaries to distinguish:
- [x] beginners courses
- [x] Have a Go sessions
- [x] Taster Sessions

### Phase 6. Member profile and user admin UI

- [x] Update member creation form to show:
- [x] role
- [x] membership status
- [x] programme type
- [x] Prevent inconsistent combinations where possible
- [x] Example: `guest` should not also be assigned a programme type unless explicitly supported
- [x] Update profile page edit forms to allow staff to change membership status and programme type
- [x] Add clear helper copy explaining that role controls access, while membership/programme describe status

### Phase 7. Non-member experience

- [x] Define baseline pages available to non-members
- [x] Confirm whether non-members should see:
- [x] General Information
- [x] Range Rules
- [x] Ask A Question
- [x] their own programme dashboard
- [x] any calendar information
- [x] Replace role-based page hiding that currently assumes `beginner` with membership/programme-aware access rules where appropriate
- [x] Keep sensitive admin/member pages restricted by permission or explicit access checks
- [x] Phase 7 decision: non-members keep access to General Information, Range Rules, Ask A Question, and their own programme dashboard
- [x] Phase 7 decision: programme participants do not get the wider member calendar and related restricted member pages yet

### Phase 8. Rename and presentation cleanup

- [x] Audit visible text that currently says `member` where `participant` or `non-member` is more accurate
- [x] Review visible text for:
- [x] Have a Go
- [x] beginners
- [x] guest
- [x] member
- [x] Update display badges/suffixes so non-members are recognizable without looking like full club members
- [x] Decide whether name suffixes should show:
- [x] programme label
- [x] non-member label
- [x] both

### Phase 9. Audit log, reporting, and exports

- [x] Update reporting views to include membership status and programme type
- [x] Update audit logging labels if new fields are added to member profile changes
- [x] Review CSV/export output for new fields
- [x] Confirm whether attendance reporting should group by:
- [x] member vs non-member
- [x] programme type

### Phase 10. Backward compatibility

- [x] Keep current `beginner` and `have-a-go` role handling working during transition
- [x] Add compatibility mapping in frontend display helpers
- [x] Add compatibility mapping in backend normalization helpers
- [x] Avoid breaking existing seeded/demo/live data
- [x] Decide when legacy role keys can be retired, if ever
- [x] Legacy role keys remain in place for the current migration plan and should not be normalized away during Phase 2
- [x] Phase 10 decision: legacy role keys remain in place indefinitely unless a future dedicated migration is approved

### Phase 11. Testing

- [x] Add tests for user normalization with membership status and programme type
- [x] Add tests for compatibility mapping from legacy `beginner` / `have-a-go`
- [x] Add tests for new Taster Session course type
- [x] Add tests for permissions remaining role-based
- [x] Add tests for menu visibility for non-members
- [x] Add tests for user normalization with membership status and programme type
- [x] Add tests for compatibility mapping from legacy `beginner` / `have-a-go`
- [x] Add tests for approval summary counts when Have a Go and Taster Session both exist

## Suggested First Slice

Deliver this first before deeper migration:

- [x] add `membershipStatus` and `programmeType` to the user model
- [x] backfill current beginner and Have a Go users
- [x] keep existing role and permission logic unchanged
- [x] add visible non-member labels to profile/display helpers
- [x] add Taster Session as a new programme/session variant reusing the current Have a Go workflow where possible

## Current Focus

- [x] Add helper copy and validation rules to prevent inconsistent membership/programme combinations
- [x] Update portal wording so non-members are described consistently across profile, lists, and dashboards
- [x] Add `taster-session` into the course/session workflow using the new programme model
- [x] Add targeted tests for normalization and legacy compatibility mapping

This gives the club a clearer real-world model quickly, while keeping the current permissions architecture stable.
