# Tournament Workbook Assessment And Integration Plan

## Executive Summary

`Black and Gold 2026.xlsm` should not drive us toward a Black-and-Gold-only feature.
It should push us toward a reusable competition platform.

The workbook is valuable because it exposes the business capabilities we actually need:

- handicap calculation
- round-definition lookup
- category-specific ranking
- points assignment
- overall standings calculation
- target allocation
- score-sheet generation
- results export

So the right design is:

1. build reusable competition services and components
2. model Black and Gold as one configuration of those services
3. allow future tournaments to reuse the same engines with different rules

## What The Workbook Is Really Telling Us

Although the workbook is named `Black and Gold 2026`, the important part is not the branding.
The important part is the set of reusable competition behaviours inside it.

Behind the workbook are these general concerns:

- member entry management
- round selection
- round metadata lookup
- handicap reference lookup
- allowance calculation
- raw-to-adjusted score calculation
- incomplete-round handling
- category ranking
- series ranking
- printable operational outputs

Those are reusable competition capabilities, not one-off workbook quirks.

## Workbook Assessment

## Workbook Structure

The workbook has 68 sheets, which break down into these groups:

### Setup and reference data

- `Setup and changes`
- `Members`
- `Handicaps2023`
- `0 Rounds Data`

### Event entry sheets

- `0 black and gold 1` to `0 black and gold 6`

These are six stages/events in one competition series.

### Results sheets

- `Senior Results`
- `Junior Results`
- `Overall Results`
- `Overall print out`

### Operational sheets

- `Target List`
- `Score_sheets`

### Round-specific reference sheets

Examples:

- `York`
- `American`
- `National`
- `Windsor`
- `Worcester`

These act as lookup/reference helpers for allowance and score logic.

## Workbook Behaviours We Should Generalize

### 1. Handicap calculator

The workbook:

- reads an archer handicap
- looks up a round-specific reference score
- applies an allowance percentage such as `95%`
- derives an allowance value

This should become a reusable backend service:

- `HandicapCalculator`

Inputs:

- handicap ruleset/table
- round definition
- handicap value
- allowance percentage

Outputs:

- reference score
- allowance value
- handicap baseline at 95%
- handicap baseline at 100%

### 2. Round definition resolver

The workbook uses `0 Rounds Data` to determine:

- distance count
- distances
- dozens
- unit
- max score
- age-group relationship
- indoor/outdoor

This should become:

- `RoundDefinitionService`

### 3. Competition score calculator

The workbook combines:

- raw score
- allowance
- max score
- incomplete-round flag

to derive:

- adjusted total
- handicap percentage

This should become:

- `CompetitionScoreCalculator`

### 4. Category results calculator

The workbook separately ranks:

- seniors
- juniors

This should become:

- `CompetitionResultsCalculator`

Inputs:

- stage entries
- stage scores
- category rules
- ranking rules

Outputs:

- ordered results
- placing
- tie handling
- points allocation

### 5. Series standings calculator

The workbook builds overall standings across six events and calculates:

- total points
- best 4
- overall placing

This should become:

- `SeriesStandingsCalculator`

### 6. Target allocation component

The workbook groups archers by boss/target and builds:

- target list
- score sheets

This should become:

- `TargetAllocationService`
- `TargetListExporter`
- `ScoreSheetExporter`

## Gap Against The Current App

The current app tournament feature is built around a simpler model:

- one tournament
- one registration list
- one bracket
- one score per competitor per round

Current implementation areas include:

- `server/presentation/http/registerTournamentRoutes.js`
- `server/infrastructure/persistence/tournamentGateway.js`
- `src/presentation/pages/TournamentsPage.tsx`

That model is useful, but it is not the right abstraction for reusable competition logic.

What is missing today:

- reusable handicap engine
- reusable round-definition model
- reusable results/ranking engine
- reusable series standings engine
- reusable stage-based competition model
- reusable target/score-sheet generation

## Recommended Architecture Direction

Move away from feature naming based on one event and toward reusable engines.

Recommended structure:

- `competitions`
  - high-level feature area
- `calculators`
  - reusable backend calculation services
- `reference-data`
  - rounds, handicaps, category rules
- `exports`
  - target list, score sheet, result exports
- `formats`
  - thin format-specific configuration such as Black and Gold

In other words:

- Black and Gold should become a consumer of the reusable competition platform
- not the platform itself

## Proposed Reusable Backend Components

These are the main reusable backend pieces I recommend.

### `RoundDefinitionService`

Responsibility:

- fetch round definitions
- normalize round data
- expose max score, distances, dozens, units, and rule metadata

