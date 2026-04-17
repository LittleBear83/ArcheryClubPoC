# ArcheryClubPoC

ArcheryClubPoC is a proof-of-concept web application for an archery club. It combines a React frontend with a small Express and SQLite backend to explore how club members, guests, events, and range usage could be managed in a single internal system.

The project is aimed at validating the workflow and user experience rather than being a finished production platform. It currently focuses on member login, guest sign-in, calendar-based club information, and simple range usage reporting.

## What This Project Does

The app currently includes:

- Member login using username/password.
- Simulated RFID login support for members.
- Guest sign-in recording.
- A home page showing signed-up events and members recently active at the range.
- An event and competition calendar with:
  recurring range-closure rules,
  event types such as competition, social event, and range closed,
  booking conflict checks for duplicate date/time slots,
  a split view with calendar on the left and date summary on the right.
- A coaching calendar for planned sessions.
- A range usage dashboard showing usage by hour, weekday, and date range.
- Supporting club pages such as feedback, ideas, and lost and found.

## Tech Stack

- Frontend: React, React Router, Vite
- Backend: Express
- Database: SQLite via `better-sqlite3`
- Tooling: ESLint

## Project Structure

- `src/`
  Frontend application code.
- `src/bootstrap/`
  Frontend composition root and provider wiring.
- `src/application/`
  Frontend use cases that coordinate domain behaviour.
- `src/domain/`
  Frontend entities and repository contracts.
- `src/data/`
  Frontend repository implementations and data sources.
- `src/presentation/pages/`
  Main screens such as home, event calendar, coaching calendar, and range usage.
- `src/presentation/components/`
  Shared UI pieces such as the calendar, modal, and side drawer.
- `server/`
  Backend entrypoint and delivery layer.
- `server/bootstrap/`
  Backend startup and framework composition.
- `server/config/`
  Runtime and environment-derived configuration.
- `server/domain/`
  Backend domain constants and business concepts shared across features.
- `server/infrastructure/`
  Backend persistence and framework-facing infrastructure.
- `server/data/auth.sqlite`
  Local SQLite database file used by the backend.
- `docs/DeveloperGuide.md`
  Developer-facing architecture and implementation guide for extending the application.

## Running Locally

1. Install dependencies:

```bash
npm ci
```

2. Start the frontend and backend together:

```bash
npm run dev
```

3. Open the app in your browser using the Vite development URL shown in the terminal.

The backend runs from `server/index.js` and the frontend runs through Vite. During development, both are started together with `concurrently`.

## Available Scripts

- `npm run dev`
  Starts both the Express server and the Vite client.
- `npm run build`
  Builds the frontend for production.
- `npm run preview`
  Builds the frontend and then starts the Express server.
- `npm run start`
  Starts the Express server.
- `npm run start:live`
  Starts the Express server in live mode. An empty live database seeds only the
  developer account `Cfleetham`.
- `npm run lint`
  Runs ESLint across the project.

## Database Notes

The backend creates the SQLite database automatically if it does not already exist. It also seeds a small set of example users for testing the proof of concept.

Live mode uses `server/data/auth.live.sqlite` by default and seeds only the
developer user `Cfleetham` when that database is empty. You can override the
database path with `DATABASE_PATH`.

RFID simulation is hidden in production builds by default. To deliberately
enable it for a non-live test build, set `VITE_ENABLE_RFID_SIMULATOR=true`
before building the client.

Current backend data includes:

- users
- user types
- user disciplines
- member login events
- guest login events

## Current Status

This repository is a working proof of concept for club operations, not a complete production-ready system. The current implementation is strongest as a demo and foundation for future work such as:

- stronger authentication and authorization
- persistent event management APIs
- real booking workflows
- richer reporting
- deployment and environment configuration
