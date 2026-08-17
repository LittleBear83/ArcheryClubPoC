# Knockout Tournament Engine Implementation Plan

## Executive Summary

The current tournament feature is a strong starting point, but it is still too simple for club-managed knockout competitions such as Captain's Sword.

## Implementation Status

Current progress reflects completed foundation, captain setup, member match flow, and captain operations/progression work.

Completed:

- reusable tournament templates have been introduced in the backend contract
- a `Captain's Sword` template now exists as the first engine-oriented template
- a `Standard Knockout` template now exists as a reusable fallback knockout template
- `GET /api/tournament-templates` has been added
- `GET /api/tournaments` now includes `tournamentTemplates`
- tournament responses now include an `engine` payload with template, lifecycle, rounds, and matches
- frontend tournament view types now understand the new engine response shape
- template selection during tournament creation and editing is now implemented
- tournaments now persist `templateKey`
- tournaments now persist `drawDate`
- tournaments now persist `roundSchedule`
- persisted `tournament_rounds` records now exist in the database layer
- tournament create and update now sync persisted round records from configured schedules
- tournament engine responses now read persisted round records for round titles and deadlines
- persisted `tournament_matches` records now exist in the database layer
- tournament create, update, registration, withdrawal, and score submission now sync persisted match records from current bracket state
- handicap table foundation entities now exist in the database layer
- captain setup now supports draw date entry
- captain setup now supports round deadline entry
- captain setup now supports template-driven default round names
- captain setup now supports add/remove round schedule rows
- backend validation now enforces draw date and round deadlines for templates that require them
- captain setup now uses a guided multi-step wizard for create and edit flows
- captain setup now includes a review step before save
- captain setup now supports automatic round window scheduling using round duration and rest-day configuration
- member match detail interactions now support result submission, opponent confirmation, and dispute handling
- captain operations now support override, push-forward, and disqualification actions with recorded decision notes
- automatic progression now advances only completed winners and keeps future rounds pending until prerequisite matches are complete
- captain decisions now write to audit history

Not yet completed:

- new database tables for tournament confirmations
- eligibility engine
- handicap engine
- member homepage reminders
- notification hooks
- reporting and export polish

Today the app supports:

- tournament creation
- a registration window
- a score submission window
- a bracket-style display
- one score per archer per round

That is not yet enough to support:

- tournament-specific rule sets
- round-by-round deadlines
- handicap-based head-to-head scoring
- eligibility-aware registration and round gating
- handicap-driven score adjustment and snapshotting
- member reminders for active matches

The recommended direction is to build a reusable knockout tournament engine and expose it through a guided setup flow in the app.
Captain's Sword should be the first template built on top of that engine, not a one-off special case.

## Source Distinction

This plan combines two inputs and keeps them separate.

Rules taken from the Captain's Sword document:

- the competition runs between October and March
- it is a head-to-head knockout
- it is based on the Portsmouth round
- it uses 95% handicap allowances
- archers need 3 indoor rounds to establish a handicap before first-round eligibility
- archers must submit 1 indoor round before each knockout section they shoot
- each round has a published deadline
- deadlines are not automatically extended
- the captain may intervene where scheduling problems exist
- the captain's decision is final

Product requirements taken from the user request:

- support multiple tournaments through one reusable feature
- make tournament setup user-friendly in the app
- allow captain-controlled registration and deadline overrides
- show members a homepage reminder for active matches
- allow score entry and opponent confirmation
- progress winners automatically
- expose a handicap table to members
- allow handicap table editing through permissions

## Current State Assessment

The current implementation is centered around a simpler tournament model.

Relevant files:

- [src/presentation/pages/TournamentsPage.tsx](/C:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/TournamentsPage.tsx)
- [src/presentation/pages/tournaments/tournamentViewTypes.ts](/C:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/tournaments/tournamentViewTypes.ts)
- [server/presentation/http/registerTournamentRoutes.js](/C:/Users/cfleetham/personal/ArcheryClubPoC/server/presentation/http/registerTournamentRoutes.js)
- [server/infrastructure/persistence/tournamentGateway.js](/C:/Users/cfleetham/personal/ArcheryClubPoC/server/infrastructure/persistence/tournamentGateway.js)