### `HandicapCalculator`

Responsibility:

- resolve handicap table values
- compute reference score
- compute allowance amount
- support configurable percentages such as `95%`

### `CompetitionScoreCalculator`

Responsibility:

- combine raw score and handicap allowance
- compute adjusted scores
- compute handicap percentages
- support complete and incomplete round rules

### `CompetitionResultsCalculator`

Responsibility:

- sort competitors within a category
- rank by configured score type
- allocate positions
- handle ties consistently
- optionally assign points

### `SeriesStandingsCalculator`

Responsibility:

- combine results across stages
- apply best-N logic
- calculate total points
- calculate final standings

### `TargetAllocationService`

Responsibility:

- group stage entrants onto targets
- generate ordered target lists
- support future lane/boss allocation rules

### `CompetitionExportService`

Responsibility:

- produce printable or downloadable outputs:
  - target list
  - score sheets
  - stage results
  - overall standings

### `CompetitionImportService`

Responsibility:

- parse uploaded workbook/import files
- validate required structure
- map import data into normalized competition entities

## Proposed Reusable Frontend Components

The frontend should also move toward reusable competition components.

### `CompetitionSeriesPage`

Responsibility:

- show a reusable detail page for a competition series

### `CompetitionStageTable`

Responsibility:

- display/edit entrants and scores for one stage

### `CompetitionResultsTable`

Responsibility:

- display ranked results for any category

### `SeriesStandingsTable`

Responsibility:

- display reusable overall standings

### `TargetListPanel`

Responsibility:

- show operational target allocations

### `CompetitionImportModal`

Responsibility:

- import workbook data into reusable backend models

## Proposed Data Model

The tables should also be general-purpose.

## Core tables

### `competition_series`

Top-level competition container.

```sql
CREATE TABLE competition_series (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  format_key TEXT NOT NULL,
  season_year INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  description TEXT,
  source_type TEXT,
  source_file_name TEXT,
  source_import_hash TEXT,
  created_by_username TEXT NOT NULL REFERENCES users(username),
  created_at_date TEXT NOT NULL,
  created_at_time TEXT NOT NULL,
  updated_by_username TEXT REFERENCES users(username),
  updated_at_date TEXT,
  updated_at_time TEXT
);
```

### `competition_categories`

Reusable category definitions inside a series.

```sql
CREATE TABLE competition_categories (
  id BIGSERIAL PRIMARY KEY,
  competition_series_id BIGINT NOT NULL REFERENCES competition_series(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  label TEXT NOT NULL,
  ranking_scope TEXT NOT NULL,
  scoring_method TEXT NOT NULL,
  config_json TEXT,
  UNIQUE (competition_series_id, category_key)
);
```

### `competition_stages`

Reusable stage/event model.

```sql
CREATE TABLE competition_stages (
  id BIGSERIAL PRIMARY KEY,
  competition_series_id BIGINT NOT NULL REFERENCES competition_series(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  stage_type TEXT NOT NULL,
  scheduled_date TEXT,
  registration_open_date TEXT,
  registration_close_date TEXT,
  score_open_date TEXT,
  score_close_date TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  config_json TEXT,
  UNIQUE (competition_series_id, stage_number)
);
```

### `competition_entries`

Series-level participation.

```sql
CREATE TABLE competition_entries (
  id BIGSERIAL PRIMARY KEY,
  competition_series_id BIGINT NOT NULL REFERENCES competition_series(id) ON DELETE CASCADE,
  member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  default_category_id BIGINT REFERENCES competition_categories(id),
  active_status TEXT NOT NULL DEFAULT 'active',
  joined_at_date TEXT NOT NULL,
  joined_at_time TEXT NOT NULL,
  UNIQUE (competition_series_id, member_username)
);
```

### `competition_stage_entries`

Per-stage row assignments.

```sql
CREATE TABLE competition_stage_entries (
  id BIGSERIAL PRIMARY KEY,
  competition_stage_id BIGINT NOT NULL REFERENCES competition_stages(id) ON DELETE CASCADE,
  competition_entry_id BIGINT NOT NULL REFERENCES competition_entries(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES competition_categories(id),
  bow_style TEXT NOT NULL,
  handicap_value INTEGER,
  round_definition_id BIGINT REFERENCES archery_round_definitions(id),
  target_number INTEGER,
  allowance_percentage NUMERIC(5,4) NOT NULL DEFAULT 0.9500,
  imported_row_number INTEGER,
  entry_status TEXT NOT NULL DEFAULT 'entered',
  UNIQUE (competition_stage_id, competition_entry_id)
);
```

