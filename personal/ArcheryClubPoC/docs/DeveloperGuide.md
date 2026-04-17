# 📘 Archery Club PoC – Developer Guide

---

# 1. 🧠 Overview

**ArcheryClubPoC** is a full-stack web application designed to manage archery-related workflows such as:

- Archer management
- Competition handling (future-ready)
- Scoring and data tracking (extendable)
- Local-first data persistence

## 🧱 Architecture Style

The application follows a **Clean Architecture / Domain-Driven Design** approach:

```
Presentation (UI)
↓
Use Cases (Application Logic)
↓
Domain (Business Rules)
↓
Infrastructure (DB / APIs)
```

### Benefits

- Highly maintainable
- Testable
- Scalable for future features (mobile, AI scoring, RFID)

---

# 2. ⚙️ Tech Stack

## Frontend

- React 19
- TypeScript
- Vite
- React Router
- @tanstack/react-query

## Backend

- Node.js
- Express (v5)
- better-sqlite3 (local database)

## Tooling

- ESLint
- Concurrently (run frontend + backend)

---

# 3. 📁 Project Structure

## Frontend (`/src`)

```
src/
├── application/      # Application services (orchestration)
├── domain/           # Core business logic & models
├── usecases/         # Business actions
├── infrastructure/   # Database + external integrations
├── presentation/     # UI components/pages
├── shared/           # Shared utilities/constants
├── utils/            # Helper functions
├── types/            # Global TypeScript types
├── theme/            # Styling/theming
├── data/             # Static/mock data
├── assets/           # Images/icons
```

## Backend

```
server/
├── index.js          # Express server entry point
```

---

# 4. 🧩 Architectural Layers

---

## 4.1 Domain Layer (`/domain`)

The **core of the system**.

### Responsibilities

- Business entities (Archer, Score, Round)
- Business rules
- Validation logic

### Rules

- No dependencies on UI, frameworks, or database
- Pure TypeScript logic

---

## 4.2 Use Cases (`/usecases`)

Defines **what the system can do**.

### Examples

- Register Archer
- Record Score
- Start Competition
- Calculate Results

### Pattern

Each use case:

1. Accepts input
2. Uses domain logic
3. Calls infrastructure if needed
4. Returns a result

---

## 4.3 Application Layer (`/application`)

Acts as a **coordinator**.

### Responsibilities

- Orchestrates multiple use cases
- Handles workflows
- Bridges UI and business logic

---

## 4.4 Infrastructure Layer (`/infrastructure`)

Handles **external systems**.

### Responsibilities

- Database access (SQLite)
- API calls
- Data persistence

### Typical Pattern

```
Repositories:
- ArcherRepository
- ScoreRepository
```

---

## 4.5 Presentation Layer (`/presentation`)

React-based UI.

### Includes

- Pages
- Components
- Hooks

### Integrations

- React Router (navigation)
- React Query (data fetching + caching)

---

# 5. 🔄 Data Flow

Typical request lifecycle:

```
User Action (UI)
↓
React Component
↓
React Query / Hook
↓
Use Case
↓
Domain Logic
↓
Repository (Infrastructure)
↓
SQLite Database
```

---

# 6. 🖥️ Backend (Express Server)

## Entry Point

```
server/index.js
```

## Responsibilities

- API endpoints
- Serve frontend (production)
- Database access

---

# 7. 📦 Dependencies

## Runtime

| Dependency            | Purpose        |
| --------------------- | -------------- |
| react                 | UI framework   |
| react-router-dom      | Routing        |
| @tanstack/react-query | Data fetching  |
| express               | Backend API    |
| better-sqlite3        | Local database |
| concurrently          | Dev workflow   |

## Development

| Dependency           | Purpose       |
| -------------------- | ------------- |
| vite                 | Build tool    |
| typescript           | Type safety   |
| eslint               | Code quality  |
| @vitejs/plugin-react | React support |

---

# 8. 🧠 Key Features

## Current

- Modular UI structure
- Local database persistence
- API-driven architecture
- Clean separation of concerns

## Designed For (Future)

- Archer registration
- Competition brackets
- Round management
- Score tracking
- Historical results
- Mobile integration

---

# 9. 🧪 Development Workflow

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

---

# 10. 🧱 Extending the Application

## Example: Add “Score an End”

### Step 1 – Domain

```
domain/Score.ts
```

### Step 2 – Use Case

```
usecases/recordScore.ts
```

### Step 3 – Infrastructure

```
infrastructure/ScoreRepository.ts
```

### Step 4 – UI Component

```
presentation/components/ScoreInput.tsx
```

### Step 5 – Connect via React Query

---

# 11. ⚠️ Recommendations

## Improvements

### 1. API Abstraction Layer

Create:

```
infrastructure/api/
```

---

### 2. Environment Configuration

Use:

```
.env
```

---

### 3. Logging Layer

```
shared/logger.ts
```

---

### 4. Validation

Introduce:

- Zod or Yup

---

### 5. Testing

- Unit tests (domain)
- Integration tests (use cases)

---

# 12. 🔮 Future Roadmap

## 📱 Mobile App

- React Native / Expo
- Reuse domain + usecases

---

## 🎯 AI Scoring

- Image upload
- Arrow detection
- User correction feedback loop

---

## 🏹 Competition Engine

- Bracket generation
- Round progression
- Live leaderboard

---

## 🔐 RFID Integration

- Access control
- Member validation
- Entry logging

---

# 13. 🧾 Summary

This project provides a **solid foundation** for a full archery platform.

### Strengths

- Clean architecture
- Scalable design
- Strong separation of concerns
- Ready for advanced features

With additional layers (validation, testing, API abstraction), this can evolve into a **production-grade system**.

---