Current strengths:

- tournament creation and editing already exist
- registration and withdrawal already exist
- bracket rendering already exists
- permissions for tournament management already exist
- server event updates already exist

Current gaps:

- one tournament-level score window instead of round-level match windows
- one score per archer per round instead of a head-to-head match record
- no explicit match confirmation workflow
- no dispute workflow
- no captain override tools inside the match lifecycle
- no reusable tournament template system
- no handicap reference management feature
- no eligibility engine for qualification rules
- no member-focused "my active match" flow

## Product Direction

Build a generic knockout competition engine underneath, but make the app experience template-driven and captain-friendly.

This means the product should have four layers:

1. reusable tournament engine
2. tournament templates
3. captain setup and operations screens
4. member match and reminder screens

The key principle is:

- generic behavior in the engine
- competition-specific behavior in templates and rules

## Target Experience

### Captain experience

Creating a Captain's Sword tournament should feel like:

1. choose the `Captain's Sword` template
2. enter season details and registration dates
3. enter draw date and round deadlines
4. review eligible entrants
5. publish the tournament

The captain should not need to manually configure low-level rule mechanics every time.

### Member experience

Members should be able to:

- see whether registration is open
- register or withdraw if allowed
- understand whether they are eligible
- see who they are shooting against
- see the deadline for the current round
- submit a match result
- confirm or dispute an opponent's submitted result
- see when the competition data was last updated

## Proposed Domain Model

Replace the current flat model with explicit competition objects.

### Core entities

- `tournaments`
- `tournament_templates`
- `tournament_rounds`
- `tournament_matches`
- `tournament_match_results`
- `tournament_match_confirmations`
- `tournament_registrations`
- `tournament_eligibility_snapshots`
- `handicap_tables`
- `handicap_table_rows`

### Key model changes

#### `tournaments`

Should hold high-level metadata such as:

- name
- template id
- status
- registration start and end
- draw date
- created by
- published at

#### `tournament_rounds`

Should hold round-specific schedule data:

- tournament id
- round number
- round label
- publish date
- shooting start date
- submission deadline
- status

This replaces the current single tournament-level score submission window.

Status:

- completed: persisted round records for tournament schedule metadata
- not yet completed: full round lifecycle management and publish controls

#### `tournament_matches`

Should hold the actual head-to-head pairing:

- tournament id
- round id
- bracket position
- left archer id
- right archer id
- left handicap snapshot
- right handicap snapshot
- calculated allowance values
- winner id
- progression target slot
- status

Status:

- completed: persisted match records for bracket state snapshots
- not yet completed: first-class match workflow, confirmation, and dispute lifecycle

#### `tournament_match_results`

Should capture result entry rather than only storing one round score per member:

- match id
- submitted by
- raw score details
- adjusted score details
- submission timestamp
- status

#### `tournament_match_confirmations`

Should track agreement and disputes:

- match id
- confirming archer id
- confirmation status
- confirmation timestamp
- dispute note

#### `tournament_eligibility_snapshots`

Should capture why someone was or was not eligible at a given point:

- tournament id
- round id
- member id
- handicap established flag
- indoor rounds counted
- qualifying round present flag
- eligibility status
- reason text

This is important for transparency and captain decisions.

## Tournament Templates

Templates should let us support multiple knockout competitions without hardcoding each one into the app.

Status:

- completed: backend template definitions and API exposure
- completed: template persistence
- completed: setup UI template selection
- completed: persisted round schedule storage
- completed: persisted template-driven foundation behavior for rounds and matches
- completed: captain workflow for setup, review, and operations
- not yet completed: eligibility and handicap rules execution

### Captain's Sword template

The first template should contain:

- format: knockout
- scoring round: Portsmouth
- handicap mode: 95% allowance
- handicap prerequisite: 3 indoor rounds before round 1
- round prerequisite: 1 indoor qualifying round before each knockout section
- deadline policy: hard cutoff
- captain intervention allowed: yes
- captain decision final: yes
- result workflow: submit then confirm