### `competition_stage_scores`

Reusable calculated scoring storage.

```sql
CREATE TABLE competition_stage_scores (
  id BIGSERIAL PRIMARY KEY,
  competition_stage_entry_id BIGINT NOT NULL UNIQUE REFERENCES competition_stage_entries(id) ON DELETE CASCADE,
  raw_score INTEGER,
  allowance_value INTEGER,
  adjusted_score INTEGER,
  handicap_score_95 NUMERIC(10,2),
  handicap_percent_95 NUMERIC(10,4),
  handicap_score_100 NUMERIC(10,2),
  handicap_percent_100 NUMERIC(10,4),
  is_incomplete_round BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at_date TEXT,
  submitted_at_time TEXT,
  verified_by_username TEXT REFERENCES users(username)
);
```

### `competition_rankings`

Reusable ranking output table.

```sql
CREATE TABLE competition_rankings (
  id BIGSERIAL PRIMARY KEY,
  competition_series_id BIGINT NOT NULL REFERENCES competition_series(id) ON DELETE CASCADE,
  competition_stage_id BIGINT REFERENCES competition_stages(id) ON DELETE CASCADE,
  category_id BIGINT REFERENCES competition_categories(id) ON DELETE CASCADE,
  competition_entry_id BIGINT NOT NULL REFERENCES competition_entries(id) ON DELETE CASCADE,
  ranking_scope TEXT NOT NULL,
  position INTEGER,
  points INTEGER,
  raw_score INTEGER,
  adjusted_score NUMERIC(10,2),
  best_n_total NUMERIC(10,2),
  generated_at_date TEXT NOT NULL,
  generated_at_time TEXT NOT NULL
);
```

## Reference-data tables

### `archery_round_definitions`

```sql
CREATE TABLE archery_round_definitions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  indoor_outdoor TEXT,
  max_score INTEGER NOT NULL,
  distance_count INTEGER NOT NULL,
  dozens_csv TEXT NOT NULL,
  distances_csv TEXT NOT NULL,
  distance_unit TEXT NOT NULL,
  age_group_rule TEXT,
  bowstyle_rule TEXT,
  source_name TEXT
);
```

### `handicap_tables`

```sql
CREATE TABLE handicap_tables (
  id BIGSERIAL PRIMARY KEY,
  ruleset_name TEXT NOT NULL,
  source_sheet_name TEXT,
  season_year INTEGER,
  created_at_date TEXT NOT NULL,
  created_at_time TEXT NOT NULL
);
```

### `handicap_table_values`

```sql
CREATE TABLE handicap_table_values (
  handicap_table_id BIGINT NOT NULL REFERENCES handicap_tables(id) ON DELETE CASCADE,
  round_definition_id BIGINT NOT NULL REFERENCES archery_round_definitions(id) ON DELETE CASCADE,
  handicap_value INTEGER NOT NULL,
  reference_score INTEGER NOT NULL,
  PRIMARY KEY (handicap_table_id, round_definition_id, handicap_value)
);
```

## Import/audit tables

### `competition_import_jobs`

```sql
CREATE TABLE competition_import_jobs (
  id BIGSERIAL PRIMARY KEY,
  competition_series_id BIGINT REFERENCES competition_series(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  import_status TEXT NOT NULL,
  warnings_json TEXT,
  raw_snapshot_json TEXT,
  imported_by_username TEXT NOT NULL REFERENCES users(username),
  imported_at_date TEXT NOT NULL,
  imported_at_time TEXT NOT NULL
);
```

## Proposed File Plan

## Backend files

### New reusable service files

- `server/domain/competitions/RoundDefinitionService.js`
  - read and normalize round definitions

- `server/domain/competitions/HandicapCalculator.js`
  - reusable handicap and allowance calculations

- `server/domain/competitions/CompetitionScoreCalculator.js`
  - reusable raw-to-adjusted score calculations

- `server/domain/competitions/CompetitionResultsCalculator.js`
  - reusable category ranking and points logic

- `server/domain/competitions/SeriesStandingsCalculator.js`
  - reusable overall standings and best-N logic

- `server/domain/competitions/TargetAllocationService.js`
  - reusable target grouping and ordering

- `server/domain/competitions/CompetitionExportService.js`
  - reusable export generation

- `server/domain/competitions/CompetitionImportService.js`
  - reusable import orchestration

### New format adapter files

- `server/domain/competitions/formats/blackAndGoldFormat.js`
  - configuration only
  - category rules
  - points rules
  - stage count
  - best-N logic

- `server/domain/competitions/formats/headToHeadFormat.js`
  - future bracket format adapter

