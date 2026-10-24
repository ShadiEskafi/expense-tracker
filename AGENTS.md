# Agent Operating Manual — Expense Management App

> **Status**: Harness Active  
> **Single Source of Truth**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) & [design-system/](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/)

---

## 1. Cold-Start Initialization (MANDATORY BEFORE ANY WORK)
Every agent session must execute this sequence before writing any code:
1. Run `./init.ps1` (or `./init.sh` on bash) to verify environment health (lint, test, build).
2. Read `progress.md` to load inter-session narrative memory.
3. Read `feature_list.json` to inspect completed work and select the next single feature.
4. Run `git status` and `git log -5` to inspect recent working tree changes.
5. Read `DECISIONS.md` to ensure no architectural decisions are reversed.
6. When selecting a feature and transitioning it to `state: active` in `feature_list.json`, immediately run `npm run trello:sync` to move the corresponding Trello card from `Ready` to `In Progress`.

---

## 2. Inviolable Operating Rules
- **WIP=1 (Work-In-Progress = 1)**: Work on exactly ONE feature from `feature_list.json` at a time. Never multitask across multiple features. (Agents may modify multiple files required to complete that single feature).
- **Proof-Only Done**: Never declare a feature complete without passing automated test evidence (`verification` command).
- **Atomic Commits**: Commit only after all checks pass and state files (`feature_list.json`, `progress.md`) are updated.
- **Trello Mirror Synchronization**: Run `npm run trello:sync` whenever a feature is set to `active` (start of work) and when committed to `passing` (end of work), ensuring Trello faithfully mirrors `feature_list.json`.
- **Arabic-First / RTL Compliance**: All UI components, layouts, typography, and copy must strictly follow `design-system/`.
- **Product Routing**: For product requirements and scope questions, consult `project-summary.md` (Frozen v1.0).
- **UI/UX Routing**: Consult `design-system/README.md` first, then only the specific sub-documents needed.
- **Knowledge Near Code**: If altering domain architecture, update `docs/architecture.md` or `design-system/`.

---

## 3. Core Verification Commands
- **Health Gate (Full Pipeline)**: `powershell -ExecutionPolicy Bypass -File .\init.ps1` (or `./init.sh`)
- **Automated Tests**: `npm test` (Vitest unit & integration tests)
- **Code Linter**: `npm run lint` (ESLint 10)
- **Production Build**: `npm run build` (Vite 8 production bundle)
- **Dev Server**: `npm run dev` (starts Vite at `http://localhost:5173`)
- **Trello Sync**: `npm run trello:sync` (syncs visual cards with `feature_list.json`)

---

## 4. Subsystem Routing Map
Do not bloat this file. Domain-specific rules reside in their dedicated sub-documents:
- **System Architecture & Boundary Rules**: [docs/architecture.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/architecture.md)
- **Sync & Offline Queue Architecture**: [docs/sync-architecture.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/sync-architecture.md)
- **Data Models & Schema Invariants**: [docs/data-model.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/data-model.md)
- **Financial & Accounting Rules**: [docs/financial-rules.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/financial-rules.md)
- **Testing Standards & Mocks**: [docs/testing-standards.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/testing-standards.md)
- **Architectural Decisions (ADRs)**: [DECISIONS.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/DECISIONS.md)
- **Machine-Readable Features**: [feature_list.json](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/feature_list.json)
- **Inter-Session Progress**: [progress.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/progress.md)
- **Arabic RTL UI Design System**: [design-system/README.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/README.md)
- **Product Specification (Frozen v1.0)**: [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md)
- **Visual Project Tracking (Trello)**: [docs/project-tracking.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/docs/project-tracking.md) (For task status visibility, see Trello. For authoritative execution state, see `feature_list.json`).

---

## 5. Session Exit Checklist
Before concluding any coding session or handing off:
- [ ] Active feature verification command passes with 0 errors.
- [ ] Full test suite (`npm test`) passes without regressions.
- [ ] Production build (`npm run build`) and linter (`npm run lint`) pass cleanly.
- [ ] `feature_list.json` updated (`state: passing` + evidence recorded).
- [ ] `progress.md` updated with completed work and explicit next session handoff.
- [ ] Atomic git commit recorded for completed feature.
- [ ] Visual tracking mirror on Trello synchronized via `npm run trello:sync`.