### Future template examples

- novice handicap knockout
- scratch knockout
- summer outdoor knockout
- junior-only knockout

## Eligibility Engine

Eligibility needs to become a reusable backend service rather than a manual check.

Recommended service:

- `TournamentEligibilityService`

Responsibilities:

- determine whether a member can register
- determine whether a member can shoot a given round
- evaluate handicap prerequisites
- evaluate per-round qualification prerequisites
- surface reasons for ineligibility

Outputs should be member-friendly and captain-friendly.

Example statuses:

- `eligible`
- `eligible_with_warning`
- `awaiting_handicap_rounds`
- `awaiting_qualifying_round`
- `disqualified`

## Handicap Engine

Because this competition is handicap-based, the handicap rules need to be explicit, visible, and reusable.

Recommended services:

- `HandicapTableService`
- `MatchHandicapCalculator`

Responsibilities:

- store and edit handicap tables
- expose handicap tables to members
- calculate allowance values using the selected table and percentage
- snapshot the relevant handicap data when a match is generated

Important rule:

- historical match calculations should not change if the table is edited later

That means the app should save a handicap snapshot onto the match when the round is created.

## Match Lifecycle

The match flow should become the center of the feature.

Recommended status flow:

- `scheduled`
- `awaiting_result`
- `awaiting_opponent_confirmation`
- `disputed`
- `finalised`
- `progressed`
- `walkover`
- `disqualified`

Recommended interaction flow:

1. round is published
2. members arrange a time between themselves
3. one member submits the result
4. opponent confirms or disputes it
5. if disputed, captain resolves it
6. winner is finalised
7. winner progresses automatically into the next round slot

Status:

- completed: result submission
- completed: opponent confirmation and dispute flow
- completed: captain resolution flow for disputed or manual outcomes
- completed: progression from completed matches into the next round bracket slot
- not yet completed: handicap-adjusted match scoring rules

## Captain Controls

Captain tools should be first-class in the product, not hidden admin workarounds.

Recommended captain actions:

- open or close registration manually
- add or remove an archer
- amend round dates
- regenerate or repair pairings before a round is live
- mark a walkover
- resolve a dispute
- disqualify an archer
- override a winner
- manually advance an archer
- record why a decision was made

Each override should leave an audit trail.

Status:

- completed: captain operations panel in the tournament UI
- completed: override winner actions
- completed: push-forward actions
- completed: disqualification actions
- completed: required captain decision notes and audit logging

## Member Reminders

Add a tournament reminder card to the member homepage.

Recommended content:

- tournament name
- current round
- opponent name
- submission deadline
- match status
- action button such as `Enter result` or `Confirm result`
- last updated timestamp

Recommended reminder states:

- registration open
- match waiting to be arranged
- result required from you
- opponent confirmation required from you
- dispute pending captain decision
- round complete

## Captain-Friendly Setup Flow

This is now a core requirement.

The setup experience should be a wizard rather than one long technical form.

### Suggested setup steps

1. `Choose template`
2. `Tournament details`
3. `Registration window`
4. `Draw date and round schedule`
5. `Eligibility and handicap rules`
6. `Review entrants and warnings`
7. `Publish`

### Setup principles

- prefill from template defaults
- show plain-English descriptions of rules
- validate deadlines before publish
- highlight members who are not yet eligible
- hide advanced controls unless the user has captain or admin permissions

Status:

- completed: template selection in create/edit forms
- completed: inline template descriptions in setup
- completed: draw date capture for template-based knockout tournaments
- completed: editable round deadline rows in setup
- completed: automatic round window generation from round length and rest-day configuration
- completed: validation for missing or invalid round deadline schedules
- completed: true step-by-step wizard flow
- not yet completed: entrant review and eligibility warnings

## API Direction

The current routes are a useful base, but the engine will need more explicit endpoints.

### Existing routes to evolve