- `server/domain/competitions/formats/wa720Format.js`
  - future qualification/finals format adapter

### New persistence files

- `server/infrastructure/persistence/competitionGateway.js`
- `server/infrastructure/persistence/roundDefinitionGateway.js`
- `server/infrastructure/persistence/handicapGateway.js`

### New route files

- `server/presentation/http/registerCompetitionRoutes.js`
- `server/presentation/http/registerCompetitionImportRoutes.js`
- `server/presentation/http/registerCompetitionExportRoutes.js`

### Existing backend files to update

- `server/infrastructure/persistence/runPostgresMigrations.js`
- `server/infrastructure/persistence/bootstrapSqliteBaseSchema.js`
- `server/bootstrap/bootstrapPersistence.js`
- `server/index.js`

## Frontend files

### New reusable frontend files

- `src/api/competitionApi.ts`
- `src/api/competitionCrudApi.ts`
- `src/domain/entities/Competition.ts`
- `src/domain/repositories/CompetitionRepository.ts`
- `src/data/repositories/CompetitionRepositoryImpl.ts`
- `src/application/usecases/CompetitionUseCases.ts`

- `src/presentation/pages/CompetitionsPage.tsx`
- `src/presentation/pages/competitions/CompetitionSeriesList.tsx`
- `src/presentation/pages/competitions/CompetitionStageTable.tsx`
- `src/presentation/pages/competitions/CompetitionResultsTable.tsx`
- `src/presentation/pages/competitions/SeriesStandingsTable.tsx`
- `src/presentation/pages/competitions/TargetListPanel.tsx`
- `src/presentation/pages/competitions/CompetitionImportModal.tsx`

### Existing frontend files to update

- `src/bootstrap/createAppDependencies.ts`
- `src/presentation/components/SideDrawer.tsx`
- `src/presentation/state/useServerEvents.ts`

## How It Links Together

### Import flow

1. User uploads a workbook.
2. `CompetitionImportService` parses and validates it.
3. Workbook rows are mapped into:
   - round definitions
   - handicap table values
   - competition series
   - stages
   - entries
   - stage entries
   - scores
4. `CompetitionScoreCalculator` calculates adjusted scores.
5. `CompetitionResultsCalculator` calculates category results.
6. `SeriesStandingsCalculator` calculates overall standings.
7. Rankings are saved and exposed to the UI.

### Edit/score flow

1. User edits stage entries or scores.
2. Backend saves changes.
3. Calculator services rerun for affected scopes.
4. Updated rankings and exports become available.

### Export flow

1. User requests an export.
2. `CompetitionExportService` pulls normalized data.
3. Reusable exporters generate:
   - target list
   - score sheet
   - stage results
   - series standings

## How Black And Gold Fits In After Refactor

After this refactor, Black and Gold becomes:

- one `competition_series`
- six `competition_stages`
- categories such as `senior` and `junior`
- one configured ranking/points policy
- one configured overall standings policy such as `best 4`

That means Black and Gold is just a format configuration and imported dataset.
It is no longer the thing that defines the whole architecture.

## Suggested Delivery Phases

### Phase 1. Generalize the terminology

- rename planning from `tournament workbook` mindset to `competition platform`
- define core reusable calculators and reference services

### Phase 2. Build reference-data support

- implement round-definition persistence
- implement handicap-table persistence

### Phase 3. Build reusable calculators

- `HandicapCalculator`
- `CompetitionScoreCalculator`
- `CompetitionResultsCalculator`
- `SeriesStandingsCalculator`

### Phase 4. Build reusable competition persistence

- series
- stages
- entries
- scores
- rankings

### Phase 5. Build import path

- workbook import
- validation
- normalization

### Phase 6. Build reusable UI

- stage editor
- results table
- standings table
- target/export views

### Phase 7. Add format adapters

- Black and Gold
- future event types

## Immediate Recommendations

### Recommendation 1

Rename the design mentally and structurally from `Black and Gold import` to `competition engine with workbook import`.

### Recommendation 2

Prioritize reusable backend calculators first:

- `HandicapCalculator`
- `CompetitionScoreCalculator`
- `CompetitionResultsCalculator`
- `SeriesStandingsCalculator`

### Recommendation 3

Treat Black and Gold as the first configuration of those reusable services, not as a special-case architecture.

### Recommendation 4

Keep the current bracket tournament feature intact for now, and build the new reusable competition platform beside it.

## Best Next Step

Define the reusable backend service contracts first, then build the generalized schema around them, and only after that implement the Black and Gold workbook importer as one adapter into that shared platform.