- `GET /api/tournaments`
- `POST /api/tournaments`
- `PUT /api/tournaments/:id`
- `POST /api/tournaments/:id/register`
- `DELETE /api/tournaments/:id/register`

### New routes to add

- `GET /api/tournament-templates` completed
- `POST /api/tournaments/:id/publish`
- `POST /api/tournaments/:id/rounds/generate`
- `GET /api/tournaments/:id/matches`
- `GET /api/tournament-matches/:id`
- `POST /api/tournament-matches/:id/result`
- `POST /api/tournament-matches/:id/confirm`
- `POST /api/tournament-matches/:id/dispute`
- `POST /api/tournament-matches/:id/override`
- `GET /api/handicap-tables`
- `PUT /api/handicap-tables/:id`
- `GET /api/tournaments/:id/eligibility`

Current implementation note:

- `POST /api/tournaments` and `PUT /api/tournaments/:id` now accept and persist `templateKey`, `drawDate`, and `roundSchedule`
- tournament create and update now also generate persisted `tournament_rounds` records from the configured schedule
- tournament create, update, registration, withdrawal, and score submission now also generate persisted `tournament_matches` records from the current bracket state

## Frontend Direction

The existing [src/presentation/pages/TournamentsPage.tsx](/C:/Users/cfleetham/personal/ArcheryClubPoC/src/presentation/pages/TournamentsPage.tsx) should likely become a shell for several more focused views.

Recommended screens:

- tournament list page
- tournament setup wizard
- captain operations view
- member tournament overview
- match detail page
- handicap table page

Recommended design principle:

- the bracket remains useful as context
- the primary member action should be centered on "my current match"

## Phased Delivery Plan

### Phase 1: foundation

Status: completed

- completed: add tournament templates
- completed: expose engine-style tournament payload for rounds and matches
- completed: persist template selection
- completed: persist draw date and round schedule
- completed: add persisted round entities
- completed: add persisted match entities
- completed: add handicap table entities
- completed: design new schema
- completed: preserve existing tournament data during migration coverage for foundation entities

### Phase 2: captain setup

- Status: completed

- completed: build setup wizard
- completed: add Captain's Sword template
- completed: allow captain-managed round schedule entry
- completed: add validation for deadlines and rule completeness

### Phase 3: eligibility and handicap logic

- Status: deferred

- build eligibility service
- build handicap calculation service
- expose eligibility warnings during setup and registration
- snapshot handicap data into matches

### Phase 4: member match flow

- Status: completed

- completed: build match detail screen
- completed: add result submission
- completed: add opponent confirmation
- completed: add dispute handling

### Phase 5: progression and operations

- Status: completed

- completed: implement automatic winner progression
- completed: prevent premature progression before prerequisite match completion
- completed: add captain overrides
- completed: add walkovers and disqualification handling
- completed: add audit logging around decisions

### Phase 6: reminders and polish

- Status: not started

- add homepage reminder cards
- add last-updated timestamps
- add notification hooks if needed later
- improve reporting and exports

## Recommended First Milestone

The best first milestone is:

`A captain can create a Captain's Sword tournament from a template, define round deadlines, review eligibility, and publish registration.`

Why this first:

- it gives the club a usable operational starting point
- it forces us to shape templates correctly
- it avoids overbuilding scoring before setup and eligibility are stable
- it supports iterative rollout

## Risks And Decisions To Resolve

These items should be confirmed before implementation starts in earnest:

- whether both archers may submit scores, or whether one should submit and one confirm
- how ties are resolved in Captain's Sword
- what exact handicap table and formula should be used in the app
- whether handicap is frozen at tournament start or recalculated per round
- whether captains can replace entrants after registration closes
- whether match scheduling conversations stay outside the app or need in-app messaging later

## Recommendation

Proceed with a reusable knockout tournament engine, but deliver it through a guided template-based setup flow.

That gives us:

- a better captain experience
- a better member experience
- lower maintenance for future tournaments
- a clean path to support additional formats after Captain's Sword

Captain's Sword should be the proving ground for the engine, not the boundary of the design.
